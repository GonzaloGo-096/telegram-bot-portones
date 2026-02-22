import { registerCallbackHandler } from "./callbackHandler.js";
import { registerStartHandler } from "./startHandler.js";

/**
 * Registro centralizado de handlers de presentación.
 */
export function registerCommands(bot, { backendClient, log = () => {} } = {}) {
  const userSessions = new Map();

  registerStartHandler(bot, { backendClient, userSessions, log });
  registerCallbackHandler(bot, { backendClient, userSessions, log });

  bot.onText(/^\/help(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    if (!chatId) return;
    await bot.sendMessage(chatId, "Usá /start para abrir el menú principal.");
  });
}
