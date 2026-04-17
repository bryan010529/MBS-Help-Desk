import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL;

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
const customerTypes = ['Iguala', 'Ocasional'];

const SLA_LABELS = { Baja: '24 horas', Media: '8 horas', Alta: '2 horas', Crítica: 'Inmediata' };

const initialTicketForm = {
  rnc: '',
  companyName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  customerType: 'Ocasional',
  assistanceType: 'Remota',
  urgencyLevel: 'Media',
  description: '',
};

const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem('admin_session') || 'null');
  } catch {
    return null;
  }
};

const saveSession = (session) => sessionStorage.setItem('admin_session', JSON.stringify(session));
const clearSession = () => sessionStorage.removeItem('admin_session');

function BrandLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect width="48" height="48" rx="10" fill="#2563eb" />
      <text x="8" y="34" fontFamily="Arial,sans-serif" fontWeight="bold" fontSize="26" fill="white">IT</text>
    </svg>
  );
}

function LoginScreen({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) { setErr('Credenciales incorrectas'); return; }
    const data = await res.json();
    saveSession(data);
    onLogin(data);
  };

  return (
    <main className="app login-page">
      <div className="login-card card">
        <div className="login-brand">
          <BrandLogo size={52} />
          <div>
            <h1>IT Soluclick SRL</h1>
            <p>Panel de Soporte</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <label>
            Usuario
            <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" />
          </label>
          <label>
            Contraseña
            <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
          </label>
          {err && <p className="error">{err}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <p className="powered">Powered by IT Soluclick SRL</p>
      </div>
    </main>
  );
}

