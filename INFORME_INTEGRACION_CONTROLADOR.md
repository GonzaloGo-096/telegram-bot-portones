# Informe de Integración: Bot Telegram ↔ Controlador Central de Portones

**Proyecto:** telegram-bot-portones  
**Fecha:** Febrero 2025  
**Objetivo:** Preparar la integración con el Controlador Central de Portones

---

## 1. Variables de entorno

### 1.1 Variables actuales en uso

| Variable | Obligatoria | Uso | Valor por defecto | Ubicación en código |
|----------|-------------|-----|-------------------|---------------------|
| `BOT_TOKEN` | **Sí** | Token del bot de Telegram (obtenido vía @BotFather) | — | Líneas 5, 66, 88 |
| `PORT` | No | Puerto del servidor HTTP | `3000` | Línea 4 |
| `RAILWAY_PUBLIC_DOMAIN` | Sí* | Dominio público en Railway para construir la URL del webhook | — | Línea 6 |
| `PUBLIC_DOMAIN` | Sí* | Alternativa a RAILWAY_PUBLIC_DOMAIN (para otros hostings) | — | Línea 6 |
| `WEBHOOK_SECRET` | No | Secret token para validar que los POST al webhook vienen de Telegram | `""` | Líneas 7, 174-181, 214 |

\* Al menos una de las dos (`RAILWAY_PUBLIC_DOMAIN` o `PUBLIC_DOMAIN`) es obligatoria para que el webhook funcione en producción.

### 1.2 Variables faltantes para el Controlador Central

| Variable | Obligatoria | Propósito |
|----------|-------------|-----------|
| `CONTROLADOR_BASE_URL` | **Sí** | URL base del Controlador Central (ej. `https://controlador.railway.app`) |
| `CONTROLADOR_API_KEY` | Depende | API key o Bearer token si el Controlador requiere autenticación |
| `ALLOWED_CHAT_IDS` | **Recomendada** | Lista de `chat_id` permitidos, separados por coma (ej. `123456789,-987654321`) |

### 1.3 Plantilla `.env` completa (actual + recomendada)

```env
# ——— Telegram (actuales) ———
BOT_TOKEN=
PORT=3000
RAILWAY_PUBLIC_DOMAIN=
# PUBLIC_DOMAIN=                    # alternativa si no usás Railway
WEBHOOK_SECRET=

# ——— Controlador Central (nuevas) ———
CONTROLADOR_BASE_URL=
CONTROLADOR_API_KEY=

# ——— Seguridad ———
ALLOWED_CHAT_IDS=
```

---

## 2. Handlers de comandos

### 2.1 Comandos implementados

| Tipo | Trigger | Handler | Respuesta al usuario |
|------|---------|---------|----------------------|
| Comando | `/start` | `bot.start()` | Mensaje: "Bot de portones activo." + teclado inline con 2 botones |
| Callback | Botón "Portón 1" | `bot.action("PORTON_1")` | `answerCbQuery`: "Portón 1 seleccionado" + mensaje: "Se presionó Portón 1." |
| Callback | Botón "Portón 2" | `bot.action("PORTON_2")` | `answerCbQuery`: "Portón 2 seleccionado" + mensaje: "Se presionó Portón 2." |

### 2.2 Detalle de cada handler

#### `/start`
- **Ubicación:** Líneas 71-76
- **Acción:** Responde con texto fijo y un teclado inline de 2 botones.
- **Log:** Registra `user` (username o id) y `chat` (chat_id).
- **Estado:** No envía ningún comando al Controlador Central.

#### `PORTON_1` (botón inline)
- **Ubicación:** Líneas 78-82
- **Acción:** `answerCbQuery` para cerrar el loading del botón + mensaje de confirmación.
- **Log:** Registra que se presionó Portón 1.
- **Estado:** No envía ningún comando al Controlador Central.

#### `PORTON_2` (botón inline)
- **Ubicación:** Líneas 83-87
- **Acción:** Igual que PORTON_1.
- **Estado:** No envía ningún comando al Controlador Central.

### 2.3 Acciones pendientes para enviar comandos reales

| Acción | Estado actual | Pendiente |
|--------|---------------|-----------|
| Enviar comando "abrir" al Controlador | No implementado | Llamar HTTP POST al Controlador al pulsar Portón 1/2 |
| Mostrar feedback de éxito/error | Respuesta estática | Mostrar resultado real según respuesta del Controlador |
| Mostrar estado actual del portón | No existe | Consultar estado vía API o recibir push desde Controlador |
| Rate limiting / debounce | No existe | Evitar múltiples pulsaciones seguidas |

---

## 3. Integraciones externas

### 3.1 Estado actual

