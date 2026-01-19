# 🚀 Instrucciones de Deploy - Telegram Bot Portones

## ✅ Refactorización Completada

El proyecto ha sido completamente refactorizado y está listo para producción. Todos los archivos han sido actualizados con:

- ✅ Código ES6 modules consistente
- ✅ Logs con timestamp en ambos entornos
- ✅ Callback_data unificados (`PORTON_1`, `PORTON_2`)
- ✅ Manejo correcto de `bot.handleUpdate()` sin pasar `res`
- ✅ Respuestas HTTP 200 correctas
- ✅ Endpoints para configurar/verificar webhook
- ✅ Manejo robusto de errores

---

## 📋 Checklist Pre-Deploy

### 1. Verificar Archivos Locales

- [x] `api/bot.js` - Función serverless completa
- [x] `src/bot.js` - Bot local con polling
- [x] `package.json` - Configuración ES6 modules
- [x] `vercel.json` - Configuración de función
- [x] `.env` - Variables de entorno (NO subir a repo)

### 2. Probar Localmente

```bash
# Instalar dependencias
npm install

# Probar bot local
npm start
```

**Verificar:**
- ✅ El bot inicia sin errores
- ✅ Los logs aparecen con `[LOCAL]`
- ✅ Enviar `/start` en Telegram funciona
- ✅ Los botones responden correctamente

---

## 🌐 Deploy en Vercel

### Paso 1: Configurar Variables de Entorno en Vercel

1. Ir a tu proyecto en Vercel Dashboard
2. **Settings** → **Environment Variables**
3. Agregar las siguientes variables:

| Variable | Valor | Entorno |
|----------|-------|---------|
| `BOT_TOKEN` | `8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM` | Production, Preview, Development |
| `WEBHOOK_URL` | `https://telegram-bot-portones.vercel.app/api/bot` | Production (opcional) |

**⚠️ IMPORTANTE:** 
- `BOT_TOKEN` es **OBLIGATORIO**
- `WEBHOOK_URL` es opcional (solo para referencia)

### Paso 2: Desplegar

#### Opción A: Desde CLI de Vercel

```bash
# Si no tienes Vercel CLI instalado
npm i -g vercel

# Login
vercel login

# Deploy a producción
vercel --prod
```

#### Opción B: Desde GitHub

1. Conectar repositorio a Vercel
2. Vercel detectará automáticamente:
   - Carpeta `api/` → Función serverless
   - `package.json` con `"type": "module"` → ES6 modules
3. Cada push a `main` desplegará automáticamente

### Paso 3: Verificar Deploy

1. Ir a Vercel Dashboard → Tu proyecto
2. Verificar que el deploy fue exitoso (✅ verde)
3. Verificar que la función está disponible:

```bash
# Probar endpoint GET
curl https://telegram-bot-portones.vercel.app/api/bot
```

**Respuesta esperada:** `Bot de portones funcionando.`

---

## 🔗 Configurar Webhook en Telegram

### Opción 1: Endpoint Automático (Recomendado) ⭐

Una vez desplegado, visitar en el navegador o con curl:

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

### Opción 2: Usando cURL

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

### Opción 3: Verificar Webhook Configurado

```bash
# Usando endpoint del bot
curl "https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true"

# O usando API de Telegram directamente
curl "https://api.telegram.org/bot8211551852:AAF3Yb-l1WwRlYvp6ALhzJ5eLvc6Z0BqCuM/getWebhookInfo"
```

**Verificar que:**
- ✅ `url` = `https://telegram-bot-portones.vercel.app/api/bot`
- ✅ `pending_update_count` = `0` (o bajo)
- ✅ No hay errores

---

## 🧪 Testing Final

### 1. Probar en Telegram

1. Abrir Telegram
2. Buscar tu bot: `@Ggo7Bot`
3. Enviar `/start`
4. **Verificar:**
   - ✅ Recibe mensaje: "Bot de portones activo."
   - ✅ Aparecen botones: "Portón 1" y "Portón 2"
   - ✅ Al presionar botones, recibe respuestas

