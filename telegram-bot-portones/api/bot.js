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
