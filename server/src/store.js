import { randomUUID } from 'node:crypto';

const URGENCY_WEIGHT = {
  Baja: 1,
  Media: 2,
  Alta: 3,
  Crítica: 4,
};

const STATUS_WEIGHT = {
  Nuevo: 5,
  Recibido: 4,
  Asignado: 4,
  'En revisión': 3,
  'En proceso': 3,
  'Esperando respuesta del cliente': 2,
  Resuelto: 1,
  Cerrado: 0,
};

const FINAL_STATUSES = new Set(['Resuelto', 'Cerrado']);

const state = {
  sequence: 1,
  tickets: [],
};

const createTicketNumber = () => {
  const year = new Date().getUTCFullYear();
  const number = String(state.sequence).padStart(5, '0');
  state.sequence += 1;
  return `TCK-${year}-${number}`;
};

const scoreTicket = (ticket, now = new Date()) => {
  const hoursWaiting = Math.max(0, (now.getTime() - new Date(ticket.createdAt).getTime()) / 36e5);
  const urgency = URGENCY_WEIGHT[ticket.urgencyLevel] ?? 1;
  const statusFactor = STATUS_WEIGHT[ticket.status] ?? 1;
  const ageFactor = Math.min(48, Math.round(hoursWaiting));
  const criticalBoost = ticket.urgencyLevel === 'Crítica' ? 1000 : 0;
  return urgency * 100 + statusFactor * 10 + ageFactor + criticalBoost;
};

const sortQueue = (a, b) => {
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

const recalculatePriority = () => {
  const now = new Date();
  state.tickets.forEach((ticket) => {
    ticket.priorityScore = scoreTicket(ticket, now);
  });
};

const appendTimeline = (ticket, event) => {
  ticket.timeline.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...event,
  });
};

const appendNotification = (ticket, message) => {
  const notification = {
    id: randomUUID(),
    message,
    createdAt: new Date().toISOString(),
  };
  ticket.notifications.push(notification);
  return notification;
};

const withQueueData = (ticket) => {
  recalculatePriority();
  const queue = state.tickets.filter((item) => !FINAL_STATUSES.has(item.status)).sort(sortQueue);
  const position = queue.findIndex((item) => item.id === ticket.id);
  return {
    ...ticket,
    queuePosition: position >= 0 ? position + 1 : null,
    ticketsAhead: position >= 0 ? position : 0,
  };
};

export const createTicket = ({ payload, files }) => {
  const now = new Date().toISOString();
  const ticket = {
    id: randomUUID(),
    ticketNumber: createTicketNumber(),
    rnc: payload.rnc,
    companyName: payload.companyName,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    assistanceType: payload.assistanceType,
    urgencyLevel: payload.urgencyLevel,
    description: payload.description,
    status: 'Nuevo',
    assignedTechnician: null,
    tags: payload.tags ?? [],
    internalComments: [],
    attachments: files,
    messages: [],
    notifications: [],
    timeline: [],
    createdAt: now,
    updatedAt: now,
    priorityScore: 0,
  };

  appendTimeline(ticket, {
    type: 'status',
    actor: 'sistema',
    status: 'Nuevo',
    message: 'Ticket creado',
  });
  appendNotification(ticket, 'Ticket recibido correctamente');
  state.tickets.push(ticket);
  recalculatePriority();
  return withQueueData(ticket);
};

export const listTickets = (filters = {}) => {
  recalculatePriority();
  const result = state.tickets
    .filter((ticket) => {
      if (filters.status && ticket.status !== filters.status) return false;
      if (filters.priority && ticket.urgencyLevel !== filters.priority) return false;
      if (filters.company && !ticket.companyName.toLowerCase().includes(filters.company.toLowerCase())) return false;
      if (filters.technician && (ticket.assignedTechnician ?? '').toLowerCase() !== filters.technician.toLowerCase()) return false;
      if (filters.fromDate && new Date(ticket.createdAt) < new Date(filters.fromDate)) return false;
      if (filters.toDate && new Date(ticket.createdAt) > new Date(filters.toDate)) return false;
      if (
        filters.search &&
        ![ticket.ticketNumber, ticket.companyName, ticket.rnc, ticket.contactPhone].some((value) =>
          value.toLowerCase().includes(filters.search.toLowerCase()),
        )
      ) {
        return false;
      }
      return true;
    })
    .sort(sortQueue)
    .map(withQueueData);
  return result;
};

