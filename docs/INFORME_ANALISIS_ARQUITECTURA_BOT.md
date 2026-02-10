# INFORME — Análisis arquitectónico del Bot de Telegram (Control de Portones)

**Fecha:** 9 de febrero de 2025  
**Objetivo:** Análisis técnico profundo del código, sin propuestas de implementación.

---

## 1. Mapa del proyecto

### Estructura de directorios

```
telegram-bot-portones/
├── src/
│   ├── index.js              # Entrypoint: Express, webhook, feedback, shutdown
│   ├── no-test-db.js         # Script de prueba de conexión DB (no parte del runtime)
│   ├── bot/
│   │   ├── bot.js            # Creación y configuración del bot Telegraf
│   │   ├── commands/
│   │   │   ├── start.js      # Handler /start
│   │   │   ├── openGate.js   # Lógica de apertura (llamado por gateSelection)
│   │   │   └── feedback.js   # Registro de ruta POST /api/feedback
│   │   └── callbacks/
│   │       ├── tenantSelection.js  # Callback tenant:X
│   │       └── gateSelection.js   # Callback gate:X
│   ├── db/
│   │   ├── index.js          # Pool PostgreSQL
│   │   └── queries.js        # Todas las queries parametrizadas
│   └── utils/
│       ├── controladorClient.js  # HTTP POST al Controlador Central
│       ├── permissions.js       # getUserWithTenants, getGatesForUser, checkGateAccess
│       └── jwt.js               # verifyToken, signToken (no usado en el proyecto)
├── docs/
│   ├── SCHEMA.sql            # Esquema de tablas
│   └── ...
├── .env.example
└── package.json
```

### Responsabilidades por archivo

| Archivo | Responsabilidad |
|---------|-----------------|
| **src/index.js** | Inicialización Express, webhook `/bot`, health/ready, feedback route, shutdown, configuración webhook Telegram |
| **src/bot/bot.js** | Crear instancia Telegraf, registrar comandos y callbacks, pasar dependencias (controlador, log) |
| **src/bot/commands/start.js** | Comando `/start`: obtener usuario, tenants, mostrar botones inline |
| **src/bot/commands/openGate.js** | Verificar permisos, obtener gate, enviar evento al Controlador, registrar en `gate_events` |
| **src/bot/commands/feedback.js** | Endpoint POST `/api/feedback`: validar body, buscar gate, usuarios con acceso, enviar mensajes via bot |
| **src/bot/callbacks/tenantSelection.js** | Callback `tenant:X`: obtener/crear usuario, gates del tenant, mostrar botones |
| **src/bot/callbacks/gateSelection.js** | Callback `gate:X`: obtener/crear usuario, llamar `openGate`, responder al usuario |
| **src/db/index.js** | Crear y cerrar pool PostgreSQL |
| **src/db/queries.js** | CRUD: users, tenants, gates, user_tenants, user_gates, gate_events |
| **src/utils/controladorClient.js** | POST a `{baseUrl}/api/events` con payload `{portonId, event}` |
| **src/utils/permissions.js** | Orquestar queries para getUserWithTenants, getGatesForUser, checkGateAccess |
| **src/utils/jwt.js** | Utilidades JWT (no importadas en ningún archivo) |

---

## 2. Cómo se obtiene el Telegram User ID

### Ubicación y objeto usado

| Handler | Archivo | Objeto usado | Variable |
|---------|---------|--------------|----------|
| `/start` | `start.js` | `ctx.from?.id` | `telegramUserId` |
| `tenant:X` | `tenantSelection.js` | `ctx.from?.id` | `telegramUserId` |
| `gate:X` | `gateSelection.js` | `ctx.from?.id` | `telegramUserId` |

### Patrón observado

- **No centralizado:** cada handler obtiene `ctx.from?.id` de forma independiente.
- **Mismo patrón:** todos usan `ctx.from?.id` y `ctx.from?.username ?? null`.
- **Validación repetida:** en los tres handlers se comprueba `if (!telegramUserId)` y se responde con mensaje de error.
- **Contexto:** En `callback_query`, `ctx.from` está disponible igual que en `message` (Telegraf lo expone en ambos casos).

