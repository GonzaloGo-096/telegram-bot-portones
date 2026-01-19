import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN no está definido");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Comando /start con botones
bot.start((ctx) => {
  console.log("Comando /start recibido (local)");
  return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
    Markup.button.callback("Portón 1", "PORTON_1"),
    Markup.button.callback("Portón 2", "PORTON_2")
  ]));
});

// Callbacks botones
bot.action("PORTON_1", (ctx) => {
  console.log("Botón presionado: Portón 1 (local)");
  return ctx.reply("Se presionó Portón 1.");
});
bot.action("PORTON_2", (ctx) => {
  console.log("Botón presionado: Portón 2 (local)");
  return ctx.reply("Se presionó Portón 2.");
});

// Iniciar polling local
bot.launch()
  .then(() => console.log("Bot local arrancado con polling"))
  .catch(console.error);