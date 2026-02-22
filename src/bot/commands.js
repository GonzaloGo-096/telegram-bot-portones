import { getChatIdFromMessage, getTelegramUserIdFromMessage, parseAbrirCommand } from "./utils.js";

const HELP_TEXT = [
  "Comandos disponibles:",
  "/abrir {id_porton} - Abre un portón autorizado.",
  "",
  "Ejemplo:",
  "/abrir 25",
].join("\n");

function mapOpenGateResponseToMessage(result) {
  if (result?.ok) {
    return "✅ Portón abierto correctamente.";
  }
  if (result?.status === 403) {
    return "⛔ No tenés permiso para abrir este portón.";
  }
  if (result?.status === 429) {
    return "⏱️ Ya se envió una apertura hace instantes. Esperá unos segundos e intentá de nuevo.";
  }
  return `⚠️ ${result?.error || "No se pudo procesar la apertura."}`;
}

export function registerCommands(bot, { backendClient, authService, log = () => {} } = {}) {
  bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
    const chatId = getChatIdFromMessage(msg);
    if (!chatId) return;
    await bot.sendMessage(chatId, HELP_TEXT);
  });

  bot.onText(/^\/help(?:@\w+)?$/i, async (msg) => {
    const chatId = getChatIdFromMessage(msg);
    if (!chatId) return;
    await bot.sendMessage(chatId, HELP_TEXT);
  });

  bot.onText(/^\/abrir(?:@\w+)?(?:\s+.+)?$/i, async (msg) => {
    const chatId = getChatIdFromMessage(msg);
    const telegramUserId = getTelegramUserIdFromMessage(msg);
    if (!chatId || !telegramUserId) return;

    const parsed = parseAbrirCommand(msg.text);
    if (!parsed.ok) {
      await bot.sendMessage(chatId, "Formato inválido. Usá: /abrir {id_porton}. Ejemplo: /abrir 12");
      return;
    }

    const jwt = authService.getJwtForTelegramUser(telegramUserId);
    const authCheck = authService.validateJwtRole(jwt);
    if (!authCheck.ok) {
      await bot.sendMessage(
        chatId,
        "No tenés credenciales activas para operar por Telegram. Contactá al administrador."
      );
      return;
    }

    try {
      const result = await backendClient.openGate({
        gateId: parsed.gateId,
        jwt,
        telegramUserId,
      });
      const message = mapOpenGateResponseToMessage(result);
      await bot.sendMessage(chatId, message);

      log("Bot /abrir", {
        telegramUserId: String(telegramUserId),
        role: authCheck.role,
        accountId: authCheck.accountId,
        gateId: parsed.gateId,
        status: result.status || (result.ok ? 200 : 500),
      });
    } catch (error) {
      log("Bot /abrir error", {
        telegramUserId: String(telegramUserId),
        gateId: parsed.gateId,
        error: error?.message || String(error),
      });
      await bot.sendMessage(chatId, "⚠️ Error inesperado al abrir el portón. Intentá nuevamente.");
    }
  });
}
