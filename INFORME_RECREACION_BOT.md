# Informe de Recreación del Bot de Telegram - Control de Portones

**Proyecto:** telegram-bot-portones  
**Fecha:** 8 de febrero de 2025  
**Objetivo:** Extraer toda la información necesaria para recrear el bot con integración profesional a base de datos (`users`, `user_tenants`, `gates`, `user_gates`, `gate_events`, `tenants`)

---

## 1. Mapa completo del proyecto

### 1.1 Estructura actual (carpeta raíz)

```
telegram-bot-portones/
├── index.js                    # Entry point: Express, webhook, arranque
├── bot.js                      # Lógica del bot Telegraf (comandos, acciones)
├── controladorClient.js        # Cliente HTTP al Controlador Central
├── feedback.js                 # Endpoint POST /api/feedback y notificaciones
├── package.json                # Dependencias: express, telegraf
├── package-lock.json
├── .env.example                # Plantilla de variables (documentada)
├── .env.template                # Plantilla mínima (redundante)
├── .env                         # Variables reales (NO subir, en .gitignore)
├── .gitignore
├── README.md                    # Documentación (desactualizada respecto a estructura)
├── INFORME_INTEGRACION_CONTROLADOR.md  # Informe previo
└── node_modules/                # Dependencias
```

**No existen carpetas `src/`, `api/` ni `commands/`.** El README las menciona pero la estructura real es plana.

---

### 1.2 Tabla de archivos: función, responsabilidad y acción recomendada

| Archivo | Función | Responsabilidad | Acción |
|---------|---------|-----------------|--------|
| **index.js** | Entry point | Express, webhook `/bot`, `/health`, `/ready`, registro de feedback, arranque, shutdown | **REESCRIBIR**: mantener servidor/express; integrar DB para permisos y sesión |
| **bot.js** | Lógica del bot | Comandos `/start`, botones inline, validación `ALLOWED_CHAT_IDS`, callback `PORTON_1`/`PORTON_2` | **REESCRIBIR**: reemplazar `ALLOWED_CHAT_IDS` por consultas a `user_tenants`/`user_gates`; flujo tenant → gate → acción |
| **controladorClient.js** | Cliente HTTP | `enviarEvento()` → POST al Controlador Central | **MANTENER** (con ajustes): usarlo para enviar comandos; el `portonId` vendrá de `gates` |
| **feedback.js** | Feedback del Controlador | POST `/api/feedback`, validación body, envío a chats autorizados | **REESCRIBIR**: notificar según `user_gates`/`gate_events`; no usar `ALLOWED_CHAT_IDS` |
| **package.json** | Dependencias | express, telegraf | **MANTENER** + añadir cliente DB (pg, prisma, etc.) |
| **.env.example** | Variables de entorno | Plantilla con documentación | **REESCRIBIR**: añadir `DATABASE_URL`, quitar `ALLOWED_CHAT_IDS` si se usa DB |
| **.env.template** | Plantilla mínima | Versión resumida | **BORRAR** (redundante con .env.example) |
| **README.md** | Documentación | Uso, deploy | **REESCRIBIR**: ajustar a estructura real (Railway, no Vercel) |
| **INFORME_INTEGRACION_CONTROLADOR.md** | Informe previo | Guía de integración | **MANTENER** como referencia histórica |

---

### 1.3 Carpetas necesarias para la nueva arquitectura

| Carpeta | Propósito |
|---------|-----------|
| `src/` | Código fuente principal |
| `src/commands/` | Handlers de comandos (`/start`, `/help`, etc.) |
| `src/handlers/` | Handlers de callbacks (botones, flujo tenant → gate) |
| `src/services/` | Lógica de negocio (DB, Controlador) |
| `src/utils/` | Helpers (parseAllowedChatIds, formatear nombres, etc.) |
| `src/db/` | Conexión DB, queries, modelos |

---

## 2. Handlers y comandos de Telegram

### 2.1 Comandos

