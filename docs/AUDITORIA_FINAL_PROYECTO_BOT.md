# Auditoría final — Proyecto Bot de Telegram

**Fecha:** 2025  
**Objetivo:** Verificar cumplimiento de la arquitectura (bot solo UI, backend HTTP, sin DB ni lógica de negocio) y checklist de aprobación.

---

## 1. Handlers: solo telegramUserId, backendClient y render

### 1.1 start.js (`src/bot/commands/start.js`)

| Verificación | Estado | Referencia |
|--------------|--------|------------|
| Obtiene telegramUserId vía helper | ✅ | Línea 16: `getTelegramUserId(ctx)` |
| Llama a backendClient | ✅ | Línea 25: `backendClient.getTenants(telegramUserId)` |
| Renderiza botones y mensajes | ✅ | Líneas 37–41: `Markup.button.callback`, `ctx.reply` con `prompts.selectBuilding` |
| No accede a DB | ✅ | Sin imports de db/queries |
| No auditoría ni permisos locales | ✅ | Sin lógica de autorización |

**Conclusión:** Cumple. Flujo: ctx → getTelegramUserId → getTenants → reply con teclado.

---

### 1.2 tenantSelection.js (`src/bot/callbacks/tenantSelection.js`)

| Verificación | Estado | Referencia |
|--------------|--------|------------|
| Obtiene telegramUserId vía helper | ✅ | Línea 23: `getTelegramUserId(ctx)` |
| Extrae tenantId del callback_data | ✅ | Líneas 15–16 (parseo); sin lógica de negocio |
| Llama a backendClient | ✅ | Línea 31: `backendClient.getTenants(telegramUserId)` |
| Filtra tenant en cliente (datos ya del backend) | ✅ | Líneas 36–38: `tenants?.find`, `tenant?.gates` |
| Renderiza botones y mensajes | ✅ | Líneas 48–53 con `prompts.selectGate`, `gateLabel` |
| No DB, permisos ni auditoría | ✅ | Ninguno |

**Conclusión:** Cumple. Solo UI + una llamada al backend.

---

### 1.3 gateSelection.js (`src/bot/callbacks/gateSelection.js`)

| Verificación | Estado | Referencia |
|--------------|--------|------------|
| Obtiene telegramUserId vía helper | ✅ | Línea 22: `getTelegramUserId(ctx)` |
| Llama a backendClient | ✅ | Línea 30: `backendClient.executeCommand(telegramUserId, gateId, "OPEN")` |
| Muestra resultado (éxito/error) | ✅ | Líneas 32–38: `result.accepted`, `result.error`, `success.commandSent`, `errorPrefix` |
| No DB, permisos ni auditoría | ✅ | Ninguno |

**Conclusión:** Cumple. Solo delegación al backend y render de respuesta.

---

## 2. backendClient.js

### 2.1 Métodos

| Método | Estado | Contrato |
|--------|--------|----------|
| getTenants(telegramId) | ✅ | GET `/api/telegram/tenants?telegram_id=X`; devuelve `{ ok, tenants, error? }` |
| executeCommand(telegramId, gateId, action) | ✅ | POST `/api/telegram/command` con body; devuelve `{ accepted, reason?, error? }` |

### 2.2 Headers

| Header | Estado | Referencia |
|--------|--------|------------|
| X-Request-Id | ✅ | Línea 44 |
| X-API-Key (opcional) | ✅ | Línea 46: `...(apiKey ? { "X-API-Key": apiKey } : {})` |
| Content-Type solo si hay body | ✅ | Línea 45: `...(body !== null ? { "Content-Type": "application/json" } : {})` |

### 2.3 Timeout y reintentos

| Aspecto | Estado | Referencia |
|---------|--------|------------|
| Timeout 10 s | ✅ | Línea 21: `REQUEST_TIMEOUT_MS = 10_000` |
| 2 reintentos (3 intentos) | ✅ | Línea 22: `MAX_RETRIES = 2`; bucle líneas 50–93 |

### 2.4 Manejo de errores

| Aspecto | Estado | Referencia |
|---------|--------|------------|
| 4xx (excepto 429) sin reintento | ✅ | Líneas 79–81: return inmediato |
| 5xx y errores de red con reintento | ✅ | Catch y loop con backoff 300*(attempt+1) |
| Respuesta normalizada getTenants | ✅ | Líneas 110–117: `{ ok, tenants: []|data, error? }` |
| Respuesta normalizada executeCommand | ✅ | Líneas 133–160: `accepted`, `reason`, `error` según backend |

**Conclusión:** Cliente HTTP correcto según arquitectura.

---

## 3. feedback.js → notify.js

| Verificación | Estado | Detalle |
|--------------|--------|---------|
| feedback.js eliminado | ✅ | No existe en el repo |
| notify expuesto | ✅ | `src/routes/notify.js` con `registerNotifyRoute` |
| POST /api/telegram/notify | ✅ | Línea 47: `app.post("/api/telegram/notify", ...)` |
| Body: deliveries[] con telegramUserId y message | ✅ | `validateNotifyBody` líneas 13–37 |
| Solo envía mensajes; no calcula destinatarios ni contenido | ✅ | Líneas 63–74: loop sobre `deliveries`, `bot.telegram.sendMessage(chatId, message)` |
| Respuesta 202 tras validar | ✅ | Línea 56; envío en background |

**Nota:** notify está en `src/routes/notify.js` (no en `src/bot/routes/`). Es coherente: rutas HTTP a nivel `src/`, handlers de Telegram en `src/bot/`.

---

## 4. Validación de entorno