function App() {
  const [activeView, setActiveView] = useState('cliente');
  const [adminSession, setAdminSession] = useState(getSession);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

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
  const [customers, setCustomers] = useState([]);
  const [customerForm, setCustomerForm] = useState({ rnc: '', name: '', customerType: 'Ocasional' });
  const [adminSubView, setAdminSubView] = useState('tickets');
  const [error, setError] = useState('');
  const adminFiltersRef = useRef(adminFilters);

  useEffect(() => {
    adminFiltersRef.current = adminFilters;
  }, [adminFilters]);

  const adminHeaders = useMemo(
    () => ({ 'content-type': 'application/json', 'x-admin-token': adminSession?.token || '' }),
    [adminSession],
  );

  const loadTrackedTicket = useCallback(
    async (ticketNumber = trackedTicketNumber) => {
      if (!ticketNumber) return;
      const response = await fetch(`${API_URL}/api/tickets/number/${ticketNumber}`);
      if (!response.ok) { setTrackedTicket(null); setError('No se encontró el ticket indicado.'); return; }
      const data = await response.json();
      setTrackedTicket(data.ticket);
      setError('');
    },
    [trackedTicketNumber],
  );

  const loadAdminData = useCallback(async () => {
    if (!adminSession) return;
    const query = new URLSearchParams(Object.entries(adminFiltersRef.current).filter(([, v]) => v)).toString();
    const [ticketsRes, metricsRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/tickets${query ? `?${query}` : ''}`, { headers: adminHeaders }),
      fetch(`${API_URL}/api/admin/metrics`, { headers: adminHeaders }),
    ]);
    if (!ticketsRes.ok || !metricsRes.ok) { setError('No fue posible cargar el panel administrativo.'); return; }
    const [ticketsData, metricsData] = await Promise.all([ticketsRes.json(), metricsRes.json()]);
    setAdminTickets(ticketsData.tickets);
    setMetrics(metricsData.metrics);
    setError('');
  }, [adminSession, adminHeaders]);

  const loadCustomers = useCallback(async () => {
    if (!adminSession) return;
    const res = await fetch(`${API_URL}/api/admin/customers`, { headers: adminHeaders });
    if (!res.ok) return;
    const data = await res.json();
    setCustomers(data.customers);
  }, [adminSession, adminHeaders]);

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
    if (activeView === 'admin' && adminSession) {
      const timeout = setTimeout(() => {
        loadAdminData();
        loadCustomers();
      }, 0);
      return () => clearTimeout(timeout);
    }
    if (!trackedTicketNumber) return;
    const timer = setInterval(() => loadTrackedTicket(), 5000);
    return () => clearInterval(timer);
  }, [activeView, trackedTicketNumber, adminSession, loadAdminData, loadTrackedTicket, loadCustomers]);

  useEffect(() => {
    if (activeView !== 'admin' || !adminSession) return;
    const timer = setInterval(() => loadAdminData(), 7000);
    return () => clearInterval(timer);
  }, [activeView, adminSession, loadAdminData]);

  const kanban = useMemo(() => {
    const grouped = statuses.reduce((acc, s) => ({ ...acc, [s]: [] }), {});
    adminTickets.forEach((t) => { grouped[t.status]?.push(t); });
    return grouped;
  }, [adminTickets]);

  const handleSubmitTicket = async (event) => {
    event.preventDefault();
    setSubmitMessage('');
    const formData = new FormData();
    Object.entries(ticketForm).forEach(([k, v]) => formData.append(k, v));
    [...ticketFiles].forEach((file) => formData.append('attachments', file));
    const response = await fetch(`${API_URL}/api/tickets`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'No fue posible crear el ticket.'); return; }
    setTicketForm(initialTicketForm);
    setTicketFiles([]);
    setTrackedTicket(data.ticket);
    setTrackedTicketNumber(data.ticket.ticketNumber);
    setSubmitMessage(`Ticket ${data.ticket.ticketNumber} creado. Tiempo estimado: ${SLA_LABELS[data.ticket.urgencyLevel]}.`);
    setError('');
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!trackedTicket) return;
    const formData = new FormData();
    Object.entries(chatForm).forEach(([k, v]) => formData.append(k, v));
    [...chatFiles].forEach((file) => formData.append('attachments', file));
    const response = await fetch(`${API_URL}/api/tickets/${trackedTicket.id}/messages`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) { setError(data.error || 'No fue posible enviar el mensaje.'); return; }
    setTrackedTicket(data.ticket);
    setChatForm({ ...chatForm, message: '' });
    setChatFiles([]);
    setError('');
  };

  const updateStatus = async (ticketId, status) => {
    const res = await fetch(`${API_URL}/api/tickets/${ticketId}/status`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status }) });
    if (res.ok) loadAdminData();
  };

  const assignTechnician = async (ticketId) => {
    const technician = technicianDraft[ticketId];
    if (!technician) return;
    const res = await fetch(`${API_URL}/api/tickets/${ticketId}/assign`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ technician }) });
    if (res.ok) loadAdminData();
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/api/admin/customers`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(customerForm) });
    if (!res.ok) { setError('No fue posible guardar el cliente.'); return; }
    setCustomerForm({ rnc: '', name: '', customerType: 'Ocasional' });
    loadCustomers();
    setError('');
  };

  const handleAdminTabClick = () => {
    if (!adminSession) { setShowAdminLogin(true); } else { setActiveView('admin'); }
  };

  const handleLogout = () => { clearSession(); setAdminSession(null); setActiveView('cliente'); };

  if (showAdminLogin && !adminSession) {
    return (
      <LoginScreen
        onLogin={(session) => { setAdminSession(session); setShowAdminLogin(false); setActiveView('admin'); }}
      />
    );
  }

  return (
    <main className="app">
      <header className="hero-header">
        <div className="hero-brand">
          <BrandLogo size={40} />
          <div>
            <p className="eyebrow">IT Soluclick SRL – Soporte técnico empresarial</p>
            <h1>Help Desk</h1>
            <p className="hero-sub">Tickets · Chat · Cola por prioridad · Seguimiento en tiempo real</p>
          </div>
        </div>
        <div className="tabs">
          <button className={activeView === 'cliente' ? 'active' : ''} onClick={() => setActiveView('cliente')}>Portal cliente</button>
          <button className={activeView === 'admin' ? 'active' : ''} onClick={handleAdminTabClick}>
            {adminSession ? `Panel soporte (${adminSession.role})` : 'Panel soporte'}
          </button>
          {adminSession && <button className="btn-logout" onClick={handleLogout}>Cerrar sesión</button>}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {activeView === 'cliente' && (
        <section className="grid two">
          <article className="card">
            <h2>Crear ticket</h2>
            <form onSubmit={handleSubmitTicket} className="form">
              <label>RNC<input required value={ticketForm.rnc} onChange={(e) => setTicketForm({ ...ticketForm, rnc: e.target.value })} /></label>
              <label>Nombre de la empresa<input required value={ticketForm.companyName} onChange={(e) => setTicketForm({ ...ticketForm, companyName: e.target.value })} /></label>
              <label>Nombre del contacto<input required value={ticketForm.contactName} onChange={(e) => setTicketForm({ ...ticketForm, contactName: e.target.value })} /></label>
              <label>Número del cliente<input type="tel" pattern="[0-9+()\-\s]{7,20}" required value={ticketForm.contactPhone} onChange={(e) => setTicketForm({ ...ticketForm, contactPhone: e.target.value })} placeholder="Ej: 809-555-1234" /></label>
              <label>Correo electrónico (para notificaciones)<input type="email" value={ticketForm.contactEmail} onChange={(e) => setTicketForm({ ...ticketForm, contactEmail: e.target.value })} placeholder="correo@empresa.com" /></label>
              <label>Tipo de cliente
                <select value={ticketForm.customerType} onChange={(e) => setTicketForm({ ...ticketForm, customerType: e.target.value })}>
                  {customerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
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
              <p className="sla-hint">⏱ Tiempo estimado de atención: <strong>{SLA_LABELS[ticketForm.urgencyLevel]}</strong></p>
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
                <div className="ticket-status-grid">
                  <div className="status-chip">{trackedTicket.status}</div>
                  <div className="urgency-chip">{trackedTicket.urgencyLevel}</div>
                  {trackedTicket.customerType === 'Iguala' && <div className="iguala-chip">Iguala ⭐</div>}
                </div>
                <p><strong>Cola:</strong> {trackedTicket.ticketsAhead} ticket(s) antes (posición {trackedTicket.queuePosition})</p>
                <p><strong>Tiempo estimado:</strong> {SLA_LABELS[trackedTicket.urgencyLevel]}</p>
                <p><strong>Tiempo restante SLA:</strong> <span className="sla-remaining">{trackedTicket.slaRemaining}</span></p>
                <p><strong>Último avance:</strong> {new Date(trackedTicket.updatedAt).toLocaleString()}</p>

                <h3>Chat del ticket</h3>
                <ul className="messages">
                  {trackedTicket.messages.map((message) => (
                    <li key={message.id} className={`msg msg-${message.senderRole}`}>
                      <p><strong>{message.senderName}</strong> <span className="msg-role">({message.senderRole})</span> — {new Date(message.createdAt).toLocaleString()}</p>
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
                <ol className="timeline">
                  {trackedTicket.timeline.map((event) => (
                    <li key={event.id}>{new Date(event.createdAt).toLocaleString()} — {event.message}</li>
                  ))}
                </ol>

                <h3>Notificaciones</h3>
                <ul className="notif-list">
                  {trackedTicket.notifications.map((n) => (
                    <li key={n.id}>{new Date(n.createdAt).toLocaleString()} — {n.message}</li>
                  ))}
                </ul>
              </>
            )}
          </article>
        </section>
      )}

      {activeView === 'admin' && adminSession && (
        <section className="grid one">
          <div className="admin-tabs">
            <button className={adminSubView === 'tickets' ? 'active' : ''} onClick={() => setAdminSubView('tickets')}>Tickets</button>
            <button className={adminSubView === 'customers' ? 'active' : ''} onClick={() => setAdminSubView('customers')}>Clientes</button>
            <button className={adminSubView === 'kanban' ? 'active' : ''} onClick={() => setAdminSubView('kanban')}>Kanban</button>
          </div>

          {adminSubView === 'tickets' && (
            <article className="card">
              <h2>Dashboard administrativo</h2>
              <div className="grid filters">
                <input placeholder="Buscar por ticket, empresa, RNC o número" value={adminFilters.search} onChange={(e) => setAdminFilters({ ...adminFilters, search: e.target.value })} />
                <select value={adminFilters.status} onChange={(e) => setAdminFilters({ ...adminFilters, status: e.target.value })}>
                  <option value="">Estado</option>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
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
                  <div className="metric-card"><span className="metric-val">{metrics.opened}</span><span>Abiertos</span></div>
                  <div className="metric-card"><span className="metric-val">{metrics.solved}</span><span>Resueltos</span></div>
                  <div className="metric-card"><span className="metric-val">{metrics.avgResponseMinutes} min</span><span>Prom. respuesta</span></div>
                  <div className="metric-card"><span className="metric-val">{metrics.byUrgency?.Crítica ?? 0}</span><span>Críticos</span></div>
                </div>
              )}

              <table>
                <thead>
                  <tr><th>Ticket</th><th>Empresa</th><th>Tipo</th><th>Urgencia</th><th>Estado</th><th>SLA</th><th>Técnico</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {adminTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>{ticket.ticketNumber}</td>
                      <td>{ticket.companyName}</td>
                      <td>{ticket.customerType === 'Iguala' ? <span className="iguala-chip">Iguala ⭐</span> : 'Ocasional'}</td>
                      <td>{ticket.urgencyLevel}</td>
                      <td>
                        <select value={ticket.status} onChange={(e) => updateStatus(ticket.id, e.target.value)}>
                          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>{ticket.slaRemaining}</td>
                      <td>{ticket.assignedTechnician || '—'}</td>
                      <td>
                        <div className="inline">
                          <input placeholder="Asignar técnico" value={technicianDraft[ticket.id] ?? ''} onChange={(e) => setTechnicianDraft({ ...technicianDraft, [ticket.id]: e.target.value })} />
                          <button onClick={() => assignTechnician(ticket.id)}>Asignar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          )}

          {adminSubView === 'customers' && (
            <article className="card">
              <h2>Módulo de clientes</h2>
              <form onSubmit={handleSaveCustomer} className="form compact">
                <label>RNC<input required value={customerForm.rnc} onChange={(e) => setCustomerForm({ ...customerForm, rnc: e.target.value })} /></label>
                <label>Nombre<input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></label>
                <label>Tipo de cliente
                  <select value={customerForm.customerType} onChange={(e) => setCustomerForm({ ...customerForm, customerType: e.target.value })}>
                    {customerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <button type="submit">Guardar cliente</button>
              </form>
              <table>
                <thead><tr><th>RNC</th><th>Nombre</th><th>Tipo</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}><td>{c.rnc}</td><td>{c.name}</td><td>{c.customerType === 'Iguala' ? <span className="iguala-chip">Iguala ⭐</span> : 'Ocasional'}</td></tr>
                  ))}
                </tbody>
              </table>
            </article>
          )}

          {adminSubView === 'kanban' && (
            <article className="card">
              <h2>Vista Kanban</h2>
              <div className="kanban">
                {statuses.map((status) => (
                  <section key={status}>
                    <h4>{status}</h4>
                    {(kanban[status] || []).map((ticket) => (
                      <article key={ticket.id} className="kanban-card">
                        <p>{ticket.ticketNumber}</p>
                        <small>{ticket.companyName}</small>
                        {ticket.customerType === 'Iguala' && <span className="iguala-dot"> ⭐</span>}
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            </article>
          )}
        </section>
      )}

      <footer className="powered-footer">Powered by IT Soluclick SRL</footer>
    </main>
  );
}

export default App;
