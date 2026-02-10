# Auditoría completa — Bot de Telegram (solo UI vs backend)

**Contexto:** El bot debe actuar solo como UI conversacional + cliente HTTP. El backend (“vacío cerebro”) concentra lógica de negocio, autorización y FSM.  
**Objetivo:** Verificar que el bot no asume responsabilidades indebidas y detectar qué debe eliminarse o moverse al backend.  
**Restricciones:** No se modificó código; no se audita el backend.

---

## 1. Resumen del estado actual del bot

### 1.1 Stack y librerías

- **Telegram:** Telegraf 4.16.3 (única librería de Telegram). No hay node-telegram-bot-api.
- **Runtime:** Node.js (ES modules), Express para webhook y rutas HTTP.
- **Datos:** PostgreSQL vía `pg`; el bot crea pool, ejecuta queries y cierra pool en shutdown.
- **HTTP saliente:** Un único cliente (`controladorClient.js`) que hace POST a `{CONTROLADOR_BASE_URL}/api/events` con `{ portonId, event }`.

### 1.2 Handlers de Telegram

| Handler | Origen de datos | Acción |
|--------|-----------------|--------|
| `/start` | `getUserWithTenants(telegramUserId, username)` → DB | Crea usuario si no existe; lista tenants desde `user_tenants`; renderiza botones. |
| Callback `tenant:X` | `getOrCreateUserByTelegramId` + `getGatesForUser(userId, tenantId)` → DB | Crea usuario; lista gates desde `user_gates`/`gates`; renderiza botones. |
| Callback `gate:X` | `getOrCreateUserByTelegramId` + `openGate()` | Abre: permisos en DB, POST al Controlador, `insertGateEvent` en DB; responde al usuario. |

### 1.3 Endpoint HTTP en el bot

- **POST /api/feedback:** Recibe `{ portonId, previousState, currentState, timestamp? }`. Consulta DB (`getGateByControllerId`, `getUsersWithAccessToGate`) para resolver destinatarios y envía mensajes con `bot.telegram.sendMessage(telegram_user_id, mensaje)`.

### 1.4 Flujo de datos actual

- **Identidad:** En todos los handlers se usa `ctx.from?.id` (telegramUserId) y a veces `ctx.from?.username`. No está centralizado.
- **Permisos y listas:** Decididos y obtenidos en el bot vía `permissions.js` + `db/queries.js`.
- **Apertura de portón:** El bot traduce a `portonId` (desde `gates.controller_id`), envía evento "PRESS" al Controlador y escribe en `gate_events`.
- **Feedback:** El Controlador llama al bot; el bot usa la DB para saber a quién notificar y construye el texto del mensaje (`previousState → currentState`).

---

## 2. Responsabilidades BIEN ubicadas

| Responsabilidad | Dónde | Por qué está bien |
|-----------------|--------|-------------------|
| Recibir updates de Telegram por webhook | `index.js` POST /bot | Es infraestructura del bot. |
| Validar presencia de `ctx.from?.id` y responder con mensaje de error | start, tenantSelection, gateSelection | Validación mínima de contexto de Telegram. |
| Construir inline keyboards (Markup) con tenants y gates | start.js, tenantSelection.js | Es presentación: botones y textos. |
| Enviar respuestas al usuario (reply, answerCbQuery) | Todos los handlers | Es UI: mostrar mensajes. |
| Cliente HTTP con timeout y reintentos | controladorClient.js | Encapsula la llamada saliente; no decide reglas de negocio. |
| Request ID, logging de requests, health/ready | index.js | Operación del servidor, no dominio. |
| Shutdown cerrando servidor y pool | index.js | Gestión del proceso. |
| Validación de forma del body en /api/feedback | feedback.js `validarFeedbackBody` | Validación de contrato HTTP, no de reglas de negocio. |
| Uso de Telegraf (comandos, callbacks, catch) | bot.js + handlers | Uso correcto del SDK. |

---

