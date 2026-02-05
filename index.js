import express from "express";
import { createBot, parseAllowedChatIds } from "./bot.js";
import { registerFeedbackRoute } from "./feedback.js";

// ——— Variables de entorno (ver .env.example para documentación) ———
// PORT → servidor HTTP
const PORT = Number(process.env.PORT) || 3000;
// BOT_TOKEN → Telegraf (obligatorio)
const BOT_TOKEN = process.env.BOT_TOKEN;
// RAILWAY_PUBLIC_DOMAIN | PUBLIC_DOMAIN → URL del webhook
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_DOMAIN;
// WEBHOOK_SECRET → validación header x-telegram-bot-api-secret-token en POST /bot
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() || "";
const WEBHOOK_PATH = "/bot";
const WEBHOOK_URL = PUBLIC_DOMAIN ? `https://${PUBLIC_DOMAIN}${WEBHOOK_PATH}` : null;

// CONTROLADOR_BASE_URL, CONTROLADOR_API_KEY → cliente HTTP enviarEvento()
const CONTROLADOR_BASE_URL = process.env.CONTROLADOR_BASE_URL?.trim() || "";
const CONTROLADOR_API_KEY = process.env.CONTROLADOR_API_KEY?.trim() || "";
// ALLOWED_CHAT_IDS → filtro de chats en /start, botones y feedback
const ALLOWED_CHAT_IDS = parseAllowedChatIds(process.env.ALLOWED_CHAT_IDS || "");

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

// ——— Bot ———
const bot = createBot({
  botToken: BOT_TOKEN,
  controladorBaseUrl: CONTROLADOR_BASE_URL,
  controladorApiKey: CONTROLADOR_API_KEY,
  allowedChatIds: ALLOWED_CHAT_IDS,
  log,
});

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

// Endpoint de feedback del Controlador Central
registerFeedbackRoute(app, bot, ALLOWED_CHAT_IDS, log, logReq);

server = app.listen(PORT, "0.0.0.0", async () => {
  state.serverStartedAt = new Date();
  state.webhookUrl = WEBHOOK_URL;

  log("Arranque del servidor", {
    PORT,
    dominio: PUBLIC_DOMAIN ?? null,
    WEBHOOK_URL,
    controladorConfigurado: !!CONTROLADOR_BASE_URL,
    allowedChatIdsCount: ALLOWED_CHAT_IDS.length,
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
