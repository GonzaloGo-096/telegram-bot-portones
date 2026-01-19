import { Telegraf, Markup } from "telegraf";

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN no está definido en las variables de entorno");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Comando /start con botones
bot.start((ctx) => {
  return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
    Markup.button.callback("Portón 1", "PORTON_1"),
    Markup.button.callback("Portón 2", "PORTON_2")
  ]));
});

// Manejo de callbacks de los botones
bot.action("PORTON_1", (ctx) => ctx.reply("Se presionó Portón 1."));
bot.action("PORTON_2", (ctx) => ctx.reply("Se presionó Portón 2."));

// Función serverless para Vercel
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // Manejar actualización de Telegram
      await bot.handleUpdate(req.body, res);
      return res.status(200).send("ok");
    } else {
      return res.status(200).send("Bot de portones funcionando.");
    }
  } catch (error) {
    console.error("Error en el bot:", error);
    return res.status(200).send("ok");
  }
}

