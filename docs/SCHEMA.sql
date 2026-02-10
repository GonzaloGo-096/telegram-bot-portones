-- Esquema mínimo esperado por el bot.
-- Ajustar según tu base de datos existente.

-- Usuarios (vinculados a Telegram)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_user_id VARCHAR(50) NOT NULL UNIQUE,
  username VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenants (edificios/propiedades)
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);

-- Asociación usuario-tenant (permisos por edificio)
CREATE TABLE IF NOT EXISTS user_tenants (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  PRIMARY KEY (user_id, tenant_id)
);

-- Gates (portones)
-- controller_id es el ID que se envía al Controlador (ej. "porton1", "porton2")
CREATE TABLE IF NOT EXISTS gates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  controller_id VARCHAR(50) NOT NULL
);

-- Asociación usuario-gate (permisos por portón)
CREATE TABLE IF NOT EXISTS user_gates (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, gate_id)
);

-- Eventos de gate (auditoría)
CREATE TABLE IF NOT EXISTS gate_events (
  id SERIAL PRIMARY KEY,
  gate_id INTEGER NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL DEFAULT 'PRESS',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_gates_controller ON gates(controller_id);
CREATE INDEX IF NOT EXISTS idx_gate_events_created ON gate_events(created_at);