export const getTicketById = (id) => {
  const ticket = state.tickets.find((item) => item.id === id);
  return ticket ? withQueueData(ticket) : null;
};

export const getTicketByNumber = (ticketNumber) => {
  const ticket = state.tickets.find((item) => item.ticketNumber === ticketNumber);
  return ticket ? withQueueData(ticket) : null;
};

export const updateTicketStatus = ({ id, status, actor = 'soporte' }) => {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return null;
  ticket.status = status;
  ticket.updatedAt = new Date().toISOString();
  appendTimeline(ticket, {
    type: 'status',
    actor,
    status,
    message: `Estado actualizado a ${status}`,
  });
  appendNotification(ticket, `Ticket ${status.toLowerCase()}`);
  return withQueueData(ticket);
};

export const assignTechnician = ({ id, technician }) => {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return null;
  ticket.assignedTechnician = technician;
  ticket.updatedAt = new Date().toISOString();
  if (ticket.status === 'Nuevo' || ticket.status === 'Recibido') {
    ticket.status = 'Asignado';
  }
  appendTimeline(ticket, {
    type: 'assignment',
    actor: 'soporte',
    message: `Ticket asignado a ${technician}`,
    status: ticket.status,
  });
  appendNotification(ticket, `Ticket asignado a ${technician}`);
  return withQueueData(ticket);
};

export const addTicketMessage = ({ id, senderName, senderRole, message, files = [] }) => {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return null;
  const entry = {
    id: randomUUID(),
    senderName,
    senderRole,
    message,
    attachments: files,
    createdAt: new Date().toISOString(),
  };
  ticket.messages.push(entry);
  ticket.updatedAt = new Date().toISOString();
  appendTimeline(ticket, {
    type: 'message',
    actor: senderRole,
    message: `${senderName} respondió en el ticket`,
  });
  appendNotification(ticket, `Nuevo mensaje de ${senderName}`);
  return withQueueData(ticket);
};

export const addInternalComment = ({ id, author, comment }) => {
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return null;
  ticket.internalComments.push({
    id: randomUUID(),
    author,
    comment,
    createdAt: new Date().toISOString(),
  });
  return withQueueData(ticket);
};

export const getCustomerHistoryByRnc = (rnc) =>
  state.tickets.filter((ticket) => ticket.rnc === rnc).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(withQueueData);

export const getMetrics = () => {
  const opened = state.tickets.filter((ticket) => !FINAL_STATUSES.has(ticket.status));
  const solved = state.tickets.filter((ticket) => ticket.status === 'Resuelto' || ticket.status === 'Cerrado');
  const avgResponseMinutes = state.tickets.length
    ? Math.round(
        state.tickets.reduce((acc, ticket) => {
          if (ticket.messages.length === 0) return acc;
          return acc + (new Date(ticket.messages[0].createdAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000;
        }, 0) / state.tickets.length,
      )
    : 0;

  const byUrgency = state.tickets.reduce(
    (acc, ticket) => {
      acc[ticket.urgencyLevel] = (acc[ticket.urgencyLevel] ?? 0) + 1;
      return acc;
    },
    { Baja: 0, Media: 0, Alta: 0, Crítica: 0 },
  );

  return {
    opened: opened.length,
    solved: solved.length,
    avgResponseMinutes,
    byUrgency,
  };
};

export const statuses = [
  'Nuevo',
  'Recibido',
  'Asignado',
  'En revisión',
  'En proceso',
  'Esperando respuesta del cliente',
  'Resuelto',
  'Cerrado',
];

export const urgencies = ['Baja', 'Media', 'Alta', 'Crítica'];
export const assistanceTypes = ['Remota', 'Presencial', 'Consulta'];
export const rules = {
  urgencyWeight: URGENCY_WEIGHT,
  statusWeight: STATUS_WEIGHT,
};
