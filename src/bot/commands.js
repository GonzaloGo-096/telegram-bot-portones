/**
 * Mensaje de error según status HTTP.
 */
function errorMessageForStatus(status) {
  switch (status) {
    case 401:
      return "⚠️ Error de autenticación interna del bot";
    case 404:
      return "⚠️ No encontrado. Verificá que estés registrado.";
    case 503:
      return "⚠️ Servicio temporalmente no disponible";
    default:
      return status >= 500 ? "⚠️ Error temporal del servidor" : "⚠️ No se pudo completar. Reintentá más tarde.";
  }
}

/**
 * Registro centralizado de comandos del bot.
 * El bot solo presenta mensajes y delega toda autorización al backend.
 */
export function registerCommands(bot, { backendClient, log = () => {} } = {}) {
  bot.on("callback_query", async (query) => {
    const data = query?.data || "";
    const chatId = query?.message?.chat?.id;
    const telegramId = query?.from?.id;

    try {
      await bot.answerCallbackQuery(query.id);

      if (data === "mod:portones") {
        if (!chatId || !telegramId) return;
        const result = await backendClient.getPortonGroups(telegramId);
        if (!result.ok) {
          log("Bot mod:portones getPortonGroups error", { status: result.status, error: result.error });
          await bot.sendMessage(chatId, errorMessageForStatus(result.status ?? 0));
          return;
        }
        const groups = result.data?.groups ?? [];
        if (groups.length === 0) {
          await bot.sendMessage(chatId, "No tenés grupos de portones asignados.");
          return;
        }
        const buttons = groups.map((g) => [
          { text: `🚪 ${g.name || "Grupo " + g.id}`, callback_data: `PORTONES:GROUP:${g.id}` },
        ]);
        await bot.sendMessage(chatId, "Elegí un grupo de portones:", {
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      if (data.startsWith("PORTONES:GROUP:")) {
        const grupoId = data.replace("PORTONES:GROUP:", "").trim();
        if (!chatId || !telegramId || !grupoId) return;
        const result = await backendClient.getGatesByGroup(telegramId, grupoId);
        if (!result.ok) {
          log("Bot getGatesByGroup error", { grupoId, status: result.status });
          await bot.sendMessage(chatId, errorMessageForStatus(result.status ?? 0));
          return;
        }
        const gates = result.data?.gates ?? [];
        const groupName = result.data?.group?.name || "Grupo";
        if (gates.length === 0) {
          await bot.sendMessage(chatId, `El grupo "${groupName}" no tiene portones visibles para vos.`);
          return;
        }
        const buttons = gates.map((g) => [
          {
            text: `${g.name || "Portón " + g.id} (id: ${g.id})`,
            callback_data: `PORTONES:GATE:${g.id}:GROUP:${grupoId}`,
          },
        ]);
        await bot.sendMessage(chatId, `Portones en "${groupName}":`, {
          reply_markup: { inline_keyboard: buttons },
        });
        return;
      }

      if (data.startsWith("PORTONES:GATE:")) {
        const match = data.match(/^PORTONES:GATE:(\d+):GROUP:(\d+)$/);
        const gateId = match?.[1];
        const grupoId = match?.[2];
        if (!chatId || !gateId) return;
        const gateName = "Portón " + gateId;
        await bot.sendMessage(
          chatId,
          `🚪 ${gateName}\n\nPara abrir este portón usá:\n\`/abrir ${gateId}\`\n\n(Apertura automática próximamente)`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (data === "mod:cultivos") {
        if (chatId) {
          await bot.sendMessage(chatId, "Módulo Cultivos activo. Próximamente acciones disponibles.");
        }
        return;
      }

      if (data.startsWith("mod:")) {
        if (chatId) {
          await bot.sendMessage(chatId, "Módulo disponible. Próximamente acciones específicas.");
        }
        return;
      }
    } catch (error) {
      log("Bot callback error", { data, error: error?.message || String(error) });
      if (chatId) {
        await bot.sendMessage(chatId, "⚠️ Ocurrió un error. Reintentá más tarde.");
      }
    }
  });

  bot.onText(/^\/start(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    const telegramId = msg?.from?.id;
    if (!chatId) return;

    try {
      const menu = telegramId ? await backendClient.getBotMenu(telegramId) : null;

      if (!menu?.ok) {
        log("Bot /start menu warning", {
          telegramId: String(telegramId || ""),
          status: menu?.status ?? 0,
          error: menu?.error || "Sin detalle",
          errorBody: menu?.data ?? null,
        });
        const errMsg =
          menu?.status === 404 ? "⚠️ No estás registrado. Contactá al administrador." : errorMessageForStatus(menu?.status ?? 0);
        await bot.sendMessage(chatId, errMsg);
        return;
      }

      if (menu?.data?.requiresAccountSelection) {
        await bot.sendMessage(
          chatId,
          "Tenés más de una cuenta, seleccioná una (pendiente)"
        );
        return;
      }

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

      if (buttons.length === 0) {
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
