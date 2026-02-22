# Bot de Telegram - GGO Automatizaciones

Bot en Node.js + Express + `node-telegram-bot-api` para abrir portones mediante backend HTTP interno.

## Arquitectura actual

- `src/index.js`: servidor Express, webhook de Telegram y health checks.
- `src/bot/bot.js`: inicialización y registro de handlers.
- `src/bot/commands.js`: comandos `/start`, `/help` y `/abrir`.
- `src/api/backendClient.js`: único cliente HTTP bot -> backend.
- `src/routes/notify.js`: endpoint interno para envío de notificaciones Telegram.

## Flujo funcional

1. `/start` muestra guía de uso.
2. `/abrir {id_porton}` ejecuta apertura vía backend:
   - `POST /api/telegram/bot/portones/:id/abrir`
   - Header `x-bot-secret`
   - Body `{ "telegramId": "<id>" }`

## Variables de entorno clave

- `BOT_TOKEN`
- `BACKEND_URL` (o `BACKEND_BASE_URL`/`CONTROLADOR_BASE_URL` como fallback)
- `BACKEND_API_KEY` (opcional)
- `BACKEND_TIMEOUT_MS` (opcional)
- `TELEGRAM_BOT_INTERNAL_SECRET` (requerido para apertura)
- `RAILWAY_PUBLIC_DOMAIN` o `PUBLIC_DOMAIN`
- `WEBHOOK_SECRET` (recomendado)

## Endpoints expuestos por este servicio

- `GET /health`
- `GET /ready`
- `POST /bot` (webhook Telegram)
- `POST /api/telegram/notify`
