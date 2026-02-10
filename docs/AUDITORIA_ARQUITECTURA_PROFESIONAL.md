# Auditoría: Bot de Telegram vs arquitectura profesional

**Fecha:** 2025  
**Objetivo:** Comparar el estado actual del bot con la arquitectura definida (bot solo UI/cliente HTTP, sin DB ni lógica de negocio) y generar informe + acciones de refactorización.

---

## 1. Estado actual

### 1.1 Estructura de carpetas y archivos

```
src/
  api/
    backendClient.js      # Cliente HTTP al backend
  bot/
    bot.js               # Telegraf + registro de handlers
    callbacks/
      gateSelection.js
      tenantSelection.js
    commands/
      feedback.js        # registerNotifyRoute (POST /api/telegram/notify)
      start.js
  index.js               # Entrypoint Express, webhook, notify
```

- No existe `src/db`, `src/utils`, ni referencias a `pg`, `queries`, `permissions`, `controladorClient`, `openGate`, `jwt` en el código fuente.
- **package.json:** dependencias `dotenv`, `express`, `telegraf`; **no** `pg`.
- **.env.example:** `BOT_TOKEN`, `PORT`, `RAILWAY_PUBLIC_DOMAIN`/`PUBLIC_DOMAIN`, `WEBHOOK_SECRET`, `BACKEND_BASE_URL`, `BACKEND_API_KEY`; sin `DATABASE_URL` ni `CONTROLADOR_*`.

### 1.2 Flujo de datos

- **Identidad:** Todos los handlers usan `ctx.from?.id` como `telegramUserId`; no hay capa intermedia.
- **Datos:** Vienen solo del backend vía `backendClient.getTenants()` y `backendClient.executeCommand()`.
- **Notificaciones:** El backend llama a POST `/api/telegram/notify` con `{ deliveries: [ { telegramUserId, message } ] }`; el bot solo envía cada mensaje.

---

## 2. Cliente HTTP al backend (`backendClient.js`)

### 2.1 Comparación con la arquitectura esperada

| Requisito | Estado | Referencia |
|-----------|--------|------------|
| Método `getTenants(telegramId)` | ✅ Implementado | Líneas 95–104 |
| Método `executeCommand(telegramId, gateId, action)` | ✅ Implementado | Líneas 112–135 |
| Headers: Content-Type, X-Request-Id, X-API-Key (opcional) | ✅ | Líneas 29–33 |
| Timeout | ✅ 10 s | Línea 6, 39 |
| Reintentos (2 reintentos = 3 intentos) | ✅ | Líneas 7, 36, 75–77 |
| Manejo de errores: 4xx sin reintento, 5xx/red con reintento | ✅ | Líneas 64–66, 67–78 |
| Respuesta normalizada (ok, tenants / accepted, reason, error) | ✅ | getTenants 99–104, executeCommand 119–134 |

### 2.2 Detalles observados

- **GET con Content-Type:** Se envía `Content-Type: application/json` también en GET (línea 30). Es redundante y algún servidor podría rechazarlo; no suele ser problema en la práctica. **Mejora opcional:** enviar `Content-Type` solo cuando hay body.
- **Request ID:** Generado por petición (línea 27) y enviado en header; alineado con la arquitectura.
- **executeCommand:** Traduce correctamente `accepted: true` → éxito; `accepted: false` con `reason` FORBIDDEN / INVALID_ACTION → mensajes de error; fallos HTTP → `reason: "ERROR"`.

**Conclusión:** El cliente cumple la arquitectura profesional en métodos, headers, timeout, reintentos y manejo de errores.

---

## 3. Handlers y callbacks

### 3.1 `/start` (`start.js`)

| Criterio | Estado | Referencia |
|----------|--------|------------|
| Solo obtiene `telegramUserId` de `ctx.from?.id` | ✅ | Líneas 15–16 |
| Llama al backend (getTenants) | ✅ | Línea 25 |
| Solo renderiza botones y mensajes | ✅ | Líneas 36–43 |
| No accede a DB | ✅ | — |
| No lógica de permisos ni auditoría | ✅ | — |

