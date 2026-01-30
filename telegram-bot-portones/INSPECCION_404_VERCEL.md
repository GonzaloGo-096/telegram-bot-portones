# Inspección real del repo y corrección mínima para /api/bot → 200

---

## 1) INSPECCIÓN REAL DEL REPO

### Árbol de carpetas desde la raíz

```
telegram-bot-portones/
├── .env.example
├── .gitignore
├── ANALISIS_404_VERCEL.md
├── ANALISIS_PROYECTO.md
├── api/
│   └── bot.js
├── DIAGNOSTICO.md
├── INSTRUCCIONES_DEPLOY.md
├── package-lock.json
├── package.json
├── README.md
├── src/
│   └── bot.js
├── vercel.json
```

(No hay carpeta `public/`, ni `pages/`, ni `app/`, ni `.vercelignore`.)

### ¿Existe /api/bot.js?

**Sí.**

- Ruta exacta en el repo: **`api/bot.js`** (raíz del proyecto = raíz del repo).
- Path completo según el workspace: **`c:\proyecto-porton\telegram-bot-portones\api\bot.js`**.

`.gitignore` no ignora `api/` ni `api/bot.js`. No existe `.vercelignore` en el repo.

---

## 2) ANÁLISIS DE COMPATIBILIDAD CON VERCEL

Archivo que debe manejar `/api/bot`: **`api/bot.js`**.

| Pregunta | Respuesta (basada solo en el código actual) |
|----------|---------------------------------------------|
| ¿Exporta `export default function handler(req, res)`? | **Sí.** Línea 46: `export default async function handler(req, res) { ... }` |
| ¿CommonJS o ES Modules? | **ES Modules.** `import` en L1, `export default` en L46. Coincide con `package.json` → `"type": "module"`. |
| ¿Ejecuta lógica al importar? | **Sí.** Al cargar el módulo se ejecuta: constantes `WEBHOOK_*`, función `log`, `const bot = process.env.BOT_TOKEN ? new Telegraf(process.env.BOT_TOKEN) : null`, y si `bot` es truthy, `bot.catch`, `bot.start`, `bot.action("PORTON_1")`, `bot.action("PORTON_2")`. No hay `throw` en el top-level. |
| ¿Contiene `app.listen`, `bot.launch` u otros procesos persistentes? | **No.** No aparece `app.listen`, `bot.launch`, ni `listen(` en el repo. |

---

## 3) BUILD Y SERVERLESS

- **¿Vercel detecta funciones serverless?**  
  En este repo no hay `build` en `package.json` ni en `vercel.json`. Vercel usa por defecto la convención **`api/*.js`** como Serverless Functions. El archivo **`api/bot.js`** cumple esa convención.

- **¿El proyecto genera outputs en `/api`?**  
  **No.** No hay script de build que escriba en `api/`. Las funciones se sirven desde el propio `api/bot.js` en el repo.

- **¿Algo hace que Vercel pueda IGNORAR el archivo?**  
  - No hay `vercel.json` con `routes` o `rewrites` que sobrescriban `/api/bot`.
  - No hay `.vercelignore` que excluya `api/`.
  - La única causa objetiva en el código por la que la ruta no "exista" en runtime es que **el módulo falle al cargar** (por ejemplo un `throw` antes del `export default`). En el estado actual del repo **no hay `throw` en el top-level**; si en el despliegue donde ves 404 sigue el código anterior que hacía `throw new Error(...)` cuando faltaba `BOT_TOKEN`, ese fallo de carga explicaría el 404.

---

## 4) CONFIGURACIÓN

### package.json

- **`type`:** `"module"` → ES Modules. Compatible con `api/bot.js` (import/export).
- **Scripts relevantes:** `"start": "node src/bot.js"`, `"dev": "node src/bot.js"`. No hay script que construya o modifique `api/`. No afectan a qué hace Vercel con `api/bot.js`.

Nada aquí invalida que `/api/bot` sea la función en `api/bot.js`.

### vercel.json (existe en la raíz)

Contenido actual:

```json
{
  "functions": {
    "api/bot.js": {
      "maxDuration": 10
    }
  }
}
```

- No hay `routes`, `rewrites`, `build`, `output`. Solo se configura `maxDuration` para `api/bot.js`.
- No invalida `/api/bot`; refuerza que esa función se use.

---

## 5) DIAGNÓSTICO FINAL

- **¿Por qué `/api/bot` devuelve 404 hoy?**  
  Con el código actual en el repo (sin `throw` en la carga del módulo), la estructura y la configuración son correctas para que Vercel sirva `/api/bot`. Si en el despliegue donde medís sigue habiendo 404, las causas objetivas posibles son:  
  1) **Despliegue con una versión anterior del código** que sí hacía `throw new Error(...)` cuando `BOT_TOKEN` no estaba definido, haciendo que el módulo falle al cargar y Vercel no registre la función (comportamiento típico: 404).  
  2) **Raíz del proyecto en Vercel distinta a la raíz del repo**, de modo que en el deploy no exista `api/bot.js` en la ruta esperada.