| Tipo | Implementado | Detalle |
|------|--------------|---------|
| HTTP saliente | **No** | No hay `fetch`, `axios` ni llamadas a servicios externos |
| MQTT | **No** | No hay cliente MQTT ni suscripciones |
| WebSocket | **No** | No hay conexiones WebSocket |
| Webhook entrante | **Sí** | Solo recibe POST de Telegram en `/bot` |

### 3.2 Flujo actual vs flujo objetivo

**Actual:**
```
Usuario → Telegram → POST /bot → Bot (respuesta estática) → Usuario
```

**Objetivo:**
```
Usuario → Telegram → POST /bot → Bot → HTTP al Controlador → Controlador → MQTT → ESP32/Portón
                                                                    ↓
Usuario ← Bot ← Webhook/WebSocket/MQTT ← Controlador (feedback de estado)
```

### 3.3 Qué falta implementar

| Componente | Descripción |
|------------|-------------|
| Cliente HTTP | Módulo/función que llame a `CONTROLADOR_BASE_URL` (ej. `POST /api/portones/1/abrir`) |
| Handler de feedback | Endpoint o suscripción para recibir estados del Controlador (webhook, WebSocket o MQTT) |
| Envío de mensajes proactivos | Usar `bot.telegram.sendMessage(chatId, ...)` cuando llegue un cambio de estado |
| Manejo de errores | Timeout, reintentos, mensajes claros al usuario si el Controlador falla |

---

## 4. Seguridad

### 4.1 Mecanismos actuales

| Mecanismo | Estado | Detalle |
|-----------|--------|---------|
| Webhook secret token | Opcional | Si `WEBHOOK_SECRET` está definido, valida el header `x-telegram-bot-api-secret-token` (líneas 174-181) |
| Chat whitelist | **No** | Cualquier usuario puede usar el bot |
| Validación de origen | Parcial | Solo el secret token; no hay validación de IP |
| Rate limiting | **No** | No hay límite de requests por usuario/chat |
| Logs sensibles | Parcial | No se loguea el token; sí se loguean `update_id`, usuario, chat |

### 4.2 Recomendaciones para producción

| Recomendación | Prioridad | Descripción |
|---------------|-----------|-------------|
| **ALLOWED_CHAT_IDS** | Alta | Restringir uso del bot a chats autorizados (privados y/o grupos) |
| **WEBHOOK_SECRET** | Alta | Siempre definir en producción para evitar que terceros envíen POST falsos a `/bot` |
| **CONTROLADOR_API_KEY** | Media | Si el Controlador lo soporta, autenticar las llamadas del bot |
| **Rate limiting** | Media | Limitar pulsaciones por minuto por chat para evitar abuso |
| **HTTPS** | Alta | Railway/Vercel ya lo proveen; en self-hosted usar reverse proxy con TLS |
| **No loguear tokens** | Alta | Ya cumplido; mantener en futuras variables sensibles |

---

## 5. Gaps (archivos, funciones, endpoints)

### 5.1 Archivos faltantes

| Archivo | Propósito |
|---------|-----------|
| `src/controlador.js` o `lib/controlador.js` | Cliente HTTP para comunicarse con el Controlador Central |
| `src/middleware.js` | Middleware de validación de `ALLOWED_CHAT_IDS` |
| `.env.example` | Plantilla de variables (actualmente vacío/corrupto) |

### 5.2 Funciones faltantes

| Función | Descripción |
|---------|-------------|
| `enviarComandoPorton(portonId, accion)` | Envía POST al Controlador (ej. abrir/cerrar) y devuelve resultado |
| `parseAllowedChatIds()` | Parsea `ALLOWED_CHAT_IDS` y devuelve array de números |
| `isChatAllowed(chatId)` | Comprueba si el chat está en la whitelist |
| `enviarEstadoAUsuario(chatId, portonId, estado)` | Envía mensaje proactivo con el estado del portón |

### 5.3 Endpoints faltantes

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/api/feedback` o `/webhook/estado` | POST | Recibir notificaciones de estado del Controlador Central |
| (Opcional) `/api/estado` | GET | Consultar estado actual si el bot hace polling al Controlador |

### 5.4 Dependencias npm faltantes

| Paquete | Propósito |
|---------|-----------|
| `node-fetch` o `axios` | Llamadas HTTP al Controlador (Node 18+ tiene `fetch` nativo) |
| (Opcional) `mqtt` | Si el feedback se recibe vía MQTT en lugar de HTTP |

---

## 6. Producción

### 6.1 Variables de entorno para producción

```env
BOT_TOKEN=<token_de_botfather>
PORT=3000
RAILWAY_PUBLIC_DOMAIN=<tu-app.railway.app>
WEBHOOK_SECRET=<string_aleatorio_largo>