## 3. Responsabilidades MAL ubicadas

| Responsabilidad | Dónde | Por qué está mal (debería estar en el backend) |
|----------------|--------|-------------------------------------------------|
| Crear usuarios en DB | `queries.js` getOrCreateUserByTelegramId; llamado desde start, tenantSelection, gateSelection | Registro/identidad es lógica de negocio; el backend debe decidir si y cómo se crea el usuario. |
| Decidir qué tenants ve el usuario | permissions.js → getTenantsForUser (user_tenants) | Autorización: el backend debe devolver solo lo permitido. |
| Decidir qué gates ve el usuario por tenant | permissions.js → getGatesForUserInTenant (user_gates, gates) | Idem. |
| Decidir si el usuario puede abrir un gate | openGate.js → checkGateAccess (canUserAccessGate) | Autorización de la acción; debe vivir en el backend. |
| Resolver `portonId` (controller_id) desde gateId | openGate.js → getGateById, luego portonId = gate.controller_id | El bot no debería conocer el modelo gates/controller_id; el backend recibe gateId (o equivalente) y traduce internamente. |
| Enviar evento al Controlador (POST /api/events) desde el bot | openGate.js → enviarEvento(portonId, "PRESS") | La “acción de abrir” debería ser un solo comando al backend (ej. POST /api/telegram/command con telegramId, gateId, action); el backend llama al Controlador/FSM. |
| Registrar auditoría (gate_events) | openGate.js → insertGateEvent | Auditoría es dominio del backend. |
| Resolver destinatarios del feedback (quién recibe el mensaje) | feedback.js → getGateByControllerId, getUsersWithAccessToGate | El backend debería recibir el feedback, decidir destinatarios y notificar (o indicar al bot a quién enviar). |
| Construir el mensaje de feedback con estados | feedback.js: `${gateName} pasó de ${previousState} → ${currentState}` | Traducción de estados a texto es interpretación de dominio; puede vivir en el backend o en mensajes predefinidos que el backend devuelve. |
| Exponer POST /api/feedback en el bot | index.js + feedback.js | En un modelo “bot solo UI”, el Controlador/backend podría llamar a un endpoint del backend que luego use el bot como canal de envío; el bot no debería ser el dueño de “quién recibe” ni de la lógica de feedback. |
| Dependencia de PostgreSQL en arranque y shutdown | index.js getPool(), closePool() | Si el bot no debe acceder a DB, no debería tener pool ni DATABASE_URL. |

---

## 4. Código que debería eliminarse o simplificarse

### 4.1 Eliminar o dejar de usar (mover responsabilidad al backend)

