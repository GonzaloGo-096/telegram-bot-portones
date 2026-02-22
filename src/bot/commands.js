/**
 * Registro centralizado de comandos del bot.
 * El bot solo presenta mensajes y delega toda autorización al backend.
 */
export function registerCommands(bot, { backendClient, log = () => {} } = {}) {
  bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    if (!chatId) return;
    await bot.sendMessage(
      chatId,
      [
        "Bienvenido a GGO Automatizaciones 👋",
        "",
        "Para abrir un portón usá:",
        "/abrir {id_porton}",
        "",
        "Ejemplo: /abrir 3",
      ].join("\n")
    );
  });

  bot.onText(/^\/help(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    if (!chatId) return;
    await bot.sendMessage(chatId, "Comando disponible: /abrir {id_porton}");
  });

  bot.onText(/^\/abrir(?:@\w+)?\s+(\d+)$/i, async (msg, match) => {
    const chatId = msg?.chat?.id;
    const telegramId = msg?.from?.id;
    const gateId = match?.[1];
    if (!chatId || !telegramId || !gateId) return;

    const result = await backendClient.openGate(gateId, telegramId);
    if (result.ok) {
      await bot.sendMessage(chatId, "✅ Comando enviado");
      return;
    }

    if (result.status === 401) {
      await bot.sendMessage(chatId, "⚠️ Error de autenticación interna del bot");
      return;
    }
    if (result.status === 403) {
      await bot.sendMessage(chatId, "⚠️ No tenés permiso para ese portón");
      return;
    }
    if (result.status === 404) {
      await bot.sendMessage(chatId, "⚠️ No se encontró usuario/portón");
      return;
    }
    if (result.status === 429) {
      await bot.sendMessage(chatId, "⏱ Comando repetido, esperá 2 segundos");
      return;
    }
    if (result.status >= 500) {
      await bot.sendMessage(chatId, "⚠️ Error temporal del servidor");
      return;
    }

    log("Bot /abrir fallido", {
      gateId: String(gateId),
      telegramId: String(telegramId),
      status: result.status,
      error: result.error,
      errorBody: result.data ?? null,
    });
    await bot.sendMessage(chatId, "⚠️ No se pudo enviar el comando.");
  });
}