| Comando | Trigger | Handler | Archivo | Respuesta |
|---------|---------|---------|---------|-----------|
| `/start` | Mensaje de texto | `bot.start()` | bot.js (L69-80) | "Bot de portones activo." + teclado inline con 2 botones |

---

### 2.2 Botones (Inline Keyboard)

| Botón | `callback_data` | Handler | Archivo | Acción |
|-------|-----------------|---------|---------|--------|
| Portón 1 | `PORTON_1` | `bot.action(/^PORTON_(1\|2)$/)` | bot.js (L83-115) | `answerCbQuery` + `enviarEvento(porton1, PRESS)` + mensaje éxito/error |
| Portón 2 | `PORTON_2` | Mismo | bot.js (L83-115) | Igual con `porton2` |

**No hay Reply Keyboard** (teclado de respuestas).

---

### 2.3 Eventos especiales

| Evento | Handler | Archivo | Descripción |
|--------|---------|---------|-------------|
| `callback_query` | `bot.action(/^PORTON_(1\|2)$/)` | bot.js (L83-115) | Callback al pulsar botón inline |
| ` message` (texto) | `bot.start()` | bot.js (L69-80) | Solo `/start` implementado; no hay otros textos |
| `bot.catch()` | Error handler | bot.js (L65-67) | Log de errores |

**No hay handlers para:** `/help`, mensajes de texto genéricos, edits, fotos, etc.

---

### 2.4 Mapeo de callback_data → portón

```javascript
// bot.js L9-19
const PORTON_MAP = {
  PORTON_1: "porton1",
  PORTON_2: "porton2",
};
const PORTON_NOMBRE = {
  PORTON_1: "Portón 1",
  PORTON_2: "Portón 2",
};
```

**Actualmente hardcodeado.** En la nueva arquitectura debe obtenerse de la tabla `gates`.

---

## 3. Variables de entorno

### 3.1 Extracción completa

| Variable | Tipo | Obligatoria | Archivo donde se usa | Uso |
|----------|------|-------------|----------------------|-----|
| `BOT_TOKEN` | string | Sí | index.js (L9), bot.js (createBot) | Token de @BotFather; inicialización Telegraf |
| `PORT` | number | No | index.js (L7) | Puerto Express; default 3000 |
| `RAILWAY_PUBLIC_DOMAIN` | string | Sí* | index.js (L11) | Dominio para webhook; Railway lo inyecta |
| `PUBLIC_DOMAIN` | string | Sí* | index.js (L11) | Alternativa si no usas Railway |
| `WEBHOOK_SECRET` | string | No | index.js (L13, L166-172, L213) | Validación header `x-telegram-bot-api-secret-token` en POST `/bot` |
| `CONTROLADOR_BASE_URL` | string | Sí | index.js (L18), controladorClient.js | URL base del Controlador; POST `/api/events` |
| `CONTROLADOR_API_KEY` | string | Depende | index.js (L19), controladorClient.js | Header `X-API-Key` para autenticar al Controlador |
| `ALLOWED_CHAT_IDS` | string | Recomendada | index.js (L21), bot.js, feedback.js | Chat IDs permitidos, separados por coma; validación de acceso |

\* Al menos una de `RAILWAY_PUBLIC_DOMAIN` o `PUBLIC_DOMAIN` para webhook en producción.

---

### 3.2 .env.example sugerido (incluyendo DB)

