# Informe técnico — Bot de Telegram (Control de Portones)

Documentación de arquitectura e integración. Solo descriptivo, sin propuestas de cambio.

---

## 1. STACK

| Aspecto | Detalle |
|--------|---------|
| **Lenguaje** | JavaScript (ECMAScript modules, `"type": "module"` en `package.json`) |
| **Runtime** | Node.js (requiere `>=18.0.0`) |
| **Librería Telegram** | **Telegraf** v4.16.3 |
| **Tipo de conexión** | **Webhook** (no polling). El servidor Express recibe updates en `POST /bot` y los pasa a `bot.handleUpdate(req.body)`. El webhook se configura al arranque con `bot.telegram.setWebhook(WEBHOOK_URL)` si existe `PUBLIC_DOMAIN` o `RAILWAY_PUBLIC_DOMAIN`. |

Servidor HTTP: **Express** v4.21.0. Variables de entorno: **dotenv** v17.2.4.

---

## 2. INTEGRACIÓN CON BACKEND

### Cómo se comunica con el “cerebro”

- El bot no tiene base de datos ni lógica de negocio. Toda la autorización y datos vienen del backend vía **HTTP**.
- El único módulo que habla con el backend es **`src/api/backendClient.js`**. Se instancia en `src/index.js` con `createBackendClient(BACKEND_BASE_URL, { apiKey, log })` y se inyecta en el bot; los comandos y callbacks llaman a este cliente.

### Endpoints que consume (bot → backend)

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/telegram/tenants?telegram_id={id}` | Obtener portones (gates) asociados al usuario Telegram. El backend devuelve `{ gates: [...] }`; el cliente lo expone como `getGates(telegramId)`. |
| POST | `/api/telegram/command` | Ejecutar acción sobre un portón. Body: `{ telegramId, gateId, action }`. El bot solo usa `action: "OPEN"`. Expuesto como `executeCommand(telegramId, gateId, action)`. |

Rutas fijas en código: `BACKEND_PATH_TENANTS = "/api/telegram/tenants"`, `BACKEND_PATH_COMMAND = "/api/telegram/command"` en `backendClient.js`.

### Endpoint que expone (backend → bot)

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/telegram/notify` | El backend envía mensajes a usuarios. Body: `{ deliveries: [ { telegramUserId, message } ] }`. El bot responde 202 y envía cada mensaje por Telegram; no decide destinatarios ni contenido. |

Definido en `src/routes/notify.js`, registrado en `index.js`.

### Autenticación usada

- **Hacia el backend:** header opcional `X-API-Key` con el valor de `BACKEND_API_KEY` o `CONTROLADOR_API_KEY`. Si no está definido, las peticiones se envían sin ese header.
- **Webhook de Telegram:** opcionalmente, header `x-telegram-bot-api-secret-token` comparado con `WEBHOOK_SECRET`; si `WEBHOOK_SECRET` está definido y el header no coincide, se responde 401 y no se procesa el update.

### Tokens internos

- **BOT_TOKEN:** obligatorio para el bot; sin él el bot no se crea.
- **BACKEND_API_KEY / CONTROLADOR_API_KEY:** opcional; se envía como `X-API-Key` al backend.
- **WEBHOOK_SECRET:** opcional; si está definido, valida el secret token en cada POST al webhook.

No hay otros mecanismos de token documentados en el código (por ejemplo, JWT o sesiones propias).

### Base de datos

- El bot **no usa base de datos**. No hay conexión a PostgreSQL ni a otro almacenamiento en este repositorio. La variable `DATABASE_URL` que puede aparecer en `.env` no se referencia en el código del bot. Los datos de usuarios y portones se obtienen en tiempo real del backend vía HTTP.

---

## 3. ESTRUCTURA DEL BOT

### Organización de comandos

- **Comando único registrado:** `/start`.
- Definido en `src/bot/commands/start.js` mediante `registerStartCommand(bot, opts)`. Obtiene los gates con `backendClient.getGates(telegramUserId)` y muestra un teclado inline con un botón por portón (callback `gate:{gateId}`). Si el backend no está configurado, se registra un handler de `/start` alternativo que informa que el servicio no está configurado.