- Validación mínima de contexto: si no hay `telegramUserId`, responde y termina (líneas 17–21).
- Textos de error genéricos cuando `!ok`, `error` o `tenants` vacío; no interpreta códigos de negocio del backend.

### 3.2 Callback `tenant:X` (`tenantSelection.js`)

| Criterio | Estado | Referencia |
|----------|--------|------------|
| Extrae `tenantId` del callback_data y `telegramUserId` de `ctx.from?.id` | ✅ | Líneas 14–22 |
| Obtiene datos del backend (getTenants, filtra por tenantId) | ✅ | Líneas 29–37 |
| Solo renderiza botones (gates) | ✅ | Líneas 46–53 |
| No DB, no permisos, no auditoría | ✅ | — |

- Reutiliza GET tenants y filtra en cliente; evita un endpoint extra de “gates por tenant”. Aceptable y alineado con backend que devuelve `tenants[].gates`.

### 3.3 Callback `gate:X` (`gateSelection.js`)

| Criterio | Estado | Referencia |
|----------|--------|------------|
| Extrae `gateId` y `telegramUserId` del contexto | ✅ | Líneas 13–24 |
| Llama al backend (executeCommand) con telegramId, gateId, "OPEN" | ✅ | Línea 29 |
| Muestra resultado según `accepted` / error | ✅ | Líneas 31–37 |
| No valida permisos localmente, no DB, no auditoría | ✅ | — |

- Pequeña redundancia: en línea 34, si `result.reason === "FORBIDDEN"` se usa un texto alternativo, pero `result.error` ya viene con mensaje desde `backendClient`; no rompe la arquitectura.

**Conclusión:** Los tres handlers cumplen “solo render + llamada al backend”; no hay lógica de negocio, DB ni auditoría en el bot.

---

## 4. Estructura de carpetas y dependencias

| Requisito | Estado | Notas |
|-----------|--------|--------|
| Separación `src/bot`, `src/api`, `src/index.js` | ✅ | Bot en `bot/`, cliente en `api/`, entrypoint en raíz de `src` |
| Sin `pg` ni pool de DB | ✅ | package.json sin `pg`; ningún import de db |
| Sin controladorClient (antiguo cliente al Controlador) | ✅ | No existe en el proyecto |
| Sin módulos de permisos ni queries | ✅ | No existen en `src` |

- **package-lock.json:** Si aún aparece `pg` en dependencias, es residual de una versión anterior; con el `package.json` actual, `npm install` debería dejar solo las dependencias actuales. Recomendación: ejecutar `npm install` y confirmar que el lock ya no incluye `pg`.

---

## 5. Rutas expuestas

| Ruta | Método | Responsabilidad | ¿Alineado? |
|------|--------|------------------|------------|
| `/bot` | POST | Webhook Telegram | ✅ |
| `/health` | GET | Salud del proceso | ✅ |
| `/ready` | GET | Listo (bot + webhook) | ✅ |
| `/api/telegram/notify` | POST | Recibir lista de mensajes del backend y enviar por Telegram | ✅ |

- **Notify:** El bot solo valida la forma del body (`deliveries[]`, `telegramUserId`, `message`) y envía; no decide destinatarios ni contenido. El backend es el dueño de la lógica.

---

## 6. Lo que está bien

1. **Cliente HTTP centralizado** en `api/backendClient.js` con timeout, reintentos y request ID.
2. **getTenants y executeCommand** con firma y contrato esperado.
3. **Handlers** solo leen contexto Telegram, llaman al backend y renderizan; sin DB, permisos ni auditoría.
4. **Notify** solo ejecuta envíos; sin lógica de negocio.
5. **Estructura** clara: `api/`, `bot/`, `index.js`; sin capas obsoletas (db, permissions, controladorClient, openGate, jwt).
6. **Variables de entorno** coherentes con “solo UI + backend”: `BACKEND_BASE_URL`, `BACKEND_API_KEY`; sin `DATABASE_URL`.
7. **Inyección de dependencias:** `backendClient` y `log` inyectados desde `index.js` → `bot.js` → handlers; facilita tests y sustitución del cliente.

---

## 7. Lo que hay que corregir (o verificar)

