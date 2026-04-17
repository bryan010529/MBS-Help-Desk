import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || 'dev-admin-token';

const statuses = [
  'Nuevo',
  'Recibido',
  'Asignado',
  'En revisión',
  'En proceso',
  'Esperando respuesta del cliente',
  'Resuelto',
  'Cerrado',
];

const urgencyLevels = ['Baja', 'Media', 'Alta', 'Crítica'];
const assistanceTypes = ['Remota', 'Presencial', 'Consulta'];

const initialTicketForm = {
  rnc: '',
  companyName: '',
  contactName: '',
  assistanceType: 'Remota',
  urgencyLevel: 'Media',
  description: '',
};

function App() {
  const [activeView, setActiveView] = useState('cliente');
  const [ticketForm, setTicketForm] = useState(initialTicketForm);
  const [ticketFiles, setTicketFiles] = useState([]);
  const [submitMessage, setSubmitMessage] = useState('');
  const [trackedTicketNumber, setTrackedTicketNumber] = useState('');
  const [trackedTicket, setTrackedTicket] = useState(null);
  const [chatForm, setChatForm] = useState({ senderName: '', senderRole: 'cliente', message: '' });
  const [chatFiles, setChatFiles] = useState([]);
  const [adminFilters, setAdminFilters] = useState({ status: '', priority: '', company: '', technician: '', search: '' });
  const [technicianDraft, setTechnicianDraft] = useState({});
  const [adminTickets, setAdminTickets] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  const loadTrackedTicket = useCallback(async (ticketNumber = trackedTicketNumber) => {
    if (!ticketNumber) return;
    const response = await fetch(`${API_URL}/api/tickets/number/${ticketNumber}`);
    if (!response.ok) {
      setTrackedTicket(null);
      setError('No se encontró el ticket indicado.');
      return;
    }
    const data = await response.json();
    setTrackedTicket(data.ticket);
    setError('');
  }, [trackedTicketNumber]);

  const loadAdminData = useCallback(async () => {
    const query = new URLSearchParams(Object.entries(adminFilters).filter(([, value]) => value)).toString();
    const [ticketsRes, metricsRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/tickets${query ? `?${query}` : ''}`, {
        headers: { 'x-admin-token': ADMIN_TOKEN },
      }),
      fetch(`${API_URL}/api/admin/metrics`, {
        headers: { 'x-admin-token': ADMIN_TOKEN },
      }),
    ]);

    if (!ticketsRes.ok || !metricsRes.ok) {
      setError('No fue posible cargar el panel administrativo.');
      return;
    }

    const [ticketsData, metricsData] = await Promise.all([ticketsRes.json(), metricsRes.json()]);
    setAdminTickets(ticketsData.tickets);
    setMetrics(metricsData.metrics);
    setError('');
  }, [adminFilters]);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on('ticket:created', (ticket) => {
      if (trackedTicket?.id === ticket.id) setTrackedTicket(ticket);
      if (activeView === 'admin') loadAdminData();
    });
    socket.on('ticket:updated', (ticket) => {
      if (trackedTicket?.id === ticket.id) setTrackedTicket(ticket);
      if (activeView === 'admin') loadAdminData();
    });
    return () => socket.disconnect();
  }, [activeView, trackedTicket?.id, loadAdminData]);

  useEffect(() => {
    if (activeView === 'admin') {
      const timeout = setTimeout(() => {
        loadAdminData();
      }, 0);
      return () => clearTimeout(timeout);
    }
    if (!trackedTicketNumber) return;
    const timer = setInterval(() => {
      loadTrackedTicket();
    }, 5000);
    return () => clearInterval(timer);
  }, [activeView, trackedTicketNumber, loadAdminData, loadTrackedTicket]);

  useEffect(() => {
    if (activeView !== 'admin') return;
    const timer = setInterval(() => {
      loadAdminData();
    }, 7000);
    return () => clearInterval(timer);
  }, [activeView, loadAdminData]);

  const kanban = useMemo(() => {
    const grouped = statuses.reduce((acc, status) => ({ ...acc, [status]: [] }), {});
    adminTickets.forEach((ticket) => {
      grouped[ticket.status]?.push(ticket);
    });
    return grouped;
  }, [adminTickets]);

  const handleSubmitTicket = async (event) => {
    event.preventDefault();
    setSubmitMessage('');
    const formData = new FormData();
    Object.entries(ticketForm).forEach(([key, value]) => formData.append(key, value));
    [...ticketFiles].forEach((file) => formData.append('attachments', file));

    const response = await fetch(`${API_URL}/api/tickets`, { method: 'POST', body: formData });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || 'No fue posible crear el ticket.');
      return;
    }

    setTicketForm(initialTicketForm);
    setTicketFiles([]);
    setTrackedTicket(data.ticket);
    setTrackedTicketNumber(data.ticket.ticketNumber);
    setSubmitMessage(`Ticket ${data.ticket.ticketNumber} creado exitosamente.`);
    setError('');
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!trackedTicket) return;
    const formData = new FormData();
    Object.entries(chatForm).forEach(([key, value]) => formData.append(key, value));
    [...chatFiles].forEach((file) => formData.append('attachments', file));

    const response = await fetch(`${API_URL}/api/tickets/${trackedTicket.id}/messages`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'No fue posible enviar el mensaje.');
      return;
    }

    setTrackedTicket(data.ticket);
    setChatForm({ ...chatForm, message: '' });
    setChatFiles([]);
    setError('');
  };

  const updateStatus = async (ticketId, status) => {
    const response = await fetch(`${API_URL}/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
      body: JSON.stringify({ status }),
    });
    if (response.ok) loadAdminData();
  };

  const assignTechnician = async (ticketId) => {
    const technician = technicianDraft[ticketId];
    if (!technician) return;
    const response = await fetch(`${API_URL}/api/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-token': ADMIN_TOKEN },
      body: JSON.stringify({ technician }),
    });
    if (response.ok) loadAdminData();
  };

  return (
    <main className="app">
      <header>
        <h1>MBS Help Desk</h1>
        <p>Plataforma de tickets con chat, cola por prioridad y seguimiento en tiempo real.</p>
        <div className="tabs">
          <button className={activeView === 'cliente' ? 'active' : ''} onClick={() => setActiveView('cliente')}>Cliente</button>
          <button className={activeView === 'admin' ? 'active' : ''} onClick={() => setActiveView('admin')}>Panel soporte</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {activeView === 'cliente' ? (
        <section className="grid two">
          <article className="card">
            <h2>Crear ticket</h2>
            <form onSubmit={handleSubmitTicket} className="form">
              <label>RNC<input required value={ticketForm.rnc} onChange={(e) => setTicketForm({ ...ticketForm, rnc: e.target.value })} /></label>
              <label>Nombre de la empresa<input required value={ticketForm.companyName} onChange={(e) => setTicketForm({ ...ticketForm, companyName: e.target.value })} /></label>
              <label>Nombre del contacto<input required value={ticketForm.contactName} onChange={(e) => setTicketForm({ ...ticketForm, contactName: e.target.value })} /></label>
              <label>Tipo de asistencia
                <select value={ticketForm.assistanceType} onChange={(e) => setTicketForm({ ...ticketForm, assistanceType: e.target.value })}>
                  {assistanceTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Nivel de urgencia
                <select value={ticketForm.urgencyLevel} onChange={(e) => setTicketForm({ ...ticketForm, urgencyLevel: e.target.value })}>
                  {urgencyLevels.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Situación o descripción<textarea required minLength={10} value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} /></label>
              <label>Adjuntar imágenes/archivos<input type="file" multiple onChange={(e) => setTicketFiles(e.target.files || [])} /></label>
              <button type="submit">Enviar Ticket</button>
            </form>
            {submitMessage && <p className="success">{submitMessage}</p>}
          </article>

          <article className="card">
            <h2>Seguimiento del ticket</h2>
            <div className="inline">
              <input placeholder="Número de ticket" value={trackedTicketNumber} onChange={(e) => setTrackedTicketNumber(e.target.value)} />
              <button onClick={() => loadTrackedTicket()}>Buscar</button>
            </div>

            {trackedTicket && (
              <>
                <p><strong>Estado:</strong> {trackedTicket.status}</p>
                <p><strong>Prioridad:</strong> {trackedTicket.urgencyLevel}</p>
                <p><strong>Cola:</strong> Hay {trackedTicket.ticketsAhead} tickets antes que el tuyo (posición {trackedTicket.queuePosition}).</p>
                <p><strong>Último avance:</strong> {new Date(trackedTicket.updatedAt).toLocaleString()}</p>

                <h3>Chat del ticket</h3>
                <ul className="messages">
                  {trackedTicket.messages.map((message) => (
                    <li key={message.id}>
                      <p><strong>{message.senderName}</strong> ({message.senderRole}) - {new Date(message.createdAt).toLocaleString()}</p>
                      <p>{message.message}</p>
                    </li>
                  ))}
                </ul>

                <form onSubmit={handleSendMessage} className="form compact">
                  <label>Nombre<input required value={chatForm.senderName} onChange={(e) => setChatForm({ ...chatForm, senderName: e.target.value })} /></label>
                  <label>Rol
                    <select value={chatForm.senderRole} onChange={(e) => setChatForm({ ...chatForm, senderRole: e.target.value })}>
                      <option value="cliente">Cliente</option>
                      <option value="soporte">Soporte</option>
                    </select>
                  </label>
                  <label>Mensaje<textarea required value={chatForm.message} onChange={(e) => setChatForm({ ...chatForm, message: e.target.value })} /></label>
                  <label>Adjuntar<input type="file" multiple onChange={(e) => setChatFiles(e.target.files || [])} /></label>
                  <button type="submit">Enviar mensaje</button>
                </form>

                <h3>Línea de tiempo</h3>
                <ol>
                  {trackedTicket.timeline.map((event) => (
                    <li key={event.id}>{new Date(event.createdAt).toLocaleTimeString()} - {event.message}</li>
                  ))}
                </ol>

                <h3>Notificaciones</h3>
                <ul>
                  {trackedTicket.notifications.map((notification) => (
                    <li key={notification.id}>{new Date(notification.createdAt).toLocaleString()} - {notification.message}</li>
                  ))}
                </ul>
              </>
            )}
          </article>
        </section>
      ) : (
        <section className="grid one">
          <article className="card">
            <h2>Dashboard administrativo</h2>
            <div className="grid filters">
              <input placeholder="Buscar por ticket, empresa o RNC" value={adminFilters.search} onChange={(e) => setAdminFilters({ ...adminFilters, search: e.target.value })} />
              <select value={adminFilters.status} onChange={(e) => setAdminFilters({ ...adminFilters, status: e.target.value })}>
                <option value="">Estado</option>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={adminFilters.priority} onChange={(e) => setAdminFilters({ ...adminFilters, priority: e.target.value })}>
                <option value="">Prioridad</option>
                {urgencyLevels.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input placeholder="Empresa" value={adminFilters.company} onChange={(e) => setAdminFilters({ ...adminFilters, company: e.target.value })} />
              <input placeholder="Técnico" value={adminFilters.technician} onChange={(e) => setAdminFilters({ ...adminFilters, technician: e.target.value })} />
              <button onClick={loadAdminData}>Aplicar filtros</button>
            </div>

            {metrics && (
              <div className="metrics">
                <p><strong>Tickets abiertos:</strong> {metrics.opened}</p>
                <p><strong>Tickets resueltos:</strong> {metrics.solved}</p>
                <p><strong>Promedio de respuesta:</strong> {metrics.avgResponseMinutes} min</p>
                <p><strong>Por urgencia:</strong> Baja {metrics.byUrgency.Baja} | Media {metrics.byUrgency.Media} | Alta {metrics.byUrgency.Alta} | Crítica {metrics.byUrgency.Crítica}</p>
              </div>
            )}

            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Empresa</th>
                  <th>Urgencia</th>
                  <th>Estado</th>
                  <th>Técnico</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {adminTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.ticketNumber}</td>
                    <td>{ticket.companyName}</td>
                    <td>{ticket.urgencyLevel}</td>
                    <td>
                      <select value={ticket.status} onChange={(e) => updateStatus(ticket.id, e.target.value)}>
                        {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>{ticket.assignedTechnician || '-'}</td>
                    <td>
                      <div className="inline">
                        <input
                          placeholder="Asignar técnico"
                          value={technicianDraft[ticket.id] ?? ''}
                          onChange={(e) => setTechnicianDraft({ ...technicianDraft, [ticket.id]: e.target.value })}
                        />
                        <button onClick={() => assignTechnician(ticket.id)}>Asignar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Vista Kanban</h3>
            <div className="kanban">
              {statuses.map((status) => (
                <section key={status}>
                  <h4>{status}</h4>
                  {(kanban[status] || []).map((ticket) => (
                    <article key={ticket.id} className="kanban-card">
                      <p>{ticket.ticketNumber}</p>
                      <small>{ticket.companyName}</small>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </article>
        </section>
      )}
    </main>
  );
}

export default App;