No hay comandos tipo `/abrir_porton`; la apertura se hace eligiendo un portón en el menú tras `/start`.

### Organización de handlers

- **Comando:** `bot.start(...)` en `start.js`.
- **Callbacks (acciones de botones inline):**
  - **gate:X** — en `src/bot/callbacks/gateSelection.js` (`registerGateSelectionCallback`). Patrón `^gate:(\d+)$`. Llama a `backendClient.executeCommand(telegramUserId, gateId, "OPEN")` y responde al usuario según resultado.
  - **tenant:X** — en `src/bot/callbacks/tenantSelection.js` (`registerTenantSelectionCallback`). **No está registrado** en `bot.js`; el flujo actual no pasa por selección de tenant, solo por lista de gates desde `/start`.

En `bot.js` solo se registran `registerStartCommand` y `registerGateSelectionCallback` cuando el `backendClient` es válido (tiene `getGates`/`getTenants`, `executeCommand` y `isConfigured !== false`).

### Separación por módulos

- **`src/index.js`:** entrada, Express, webhook, health/ready, creación de `backendClient` y bot, registro de ruta notify.
- **`src/api/backendClient.js`:** cliente HTTP al backend (getGates/getTenants, executeCommand); rutas y contratos de respuesta concentrados aquí.
- **`src/bot/bot.js`:** construcción del bot Telegraf y registro de comandos/callbacks.
- **`src/bot/commands/start.js`:** handler de `/start`.
- **`src/bot/callbacks/gateSelection.js`:** handler del callback de selección de portón y envío de OPEN.
- **`src/bot/callbacks/tenantSelection.js`:** handler tenant (no usado en el flujo actual).
- **`src/bot/messages.js`:** textos (errores, prompts, éxito, validación de notify).
- **`src/bot/utils.js`:** helpers (p. ej. `getTelegramUserId(ctx)`).
- **`src/routes/notify.js`:** POST `/api/telegram/notify` y validación del body.

---

## 4. FLUJO DE COMANDO (ejemplo: abrir portón)

No existe el comando literal `/abrir_porton`. El flujo de “abrir portón” es: **/start → elegir portón (botón) → envío de OPEN**.

### Paso 1: Usuario escribe /start

- **Función:** handler `bot.start(...)` en `src/bot/commands/start.js`.
- **Request HTTP:** `GET {BACKEND_BASE_URL}/api/telegram/tenants?telegram_id={ctx.from.id}` (vía `backendClient.getGates(telegramUserId)`).
- **Respuesta esperada del backend:** `200` con body `{ gates: [ { gateId, gateName, identifier?, topic_mqtt? } ] }`. Si no hay `gates`, se usa array vacío.
- **Al usuario:** Si hay gates, se envía el mensaje “Seleccioná el portón:” y un teclado inline con un botón por gate (texto `gateLabel(gateName, gateId)`, callback `gate:{gateId}`). Si error o lista vacía, se envía el mensaje de error correspondiente de `messages.js`.

### Paso 2: Usuario pulsa un botón de portón (ej. “Portón 1”)

- **Función:** handler del callback `gate:(\d+)` en `src/bot/callbacks/gateSelection.js`.
- **Request HTTP:** `POST {BACKEND_BASE_URL}/api/telegram/command` con body:
  - `{ telegramId: ctx.from.id, gateId: <número del callback>, action: "OPEN" }`
  (vía `backendClient.executeCommand(telegramUserId, gateId, "OPEN")`).
- **Respuesta esperada del backend:**  
  - `200` y `{ accepted: true }` → éxito.  
  - `200` y `{ accepted: false, reason: "FORBIDDEN" | "INVALID_ACTION" }` u otro → error controlado.  
  - 4xx/5xx → se trata como error; el cliente puede reintentar en 5xx (hasta 2 reintentos además del intento inicial).