```env
# =============================================================================
# Bot de Telegram - Control de Portones (con base de datos)
# =============================================================================
# cp .env.example .env  y reemplazar los valores <...>

# -----------------------------------------------------------------------------
# Telegram Bot
# -----------------------------------------------------------------------------
BOT_TOKEN=<tu_token_de_telegram>

# -----------------------------------------------------------------------------
# Servidor HTTP
# -----------------------------------------------------------------------------
PORT=3000

# -----------------------------------------------------------------------------
# Webhook (producción)
# -----------------------------------------------------------------------------
RAILWAY_PUBLIC_DOMAIN=<tu-app.railway.app>
# PUBLIC_DOMAIN=<tu-dominio.com>
WEBHOOK_SECRET=

# -----------------------------------------------------------------------------
# Base de datos (PostgreSQL)
# -----------------------------------------------------------------------------
DATABASE_URL=postgresql://user:password@host:5432/database

# -----------------------------------------------------------------------------
# Controlador Central de Portones
# -----------------------------------------------------------------------------
CONTROLADOR_BASE_URL=https://controlador-central-portones-production.up.railway.app
CONTROLADOR_API_KEY=

# -----------------------------------------------------------------------------
# Seguridad (legacy - solo si NO se usa DB para permisos)
# -----------------------------------------------------------------------------
# Si está vacío y usas DB, los permisos vienen de user_tenants y user_gates.
ALLOWED_CHAT_IDS=
```

---

## 4. Interacción con la base de datos

### 4.1 Estado actual

**El bot actual NO usa base de datos.** Todo está hardcodeado:

- Portones: `porton1`, `porton2`
- Permisos: `ALLOWED_CHAT_IDS` (variable de entorno)
- Sin tablas, queries ni inserciones

---

### 4.2 Integración requerida con la nueva DB

| Tabla | Uso en el bot |
|-------|---------------|
| `users` | Vinculación `telegram_user_id` ↔ `user.id`; login/registro |
| `user_tenants` | Determinar tenants a los que tiene acceso el usuario |
| `tenants` | Listar propiedades/edificios para seleccionar |
| `gates` | Listar portones del tenant seleccionado; `gates.id` para enviar al Controlador |
| `user_gates` | Permisos por portón; validar si el usuario puede abrir el portón |
| `gate_events` | Registrar evento (quién, cuándo, qué portón); feedback del Controlador |

---

### 4.3 Queries necesarias (a implementar)

| Operación | Tabla(s) | Descripción |
|-----------|----------|-------------|
| Obtener usuario por `telegram_user_id` | `users` | SELECT para identificar usuario |
| Listar tenants del usuario | `user_tenants` + `tenants` | JOIN para mostrar opciones |
| Listar gates del tenant | `gates` | WHERE tenant_id = ? |
| Verificar permiso en portón | `user_gates` | WHERE user_id = ? AND gate_id = ? |
| Registrar evento | `gate_events` | INSERT al abrir portón |
| Chats a notificar en feedback | `user_gates` / `users` | Quién debe recibir notificación de cambio de estado |

---

### 4.4 Relación con handlers de Telegram

| Handler | Relación con DB |
|---------|-----------------|
| `/start` | Buscar/crear usuario por `ctx.from.id`; mostrar tenants si ya existe; si no, flujo de registro |
| Selección tenant | Query `user_tenants` + `tenants`; mostrar inline buttons |
| Selección portón | Query `gates` (por tenant) + validar `user_gates` |
| Acción abrir portón | Validar `user_gates`; INSERT `gate_events`; llamar `enviarEvento()` con `gate.id` o `gate.controller_id` |
| POST `/api/feedback` | Recibir `portonId`; buscar `gates`; notificar a usuarios con permiso en ese gate |

---

## 5. Informe estructurado: reemplazar, mantener, reescribir

### 5.1 Archivos a reemplazar (reescribir por completo)

| Archivo | Motivo |
|---------|--------|
| `bot.js` | Flujo actual: `/start` → 2 botones fijos. Nuevo: `/start` → tenant → gate → acción. Permisos desde DB. |
| `feedback.js` | Destinatarios hoy: `ALLOWED_CHAT_IDS`. Nuevo: usuarios con `user_gates` sobre el gate afectado. |

---

### 5.2 Archivos a mantener (con ajustes menores)

