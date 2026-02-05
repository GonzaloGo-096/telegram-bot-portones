/**
 * Módulo del bot de Telegram.
 * Configura Telegraf con comandos, botones inline y validación de chats autorizados.
 */

import { Telegraf, Markup } from "telegraf";
import { enviarEvento } from "./controladorClient.js";

/** Mapeo callback_data → portonId para el Controlador */
const PORTON_MAP = {
  PORTON_1: "porton1",
  PORTON_2: "porton2",
};

/** Mapeo callback_data → nombre para mensajes al usuario */
const PORTON_NOMBRE = {
  PORTON_1: "Portón 1",
  PORTON_2: "Portón 2",
};

/**
 * Parsea ALLOWED_CHAT_IDS (string separado por comas) en array de números.
 * @param {string} raw - ej. "123456789,-987654321" o "123456789, 456"
 * @returns {number[]}
 */
export function parseAllowedChatIds(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/**
 * Comprueba si el chat está autorizado.
 * Si allowedChatIds está vacío, se permite todo (backward compatibility).
 * @param {number} chatId
 * @param {number[]} allowedChatIds
 * @returns {boolean}
 */
export function isChatAllowed(chatId, allowedChatIds) {
  if (!Array.isArray(allowedChatIds) || allowedChatIds.length === 0) {
    return true;
  }
  return allowedChatIds.includes(Number(chatId));
}

/**
 * Crea y configura el bot de Telegraf.
 * @param {object} options
 * @param {string} options.botToken - BOT_TOKEN
 * @param {string} options.controladorBaseUrl - CONTROLADOR_BASE_URL
 * @param {string} options.controladorApiKey - CONTROLADOR_API_KEY
 * @param {number[]} options.allowedChatIds - Array de chat_ids permitidos
 * @param {function} options.log - Función de log (message, data)
 * @returns {Telegraf|null} Instancia del bot o null si no hay token
 */
export function createBot({ botToken, controladorBaseUrl, controladorApiKey, allowedChatIds, log }) {
  if (!botToken) {
    log("BOT_TOKEN no definido. Bot desactivado.");
    return null;
  }

  const bot = new Telegraf(botToken);

  bot.catch((err, ctx) => {
    log("Error en el bot:", { error: err.message, update: ctx.update });
  });

  bot.start((ctx) => {
    const chatId = ctx.chat?.id;
    log("Comando /start recibido", { user: ctx.from?.username ?? ctx.from?.id, chat: chatId });

    if (!isChatAllowed(chatId, allowedChatIds)) {
      return ctx.reply("No tienes permiso para usar este bot.");
    }

    return ctx.reply("Bot de portones activo.", Markup.inlineKeyboard([
      Markup.button.callback("Portón 1", "PORTON_1"),
      Markup.button.callback("Portón 2", "PORTON_2"),
    ]));
  });

  bot.action(/^PORTON_(1|2)$/, async (ctx) => {
    const callbackData = ctx.callbackQuery?.data;
    const chatId = ctx.chat?.id;
    const portonKey = callbackData; // PORTON_1 o PORTON_2
    const portonId = PORTON_MAP[portonKey];
    const nombrePorton = PORTON_NOMBRE[portonKey];
    const username = ctx.from?.username ?? ctx.from?.id ?? "desconocido";

    if (!isChatAllowed(chatId, allowedChatIds)) {
      await ctx.answerCbQuery("Acceso denegado");
      return ctx.reply("No tienes permiso para usar este bot.");
    }

    log(`[Telegram] Comando ${portonKey} recibido de chat ${chatId} (usuario: ${username})`);

    await ctx.answerCbQuery(`${nombrePorton} seleccionado`);

    const result = await enviarEvento({
      baseUrl: controladorBaseUrl,
      apiKey: controladorApiKey,
      portonId,
      event: "PRESS",
      log,
    });

    if (result.success) {
      log(`[ControladorClient] Evento PRESS enviado a ${portonId} con éxito`);
      return ctx.reply(`✅ Comando enviado al ${nombrePorton}.`);
    }

    log(`[ControladorClient] Error al enviar evento a ${portonId}: ${result.error}`);
    return ctx.reply(`⚠️ Error al enviar comando, intenta de nuevo.`);
  });

  return bot;
}
