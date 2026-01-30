# 🔍 Guía de Diagnóstico - Telegram Bot Portones

## ❓ ¿Qué específicamente no funciona?

Marca qué opción describe tu problema:

- [ ] El bot no responde cuando envío `/start` en Telegram
- [ ] No puedo desplegar en Vercel
- [ ] Obtengo errores al ejecutar `npm start` localmente
- [ ] El webhook no se configura
- [ ] Hay errores en los logs de Vercel
- [ ] El bot funciona localmente pero no en Vercel
- [ ] Otro (describe al final)

---

## 📋 Checklist de Diagnóstico Paso a Paso

### 1️⃣ Verificar Funcionamiento Local

**Ejecutar:**
```bash
npm start
```

**¿Qué deberías ver?**
```
[2024-XX-XX] [LOCAL] Iniciando bot local con polling...
[2024-XX-XX] [LOCAL] BOT_TOKEN encontrado: 8211551852...
[2024-XX-XX] [LOCAL] ✅ Bot local arrancado correctamente con polling
```

**Problemas comunes:**

#### ❌ Error: "BOT_TOKEN no está definido"
**Causa:** Falta archivo `.env` o no tiene `BOT_TOKEN`

**Solución:**
1. Crear archivo `.env` en la raíz del proyecto
2. Agregar:
```env
BOT_TOKEN=8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM
```

#### ❌ Error: "Cannot find module 'dotenv/config'"
**Causa:** Dependencias no instaladas

**Solución:**
```bash
npm install
```

#### ❌ Error de sintaxis o módulos
**Causa:** Versión de Node.js incompatible

**Solución:**
- Verificar versión: `node --version` (debe ser >= 18.0.0)
- Actualizar Node.js si es necesario

---

### 2️⃣ Verificar Deploy en Vercel

**Paso 1: Verificar que el proyecto está desplegado**

Abrir en navegador:
```
https://telegram-bot-portones.vercel.app/api/bot
```

**Respuesta esperada:**
```
Bot de portones funcionando.
```

#### ❌ Error 404 - Página no encontrada
**Causa:** El proyecto no está desplegado o la URL es incorrecta

**Solución:**
1. Ir a Vercel Dashboard
2. Verificar que existe un proyecto llamado `telegram-bot-portones`
3. Verificar que hay un deploy exitoso (✅ verde)
4. Si no existe, desplegar:
   ```bash
   vercel --prod
   ```

#### ❌ Error 500 o error en la función
**Causa:** Error en el código o variables de entorno faltantes

**Solución:**
1. Ir a Vercel Dashboard → Tu proyecto
2. Click en **Functions** → `api/bot.js`
3. Revisar logs para ver el error exacto

---

### 3️⃣ Verificar Variables de Entorno en Vercel

**En Vercel Dashboard:**

1. Ir a tu proyecto
2. **Settings** → **Environment Variables**
3. Verificar que existe:

| Variable | Valor | Debe estar en |
|----------|-------|---------------|
| `BOT_TOKEN` | `8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM` | Production, Preview, Development |

#### ❌ No existe `BOT_TOKEN`
**Solución:**
1. Click en **Add New**
2. Key: `BOT_TOKEN`
3. Value: `8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM`
4. Seleccionar todos los entornos (Production, Preview, Development)
5. Click en **Save**
6. **IMPORTANTE:** Redesplegar el proyecto para que tome las variables

#### ⚠️ Variables existen pero no funcionan
**Solución:**
- Las variables se cargan solo en nuevos deploys
- Hacer un nuevo deploy después de agregar variables:
  ```bash
  vercel --prod
  ```
  O hacer un commit/push si está conectado a GitHub

---

### 4️⃣ Verificar Configuración del Webhook

**Opción A: Usando endpoint del bot**

Abrir en navegador:
```
https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true
```

**Respuesta esperada:**
```json
{
  "success": true,
  "webhookInfo": {
    "url": "https://telegram-bot-portones.vercel.app/api/bot",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": null,
    "last_error_message": null
  }
}
```

#### ❌ `url` está vacío o es null
**Causa:** Webhook no configurado

**Solución:** Ver siguiente sección

#### ❌ `url` es diferente a la esperada
**Causa:** Webhook apunta a otra URL

**Solución:**
1. Configurar webhook correctamente (ver abajo)
2. O eliminar webhook actual y configurarlo de nuevo

#### ⚠️ `pending_update_count` > 0
**Causa:** Hay actualizaciones pendientes que no se procesaron

**Solución:**
- Normalmente se resuelve solo al procesarse
- Si persiste, puede indicar que el webhook tuvo problemas anteriores

#### ❌ `last_error_message` tiene un mensaje
**Causa:** Telegram tuvo problemas enviando al webhook

**Solución:**
- Revisar el mensaje de error
- Verificar que la función serverless esté funcionando
- Reconfigurar webhook

**Opción B: Usando API de Telegram directamente**

```bash
curl "https://api.telegram.org/bot8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM/getWebhookInfo"
```

---

### 5️⃣ Configurar Webhook

**Opción A: Usando endpoint del bot (RECOMENDADO)**

Abrir en navegador:
```
https://telegram-bot-portones.vercel.app/api/bot?set-webhook=true
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Webhook configurado",
  "url": "https://telegram-bot-portones.vercel.app/api/bot",
  "webhookInfo": { ... }
}
```

#### ❌ Error 500 al configurar webhook
**Causa:** `BOT_TOKEN` no configurado o incorrecto

**Solución:**
1. Verificar `BOT_TOKEN` en Vercel (paso 3)
2. Verificar que el token es correcto
3. Redesplegar después de configurar variables

**Opción B: Usando cURL**

