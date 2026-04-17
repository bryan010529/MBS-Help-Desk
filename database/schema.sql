-- PostgreSQL schema base para producción
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  rnc VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  customer_type VARCHAR(20) NOT NULL DEFAULT 'Ocasional' CHECK (customer_type IN ('Iguala', 'Ocasional')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(30) NOT NULL CHECK (role IN ('cliente', 'tecnico', 'admin')),
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  ticket_number VARCHAR(30) UNIQUE NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  contact_user_id UUID REFERENCES users(id),
  contact_phone VARCHAR(20) NOT NULL,
  contact_email VARCHAR(255),
  customer_type VARCHAR(20) NOT NULL DEFAULT 'Ocasional' CHECK (customer_type IN ('Iguala', 'Ocasional')),
  assistance_type VARCHAR(20) NOT NULL CHECK (assistance_type IN ('Remota', 'Presencial', 'Consulta')),
  urgency_level VARCHAR(20) NOT NULL CHECK (urgency_level IN ('Baja', 'Media', 'Alta', 'Crítica')),
  status VARCHAR(40) NOT NULL,
  priority_score INT NOT NULL,
  description TEXT NOT NULL,
  assigned_technician_id UUID REFERENCES users(id),
  sla_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  sender_role VARCHAR(30) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_attachments (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message_id UUID REFERENCES ticket_messages(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  mime_type VARCHAR(120),
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ticket_events (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  status_to VARCHAR(40),
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp')),
  recipient TEXT NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority_score DESC, created_at ASC);
CREATE INDEX idx_tickets_sla ON tickets(sla_deadline ASC);
CREATE INDEX idx_companies_rnc ON companies(rnc);
CREATE INDEX idx_companies_type ON companies(customer_type);