- **Al usuario:** Se hace `answerCbQuery` con “Enviando comando...”. Luego: si `accepted === true`, mensaje “✅ Comando enviado correctamente.”; si no, mensaje con prefijo “⚠️ ” y texto según `reason` (p. ej. “No tenés permiso para usar este portón.”) o mensaje genérico de error.

---

## 5. DEPENDENCIAS CRÍTICAS

### Variables de entorno

| Variable | Obligatoriedad | Uso |
|----------|----------------|-----|
| **BOT_TOKEN** | Obligatoria para que el bot funcione | Token del Bot de Telegram; sin ella no se crea el bot. |
| **BACKEND_BASE_URL** o **CONTROLADOR_BASE_URL** | Obligatoria para flujo /start y comandos | URL base del backend (http/https, sin barra final). Sin ella no se registran handlers de /start ni callback de gate. |
| **RAILWAY_PUBLIC_DOMAIN** o **PUBLIC_DOMAIN** | Necesaria para webhook | Dominio público para armar `WEBHOOK_URL` (ej. `https://{dominio}/bot`). Sin ella no se llama a `setWebhook`. |
| **PORT** | Opcional | Puerto del servidor Express; por defecto 3000. |
| **WEBHOOK_SECRET** | Opcional | Si está definido, se valida en cada POST al webhook y se envía como `secret_token` al configurar el webhook. |
| **BACKEND_API_KEY** o **CONTROLADOR_API_KEY** | Opcional | Se envía como header `X-API-Key` en todas las peticiones al backend. |

Otras variables que pueden estar en `.env` (p. ej. `DATABASE_URL`) no son usadas por el código del bot.

### URLs fijas

- **Webhook path:** `/bot` (constante `WEBHOOK_PATH` en `index.js`).
- **Backend:** `/api/telegram/tenants`, `/api/telegram/command` (constantes en `backendClient.js`).
- **Notify:** `/api/telegram/notify` (en `notify.js`).
- **Health/Ready:** `/health`, `/ready` (en `index.js`).

### Secrets

- **BOT_TOKEN:** secreto; identifica y autoriza el bot ante Telegram.
- **WEBHOOK_SECRET:** secreto; protege el endpoint del webhook.
- **BACKEND_API_KEY / CONTROLADOR_API_KEY:** secreto; autenticación opcional hacia el backend.

---

## 6. ACOPLAMIENTO

### Dependencia del backend actual

- **Alta.** El bot asume un backend con dos contratos concretos:
  - GET `/api/telegram/tenants?telegram_id=...` → `{ gates: [ { gateId, gateName, ... } ] }`.
  - POST `/api/telegram/command` → body `{ telegramId, gateId, action }` y respuestas `{ accepted: true }` o `{ accepted: false, reason }`.
- Sin ese backend (o uno compatible con esos paths y formatos), el flujo de listar portones y abrir no funciona. No hay modo “standalone” con datos locales.

### Hardcodeo de endpoints

- **Sí.** Las rutas del backend están fijas en `backendClient.js`:  
  `BACKEND_PATH_TENANTS = "/api/telegram/tenants"`,  
  `BACKEND_PATH_COMMAND = "/api/telegram/command"`.  
- No hay variables de entorno para cambiar estos paths. Solo la base URL es configurable.

### Estructura de respuesta fija

- **Sí.** El cliente y los handlers asumen:
  - **Tenants/Gates:** propiedad `gates` (array); cada elemento con al menos `gateId` y `gateName` (y opcionalmente `identifier`, `topic_mqtt`) para construir botones y callbacks.
  - **Command:** propiedad `accepted` (boolean); si `accepted === false`, propiedad `reason` (ej. `"FORBIDDEN"`, `"INVALID_ACTION"`) para elegir el mensaje al usuario.
- Los mensajes al usuario están mapeados a esos códigos en `backendClient.js` (p. ej. “No tenés permiso...” para `FORBIDDEN`). Otras razones se tratan como error genérico. Cambios en la forma del backend (nombres de campos, códigos) requieren cambios en el bot.

---

*Fin del informe técnico.*