1. **package-lock.json:** Si todavía incluye `pg`, ejecutar `npm install` en el proyecto (con el `package.json` actual sin `pg`) y, si hace falta, eliminar `pg` del lock manualmente para que no quede como dependencia instalada.
2. **BACKEND_BASE_URL vacío:** Si `BACKEND_BASE_URL` está vacío, el cliente sigue funcionando pero todas las peticiones fallan (baseUrl ""). Opcional: en `index.js`, comprobar que exista `BACKEND_BASE_URL` antes de crear el bot y loguear advertencia o no registrar handlers que dependan del backend (solo si se quiere fail-fast en arranque).
3. **Redundancia en gateSelection (línea 34):** El mensaje de error para FORBIDDEN está duplicado (en `backendClient.executeCommand` y en el handler). No es un error arquitectónico; se puede simplificar usando solo `result.error` para no repetir el texto.

---

## 8. Mejoras opcionales (modularidad y escalabilidad)

1. **Content-Type solo en POST:** En `backendClient.js`, enviar `Content-Type: application/json` solo cuando `body != null` para evitar enviarlo en GET.
2. **Helper para telegramUserId:** Extraer en un pequeño helper (ej. `getTelegramUserId(ctx)`) la lectura de `ctx.from?.id` y la validación, para no repetir el mismo bloque en start, tenantSelection y gateSelection.
3. **Constantes de mensajes:** Centralizar strings como "No se pudo identificar tu usuario.", "Seleccioná el edificio:", etc. en un módulo `bot/messages.js` o similar para i18n o cambios centralizados.
4. **Nombre del archivo feedback.js:** Está en `commands/` pero expone una ruta HTTP, no un comando de Telegram. Opcional: renombrar a `notify.js` o mover a `routes/notify.js` para que el nombre refleje mejor la responsabilidad.
5. **Validación de backendClient en createBot:** Si `backendClient` es null/undefined, los handlers fallarían al llamar a `getTenants`/`executeCommand`. Opcional: en `bot.js`, validar que `backendClient` exista y tenga esos métodos antes de registrar handlers, o documentar que es requisito del caller.
6. **Escalabilidad:** Para muchos tenants/gates, el backend ya limita lo que devuelve; el bot solo pinta. Si en el futuro hubiera paginación, el contrato sería solo añadir parámetros en el cliente y en los handlers (ej. offset/limit); la arquitectura lo permite.

---

## 9. Referencias por archivo y línea (resumen)

| Archivo | Líneas | Comentario |
|---------|--------|------------|
| `api/backendClient.js` | 6–7 | Timeout y MAX_RETRIES correctos |
| `api/backendClient.js` | 26–33 | Headers correctos; opción de no enviar Content-Type en GET |
| `api/backendClient.js` | 95–104, 112–135 | getTenants y executeCommand alineados con arquitectura |
| `bot/commands/start.js` | 14–21, 25, 36–43 | Solo ctx, backend, render; sin DB |
| `bot/callbacks/tenantSelection.js` | 13–27, 29–53 | Solo ctx, backend, render; sin DB |
| `bot/callbacks/gateSelection.js` | 11–37 | Solo ctx, backend, render; redundancia menor en mensaje FORBIDDEN |
| `bot/commands/feedback.js` | 44–72 | Notify: solo validación de forma y envío; sin lógica de destinatarios |
| `bot/bot.js` | 19–34 | Inyección de backendClient y log; sin lógica de negocio |
| `index.js` | 76–86, 193–204 | Sin DB; backendClient y notify; webhook y rutas correctos |
| `package.json` | dependencies | Sin `pg` |
| `.env.example` | — | BACKEND_BASE_URL, BACKEND_API_KEY; sin DATABASE_URL |

---

## 10. Checklist de aprobación (bot listo para arquitectura profesional)