| Archivo | Qué mantener | Qué ajustar |
|---------|--------------|-------------|
| `index.js` | Express, webhook, `/health`, `/ready`, shutdown, middleware | Conectar DB al arranque; pasar cliente DB a bot |
| `controladorClient.js` | `enviarEvento()`, reintentos, timeout | Recibir `portonId`/`gateId` desde caller; posible mapeo `gates.controller_id` → formato Controlador |
| `package.json` | express, telegraf | Añadir `pg` o `prisma` según stack |
| `.env.example` | Estructura y documentación | Añadir `DATABASE_URL`; documentar cambio de permisos |

---

### 5.3 Archivos a borrar

| Archivo | Motivo |
|---------|--------|
| `.env.template` | Redundante con `.env.example` |

---

### 5.4 Código reutilizable tal cual

| Componente | Ubicación | Uso |
|------------|-----------|-----|
| `parseAllowedChatIds()` | bot.js | Mantener si se usa fallback con `ALLOWED_CHAT_IDS` en desarrollo |
| `isChatAllowed()` | bot.js | Idem; o eliminar si solo se usa DB |
| `enviarEvento()` | controladorClient.js | Llamada directa; solo cambiar origen de `portonId` |
| `normalizeBaseUrl()` | controladorClient.js | Sin cambios |
| `validarFeedbackBody()` | feedback.js | Mantener validación de body |
| `formatearNombrePorton()` | feedback.js | Mantener o ampliar si `gates` tiene nombre |
| Lógica de webhook (POST `/bot`, secret) | index.js | Sin cambios |
| Lógica de shutdown | index.js | Sin cambios |

---

### 5.5 Código que requiere reescritura para integrar la nueva DB

| Componente | Cambio necesario |
|------------|-------------------|
| Mapeo PORTON_MAP / PORTON_NOMBRE | Eliminar; obtener gates desde `gates` por tenant |
| Handler `/start` | 1) Buscar usuario por `telegram_user_id`; 2) Si no existe, registro; 3) Listar tenants con inline buttons |
| Handler callback PORTON_1/2 | Reemplazar por: 1) callback `tenant:X` → listar gates; 2) callback `gate:Y` → enviar evento y registrar en `gate_events` |
| Validación de permisos | De `isChatAllowed(chatId, allowedChatIds)` a consulta `user_gates` |
| Destinatarios de feedback | De `ALLOWED_CHAT_IDS` a query de usuarios con permiso en el gate afectado |

---

## 6. Estructura propuesta para el proyecto recreado

```
ProyectoBot/
├── index.js                    # Entry point: Express, webhook, DB init
├── src/
│   ├── bot.js                  # createBot(), registro de handlers
│   ├── commands/
│   │   ├── start.js            # Handler /start → tenant selection
│   │   └── help.js             # Handler /help (opcional)
│   ├── handlers/
│   │   ├── tenant.js           # Callback tenant:X → listar gates
│   │   └── gate.js             # Callback gate:Y → enviar evento, registrar
│   ├── services/
│   │   ├── controladorClient.js # enviarEvento() (mover desde raíz)
│   │   ├── userService.js      # getOrCreateUserByTelegramId, getTenants, getGates
│   │   └── permissionService.js # canAccessGate(userId, gateId)
│   ├── db/
│   │   ├── connection.js       # Pool/cliente PostgreSQL
│   │   ├── users.js            # Queries users
│   │   ├── userTenants.js      # Queries user_tenants
│   │   ├── gates.js            # Queries gates
│   │   └── gateEvents.js       # INSERT gate_events
│   └── utils/
│       ├── parseAllowedChatIds.js  # Si se mantiene fallback
│       └── formatearNombre.js      # Portón, tenant
├── feedback.js                 # POST /api/feedback (reescrito para DB)
├── .env.example
├── package.json
└── README.md
```

---

## 7. Descripción por archivo propuesto

### `index.js`
- **Función:** Arranque del servidor Express, configuración del webhook, registro de rutas.
- **Reescritura:** Inicializar conexión DB; pasar cliente DB a `createBot` y `registerFeedbackRoute`.