### Uso adicional del ID

- **Feedback:** `getUsersWithAccessToGate` devuelve `telegram_user_id`; se usa como `chatId` para `bot.telegram.sendMessage()`. En chats privados, `chat_id === telegram_user_id`, lo cual es correcto.

---

## 3. Handlers existentes

### 3.1 Comando `/start`

- **Registro:** `bot.start()` en `start.js`
- **Flujo:**  
  1. Obtener `telegramUserId`, `username`, `chatId`  
  2. `getUserWithTenants(telegramUserId, username)` → crea usuario si no existe, obtiene tenants  
  3. Si error o sin tenants → mensaje de error  
  4. Mostrar inline keyboard con tenants  
- **Dependencias:** `getUserWithTenants` (permissions.js → queries.js)

### 3.2 Callback `tenant:X`

- **Registro:** `bot.action(/^tenant:(\d+)$/, ...)` en `tenantSelection.js`
- **Flujo:**  
  1. Parsear `tenantId` del `callback_data`  
  2. Obtener `telegramUserId`, `username`  
  3. `getOrCreateUserByTelegramId` → crea usuario si no existe  
  4. `getGatesForUser(user.id, tenantId)`  
  5. Si error o sin gates → mensaje de error  
  6. `answerCbQuery()`  
  7. Mostrar inline keyboard con gates  
- **Dependencias:** `getOrCreateUserByTelegramId`, `getGatesForUser`

### 3.3 Callback `gate:X`

- **Registro:** `bot.action(/^gate:(\d+)$/, ...)` en `gateSelection.js`
- **Flujo:**  
  1. Parsear `gateId` del `callback_data`  
  2. Obtener `telegramUserId`, `username`  
  3. `getOrCreateUserByTelegramId`  
  4. `openGate({ gateId, userId: user.id, ... })`  
  5. `answerCbQuery("Enviando comando...")`  
  6. Responder con éxito o error según `openGate`  
- **Dependencias:** `openGate`, `getOrCreateUserByTelegramId`

### 3.4 Endpoint POST `/api/feedback` (no es handler de Telegram)

- **Registro:** `app.post("/api/feedback", ...)` en `feedback.js`
- **Flujo:**  
  1. Validar body (`portonId`, `previousState`, `currentState`, `timestamp`)  
  2. Responder 202 inmediatamente  
  3. Buscar gate por `controller_id`  
  4. Obtener usuarios con acceso al gate  
  5. Enviar mensaje a cada `telegram_user_id` via `bot.telegram.sendMessage`  
- **Dependencias:** `getGateByControllerId`, `getUsersWithAccessToGate`

### 3.5 Otros comandos o mensajes

- **No hay:** ningún handler para mensajes de texto, otros comandos, ni otros tipos de `callback_query`.
- **Comportamiento:** mensajes no manejados pasan sin respuesta explícita (Telegraf no tiene un handler por defecto para ellos).

---

## 4. Comunicación externa

### 4.1 HTTP saliente (bot → Controlador)

| Destino | Arquitecto | Endpoint | Método | Formato |
|---------|------------|----------|--------|---------|
| Controlador Central | `controladorClient.js` | `{CONTROLADOR_BASE_URL}/api/events` | POST | JSON: `{ portonId, event }` |

- **Headers:** `Content-Type: application/json`, `X-API-Key` (si `CONTROLADOR_API_KEY` está definido)
- **Timeout:** 5000 ms
- **Reintentos:** hasta 2 reintentos con backoff
- **Uso:** solo en `openGate` para enviar evento `PRESS` al abrir un portón

### 4.2 HTTP entrante (Controlador → bot)

| Origen | Endpoint | Método | Formato esperado |
|--------|----------|--------|------------------|
| Controlador Central | `/api/feedback` | POST | `{ portonId, previousState, currentState, timestamp? }` |

- **Validación:** `validarFeedbackBody()` comprueba tipos y campos obligatorios
- **Seguridad:** no hay validación de origen (API key, JWT, etc.) en el código actual
- **Comportamiento:** devuelve 202 y procesa en background; envía mensajes a usuarios con acceso al gate

### 4.3 Llamadas a Telegram API

