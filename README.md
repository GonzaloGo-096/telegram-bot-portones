# Bot de Telegram - Control de Portones

Bot de Telegram para control de portones con **PostgreSQL**, **roles dinámicos** y flujo **tenant → portón → acción**. Permisos desde `user_tenants` y `user_gates` (sin hardcode de chat_ids).

## Estructura del proyecto

```
telegram-bot-portones/
├── src/
│   ├── index.js                 # Entry point: Express, webhook, arranque
│   ├── bot/
│   │   ├── bot.js                # Configuración Telegraf
│   │   ├── commands/
│   │   │   ├── start.js          # Handler /start → selección tenant
│   │   │   ├── openGate.js       # Lógica de abrir portón
│   │   │   └── feedback.js       # Endpoint POST /api/feedback
│   │   └── callbacks/
│   │       ├── tenantSelection.js
│   │       └── gateSelection.js
│   ├── db/
│   │   ├── index.js              # Pool PostgreSQL
│   │   └── queries.js            # Queries parametrizadas
│   └── utils/
│       ├── controladorClient.js  # Cliente HTTP al Controlador
│       ├── jwt.js
│       └── permissions.js
├── .env.example
├── package.json
└── README.md
```

## Flujo del bot

1. **`/start`** → El usuario ve sus edificios (tenants) según `user_tenants`.
2. **Selecciona tenant** → Ve los portones (gates) según `user_gates`.
3. **Selecciona portón** → Se envía evento al Controlador y se registra en `gate_events`.

## Requisitos de base de datos

Tablas esperadas: `users`, `user_tenants`, `tenants`, `gates`, `user_gates`, `gate_events`.

Esquema mínimo:

- **users**: `id`, `telegram_user_id` (string), `username`, `created_at`
- **user_tenants**: `user_id`, `tenant_id`, `role`
- **tenants**: `id`, `name`
- **gates**: `id`, `tenant_id`, `name`, `controller_id` (ej. "porton1", "porton2")
- **user_gates**: `user_id`, `gate_id`
- **gate_events**: `id`, `gate_id`, `user_id`, `event_type`, `created_at`

## Configuración

1. Copiar `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Configurar variables en `.env`:
   - `BOT_TOKEN` - Token de @BotFather
   - `DATABASE_URL` - Conexión PostgreSQL
   - `CONTROLADOR_BASE_URL` - URL del Controlador
   - `RAILWAY_PUBLIC_DOMAIN` o `PUBLIC_DOMAIN` - Para webhook

3. Instalar dependencias:
   ```bash
   npm install
   ```

4. Ejecutar:
   ```bash
   npm start
   ```

## Despliegue (Railway)

1. Conectar el repositorio a Railway.
2. Configurar variables de entorno en el dashboard.
3. Railway inyecta `RAILWAY_PUBLIC_DOMAIN` automáticamente.
4. Health check: `GET /health` y `GET /ready`.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /health | Estado del servidor |
| GET | /ready | Listo para recibir tráfico (webhook configurado) |
| POST | /bot | Webhook de Telegram |
| POST | /api/feedback | Recepción de feedback del Controlador |

## Migración desde estructura antigua

- **Eliminar** archivos en raíz: `index.js`, `bot.js`, `controladorClient.js`, `feedback.js`.
- **Conservar** `.env` (actualizar con `DATABASE_URL`).
- El nuevo entry point es `src/index.js`; el script `npm start` apunta a él.
