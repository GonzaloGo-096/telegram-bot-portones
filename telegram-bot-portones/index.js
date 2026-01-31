import express from "express";
import { Telegraf, Markup } from "telegraf";

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_DOMAIN;
const WEBHOOK_PATH = "/bot";
const WEBHOOK_URL = PUBLIC_DOMAIN ? `https://${PUBLIC_DOMAIN}${WEBHOOK_PATH}` : null;

const log = (message, data = null) => {
  const ts = new Date().toISOString();
  if (data != null) console.log(`[${ts}] ${message}`, data);
  else console.log(`[${ts}] ${message}`);
};

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

app.post(WEBHOOK_PATH, (req, res) => {
  res.status(200).end();
  if (!bot) {
    log("POST /bot recibido pero bot no inicializado (falta BOT_TOKEN).");
    return;
  }
  if (!req.body) {
    log("POST /bot sin body, ignorado.");
    return;
  }
  log("Update recibido de Telegram", { update_id: req.body.update_id });
  bot.handleUpdate(req.body).catch((err) => {
    log("Error al procesar update:", { error: err.message });
  });
});

app.listen(PORT, async () => {
  log(`Servidor escuchando en puerto ${PORT}`);

  if (!bot) return;
  if (!WEBHOOK_URL) {
    log("RAILWAY_PUBLIC_DOMAIN (o PUBLIC_DOMAIN) no definido. No se configuró webhook.");
    return;
  }
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    const info = await bot.telegram.getWebhookInfo();
    log("Webhook configurado correctamente", { url: info.url, pending: info.pending_update_count });
  } catch (err) {
    log("Error al configurar webhook:", { error: err.message });
  }
});