```bash
curl -X POST "https://api.telegram.org/bot8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://telegram-bot-portones.vercel.app/api/bot"}'
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

---

### 6️⃣ Verificar Logs en Vercel

**En Vercel Dashboard:**

1. Ir a tu proyecto
2. Click en **Functions** → `api/bot.js`
3. Ver logs en tiempo real

**Enviar `/start` en Telegram y verificar logs:**

**Logs esperados:**
```
[2024-XX-XX] POST recibido desde Telegram { "update_id": ..., "message": { ... } }
[2024-XX-XX] Comando /start recibido (serverless) { "user": ..., "chat": ... }
```

#### ❌ No aparecen logs de POST
**Causa:** Telegram no está enviando al webhook

**Solución:**
- Verificar que el webhook está configurado (paso 4)
- Verificar que la URL es correcta
- Verificar que no hay errores en `last_error_message`

#### ❌ Aparecen errores en logs
**Causa:** Error en el código o configuración

**Ejemplos comunes:**

**Error: "BOT_TOKEN no está definido"**
- Verificar variables de entorno en Vercel
- Redesplegar después de configurar

**Error: "Cannot find module"**
- Verificar que `package.json` tiene las dependencias
- Verificar que el deploy incluye `node_modules`

**Error de timeout**
- La función puede estar tardando demasiado
- Verificar código (puede tener operaciones bloqueantes)

---

### 7️⃣ Probar Bot en Telegram

**Pasos:**
1. Abrir Telegram
2. Buscar: `@Ggo7Bot`
3. Enviar: `/start`

**Respuesta esperada:**
- Mensaje: "Bot de portones activo."
- Botones: "Portón 1" y "Portón 2"

#### ❌ No recibo respuesta
**Diagnóstico:**
1. Verificar webhook configurado (paso 4)
2. Verificar logs en Vercel (paso 6)
3. Verificar que no hay errores

#### ❌ Recibo mensaje pero sin botones
**Causa:** Problema con `Markup.inlineKeyboard`

**Solución:**
- Verificar logs para ver errores específicos
- Verificar que `telegraf` está actualizado

#### ❌ Los botones no funcionan
**Causa:** Callbacks no registrados o error en el handler

**Solución:**
- Verificar logs cuando presionas botón
- Verificar que `bot.action()` está correctamente configurado

---

## 🔧 Comandos de Diagnóstico Rápido

Copia y pega estos comandos para verificar todo:

```bash
# 1. Verificar funcionamiento local
npm start

# 2. Verificar endpoint en Vercel (en otra terminal)
curl https://telegram-bot-portones.vercel.app/api/bot

# 3. Verificar webhook configurado
curl "https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true"

# 4. Configurar webhook si falta
curl "https://telegram-bot-portones.vercel.app/api/bot?set-webhook=true"

# 5. Verificar directamente con API de Telegram
curl "https://api.telegram.org/bot8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM/getWebhookInfo"
```

---

## 🐛 Problemas Comunes y Soluciones

### Problema: "El bot funciona local pero no en Vercel"

**Causas posibles:**
1. `BOT_TOKEN` no configurado en Vercel
2. Webhook no configurado
3. Error en el código que solo aparece en producción
4. Timeout en la función

**Solución:**
1. Verificar variables de entorno en Vercel
2. Verificar logs en Vercel para ver errores específicos
3. Configurar webhook
4. Verificar que `maxDuration` en `vercel.json` es suficiente (actualmente 10s)

### Problema: "Error 500 en Vercel"

**Causas posibles:**
1. Error en el código
2. Variable de entorno faltante
3. Dependencia faltante

**Solución:**
1. Ir a Vercel Dashboard → Functions → `api/bot.js`
2. Ver logs para ver el error exacto
3. Verificar que todas las dependencias están en `package.json`
4. Verificar variables de entorno

### Problema: "Webhook se configura pero no llegan POST"

**Causas posibles:**
1. El bot está usando polling en otro lugar (conflicto)
2. El webhook apunta a otra URL
3. Telegram está bloqueando por errores previos

**Solución:**
1. Verificar que no hay otra instancia del bot corriendo
2. Eliminar webhook y configurarlo de nuevo:
   ```bash
   curl -X POST "https://api.telegram.org/bot8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM/deleteWebhook"
   curl "https://telegram-bot-portones.vercel.app/api/bot?set-webhook=true"
   ```
3. Verificar `pending_update_count` - si es alto, procesar primero

---

## 📞 Información Necesaria para Ayuda

Si necesitas ayuda adicional, proporciona:

1. **¿Dónde falla?**
   - [ ] Localmente (`npm start`)
   - [ ] En Vercel (producción)
   - [ ] Ambos

2. **¿Qué error ves exactamente?**
   - Copiar mensaje de error completo

3. **Logs de Vercel:**
   - Copiar últimos logs cuando envías `/start`

4. **Estado del webhook:**
   ```bash
   curl "https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true"
   ```

5. **Verificación de endpoint:**
   ```bash
   curl https://telegram-bot-portones.vercel.app/api/bot
   ```

---

## ✅ Checklist Final

Antes de pedir ayuda, verifica que:

- [ ] `npm start` funciona localmente
- [ ] El endpoint GET en Vercel responde: `https://telegram-bot-portones.vercel.app/api/bot`
- [ ] `BOT_TOKEN` está configurado en Vercel (Settings → Environment Variables)
- [ ] El webhook está configurado: `https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true`
- [ ] Los logs en Vercel muestran actividad cuando envías `/start`
- [ ] No hay errores en los logs de Vercel

Si todo esto está ✅ y aún no funciona, entonces hay un problema específico que necesitamos revisar con los logs exactos.