- **Webhook:** Telegram envía updates a `POST /bot` (path configurable via `WEBHOOK_PATH`)
- **Saliente:** `bot.telegram.sendMessage(chatId, text)` para feedback
- **Otros:** Telegraf usa la API de Telegram para replies, `answerCbQuery`, etc.

---

## 5. Nivel de acoplamiento

### 5.1 Lógica de negocio en el bot

| Responsabilidad | Ubicación | Observación |
|-----------------|-----------|-------------|
| Decidir qué tenants puede ver un usuario | `permissions.js` + `queries.js` | El bot llama directamente a la DB |
| Decidir qué gates puede ver un usuario | `permissions.js` + `queries.js` | Idem |
| Validar permiso para abrir un gate | `openGate.js` → `checkGateAccess` | Idem |
| Crear usuarios si no existen | `getOrCreateUserByTelegramId` en varios handlers | El bot crea usuarios |
| Enviar evento al Controlador | `openGate.js` → `controladorClient.js` | El bot orquesta la acción |
| Registrar eventos en `gate_events` | `openGate.js` → `insertGateEvent` | El bot escribe auditoría |
| A quién notificar en feedback | `getUsersWithAccessToGate` | El bot consulta DB y decide destinatarios |

### 5.2 Acceso directo a base de datos

- **Pool:** `src/db/index.js` usa `DATABASE_URL`
- **Queries usadas:**  
  - `getOrCreateUserByTelegramId` (crea usuarios)  
  - `getTenantsForUser`  
  - `getGatesForUserInTenant`  
  - `canUserAccessGate`  
  - `getGateById`  
  - `insertGateEvent`  
  - `getUsersWithAccessToGate`  
  - `getGateByControllerId`
- **Conclusión:** el bot es el único consumidor de la DB y asume toda la lógica de permisos y auditoría.

### 5.3 Creación de usuarios

- **Cuándo:** en `getOrCreateUserByTelegramId` cuando no existe el usuario
- **Dónde se llama:**  
  - `getUserWithTenants` (usado en `/start`)  
  - `tenantSelection` (al elegir tenant)  
  - `gateSelection` (al elegir gate)
- **Datos guardados:** `telegram_user_id`, `username`, `created_at`
- **Observación:** el bot crea usuarios automáticamente sin flujo de registro externo.

---

## 6. Variables de entorno

| Variable | Obligatoria | Uso | Producción |
|----------|-------------|-----|------------|
| `BOT_TOKEN` | Sí | Token del bot de Telegram | Sí |
| `PORT` | No (default 3000) | Puerto Express | Sí |
| `RAILWAY_PUBLIC_DOMAIN` | Sí (webhook) | Dominio público para webhook | Sí (Railway) |
| `PUBLIC_DOMAIN` | Alternativa | Dominio si no se usa Railway | Sí |
| `WEBHOOK_SECRET` | No | Validar `x-telegram-bot-api-secret-token` en POST /bot | Recomendado en prod |
| `DATABASE_URL` | Sí | Conexión PostgreSQL | Sí |
| `CONTROLADOR_BASE_URL` | Sí (para abrir) | URL del Controlador | Sí |
| `CONTROLADOR_API_KEY` | No | Header X-API-Key al Controlador | Opcional |
| `JWT_SECRET` | No | Usado por `jwt.js` (no referenciado) | N/A |

**Notas:**

- `RAILWAY_PUBLIC_DOMAIN` / `PUBLIC_DOMAIN` son necesarias para configurar el webhook en producción.
- `WEBHOOK_SECRET` debería estar solo en producción con un valor secreto.
- `jwt.js` existe pero no se importa en ningún archivo; `JWT_SECRET` no se usa en el flujo actual.

---

