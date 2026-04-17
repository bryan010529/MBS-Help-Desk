# MBS Help Desk

Aplicación web de gestión de tickets de soporte técnico con frontend en **React (Vite)** y backend en **Node.js + Express + Socket.io**.

## Módulos implementados

- **Creación de ticket**: formulario mobile-first con RNC, empresa, contacto, tipo de asistencia, urgencia, descripción y carga múltiple de archivos.
- **Prioridad y cola**: cálculo de prioridad por urgencia + estado + antigüedad, con impulso automático para tickets **Crítica**.
- **Chat interno por ticket**: mensajes cliente/soporte con historial, fecha/hora y adjuntos.
- **Notificaciones de avance**: registro de notificaciones in-app + endpoint opcional de WhatsApp (simulado) y línea de tiempo.
- **Panel administrativo**: dashboard con métricas, filtros, tabla, vista kanban, asignación de técnico y cambio de estado.
- **Estados de ticket**: Nuevo, Recibido, Asignado, En revisión, En proceso, Esperando respuesta del cliente, Resuelto, Cerrado.

## Arquitectura

- `client/`: interfaz React.
- `server/`: API REST + WebSocket.
- `database/schema.sql`: diseño base de datos PostgreSQL para producción.

## Endpoints principales

- `POST /api/tickets` crear ticket (multipart + adjuntos)
- `GET /api/tickets/number/:ticketNumber` consultar ticket por número
- `GET /api/tickets/:id/queue` ver cola (posición y tickets delante)
- `POST /api/tickets/:id/messages` chat del ticket
- `PATCH /api/tickets/:id/status` cambio de estado (admin)
- `PATCH /api/tickets/:id/assign` asignar técnico (admin)
- `GET /api/admin/tickets` dashboard filtrable (admin)
- `GET /api/admin/metrics` métricas (admin)
- `GET /api/admin/customers/:rnc/tickets` historial por RNC (admin)

> Header admin requerido: `x-admin-token` (por defecto `dev-admin-token`).

## Ejecutar localmente

```bash
npm install
npm run test
npm run build
npm run lint
npm run dev --workspace server
npm run dev --workspace client
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

Variables opcionales en frontend:

- `VITE_API_URL`
- `VITE_SOCKET_URL`
- `VITE_ADMIN_TOKEN`