CONTROLADOR_BASE_URL=https://controlador-central.railway.app
CONTROLADOR_API_KEY=<si_el_controlador_lo_requiere>
ALLOWED_CHAT_IDS=123456789,987654321
```

### 6.2 Configuración de seguridad en producción

| Elemento | Acción |
|----------|--------|
| Variables sensibles | Usar solo variables de entorno del hosting, nunca hardcodear |
| WEBHOOK_SECRET | Generar con `openssl rand -hex 32` o similar |
| ALLOWED_CHAT_IDS | Obtener chat_id con @userinfobot o logueando el primer /start |
| Logs | Evitar loguear tokens, API keys y datos sensibles |

### 6.3 Recomendaciones para Railway

| Recomendación | Detalle |
|---------------|---------|
| `RAILWAY_PUBLIC_DOMAIN` | Se inyecta automáticamente en Railway; no hace falta configurarlo manualmente |
| Health checks | Configurar Railway para usar `GET /health` o `GET /ready` |
| Restart policy | Railway reinicia el servicio ante fallos; el bot ya maneja SIGTERM/SIGINT |
| Dominio custom | Opcional: configurar dominio propio y usar `PUBLIC_DOMAIN` |

### 6.4 Checklist pre-deploy

- [ ] `BOT_TOKEN` configurado
- [ ] `WEBHOOK_SECRET` configurado (producción)
- [ ] `ALLOWED_CHAT_IDS` configurado
- [ ] `CONTROLADOR_BASE_URL` configurado
- [ ] Endpoint `/ready` devuelve 200
- [ ] Webhook configurado correctamente (ver logs de arranque)

---

## 7. Resumen gráfico

### 7.1 Mapa de flujo de eventos (objetivo)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Usuario   │     │   Bot Telegram   │     │ Controlador Central │
│  (Telegram) │     │  (este proyecto) │     │                     │
└──────┬──────┘     └────────┬─────────┘     └──────────┬──────────┘
       │                     │                          │
       │  /start, botones    │                          │
       │ ──────────────────>│                          │
       │                     │  POST /api/portones/1/   │
       │                     │  abrir                   │
       │                     │ ───────────────────────>│
       │                     │                          │
       │                     │                          │  MQTT
       │                     │                          │ ──────> ESP32
       │                     │                          │         Portón
       │                     │                          │
       │                     │  Webhook/WS: estado      │
       │                     │ <───────────────────────│
       │  Mensaje con estado │                          │
       │ <──────────────────│                          │
       │                     │                          │
```

### 7.2 Tabla de dependencias y módulos

| Componente | Implementado | Pendiente | Depende de |
|------------|--------------|-----------|------------|
| Servidor Express | ✅ | — | express |
| Bot Telegraf | ✅ | — | telegraf, BOT_TOKEN |
| Webhook Telegram | ✅ | — | PUBLIC_DOMAIN, WEBHOOK_SECRET |
| Handlers /start, PORTON_1, PORTON_2 | ✅ | Llamada al Controlador | — |
| Cliente HTTP al Controlador | ❌ | ✅ | CONTROLADOR_BASE_URL, fetch/axios |
| Middleware ALLOWED_CHAT_IDS | ❌ | ✅ | ALLOWED_CHAT_IDS |
| Endpoint feedback del Controlador | ❌ | ✅ | Controlador Central |
| Envío proactivo de estados | ❌ | ✅ | bot.telegram.sendMessage |
| MQTT (opcional) | ❌ | ✅ | mqtt, broker |

### 7.3 Estructura de archivos recomendada (post-integración)

```
telegram-bot-portones/
├── index.js                 # Entry point (actual)
├── src/
│   ├── controlador.js       # Cliente HTTP al Controlador Central
│   ├── middleware.js       # Validación ALLOWED_CHAT_IDS
│   └── handlers.js         # (opcional) Extraer handlers del bot
├── package.json
├── .env.example
├── README.md
└── INFORME_INTEGRACION_CONTROLADOR.md  # Este documento
```

---

## Resumen ejecutivo

El bot actual es funcional para recibir comandos de usuario y mostrar respuestas estáticas, pero **no está conectado al Controlador Central**. Para la integración se requiere:

1. **Variables:** Añadir `CONTROLADOR_BASE_URL`, `CONTROLADOR_API_KEY`, `ALLOWED_CHAT_IDS`.
2. **Código:** Implementar cliente HTTP que envíe comandos al Controlador al pulsar Portón 1/2.
3. **Seguridad:** Implementar whitelist de chats y asegurar `WEBHOOK_SECRET` en producción.
4. **Feedback:** Definir con el equipo del Controlador cómo se enviarán los estados (webhook, WebSocket o MQTT) e implementar el receptor correspondiente en el bot.

Este informe sirve como guía de implementación para completar la integración.
