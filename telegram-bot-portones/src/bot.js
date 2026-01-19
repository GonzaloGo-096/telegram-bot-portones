import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';

// Función helper para logs con timestamp
const log = (message, data = null) => {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [LOCAL] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [LOCAL] ${message}`);
  }
};

// Validar BOT_TOKEN
if (!process.env.BOT_TOKEN) {
  log("ERROR: BOT_TOKEN no está definido en el archivo .env");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Manejo de errores del bot
bot.catch((err, ctx) => {
  log("Error en el bot:", { error: err.message, update: ctx.update });
});

// Comando /start con botones
bot.start((ctx) => {
  log("Comando /start recibido", { 
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
  log("Botón presionado: Portón 1", { 
    user: ctx.from.username || ctx.from.id 
  });
  await ctx.answerCbQuery("Portón 1 seleccionado");
  return ctx.reply("Se presionó Portón 1.");
});

bot.action("PORTON_2", async (ctx) => {
  log("Botón presionado: Portón 2", { 
    user: ctx.from.username || ctx.from.id 
  });
  await ctx.answerCbQuery("Portón 2 seleccionado");
  return ctx.reply("Se presionó Portón 2.");
});

// Iniciar bot con polling para desarrollo local
log("Iniciando bot local con polling...");
log("BOT_TOKEN encontrado:", process.env.BOT_TOKEN.substring(0, 10) + "...");

bot.launch({
  polling: {
    timeout: 10,
    limit: 100,
    allowedUpdates: ['message', 'callback_query']
  }
})
  .then(() => {
    log("✅ Bot local arrancado correctamente con polling");
    log("Presiona Ctrl+C para detener el bot");
  })
  .catch((error) => {
    log("❌ Error al iniciar el bot:", { error: error.message });
    process.exit(1);
  });

// Cierre limpio del proceso
process.once('SIGINT', () => {
  log("Deteniendo bot...");
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  log("Deteniendo bot...");
  bot.stop('SIGTERM');
  process.exit(0);
});
