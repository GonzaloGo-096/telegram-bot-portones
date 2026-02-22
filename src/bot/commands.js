/**
 * Registro centralizado de comandos del bot.
 * El bot solo presenta mensajes y delega toda autorización al backend.
 */
export function registerCommands(bot, { backendClient, log = () => {} } = {}) {
  bot.on("callback_query", async (query) => {
    const data = query?.data || "";
    const chatId = query?.message?.chat?.id;
    try {
      if (data === "mod:portones") {
        await bot.answerCallbackQuery(query.id);
        if (chatId) {
          await bot.sendMessage(chatId, "Módulo Portones activo. Usá /abrir {id_porton}.");
        }
        return;
      }
      if (data === "mod:cultivos") {
        await bot.answerCallbackQuery(query.id);
        if (chatId) {
          await bot.sendMessage(chatId, "Módulo Cultivos activo. Próximamente acciones disponibles.");
        }
        return;
      }
      if (data.startsWith("mod:")) {
        await bot.answerCallbackQuery(query.id);
        if (chatId) {
          await bot.sendMessage(chatId, "Módulo disponible. Próximamente acciones específicas.");
        }
        return;
      }
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      log("Bot callback error", { data, error: error?.message || String(error) });
    }
  });

  bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    const telegramId = msg?.from?.id;
    if (!chatId) return;

    try {
      const menu = telegramId ? await backendClient.getBotMenu(telegramId) : null;
      const modules = Array.isArray(menu?.data?.modules) ? menu.data.modules : [];

      const buttons = modules.map((moduleItem) => {
        const key = String(moduleItem?.key || "").toLowerCase();
        const label = String(moduleItem?.label || key || "Modulo");
        const emoji = key === "portones" ? "🚪" : key === "cultivos" ? "🌱" : "📦";
        return [{ text: `${emoji} ${label}`, callback_data: `mod:${key}` }];
      });

      const text = [
        "Bienvenido a GGO Automatizaciones 👋",
        "Elige un módulo para continuar:",
        "",
        "Para abrir un portón también podés usar:",
        "/abrir {id_porton}",
      ].join("\n");

      await bot.sendMessage(chatId, text, {
        reply_markup: { inline_keyboard: buttons },
      });

      if (!menu?.ok) {
        log("Bot /start menu warning", {
          telegramId: String(telegramId || ""),
          status: menu?.status ?? 0,
          error: menu?.error || "Sin detalle",
          errorBody: menu?.data ?? null,
        });
      }

      if (menu?.ok && buttons.length === 0) {
        await bot.sendMessage(chatId, "No tenés módulos habilitados.");
      }
    } catch (error) {
      log("Bot /start error", {
        telegramId: String(telegramId || ""),
        error: error?.message || String(error),
      });
      await bot.sendMessage(
        chatId,
        "Bienvenido a GGO Automatizaciones 👋\nPara abrir un portón usá: /abrir {id_porton}"
      );
    }
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