- [x] Cliente HTTP con `getTenants(telegramId)` y `executeCommand(telegramId, gateId, action)`.
- [x] Headers (X-Request-Id, opcional X-API-Key), timeout y reintentos en el cliente.
- [x] Handlers `/start`, `tenant:X`, `gate:X` solo obtienen contexto, llaman al backend y renderizan.
- [x] Ningún handler accede a DB, hace auditoría ni aplica lógica de permisos.
- [x] Estructura con `src/api`, `src/bot`, `src/index.js`; sin `src/db` ni módulos de permisos/queries/controlador/openGate/jwt.
- [x] Ruta POST `/api/telegram/notify` para que el backend envíe mensajes; el bot solo envía.
- [x] Variables de entorno con BACKEND_BASE_URL y BACKEND_API_KEY; sin DATABASE_URL en el bot.
- [ ] **Verificar:** `npm install` y que package-lock no deje `pg` como dependencia instalada.
- [ ] **Opcional:** Ajustes menores (Content-Type solo en POST, helper telegramUserId, mensajes en constante, nombre feedback → notify).

---

## 11. Acciones concretas de refactorización

### 11.1 Eliminar / verificar

| Acción | Dónde | Cómo |
|--------|--------|-----|
| Asegurar que no quede `pg` en dependencias | `package.json` + `package-lock.json` | Ejecutar `npm install` en la raíz del bot; si `package-lock.json` sigue listando `pg` en la raíz de dependencias, editar el lock para quitar la entrada `pg` y volver a `npm install`. |
| Eliminar carpetas vacías (si existen) | `src/db`, `src/utils` | Borrar las carpetas si todavía están en el repo (en la refactorización anterior ya se eliminaron los archivos; las carpetas pueden haber quedado vacías). |

### 11.2 Ajustes en el cliente HTTP (opcionales)

| Acción | Archivo | Cómo |
|--------|--------|-----|
| Enviar Content-Type solo cuando hay body | `src/api/backendClient.js` | En la construcción de `headers`, incluir `"Content-Type": "application/json"` solo si `body != null`. Por ejemplo: `const headers = { "X-Request-Id": requestId, ...(body !== null ? { "Content-Type": "application/json" } : {}), ...(apiKey ? { "X-API-Key": apiKey } : {}) };` |
| Documentar contrato de error del backend | `src/api/backendClient.js` | Añadir en JSDoc que se espera `{ accepted: true }` o `{ accepted: false, reason: "FORBIDDEN" | "INVALID_ACTION" }` para POST /api/telegram/command. |

### 11.3 Ajustes en handlers y callbacks (opcionales)

| Acción | Archivo | Cómo |
|--------|--------|-----|
| Usar solo result.error en gate:X | `src/bot/callbacks/gateSelection.js` línea 34 | Sustituir el ternario por: `const msg = result.error || "No se pudo enviar el comando. Intentá de nuevo.";` y eliminar la mención explícita a `result.reason === "FORBIDDEN"`, ya que `backendClient` ya asigna ese mensaje a `result.error`. |
| Helper getTelegramUserId(ctx) | Nuevo archivo o en un utils del bot | Crear función que devuelva `ctx.from?.id` y opcionalmente valide; usar en start, tenantSelection y gateSelection para no repetir el mismo bloque. |
| Constantes de mensajes | Nuevo `src/bot/messages.js` o similar | Exportar objetos con claves como `errors.noUser`, `prompts.selectBuilding`, etc., e importar en los handlers. |

### 11.4 Variables de entorno y configuración

| Acción | Dónde | Cómo |
|--------|--------|-----|
| Documentar obligatoriedad de BACKEND_BASE_URL | `.env.example` y/o README | Dejar claro que el bot necesita BACKEND_BASE_URL para funcionar; BACKEND_API_KEY opcional. |
| Opcional: validar BACKEND_BASE_URL al arranque | `src/index.js` | Después de leer env, si `!BACKEND_BASE_URL` y se desea fail-fast, loguear error y no crear bot o no arrancar el servidor (según política del equipo). |

### 11.5 Orden sugerido de aplicación

1. Verificar/eliminar `pg` del lock y eliminar carpetas vacías (si aplica).
2. Ajuste opcional de Content-Type en backendClient.
3. Simplificación del mensaje de error en gateSelection usando solo `result.error`.
4. Resto de mejoras opcionales (helper, mensajes, nombre notify, validación BACKEND_BASE_URL) según prioridad del equipo.

---

*Fin del informe de auditoría y de las acciones de refactorización.*
