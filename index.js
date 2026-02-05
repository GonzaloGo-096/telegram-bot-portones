import express from "express";
import { Telegraf, Markup } from "telegraf";

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_DOMAIN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() || "";
const WEBHOOK_PATH = "/bot";
const WEBHOOK_URL = PUBLIC_DOMAIN ? `https://${PUBLIC_DOMAIN}${WEBHOOK_PATH}` : null;

const state = {
  serverStartedAt: null,
  webhookUrl: null,
  webhookConfigured: false,
  webhookError: null,
};

const log = (message, data) => {
  const ts = new Date().toISOString();
  const line = (data === undefined || data === null)
    ? `[${ts}] ${message}`
    : `[${ts}] ${message} ${JSON.stringify(data)}`;
  console.log(line);
};

process.on("unhandledRejection", (reason) => {
  const msg = reason?.message ?? String(reason);
  const stack = reason?.stack;
  log("unhandledRejection", stack ? { message: msg, stack } : { message: msg });
});

process.on("uncaughtException", (err) => {
  log("uncaughtException", { message: err?.message, stack: err?.stack });
  shutdown("uncaughtException", 1);
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
let server = null;

function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("Shutdown iniciado", { signal });
  const done = () => process.exit(exitCode);
  if (!server) {
    done();
    return;
  }
  const timeoutId = setTimeout(done, SHUTDOWN_TIMEOUT_MS);
  server.close((err) => {
    clearTimeout(timeoutId);
    if (err) log("server.close error", { error: err.message });
    done();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

function genRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ——— Bot: una sola instancia al arranque ———
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  bot.catch((err, ctx) => {
    log("Error en el bot:", { error: err.message, update: ctx.update });
  });
  bot.start((ctx) => {
    log("Comando /start recibido", { user: ctx.from?.username ?? ctx.from?.id, chat: ctx.chat?.id });
    return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
      Markup.button.callback("Portón 1", "PORTON_1"),
      Markup.button.callback("Portón 2", "PORTON_2"),
    ]));
  });
  bot.action("PORTON_1", async (ctx) => {
    log("Botón presionado: Portón 1", { user: ctx.from?.username ?? ctx.from?.id });
    await ctx.answerCbQuery("Portón 1 seleccionado");
    return ctx.reply("Se presionó Portón 1.");
  });
  bot.action("PORTON_2", async (ctx) => {
    log("Botón presionado: Portón 2", { user: ctx.from?.username ?? ctx.from?.id });
    await ctx.answerCbQuery("Portón 2 seleccionado");
    return ctx.reply("Se presionó Portón 2.");
  });
} else {
  log("BOT_TOKEN no definido. Bot desactivado. Definir BOT_TOKEN en variables de entorno.");
}

// ——— Servidor HTTP ———
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  req.requestId = genRequestId();
  res.setHeader("X-Request-Id", req.requestId);
  req.startTime = Date.now();
  next();
});

function logReq(req, res) {
  res.on("finish", () => {
    const ms = Date.now() - req.startTime;
    const ua = req.get("user-agent") || "";
    const ip = req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip;
    log("REQ", {
      id: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms,
      ip,
      uaShort: ua ? ua.slice(0, 60) : "-",
    });
  });
}

app.get("/health", (req, res) => {
  logReq(req, res);
  const uptimeSec = state.serverStartedAt
    ? (Date.now() - state.serverStartedAt.getTime()) / 1000
    : 0;
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    uptimeSec,
    hasBot: !!bot,
    webhookUrl: state.webhookUrl,
    webhookConfigured: state.webhookConfigured,
  });
});

app.get("/ready", (req, res) => {
  logReq(req, res);
  const ready = !!bot && state.webhookConfigured;
  if (ready) {
    res.status(200).json({
      ok: true,
      now: new Date().toISOString(),
      hasBot: true,
      webhookConfigured: true,
      webhookUrl: state.webhookUrl,
    });
    return;
  }
  const reason = !bot
    ? "BOT_TOKEN no definido"
    : !state.webhookConfigured
      ? "Webhook no configurado"
      : "Unknown";
  res.status(503).json({
    ok: false,
    reason,
    hasBot: !!bot,
    webhookConfigured: state.webhookConfigured,
    webhookError: state.webhookError,
    webhookUrl: state.webhookUrl,
  });
});

app.post(WEBHOOK_PATH, (req, res) => {
  const hasBody = !!req.body && Object.keys(req.body || {}).length > 0;
  const updateId = req.body?.update_id;
  log("POST /bot recibido", {
    requestId: req.requestId,
    update_id: updateId ?? null,
    hasBody,
  });

  logReq(req, res);

  if (WEBHOOK_SECRET) {
    const received = req.get("x-telegram-bot-api-secret-token");
    if (received !== WEBHOOK_SECRET) {
      log("Webhook rechazado por secret", { requestId: req.requestId });
      res.status(401).end();
      return;
    }
  }

  res.status(200).end();

  if (!bot) {
    log("POST /bot: bot no inicializado (falta BOT_TOKEN).");
    return;
  }
  if (!req.body) {
    log("POST /bot sin body, ignorado.");
    return;
  }
  bot.handleUpdate(req.body).catch((err) => {
    log("Error al procesar update:", { error: err.message });
  });
});

server = app.listen(PORT, "0.0.0.0", async () => {
  state.serverStartedAt = new Date();
  state.webhookUrl = WEBHOOK_URL;

  log("Arranque del servidor", {
    PORT,
    dominio: PUBLIC_DOMAIN ?? null,
    WEBHOOK_URL,
  });

  if (!bot) return;
  if (!WEBHOOK_URL) {
    log("RAILWAY_PUBLIC_DOMAIN (o PUBLIC_DOMAIN) no definido. No se configuró webhook.");
    return;
  }
  try {
    log("Intentando setWebhook", { url: WEBHOOK_URL, hasSecret: !!WEBHOOK_SECRET });
    const setWebhookOpts = WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {};
    await bot.telegram.setWebhook(WEBHOOK_URL, setWebhookOpts);
    state.webhookConfigured = true;
    state.webhookError = null;
    const info = await bot.telegram.getWebhookInfo();
    log("Webhook configurado correctamente", { url: info.url, pending: info.pending_update_count });
  } catch (err) {
    state.webhookConfigured = false;
    state.webhookError = err.message || String(err);
    log("Error al configurar webhook:", {
      error: state.webhookError,
      url: WEBHOOK_URL,
    });
  }
});