| Verificación | Estado | Referencia |
|--------------|--------|------------|
| BACKEND_BASE_URL validado al arranque | ✅ | index.js líneas 37–39: `if (!BACKEND_BASE_URL) log(...)` |
| No fallo silencioso | ✅ | Se loguea mensaje claro; el bot arranca pero sin BACKEND_BASE_URL las llamadas fallan y backendClient inválido evita registrar handlers (bot.js) |
| .env.example coherente | ✅ | BOT_TOKEN, PORT, RAILWAY_PUBLIC_DOMAIN, PUBLIC_DOMAIN, WEBHOOK_SECRET, BACKEND_BASE_URL, BACKEND_API_KEY |
| BACKEND_BASE_URL documentado como obligatorio | ✅ | .env.example sección "Backend (obligatorio)" |

**Recomendación opcional:** Si se desea fail-fast, se puede hacer `process.exit(1)` cuando falte BACKEND_BASE_URL; actualmente se loguea y se sigue (comportamiento aceptable).

---

## 5. Constantes y helpers

### 5.1 messages.js

| Verificación | Estado | Referencia |
|--------------|--------|------------|
| Exporta errors, prompts, success, errorPrefix, notifyValidation, gateLabel, tenantLabel | ✅ | messages.js líneas 5–42 |
| start.js usa messages | ✅ | errors, prompts, tenantLabel |
| tenantSelection.js usa messages | ✅ | errors, prompts, gateLabel |
| gateSelection.js usa messages | ✅ | errors, errorPrefix, prompts, success |
| notify.js usa messages | ✅ | notifyValidation (import desde bot/messages.js) |

### 5.2 getTelegramUserId(ctx)

| Handler | Estado | Referencia |
|---------|--------|------------|
| start.js | ✅ | Línea 16 |
| tenantSelection.js | ✅ | Línea 23 |
| gateSelection.js | ✅ | Línea 22 |

Definido en `src/bot/utils.js` (líneas 9–11). Sin lógica de negocio.

---

## 6. Estructura final

**Estructura actual:**

```
src/
  api/
    backendClient.js
  bot/
    bot.js
    callbacks/
      gateSelection.js
      tenantSelection.js
    commands/
      start.js
    messages.js
    utils.js
  routes/
    notify.js
  index.js
```

**Comparación con lo pedido:**

| Pedido | Actual | Nota |
|--------|--------|------|
| src/api/backendClient.js | ✅ | Igual |
| src/bot/bot.js | ✅ | Igual |
| src/bot/callbacks/*.js | ✅ | gateSelection.js, tenantSelection.js (callbacks de Telegram, no commands) |
| src/bot/commands/start.js | ✅ | Igual |
| src/bot/commands/tenantSelection.js | — | En la práctica está en **callbacks/** (correcto para callback_query) |
| src/bot/commands/gateSelection.js | — | En la práctica está en **callbacks/** (correcto para callback_query) |
| src/bot/routes/notify.js | — | Está en **src/routes/notify.js** (ruta HTTP a nivel app) |
| src/index.js | ✅ | Igual |
| Sin carpetas vacías | ✅ | No hay db/, utils/ vacíos en src |
| Sin módulos obsoletos | ✅ | Sin pg, db, queries, permissions, openGate, jwt, controladorClient |

**Conclusión:** La estructura es correcta. Los callbacks de Telegram viven en `callbacks/`; la ruta HTTP notify en `routes/` a nivel `src/` es una organización válida y clara.

---

## 7. Checklist de aprobación

| Ítem | Estado |
|------|--------|
| Cliente HTTP con getTenants, executeCommand, headers (X-Request-Id, X-API-Key opcional, Content-Type solo con body), timeout 10s, 2 reintentos, manejo 4xx/5xx | ✅ |
| Handlers solo UI: obtienen telegramUserId, llaman backendClient, renderizan; sin DB, auditoría ni permisos locales | ✅ |
| Notify: POST /api/telegram/notify, solo envía lo que recibe; no calcula destinatarios ni contenido | ✅ |
| Variables de entorno: BACKEND_BASE_URL validado y documentado; .env.example con BOT_TOKEN, PORT, dominio, WEBHOOK_SECRET, BACKEND_* | ✅ |
| Estructura modular: api/, bot/ (commands, callbacks), routes/, index.js; sin capas obsoletas | ✅ |
| Sin dependencias innecesarias: no pg, db, jwt, controladorClient en código ni en package.json | ✅ |
| Mensajes centralizados en messages.js; usados en todos los handlers y en notify | ✅ |
| Helper getTelegramUserId(ctx) usado en start, tenantSelection y gateSelection | ✅ |
| backendClient validado antes de registrar handlers; log si faltan getTenants/executeCommand | ✅ |

---

## 8. Resumen ejecutivo

- **Handlers:** Los tres (start, tenantSelection, gateSelection) solo obtienen `telegramUserId` con el helper, llaman al backend y renderizan; no hay DB, auditoría ni lógica de permisos.
- **backendClient.js:** Cumple métodos, headers, timeout, reintentos y normalización de respuestas; contrato documentado en cabecera.
- **Notify:** Implementado en `src/routes/notify.js`; POST `/api/telegram/notify`; solo reenvía mensajes del backend.
- **Entorno:** BACKEND_BASE_URL se valida y se loguea si falta; .env.example alineado.
- **Constantes y helpers:** messages.js es la única fuente de textos; getTelegramUserId usado en los tres handlers.
- **Estructura:** Coherente con bot solo UI; callbacks en `callbacks/`, ruta HTTP en `routes/`; sin carpetas vacías ni módulos obsoletos.
- **Dependencias:** Solo dotenv, express, telegraf.

**Aprobación:** El proyecto cumple la auditoría y el checklist de arquitectura definido.