## 7. Flujo actual del bot

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARRANQUE (src/index.js)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. getPool() → verificar conexión DB                                        │
│ 2. createBot() → Telegraf + registerStartCommand + callbacks                │
│ 3. Express: /health, /ready, POST /bot (webhook), POST /api/feedback         │
│ 4. listen(PORT) → setWebhook(WEBHOOK_URL)                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO USUARIO: /start → tenant → gate                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Usuario envía /start                                                        │
│       │                                                                      │
│       ▼                                                                      │
│  start.js: ctx.from.id → getUserWithTenants()                                │
│       │                    └─ getOrCreateUserByTelegramId (si no existe)     │
│       │                    └─ getTenantsForUser()                            │
│       │                                                                      │
│       ▼                                                                      │
│  Reply: "Selecciona el edificio" + botones tenant:1, tenant:2, ...           │
│       │                                                                      │
│  Usuario pulsa tenant:X                                                      │
│       │                                                                      │
│       ▼                                                                      │
│  tenantSelection.js: getOrCreateUserByTelegramId → getGatesForUser()          │
│       │                                                                      │
│       ▼                                                                      │
│  Reply: "Selecciona el portón" + botones gate:1, gate:2, ...                 │
│       │                                                                      │
│  Usuario pulsa gate:X                                                        │
│       │                                                                      │
│       ▼                                                                      │
│  gateSelection.js: getOrCreateUserByTelegramId → openGate()                   │
│       │                    └─ checkGateAccess()                              │
│       │                    └─ getGateById()                                   │
│       │                    └─ enviarEvento() → POST /api/events (Controlador) │
│       │                    └─ insertGateEvent()                               │
│       │                                                                      │
│       ▼                                                                      │
│  Reply: "✅ Comando enviado al {gateName}" o "⚠️ {error}"                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO FEEDBACK: Controlador → Usuarios                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Controlador POST /api/feedback { portonId, previousState, currentState }     │
│       │                                                                      │
│       ▼                                                                      │
│  feedback.js: validarFeedbackBody → res 202                                  │
│       │                                                                      │
│       ▼                                                                      │
│  getGateByControllerId(portonId) → getUsersWithAccessToGate(gate.id)         │
│       │                                                                      │
│       ▼                                                                      │
│  Para cada usuario: bot.telegram.sendMessage(telegram_user_id, mensaje)      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Problemas de arquitectura

### 8.1 Acoplamiento fuerte

- El bot **consulta directamente** la base de datos para permisos, gates y usuarios.
- No hay capa de servicio/API de negocio separada: el bot es la única aplicación que consume la DB.

### 8.2 Lógica de negocio en el bot

- El bot toma decisiones de negocio: quién puede ver qué tenants/gates, si puede abrir un gate, a quién notificar.
- Creación de usuarios: el bot crea usuarios automáticamente sin flujo de registro controlado.

### 8.3 Falta de autenticación en endpoints propios

- `/api/feedback` no valida que el request provenga del Controlador (sin API key, JWT ni firma).
- Cualquier cliente que conozca la URL puede enviar feedback falso.

### 8.4 Código no utilizado

- `jwt.js` no se importa en ningún archivo; `JWT_SECRET` no se usa en el flujo actual.

### 8.5 Duplicación de lógica

- `getOrCreateUserByTelegramId` se llama en `getUserWithTenants`, `tenantSelection` y `gateSelection`; en `/start` se pasa por `getUserWithTenants`, y en los callbacks se llama directamente.
- Obtención de `telegramUserId` y validación repetida en cada handler.

### 8.6 Uso de `telegram_user_id` como chat_id

- En feedback se usa `telegram_user_id` como `chatId` para `sendMessage`. Asume que el usuario solo habla por chat privado.
- Si en el futuro se usaran grupos, `chat_id` sería distinto del `user_id`.

---

## 9. Qué partes están bien diseñadas

### 9.1 Separación de responsabilidades

- `commands` y `callbacks` separados; `openGate` como función reutilizable.
- `controladorClient` encapsula la comunicación HTTP con el Controlador.
- `permissions.js` agrupa la lógica de permisos y evita duplicar SQL en handlers.

### 9.2 Queries parametrizadas

- Uso de placeholders `$1`, `$2` en `queries.js` para evitar SQL injection.

### 9.3 Webhook y Express

- Webhook configurado de forma explícita; respuesta 200 antes de procesar para evitar timeouts.
- `WEBHOOK_SECRET` opcional para validar origen.
- Endpoints `/health` y `/ready` para monitoring/rollout.

### 9.4 Shutdown limpio

