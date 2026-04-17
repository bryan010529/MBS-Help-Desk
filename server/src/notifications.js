import nodemailer from 'nodemailer';
import twilio from 'twilio';

// ---------------------------------------------------------------------------
// SLA definitions (hours per urgency level)
// ---------------------------------------------------------------------------
export const SLA_HOURS = {
  Baja: 24,
  Media: 8,
  Alta: 2,
  Crítica: 0, // inmediata (0 h = display "Inmediata")
};

export const slaDeadline = (urgencyLevel, createdAt) => {
  const hours = SLA_HOURS[urgencyLevel] ?? 24;
  if (hours === 0) return new Date(createdAt).toISOString();
  const d = new Date(createdAt);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
};

export const slaRemainingLabel = (urgencyLevel, createdAt) => {
  if (SLA_HOURS[urgencyLevel] === 0) return 'Inmediata';
  const deadline = new Date(slaDeadline(urgencyLevel, createdAt));
  const diffMs = deadline.getTime() - Date.now();
  if (diffMs <= 0) return 'Vencido';
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m restantes` : `${m}m restantes`;
};

// ---------------------------------------------------------------------------
// Email – nodemailer (env-configured, graceful no-op when not set)
// ---------------------------------------------------------------------------
const buildTransporter = () => {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

let _transporter = null;
const getTransporter = () => {
  if (!_transporter) _transporter = buildTransporter();
  return _transporter;
};

export const sendEmail = async ({ to, subject, html }) => {
  const transporter = getTransporter();
  if (!transporter || !to) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"IT Soluclick Help Desk" <noreply@itsoluclick.com>',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[email] Error enviando correo:', err.message);
  }
};

export const emailTicketCreated = (ticket) =>
  sendEmail({
    to: ticket.contactEmail,
    subject: `[${ticket.ticketNumber}] Ticket recibido – IT Soluclick SRL`,
    html: `
      <h2>Ticket recibido correctamente</h2>
      <p><strong>Número:</strong> ${ticket.ticketNumber}</p>
      <p><strong>Empresa:</strong> ${ticket.companyName}</p>
      <p><strong>Contacto:</strong> ${ticket.contactName}</p>
      <p><strong>Urgencia:</strong> ${ticket.urgencyLevel}</p>
      <p><strong>Tipo de asistencia:</strong> ${ticket.assistanceType}</p>
      <p><strong>Descripción:</strong> ${ticket.description}</p>
      <p><strong>Tiempo estimado de atención:</strong> ${
        SLA_HOURS[ticket.urgencyLevel] === 0
          ? 'Inmediata'
          : `${SLA_HOURS[ticket.urgencyLevel]} horas`
      }</p>
      <hr/>
      <p style="font-size:0.85em;color:#666">Powered by IT Soluclick SRL</p>
    `,
  });

export const emailTicketUpdated = (ticket, detail) =>
  sendEmail({
    to: ticket.contactEmail,
    subject: `[${ticket.ticketNumber}] Actualización de tu ticket`,
    html: `
      <h2>Tu ticket fue actualizado</h2>
      <p><strong>Número:</strong> ${ticket.ticketNumber}</p>
      <p><strong>Estado actual:</strong> ${ticket.status}</p>
      <p><strong>Detalle:</strong> ${detail}</p>
      <hr/>
      <p style="font-size:0.85em;color:#666">Powered by IT Soluclick SRL</p>
    `,
  });

// ---------------------------------------------------------------------------
// WhatsApp – Twilio (env-configured, graceful no-op when not set)
// ---------------------------------------------------------------------------
let _twilioClient = null;
const getTwilioClient = () => {
  if (_twilioClient) return _twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  _twilioClient = twilio(sid, token);
  return _twilioClient;
};

// Validate international format (+1xxxxxxxxxx)
const isValidPhone = (phone) => /^\+\d{7,15}$/.test(phone?.replace(/\s/g, ''));

export const sendWhatsApp = async (phone, message) => {
  if (!isValidPhone(phone)) return;
  const from = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  const client = getTwilioClient();
  if (!client) return;
  try {
    await client.messages.create({
      from,
      to: `whatsapp:${phone}`,
      body: message,
    });
  } catch (err) {
    console.error('[whatsapp] Error enviando mensaje:', err.message);
  }
};

export const whatsAppTicketCreated = (ticket) =>
  sendWhatsApp(
    ticket.contactPhone,
    `Hola ${ticket.contactName}, tu ticket *${ticket.ticketNumber}* ha sido creado.\n` +
      `Urgencia: ${ticket.urgencyLevel}\n` +
      `Tiempo estimado: ${SLA_HOURS[ticket.urgencyLevel] === 0 ? 'Inmediata' : `${SLA_HOURS[ticket.urgencyLevel]} horas`}\n` +
      `_Powered by IT Soluclick SRL_`,
  );

export const whatsAppTicketUpdated = (ticket, detail) =>
  sendWhatsApp(
    ticket.contactPhone,
    `Ticket *${ticket.ticketNumber}* actualizado.\n` +
      `Estado: ${ticket.status}\n` +
      `${detail}\n` +
      `_Powered by IT Soluclick SRL_`,
  );
