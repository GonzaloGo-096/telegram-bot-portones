import { getChatIdFromMessage, getTelegramUserIdFromMessage, resolveUserFromPayload } from "./utils.js";
import { buildMenuPrincipalKeyboard, menuPrincipalText } from "./render.js";

/**
 * Handler de /start:
 * 1) Obtiene telegram_id desde el update.
 * 2) Consulta /api/usuarios/telegram/{telegram_id}.
 * 3) Renderiza módulos activos.
 */
export function registerStartHandler(bot, { backendClient, userSessions, log = () => {} } = {}) {
  bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
    const chatId = getChatIdFromMessage(msg);
    const telegramId = getTelegramUserIdFromMessage(msg);
    if (!chatId || !telegramId) return;

    try {
      const response = await backendClient.getUserByTelegramId(telegramId);
      if (!response.ok) {
        await bot.sendMessage(chatId, `⚠️ ${response.error || "No se pudo cargar tu perfil."}`);
        return;
      }

      const user = resolveUserFromPayload(response.data, telegramId);
      if (!user.id) {
        await bot.sendMessage(chatId, "⚠️ No se pudo identificar el usuario en el backend.");
        return;
      }

      userSessions.set(chatId, {
        telegramId: user.telegramId || telegramId,
        userId: user.id,
      });

      const keyboard = buildMenuPrincipalKeyboard(user.modules);
      if (!keyboard.inline_keyboard.length) {
        await bot.sendMessage(chatId, "No tenés módulos activos para operar.");
        return;
      }

      await bot.sendMessage(chatId, menuPrincipalText(), {
        reply_markup: keyboard,
      });
    } catch (error) {
      log("Start handler error", { telegramId: String(telegramId), error: error?.message || String(error) });
      await bot.sendMessage(chatId, "⚠️ Error inesperado. Intentá nuevamente.");
    }
  });
}