- **¿Es porque el archivo no existe, está mal ubicado o es incompatible?**  
  En el repo: el archivo **existe**, está en **`api/bot.js`** (ubicación correcta para Vercel) y tiene **`export default async function handler(req, res)`** (compatible). No hay configuración que lo invalide. La única incompatibilidad que podría haber existido es el **fallo de carga del módulo** por un `throw` en el top-level (por ejemplo por falta de `BOT_TOKEN`).

- **Causa exacta (no genérica):**  
  El 404 en `/api/bot` se explica por **fallo en la carga/ejecución del módulo `api/bot.js` en el entorno de Vercel** (p. ej. por un `throw` en tiempo de import cuando no está `BOT_TOKEN`), no por ausencia del archivo ni por mala ubicación en el árbol del repo.

---

## 6) CORRECCIÓN MÍNIMA

Objetivo: que **`https://<dominio>.vercel.app/api/bot`** responda **HTTP 200** con el mínimo cambio.

- Asegurar que **ningún `throw` en el top-level** impida cargar el módulo (ya está así en el repo actual).
- Hacer que un **GET simple a `/api/bot`** (sin query) **siempre devuelva 200**, aunque `BOT_TOKEN` no esté configurado.

Cambio mínimo en `api/bot.js`: **responder 200 para GET sin query al inicio del handler**, antes de comprobar `BOT_TOKEN`.

### Contenido EXACTO que debe tener `api/bot.js`

```javascript
import { Telegraf, Markup } from "telegraf";

const WEBHOOK_DOMAIN = "https://telegram-bot-portones.vercel.app";
const WEBHOOK_URL = `${WEBHOOK_DOMAIN}/api/bot`;

const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

const bot = process.env.BOT_TOKEN ? new Telegraf(process.env.BOT_TOKEN) : null;

if (bot) {
  bot.catch((err, ctx) => {
    log("Error en el bot:", { error: err.message, update: ctx.update });
  });
  bot.start((ctx) => {
    log("Comando /start recibido (serverless)", {
      user: ctx.from.username || ctx.from.id,
      chat: ctx.chat.id,
    });
    return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
      Markup.button.callback("Portón 1", "PORTON_1"),
      Markup.button.callback("Portón 2", "PORTON_2"),
    ]));
  });
  bot.action("PORTON_1", async (ctx) => {
    log("Botón presionado: Portón 1 (serverless)", { user: ctx.from.username || ctx.from.id });
    await ctx.answerCbQuery("Portón 1 seleccionado");
    return ctx.reply("Se presionó Portón 1.");
  });
  bot.action("PORTON_2", async (ctx) => {
    log("Botón presionado: Portón 2 (serverless)", { user: ctx.from.username || ctx.from.id });
    await ctx.answerCbQuery("Portón 2 seleccionado");
    return ctx.reply("Se presionó Portón 2.");
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET" && !req.query["set-webhook"] && !req.query["get-webhook"]) {
      return res.status(200).send("Bot de portones funcionando.");
    }

    if (!process.env.BOT_TOKEN || !bot) {
      return res.status(503).json({
        ok: false,
        error: "BOT_TOKEN no configurado. Configurar en Vercel: Settings → Environment Variables y redesplegar.",
      });
    }

    if (req.method === "GET" && req.query["set-webhook"] === "true") {
      try {
        await bot.telegram.setWebhook(WEBHOOK_URL);
        const webhookInfo = await bot.telegram.getWebhookInfo();
        log("Webhook configurado exitosamente", { url: webhookInfo.url, pending_updates: webhookInfo.pending_update_count });
        return res.status(200).json({ success: true, message: "Webhook configurado", url: WEBHOOK_URL, webhookInfo });
      } catch (error) {
        log("Error al configurar webhook:", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    if (req.method === "GET" && req.query["get-webhook"] === "true") {
      try {
        const webhookInfo = await bot.telegram.getWebhookInfo();
        log("Información del webhook consultada", webhookInfo);
        return res.status(200).json({ success: true, webhookInfo });
      } catch (error) {
        log("Error al obtener información del webhook:", { error: error.message });
        return res.status(500).json({ success: false, error: error.message });
      }
    }

    if (req.method === "POST") {
      log("POST recibido desde Telegram", req.body);
      await bot.handleUpdate(req.body);
      return res.status(200).end();
    }

    return res.status(200).send("Bot de portones funcionando.");
  } catch (error) {
    log("Error en handler serverless:", { error: error.message, stack: error.stack });
    return res.status(200).end();
  }
}
```
