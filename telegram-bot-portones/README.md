# 🤖 Telegram Bot Portones

Bot de Telegram para control de portones con soporte para desarrollo local (polling) y producción serverless en Vercel (webhook).

## 📁 Estructura del Proyecto

```
telegram-bot-portones/
├── api/
│   └── bot.js          # Función serverless para Vercel
├── src/
│   └── bot.js          # Bot local con polling (desarrollo)
├── package.json
├── vercel.json
├── .env                 # Variables de entorno (local)
└── README.md
```

## 🚀 Configuración Inicial

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```env
BOT_TOKEN=tu_token_de_telegram
WEBHOOK_URL=https://telegram-bot-portones.vercel.app/api/bot
```

## 💻 Desarrollo Local

### Ejecutar con Polling

```bash
npm start
```

El bot se ejecutará localmente usando polling para recibir actualizaciones de Telegram.

**Características:**
- ✅ Logs con timestamp y prefijo `[LOCAL]`
- ✅ Polling automático
- ✅ Mismos comandos y botones que producción
- ✅ Manejo de errores y cierre limpio

## 🌐 Producción en Vercel

### 1. Configurar Variables de Entorno en Vercel

1. Ir a tu proyecto en Vercel
2. **Settings** → **Environment Variables**
3. Agregar:
   - `BOT_TOKEN` = `tu_token_de_telegram`
   - `WEBHOOK_URL` = `https://telegram-bot-portones.vercel.app/api/bot` (opcional, solo referencia)

### 2. Desplegar

```bash
vercel --prod
```

O conectar tu repositorio de GitHub a Vercel para despliegues automáticos.

### 3. Configurar Webhook en Telegram

#### Opción A: Usando el endpoint automático (Recomendado)

Una vez desplegado, visitar:

```
https://telegram-bot-portones.vercel.app/api/bot?set-webhook=true
```

Esto configurará el webhook automáticamente.

#### Opción B: Usando cURL

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://telegram-bot-portones.vercel.app/api/bot"}'
```

#### Opción C: Verificar webhook configurado

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

O visitar:

```
https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true
```

## 📊 Logs y Depuración

### Desarrollo Local

Los logs aparecen en la consola con formato:
```
[2024-01-15T10:30:45.123Z] [LOCAL] Comando /start recibido
```

### Producción en Vercel

1. **Dashboard de Vercel:**
   - Ir a tu proyecto
   - Click en **Functions** → `api/bot.js`
   - Ver logs en tiempo real

2. **CLI de Vercel:**
   ```bash
   vercel logs --follow
   ```

Los logs incluyen:
- ✅ Timestamp ISO
- ✅ Tipo de acción (POST, /start, botones, errores)
- ✅ Datos relevantes (usuario, chat, etc.)
- ✅ Prefijo `[LOCAL]` o `(serverless)` para identificar el entorno

## 🎯 Funcionalidades

### Comandos

- `/start` - Muestra menú con botones de portones

### Botones

- **Portón 1** - Selecciona Portón 1
- **Portón 2** - Selecciona Portón 2

## 🔧 Características Técnicas

### Serverless (`api/bot.js`)

- ✅ ES6 modules (`import`/`export`)
- ✅ Manejo correcto de `bot.handleUpdate(req.body)` sin pasar `res`
- ✅ Respuesta `200 OK` inmediata a Telegram
- ✅ Logs con timestamp de todas las acciones
- ✅ Endpoints para configurar/verificar webhook
- ✅ Manejo robusto de errores

### Local (`src/bot.js`)

- ✅ ES6 modules compatible
- ✅ Polling para desarrollo
- ✅ Logs diferenciados con `[LOCAL]`
- ✅ Mismos `callback_data` que producción
- ✅ Cierre limpio con Ctrl+C

## ⚠️ Solución de Problemas

### El bot no responde en Telegram

1. **Verificar webhook configurado:**
   ```
   https://telegram-bot-portones.vercel.app/api/bot?get-webhook=true
   ```

2. **Verificar logs en Vercel:**
   - Revisar si llegan POST desde Telegram
   - Buscar errores en los logs

3. **Verificar BOT_TOKEN en Vercel:**
   - Settings → Environment Variables
   - Confirmar que `BOT_TOKEN` está configurado

### Error "BOT_TOKEN no está definido"

- **Local:** Verificar que `.env` existe y tiene `BOT_TOKEN`
- **Vercel:** Configurar `BOT_TOKEN` en Environment Variables

### El bot funciona local pero no en Vercel

1. Verificar que `api/bot.js` está en la carpeta `api/`
2. Verificar que el deploy fue exitoso
3. Revisar logs de Vercel para errores
4. Verificar que el webhook está configurado correctamente

## 📝 Notas

- El dominio fijo `https://telegram-bot-portones.vercel.app` se mantiene constante en todos los deploys
- Los `callback_data` están unificados entre local y producción (`PORTON_1`, `PORTON_2`)
- El archivo `.env` está en `.gitignore` y no se sube al repositorio
- Vercel detecta automáticamente la carpeta `api/` como funciones serverless

## 🔐 Seguridad

- ⚠️ **NUNCA** subir `.env` al repositorio
- ⚠️ **NUNCA** exponer `BOT_TOKEN` en logs públicos
- ✅ Usar variables de entorno en Vercel para producción
- ✅ `.env` solo para desarrollo local

## 📚 Recursos

- [Documentación de Telegraf](https://telegraf.js.org/)
- [Documentación de Vercel](https://vercel.com/docs)
- [API de Telegram Bot](https://core.telegram.org/bots/api)