- Manejo de SIGTERM/SIGINT, cierre del pool de DB y del servidor con timeout.

### 9.5 Request ID y logging

- `requestId` en cada request y headers `X-Request-Id` para trazabilidad.

### 9.6 Retries en controladorClient

- Reintentos con backoff en llamadas al Controlador.

### 9.7 Permisos dinámicos

- No hay IDs hardcodeados; permisos vienen de `user_tenants` y `user_gates`.

---

## 10. Qué responsabilidades NO debería tener el bot

| Responsabilidad actual | Motivo |
|------------------------|--------|
| **Crear usuarios** | Debería delegarse a un servicio de registro/onboarding que controle datos y validaciones. |
| **Consultar permisos directamente a la DB** | Debería hacerlo un servicio de autorización o API que el bot consuma. |
| **Decidir qué tenants/gates mostrar** | Es lógica de negocio que debería vivir en un backend. |
| **Registrar en `gate_events`** | Es auditoría de negocio; convendría un servicio de eventos. |
| **Resolver destinatarios de feedback** | Debería venir de un servicio que resuelva “quiénes deben recibir este evento”. |
| **Validar estructura de feedback** | Encaja mejor en un gateway/API que normalice y enrute eventos. |

---

## 11. Facilidad para adaptarlo a un “bot solo interfaz”

### Qué implicaría “bot solo interfaz”

- El bot solo: muestra UI, captura input, envía comandos y muestra feedback.
- Otra capa (API/servicios) se encarga de: usuarios, permisos, eventos, Controlador, auditoría.

### Escenario actual vs deseado

| Aspecto | Estado actual | Para “solo interfaz” |
|---------|----------------|----------------------|
| Creación de usuarios | Bot llama a DB | API de registro / onboarding |
| Permisos | Bot consulta DB | API “¿puede X hacer Y?” |
| Tenant/gate list | Bot consulta DB | API “tenants de usuario”, “gates de tenant” |
| Abrir portón | Bot orquesta todo | API “abrir portón” que llame al Controlador y registre eventos |
| Feedback | Bot recibe POST, consulta DB, envía | Servicio que reciba feedback, resuelva destinatarios y notifique (bot sería un canal de notificación) |

### Grado de facilidad

- **Medio–alto esfuerzo:** el bot está acoplado a la DB y a la lógica de negocio.
- **Cambios necesarios:**  
  1. Introducir API/servicios que expongan: usuarios, permisos, tenants, gates, “abrir portón”, “recibir feedback”.  
  2. Sustituir llamadas a `queries.js` y `permissions.js` por llamadas HTTP a esa API.  
  3. Mover creación de usuarios, permisos, auditoría y destinatarios de feedback a la API.  
  4. Mantener en el bot únicamente: dibujar UI, enviar comandos a la API y mostrar respuestas/errores.

### Ventajas actuales

- Los handlers ya están separados por comando/callback.
- `openGate` es una función aislada que podría reemplazarse por una llamada a API.
- `controladorClient` podría moverse al backend; el bot solo recibiría “abrir portón” ya resuelto.
- La estructura de `permissions.js` y `queries.js` sirve como referencia para el diseño de la futura API.

---

## 12. Resumen ejecutivo

| Criterio | Evaluación |
|----------|------------|
| **Estructura del proyecto** | Clara: entrypoint, bot, commands, callbacks, db, utils. |
| **Telegram User ID** | Usado de forma consistente (`ctx.from?.id`) pero no centralizado. |
| **Handlers** | Solo `/start` + 2 callbacks (`tenant:X`, `gate:X`). Sin manejo de otros mensajes. |
| **Comunicación externa** | Saliente: POST al Controlador. Entrante: POST `/api/feedback` sin validación de origen. |
| **Acoplamiento** | Alto: el bot consulta DB, crea usuarios, decide permisos, registra eventos. |
| **Variables de entorno** | Bien documentadas en `.env.example`; `JWT_SECRET` y `jwt.js` sin uso. |
| **Bot solo interfaz** | Requiere extraer lógica a API/servicios; la estructura actual facilita el refactor. |

---

*Fin del informe. No se proponen cambios de implementación.*
