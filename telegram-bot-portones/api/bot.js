import { Telegraf, Markup } from "telegraf";

// Dominio fijo de Vercel para webhook
const WEBHOOK_DOMAIN = "https://telegram-bot-portones.vercel.app";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN no está definido en las variables de entorno");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Comando /start con botones
bot.start((ctx) => {
  console.log("Comando /start recibido");
  return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
    Markup.button.callback("Portón 1", "PORTON_1"),
    Markup.button.callback("Portón 2", "PORTON_2")
  ]));
});

// Manejo de callbacks de los botones
bot.action("PORTON_1", (ctx) => {
  console.log("Botón presionado: Portón 1");
  return ctx.reply("Se presionó Portón 1.");
});

bot.action("PORTON_2", (ctx) => {
  console.log("Botón presionado: Portón 2");
  return ctx.reply("Se presionó Portón 2.");
});

// Función serverless para Vercel
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // Log de depuración: cuerpo de la petición POST
      console.log("POST recibido desde Telegram:", JSON.stringify(req.body, null, 2));
      
      // Manejar actualización de Telegram
      await bot.handleUpdate(req.body, res);
      return res.status(200).send("ok");
    } else {
      // GET: devolver mensaje simple
      return res.status(200).send("Bot de portones funcionando.");
    }
  } catch (error) {
    console.error("Error en el bot:", error);
    return res.status(200).send("ok");
  }
}