### `src/bot.js`
- **Función:** Crear instancia Telegraf, registrar comandos y handlers.
- **Reescritura:** Importar handlers desde `commands/` y `handlers/`; pasar `userService`, `permissionService` y `controladorClient`.

### `src/commands/start.js`
- **Función:** Handler de `/start`. Buscar usuario por `telegram_user_id`; listar tenants con inline buttons.
- **Reescritura:** Sustituir botones de portones por flujo tenant → gate.

### `src/handlers/tenant.js`
- **Función:** Callback `tenant:X`. Listar gates del tenant con permiso del usuario.
- **Reescritura:** Query `gates` + `user_gates`; generar inline keyboard dinámico.

### `src/handlers/gate.js`
- **Función:** Callback `gate:Y`. Validar permiso, enviar evento al Controlador, registrar en `gate_events`.
- **Reescritura:** Llamar `enviarEvento()` con `gate.controller_id` o mapeo; INSERT en `gate_events`.

### `src/services/controladorClient.js`
- **Función:** Cliente HTTP al Controlador Central.
- **Reescritura:** Mínima; origen de `portonId` desde caller (tabla `gates`).

### `src/services/userService.js`
- **Función:** Lógica de usuarios y permisos desde DB.
- **Reescritura:** Nuevo; `getOrCreateUserByTelegramId`, `getTenantsForUser`, `getGatesForTenant`, `canAccessGate`.

### `src/db/*.js`
- **Función:** Conexión y queries a PostgreSQL.
- **Reescritura:** Nuevo; adaptado al esquema `users`, `user_tenants`, `gates`, `user_gates`, `gate_events`, `tenants`.

### `feedback.js`
- **Función:** Recibir POST del Controlador; notificar a usuarios autorizados.
- **Reescritura:** Resolver gate por `portonId`; buscar usuarios con `user_gates`; enviar mensaje a sus `telegram_user_id` o chats asociados.

### `.env.example`
- **Función:** Plantilla de variables de entorno.
- **Reescritura:** Añadir `DATABASE_URL`; documentar que permisos vienen de DB.

---

## 8. Flujo objetivo: tenant → gate → acción

```
Usuario envía /start
    → Bot busca usuario por telegram_user_id
    → Si no existe: registro (depende de política)
    → Muestra inline buttons: [Tenant A] [Tenant B] ...

Usuario pulsa [Tenant A]
    → Bot lista gates del tenant donde user_gates permite acceso
    → Muestra: [Portón 1] [Portón 2] ...

Usuario pulsa [Portón 1]
    → Bot valida user_gates
    → INSERT gate_events (user_id, gate_id, event: PRESS)
    → enviarEvento(gate.controller_id, PRESS) al Controlador
    → Respuesta: ✅ Comando enviado al Portón 1
```

---

## 9. Resumen ejecutivo

| Aspecto | Estado actual | Acción |
|---------|---------------|--------|
| **Estructura** | Plana (todo en raíz) | Reorganizar en `src/` con commands, handlers, services, db |
| **Comandos** | Solo `/start` | Mantener; ampliar flujo tenant → gate |
| **Permisos** | `ALLOWED_CHAT_IDS` | Reemplazar por `user_tenants` y `user_gates` |
| **Portones** | Hardcodeados (2) | Obtener de `gates` por tenant |
| **Base de datos** | No existe | Integrar PostgreSQL con tablas indicadas |
| **Controlador** | `controladorClient.js` operativo | Mantener; alimentar con datos de `gates` |
| **Feedback** | `ALLOWED_CHAT_IDS` | Notificar según `user_gates` y `gate_events` |

El bot es funcional para 2 portones fijos y whitelist por chat. Para la versión profesional con multi-tenant y permisos granulares, es necesario reescribir la lógica de `bot.js` y `feedback.js`, añadir capa de servicios y DB, manteniendo `controladorClient.js` y la infraestructura de index.js como base.