| Código / Módulo | Acción recomendada | Motivo |
|-----------------|--------------------|--------|
| **src/db/** (index.js, queries.js) | Dejar de usar desde el bot; no inicializar pool en index.js | El bot no debe leer ni escribir en DB. |
| **src/utils/permissions.js** | Dejar de usar desde los handlers | Toda la decisión de permisos y listas (tenants, gates) debe venir del backend vía API. |
| **src/bot/commands/openGate.js** | Eliminar o reemplazar por llamada HTTP al backend (telegramId, gateId, action) | El bot no debe: autorizar, traducir a portonId, llamar a /api/events ni escribir gate_events. |
| **src/utils/controladorClient.js** | Dejar de usar desde el bot para “abrir” | La apertura se delega al backend; el backend llama al Controlador/FSM. Si el bot solo llama a un endpoint tipo POST /api/telegram/command, no necesita este cliente para esa acción. |
| **POST /api/feedback** (feedback.js) | Eliminar la lógica que consulta DB y construye destinatarios; o mover el endpoint al backend y que el bot solo reciba “envía este mensaje a este chatId” | Resolución de destinatarios y mensaje son lógica de negocio. |
| Inicialización de pool y closePool en **index.js** | Quitar getPool() al arranque y closePool() en shutdown | El bot no usa DB. |

### 4.2 Simplificar (sin eliminar del todo)

| Código | Acción | Motivo |
|--------|--------|--------|
| **start.js** | Reemplazar llamada a getUserWithTenants por GET al backend (ej. /api/telegram/bootstrap?telegramUserId=…) y renderizar lo que devuelva | El bot solo pinta; no decide tenants. |
| **tenantSelection.js** | Reemplazar getOrCreateUserByTelegramId + getGatesForUser por datos del backend (bootstrap o GET tenants/:id/gates) y solo renderizar | El bot no decide gates ni crea usuarios. |
| **gateSelection.js** | Reemplazar openGate() por una llamada HTTP al backend (ej. POST /api/telegram/command con telegramId, gateId, action) y traducir respuesta a mensaje | El bot solo envía intención y muestra resultado. |
| **Obtención de telegramUserId** | Centralizar en un helper o middleware (ctx.from?.id) para no repetir en cada handler | Mantenibilidad y claridad. |

### 4.3 Código que puede quedar pero no se usa

| Código | Estado | Recomendación |
|--------|--------|----------------|
| **src/utils/jwt.js** | No importado en ningún archivo del bot | Eliminar o dejar documentado para uso futuro (ej. si el backend devuelve tokens); no afecta responsabilidades. |

---

## 5. Puntos de auditoría — Respuestas directas

### 5.1 Uso de librerías de Telegram

- **Telegraf:** Única librería; se usa para bot.start(), bot.action(), ctx.reply(), ctx.answerCbQuery(), Markup.inlineKeyboard, bot.telegram.setWebhook, bot.handleUpdate, bot.telegram.sendMessage.
- **Handlers:** Un comando (/start) y dos callbacks (tenant:X, gate:X). No hay handler de mensajes de texto ni otros comandos.
- **Conclusión:** Uso correcto y acotado de Telegraf. No hay mezcla con otra librería de Telegram.

### 5.2 Lógica de negocio

- **¿El bot decide permisos?** Sí: vía permissions.js y queries (user_tenants, user_gates, canUserAccessGate). **Mal ubicado.**
- **¿El bot decide si una acción es válida?** Sí: openGate llama a checkGateAccess antes de enviar al Controlador. **Mal ubicado.**
- **¿El bot conoce estados del portón?** Solo en feedback: recibe previousState/currentState y los muestra en el mensaje. No mantiene FSM ni estados; pero interpreta estados en el texto. **Atención:** la decisión de “a quién notificar” y el contenido del mensaje deberían poder venir del backend.

### 5.3 Comunicación con el backend

- **¿Llamadas HTTP centralizadas?** Parcialmente: solo existe controladorClient.js para POST /api/events. No hay cliente para “bootstrap” ni para “comando de usuario” (telegramId, gateId, action). Las listas vienen de DB, no de HTTP.
- **¿El bot solo envía telegramId, gateId y action?** No. Hoy el bot envía al Controlador `portonId` y `event` ("PRESS"), y obtiene portonId desde la DB (gates.controller_id). No existe en el bot una llamada del tipo “ejecutar comando para este usuario en este gate”.
- **Conclusión:** Falta un cliente HTTP hacia el backend que centralice: (1) obtener datos para pantallas (bootstrap / tenants / gates), (2) ejecutar comando (telegramId, gateId, action). Y debe eliminarse la llamada directa del bot a /api/events para la acción de abrir.

### 5.4 UX vs dominio

- **¿El bot solo construye mensajes, botones y textos?** No. Construye los textos de los botones desde datos que él mismo obtiene de la DB (nombres de tenants, nombres de gates). El contenido está bien como “presentación”, pero la **fuente** de esos datos (DB en el bot) es incorrecta; debería ser la respuesta del backend.
- **¿Traduce estados o reglas del sistema?** En feedback sí: arma el string “X pasó de A → B”. Eso es traducción de dominio; preferible que el backend envíe el mensaje listo o la plantilla y el bot solo lo muestre.

### 5.5 Arquitectura

- **Separación handlers vs cliente HTTP:** No hay separación clara. Los handlers llaman a permissions.js y db/queries.js; solo gateSelection usa un “servicio” (openGate), que a su vez mezcla permisos, DB y controladorClient. No existe una capa “api-client” que sea el único punto de comunicación con el backend.
- **Código simple / sobreingeniería:** El código es legible y no está sobreingeniado, pero la **ubicación** de la lógica (DB y permisos en el bot) es lo que falla respecto al objetivo “bot solo UI”.

---

## 6. Recomendaciones concretas (sin aplicar cambios)

1. **Introducir un cliente HTTP al backend** como única fuente de datos y acciones: por ejemplo `getBootstrap(telegramUserId)` y `executeCommand(telegramId, gateId, action)`. Los handlers solo llaman a este cliente y renderizan la respuesta.
2. **Dejar de usar DB en el bot:** Quitar todas las importaciones de db/ y permissions.js desde bot/; quitar inicialización y cierre del pool en index.js. Si se mantiene el proyecto para scripts de utilidad (ej. no-test-db.js), el pool puede vivir solo en ese script o en un módulo que el bot no importe.
3. **Reemplazar flujo /start y tenant:** Que /start llame al backend (ej. GET /api/telegram/bootstrap?telegramUserId=…), reciba tenants (y opcionalmente gates por tenant) y solo renderice botones. Lo mismo para tenant:X: datos desde backend, bot solo pinta.
4. **Reemplazar flujo gate:X:** En lugar de openGate (permisos + Controlador + gate_events), llamar al backend (ej. POST /api/telegram/command con telegramId, gateId, action). El backend devuelve aceptado/rechazado y motivo; el bot solo mapea a mensaje (ej. “Listo” / “No tenés permiso” / “Acción no válida”).
5. **Feedback:** Definir si el backend recibe el feedback del Controlador y luego notifica al bot (por ejemplo “envía este mensaje a estos chatIds”), o si el bot sigue exponiendo /api/feedback pero recibe del backend la lista de destinatarios y el texto. En ningún caso el bot debería consultar DB para decidir destinatarios.
6. **Centralizar telegramUserId:** Extraer `ctx.from?.id` (y opcionalmente username) en un helper o al inicio del pipeline para no repetir validación en cada handler.
7. **Variables de entorno:** Cuando el bot sea solo UI: no depender de DATABASE_URL; depender de una URL base del backend (ej. BACKEND_BASE_URL o reutilizar CONTROLADOR_BASE_URL si es el mismo servicio). Mantener BOT_TOKEN, webhook, PORT, etc.
8. **jwt.js:** Si no se usa, eliminarlo o documentar que es para uso futuro (ej. validación de webhooks o tokens del backend).

---

## 7. Tabla resumen

| Criterio | Estado actual | Objetivo (bot solo UI) |
|----------|----------------|-------------------------|
| Librería Telegram | Solo Telegraf, uso correcto | OK |
| Permisos | En el bot (DB) | En el backend; bot solo muestra lo que el backend devuelve |
| Listas (tenants, gates) | En el bot (DB) | Desde backend vía API |
| Acción “abrir” | Bot: permisos + POST /api/events + gate_events | Backend: un comando (telegramId, gateId, action); bot solo llama y muestra resultado |
| Feedback (destinatarios + mensaje) | En el bot (DB + construcción de texto) | Backend decide destinatarios y contenido; bot solo envía |
| Cliente HTTP | Solo hacia /api/events (y el bot traduce gateId→portonId) | Un cliente al backend: bootstrap + comando; sin DB |
| Base de datos | Pool en el bot; queries en varios flujos | Sin DB en el bot |
| Handlers vs capa de datos | Handlers llaman a DB y permissions | Handlers llaman solo al cliente HTTP del backend y a la capa de UI (mensajes, teclados) |

---

*Fin de la auditoría. No se realizaron cambios en el código.*