### 2. Verificar Logs en Vercel

1. Ir a Vercel Dashboard → Tu proyecto
2. Click en **Functions** → `api/bot.js`
3. Ver logs en tiempo real
4. **Verificar que aparecen:**
   - ✅ `POST recibido desde Telegram`
   - ✅ `Comando /start recibido (serverless)`
   - ✅ `Botón presionado: Portón X (serverless)`

### 3. Verificar Logs Locales (Opcional)

Si quieres comparar, ejecutar localmente:

```bash
npm start
```

**Verificar que los logs tienen prefijo `[LOCAL]`** para diferenciarlos de producción.

---

## 🔍 Solución de Problemas

### ❌ El bot no responde en Telegram

**Diagnóstico:**
1. Verificar webhook configurado:
   ```
   https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true
   ```

2. Verificar logs en Vercel:
   - ¿Llegan POST desde Telegram?
   - ¿Hay errores en los logs?

3. Verificar BOT_TOKEN en Vercel:
   - Settings → Environment Variables
   - ¿Está configurado correctamente?

**Soluciones:**
- Si webhook no está configurado → Configurarlo (ver arriba)
- Si no llegan POST → Verificar URL del webhook
- Si hay errores en logs → Revisar código y variables de entorno

### ❌ Error "BOT_TOKEN no está definido"

**Causa:** Variable de entorno no configurada en Vercel

**Solución:**
1. Vercel Dashboard → Settings → Environment Variables
2. Agregar `BOT_TOKEN` con el valor correcto
3. Redesplegar (o esperar a que Vercel lo detecte)

### ❌ Error 404 en `/api/bot`

**Causa:** Función serverless no desplegada o ruta incorrecta

**Solución:**
1. Verificar que `api/bot.js` existe en la carpeta `api/`
2. Verificar que el deploy fue exitoso
3. Verificar que la URL es exactamente: `/api/bot` (no `/bot` ni `/api/bot.js`)

### ❌ El bot funciona local pero no en Vercel

**Diagnóstico:**
1. Verificar estructura de carpetas:
   ```
   api/
     └── bot.js  ✅
   ```

2. Verificar que `package.json` tiene `"type": "module"`

3. Revisar logs de deploy en Vercel

**Solución:**
- Asegurar que `api/bot.js` exporta `export default async function handler`
- Verificar que no hay errores de sintaxis
- Redesplegar

---

## 📊 Monitoreo Continuo

### Logs en Vercel

- **Dashboard:** Proyecto → Functions → `api/bot.js` → Logs
- **CLI:** `vercel logs --follow`

### Métricas a Monitorear

- ✅ Tasa de éxito de requests (debe ser ~100%)
- ✅ Tiempo de respuesta (debe ser < 1s)
- ✅ Errores en logs
- ✅ POST recibidos desde Telegram

---

## 🔄 Actualizaciones Futuras

### Después de cada cambio:

1. **Commit y push:**
   ```bash
   git add .
   git commit -m "Descripción del cambio"
   git push
   ```

2. **Vercel desplegará automáticamente** (si está conectado a GitHub)

3. **El webhook NO necesita reconfigurarse** (el dominio es fijo)

4. **Probar en Telegram** para verificar que funciona

---

## ✅ Estado Final Esperado

- ✅ Bot responde a `/start` en Telegram
- ✅ Botones funcionan correctamente
- ✅ Logs aparecen en Vercel con timestamp
- ✅ Webhook configurado y verificado
- ✅ Sin errores en logs
- ✅ Respuestas rápidas (< 1s)

---

## 📞 Soporte

Si encuentras problemas:

1. Revisar logs en Vercel
2. Verificar webhook con `get-webhook=true`
3. Probar localmente para comparar
4. Revisar `ANALISIS_PROYECTO.md` para problemas conocidos

---

**🎉 ¡Proyecto listo para producción!**

