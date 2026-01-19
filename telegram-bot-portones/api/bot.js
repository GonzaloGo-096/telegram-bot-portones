import { Telegraf, Markup } from "telegraf";

// Dominio fijo de Vercel para webhook
const WEBHOOK_DOMAIN = "https://telegram-bot-portones.vercel.app";
const WEBHOOK_URL = `${WEBHOOK_DOMAIN}/api/bot`;

// Función helper para logs con timestamp
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
};

// Validar BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN no está definido en las variables de entorno de Vercel");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Manejo de errores del bot
bot.catch((err, ctx) => {
  log("Error en el bot:", { error: err.message, update: ctx.update });
});

// Comando /start con botones
bot.start((ctx) => {
  log("Comando /start recibido (serverless)", { 
    user: ctx.from.username || ctx.from.id,
    chat: ctx.chat.id 
  });
  return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
    Markup.button.callback("Portón 1", "PORTON_1"),
    Markup.button.callback("Portón 2", "PORTON_2")
  ]));
});

// Manejo de callbacks de los botones
bot.action("PORTON_1", async (ctx) => {
  log("Botón presionado: Portón 1 (serverless)", { 
    user: ctx.from.username || ctx.from.id 
  });
  await ctx.answerCbQuery("Portón 1 seleccionado");
  return ctx.reply("Se presionó Portón 1.");
});

bot.action("PORTON_2", async (ctx) => {
  log("Botón presionado: Portón 2 (serverless)", { 
    user: ctx.from.username || ctx.from.id 
  });
  await ctx.answerCbQuery("Portón 2 seleccionado");
  return ctx.reply("Se presionó Portón 2.");
});

// Función serverless para Vercel
export default async function handler(req, res) {
  try {
    // Endpoint para configurar webhook (GET /api/bot?set-webhook=true)
    if (req.method === "GET" && req.query["set-webhook"] === "true") {
      try {
        await bot.telegram.setWebhook(WEBHOOK_URL);
        const webhookInfo = await bot.telegram.getWebhookInfo();
        log("Webhook configurado exitosamente", { 
          url: webhookInfo.url,
          pending_updates: webhookInfo.pending_update_count 
        });
        return res.status(200).json({
          success: true,
          message: "Webhook configurado",
          url: WEBHOOK_URL,
          webhookInfo
        });
      } catch (error) {
        log("Error al configurar webhook:", { error: error.message });
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    // Endpoint para verificar webhook (GET /api/bot?get-webhook=true)
    if (req.method === "GET" && req.query["get-webhook"] === "true") {
      try {
        const webhookInfo = await bot.telegram.getWebhookInfo();
        log("Información del webhook consultada", webhookInfo);
        return res.status(200).json({
          success: true,
          webhookInfo
        });
      } catch (error) {
        log("Error al obtener información del webhook:", { error: error.message });
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    // Manejar actualizaciones de Telegram (POST)
    if (req.method === "POST") {
      log("POST recibido desde Telegram", req.body);
      
      // Manejar actualización de Telegram (sin pasar res como parámetro)
      await bot.handleUpdate(req.body);
      
      // Responder 200 OK a Telegram inmediatamente
      return res.status(200).end();
    }

    // GET simple: verificar que el bot funciona
    return res.status(200).send("Bot de portones funcionando.");
    
  } catch (error) {
    log("Error en handler serverless:", { 
      error: error.message,
      stack: error.stack 
    });
    // Siempre responder 200 para que Telegram no marque como fallido
    return res.status(200).end();
  }
}
