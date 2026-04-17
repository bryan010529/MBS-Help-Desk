import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

const basePayload = {
  rnc: '101234567',
  companyName: 'Empresa Uno',
  contactName: 'Ana Pérez',
  contactPhone: '8095551234',
  assistanceType: 'Remota',
  urgencyLevel: 'Media',
  description: 'No podemos conectarnos al sistema de facturación.',
};

test('creates ticket and assigns queue position', async () => {
  const response = await request(app).post('/api/tickets').field(basePayload);

  assert.equal(response.status, 201);
  assert.ok(response.body.ticket.ticketNumber.startsWith('TCK-'));
  assert.equal(response.body.ticket.queuePosition, 1);
  assert.equal(response.body.ticket.ticketsAhead, 0);
});

test('critical tickets move ahead in queue', async () => {
  const mediumTicket = await request(app).post('/api/tickets').field({
    ...basePayload,
    companyName: 'Empresa Media',
    rnc: '201234567',
  });
  const criticalTicket = await request(app).post('/api/tickets').field({
    ...basePayload,
    companyName: 'Empresa Critica',
    rnc: '301234567',
    urgencyLevel: 'Crítica',
  });

  const queue = await request(app).get(`/api/tickets/${criticalTicket.body.ticket.id}/queue`);

  assert.equal(mediumTicket.status, 201);
  assert.equal(criticalTicket.status, 201);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.queuePosition, 1);
});

test('adds chat messages and timeline entries', async () => {
  const ticketResponse = await request(app).post('/api/tickets').field({
    ...basePayload,
    companyName: 'Empresa Chat',
    rnc: '401234567',
  });

  const message = await request(app)
    .post(`/api/tickets/${ticketResponse.body.ticket.id}/messages`)
    .field({ senderName: 'Ana Pérez', senderRole: 'cliente', message: '¿Alguna novedad?' });

  assert.equal(message.status, 201);
  assert.equal(message.body.ticket.messages.at(-1).message, '¿Alguna novedad?');
  assert.ok(message.body.ticket.timeline.length >= 2);
});
