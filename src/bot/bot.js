/**
 * Configuración del bot de Telegram con node-telegram-bot-api.
 */

import TelegramBot from "node-telegram-bot-api";
import { registerCommands } from "./commands.js";

function hasValidBackendClient(client) {
  return (
    client &&
    typeof client.getMenu === "function" &&
    typeof client.getGateGroups === "function" &&
    typeof client.getGatesByGroup === "function" &&
    typeof client.getCultivos === "function" &&
    typeof client.openGate === "function" &&
    client.isConfigured !== false
  );
}

export function createBot({ botToken, backendClient, log = () => {} }) {
  if (!botToken) {
    log("BOT_TOKEN no definido. Bot desactivado.");
    return null;
  }

  const bot = new TelegramBot(botToken, { polling: false });

  if (!hasValidBackendClient(backendClient)) {
    log("Backend no configurado: bot inicializado sin handlers.");
    bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
      const chatId = msg?.chat?.id;
      if (!chatId) return;
      await bot.sendMessage(
        chatId,
        "Servicio no configurado. Definí BACKEND_BASE_URL y reiniciá el bot."
      );
    });
    return bot;
  }

  registerCommands(bot, { backendClient, log });
  log("Bot listo: flujo jerárquico /start + navegación inline registrado.");
  return bot;
}
