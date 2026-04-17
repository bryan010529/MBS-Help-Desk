import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  addInternalComment,
  addTicketMessage,
  assignTechnician,
  assistanceTypes,
  createTicket,
  getCustomerHistoryByRnc,
  getMetrics,
  getTicketById,
  getTicketByNumber,
  listTickets,
  rules,
  statuses,
  updateTicketStatus,
  urgencies,
} from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const ticketSchema = z.object({
  rnc: z.string().min(5),
  companyName: z.string().min(2),
  contactName: z.string().min(2),
  contactPhone: z
    .string()
    .min(7)
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, 'Formato de número inválido'),
  assistanceType: z.enum(assistanceTypes),
  urgencyLevel: z.enum(urgencies),
  description: z.string().min(10),
  tags: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [])),
});

const messageSchema = z.object({
  senderName: z.string().min(2),
  senderRole: z.enum(['cliente', 'soporte']),
  message: z.string().min(1),
});

const adminMiddleware = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token !== (process.env.ADMIN_TOKEN || 'dev-admin-token')) {
    return res.status(401).json({ error: 'Acceso administrativo no autorizado' });
  }
  return next();
};

const mapFiles = (files = []) =>
  files.map((file) => ({
    name: file.originalname,
    path: `/uploads/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  }));

export const createApp = ({ io } = {}) => {
  const app = express();
  const emitEvent = (...args) => {
    (io ?? app.get('io'))?.emit(...args);
  };
  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(uploadDir));

  app.get('/api/config', (_req, res) => {
    res.json({ statuses, urgencies, assistanceTypes, rules });
  });

  app.post('/api/tickets', upload.array('attachments', 10), (req, res) => {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de ticket inválidos', details: parsed.error.flatten() });
    }

    const ticket = createTicket({
      payload: parsed.data,
      files: mapFiles(req.files),
    });

    emitEvent('ticket:created', ticket);
    return res.status(201).json({
      message: 'Ticket enviado correctamente',
      ticket,
    });
  });

  app.get('/api/tickets/:id', (req, res) => {
    const ticket = getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({ ticket });
  });

  app.get('/api/tickets/number/:ticketNumber', (req, res) => {
    const ticket = getTicketByNumber(req.params.ticketNumber);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({ ticket });
  });

  app.get('/api/tickets/:id/queue', (req, res) => {
    const ticket = getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({
      queuePosition: ticket.queuePosition,
      ticketsAhead: ticket.ticketsAhead,
      urgencyLevel: ticket.urgencyLevel,
      priorityScore: ticket.priorityScore,
    });
  });

  app.post('/api/tickets/:id/messages', upload.array('attachments', 5), (req, res) => {
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Mensaje inválido', details: parsed.error.flatten() });
    }
    const ticket = addTicketMessage({
      id: req.params.id,
      ...parsed.data,
      files: mapFiles(req.files),
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    emitEvent('ticket:updated', ticket);
    return res.status(201).json({ message: 'Mensaje enviado', ticket });
  });

  app.patch('/api/tickets/:id/status', adminMiddleware, (req, res) => {
    const statusSchema = z.object({ status: z.enum(statuses) });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Estado inválido' });
    const ticket = updateTicketStatus({
      id: req.params.id,
      status: parsed.data.status,
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    emitEvent('ticket:updated', ticket);
    return res.json({ message: 'Estado actualizado', ticket });
  });

  app.patch('/api/tickets/:id/assign', adminMiddleware, (req, res) => {
    const assignSchema = z.object({ technician: z.string().min(2) });
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Técnico inválido' });
    const ticket = assignTechnician({ id: req.params.id, technician: parsed.data.technician });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    emitEvent('ticket:updated', ticket);
    return res.json({ message: 'Técnico asignado', ticket });
  });

  app.post('/api/tickets/:id/internal-comment', adminMiddleware, (req, res) => {
    const commentSchema = z.object({ author: z.string().min(2), comment: z.string().min(2) });
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Comentario inválido' });
    const ticket = addInternalComment({ id: req.params.id, ...parsed.data });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.status(201).json({ message: 'Comentario interno registrado', ticket });
  });

  app.get('/api/admin/tickets', adminMiddleware, (req, res) => {
    const tickets = listTickets({
      status: req.query.status,
      priority: req.query.priority,
      company: req.query.company,
      technician: req.query.technician,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      search: req.query.search,
    });
    return res.json({ tickets });
  });

  app.get('/api/admin/metrics', adminMiddleware, (_req, res) => {
    return res.json({ metrics: getMetrics() });
  });

  app.get('/api/admin/customers/:rnc/tickets', adminMiddleware, (req, res) => {
    return res.json({ tickets: getCustomerHistoryByRnc(req.params.rnc) });
  });

  app.post('/api/tickets/:id/notify/whatsapp', (req, res) => {
    const ticket = getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    return res.json({
      message: 'Notificación de WhatsApp encolada (simulación)',
      ticketNumber: ticket.ticketNumber,
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
};
