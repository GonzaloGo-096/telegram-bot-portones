/**
 * Bot modo pantalla única: edita el mismo mensaje en cada paso.
 * /start crea el mensaje raíz; callbacks editan ese mensaje con editMessageText.
 */

/** rootMessageId por chatId (memoria) */
const rootByChatId = new Map();

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
 * Edita o envía mensaje según contexto.
 * Si viene callback: edita message_id del callback.
 * Si viene /start: envía mensaje nuevo y guarda rootMessageId.
 * Fallback: si falla editar (message not found), envía nuevo y actualiza root.
 *
 * @param {{ bot, chatId, messageId?, text, replyMarkup, log? }}
 * @returns {Promise<number>} message_id del mensaje mostrado
 */
async function upsertScreen({ bot, chatId, messageId, text, replyMarkup, log = () => {} }) {
  const opts = replyMarkup ? { reply_markup: replyMarkup } : {};
  const key = String(chatId);

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        ...opts,
      });
      return messageId;
    } catch (err) {
      const notModified = err?.message?.includes("message is not modified");
      if (notModified) return messageId;
      const notFound =
        err?.message?.includes("message to edit not found") ||
        err?.response?.body?.description?.includes("message to edit");
      if (notFound) {
        log("upsertScreen edit falló (message not found), enviando nuevo mensaje", { chatId });
      }
      const sent = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...opts });
      rootByChatId.set(key, sent.message_id);
      return sent.message_id;
    }
  } else {
    const sent = await bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...opts });
    rootByChatId.set(key, sent.message_id);
    return sent.message_id;
  }
}

/**
 * Botón estándar de Inicio.
 */
function btnInicio() {
  return [{ text: "🏠 Inicio", callback_data: "NAV:HOME" }];
}

/**
 * Botón estándar Atrás.
 * @param {string} backData - callback_data para ir atrás (ej. "NAV:BACK:GROUPS")
 */
function btnAtras(backData) {
  return [{ text: "⬅️ Atrás", callback_data: backData }];
}

/**
 * Ensambla filas de botones con navegación opcional.
 */
function withNav(rows, showInicio = true, backData = null) {
  const out = [...rows];
  const navRow = [];
  if (backData) navRow.push(...btnAtras(backData));
  if (showInicio) navRow.push(...btnInicio());
  if (navRow.length > 0) out.push(navRow);
  return out;
}

/**
 * Render home (módulos).
 */
function renderHome(modules, userName = "Usuario") {
  const name = (userName || "Usuario").trim();
  const text = `Hola, ${name} 👋\nBienvenido a GGO Automatizaciones\nElegí un módulo:`;
  const buttons = (modules || []).map((m) => {
    const key = String(m?.key || "").toLowerCase();
    const label = String(m?.label || key || "Módulo");
    const emoji = key === "portones" ? "🚪" : key === "cultivos" ? "🌱" : "📦";
    return [{ text: `${emoji} ${label}`, callback_data: `mod:${key}` }];
  });
  return { text, replyMarkup: { inline_keyboard: buttons } };
}

/**
 * Render lista de grupos.
 */
function renderGroups(groups) {
  const text = "Elegí un grupo de portones:";
  const rows = (groups || []).map((g) => [
    { text: `🚪 ${g.name || "Grupo " + g.id}`, callback_data: `PORTONES:GROUP:${g.id}` },
  ]);
  return { text, replyMarkup: { inline_keyboard: withNav(rows, true, "NAV:HOME") } };
}

/**
 * Render lista de gates.
 */
function renderGates(groupName, gates, grupoId) {
  const text = `Portones en "${groupName || "Grupo"}":`;
  const rows = (gates || []).map((g) => [
    {
      text: `${g.name || "Portón " + g.id} (id: ${g.id})`,
      callback_data: `PORTONES:GATE:${g.id}:GROUP:${grupoId}`,
    },
  ]);
  return { text, replyMarkup: { inline_keyboard: withNav(rows, true, "NAV:BACK:GROUPS") } };
}

/**
 * Render detalle de un gate.
 * @param {string} gateId
 * @param {string} gateName
 * @param {string} [grupoId] - para el botón Atrás (volver a gates del grupo)
 */
function renderGateDetail(gateId, gateName = "Portón", grupoId = null) {
  const text =
    `🚪 ${gateName}\n\n` +
    `Para abrir este portón usá: \`/abrir ${gateId}\` (modo avanzado).\n\n` +
    `(Apertura automática próximamente)`;
  const backData = grupoId ? `NAV:BACK:GATES:${grupoId}` : "NAV:BACK:GROUPS";
  return { text, replyMarkup: { inline_keyboard: withNav([], true, backData) } };
}

/**
 * Render Cultivos coming soon.
 */
function renderCultivosComingSoon() {
  const text = "Módulo Cultivos activo. Próximamente acciones disponibles.";
  return { text, replyMarkup: { inline_keyboard: withNav([], true, "NAV:HOME") } };
}

/**
 * Registro centralizado de comandos del bot.
 */
export function registerCommands(bot, { backendClient, log = () => {} } = {}) {
  bot.on("callback_query", async (query) => {
    const data = query?.data || "";
    const chatId = query?.message?.chat?.id;
    const messageId = query?.message?.message_id;
    const telegramId = query?.from?.id;

    try {
      await bot.answerCallbackQuery(query.id);
    } catch (e) {
      log("answerCallbackQuery error", { queryId: query?.id });
    }

    if (!chatId) return;

    const ctx = { bot, chatId, messageId, telegramId };

    try {
      if (data === "NAV:HOME") {
        const menu = telegramId ? await backendClient.getBotMenu(telegramId) : null;
        if (!menu?.ok || menu?.data?.requiresAccountSelection) {
          const errText = !menu?.ok
            ? errorMessageForStatus(menu?.status ?? 0)
            : "Tenés más de una cuenta, seleccioná una (pendiente)";
          await upsertScreen({ ...ctx, messageId, text: errText, replyMarkup: null, log });
          return;
        }
        const modules = menu?.data?.modules ?? [];
        const userName = menu?.data?.user?.fullName ?? null;
        const { text, replyMarkup } = renderHome(modules, userName);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "NAV:BACK:GROUPS") {
        if (!telegramId) return;
        const result = await backendClient.getPortonGroups(telegramId);
        if (!result.ok) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: null,
            log,
          });
          return;
        }
        const groups = result.data?.groups ?? [];
        if (groups.length === 0) {
          const { text, replyMarkup } = renderHome([], null);
          await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
          return;
        }
        const { text, replyMarkup } = renderGroups(groups);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("NAV:BACK:GATES:")) {
        const grupoId = data.replace("NAV:BACK:GATES:", "").trim();
        if (!telegramId || !grupoId) return;
        const result = await backendClient.getGatesByGroup(telegramId, grupoId);
        if (!result.ok) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: null,
            log,
          });
          return;
        }
        const gates = result.data?.gates ?? [];
        const groupName = result.data?.group?.name || "Grupo";
        const { text, replyMarkup } = renderGates(groupName, gates, grupoId);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "mod:portones") {
        if (!telegramId) return;
        const result = await backendClient.getPortonGroups(telegramId);
        if (!result.ok) {
          log("Bot mod:portones getPortonGroups error", { status: result.status });
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: null,
            log,
          });
          return;
        }
        const groups = result.data?.groups ?? [];
        if (groups.length === 0) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: "No tenés grupos de portones asignados.",
            replyMarkup: { inline_keyboard: [btnInicio()] },
            log,
          });
          return;
        }
        const { text, replyMarkup } = renderGroups(groups);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("PORTONES:GROUP:")) {
        const grupoId = data.replace("PORTONES:GROUP:", "").trim();
        if (!telegramId || !grupoId) return;
        const result = await backendClient.getGatesByGroup(telegramId, grupoId);
        if (!result.ok) {
          log("Bot getGatesByGroup error", { grupoId, status: result.status });
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: { inline_keyboard: withNav([], true, "NAV:BACK:GROUPS") },
            log,
          });
          return;
        }
        const gates = result.data?.gates ?? [];
        const groupName = result.data?.group?.name || "Grupo";
        if (gates.length === 0) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: `El grupo "${groupName}" no tiene portones visibles para vos.`,
            replyMarkup: { inline_keyboard: withNav([], true, "NAV:BACK:GROUPS") },
            log,
          });
          return;
        }
        const { text, replyMarkup } = renderGates(groupName, gates, grupoId);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("PORTONES:GATE:")) {
        const match = data.match(/^PORTONES:GATE:(\d+):GROUP:(\d+)$/);
        const gateId = match?.[1];
        const grupoId = match?.[2];
        const gateName = "Portón " + (gateId || "");
        const { text, replyMarkup } = renderGateDetail(gateId, gateName, grupoId);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "mod:cultivos") {
        const { text, replyMarkup } = renderCultivosComingSoon();
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("mod:")) {
        const { text, replyMarkup } = renderHome([{ key: "otro", label: "Otro" }]);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
      }
    } catch (error) {
      log("Bot callback error", { data, error: error?.message || String(error) });
      await upsertScreen({
        ...ctx,
        messageId,
        text: "⚠️ Ocurrió un error. Reintentá más tarde.",
        replyMarkup: { inline_keyboard: [btnInicio()] },
        log,
      });
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
        });
        const errMsg =
          menu?.status === 404 ? "⚠️ No estás registrado. Contactá al administrador." : errorMessageForStatus(menu?.status ?? 0);
        await upsertScreen({ bot, chatId, messageId: null, text: errMsg, replyMarkup: null, log });
        return;
      }

      if (menu?.data?.requiresAccountSelection) {
        await upsertScreen({
          bot,
          chatId,
          messageId: null,
          text: "Tenés más de una cuenta, seleccioná una (pendiente)",
          replyMarkup: null,
          log,
        });
        return;
      }

      const modules = Array.isArray(menu?.data?.modules) ? menu.data.modules : [];
      const userName = menu?.data?.user?.fullName ?? null;
      const { text, replyMarkup } = renderHome(modules, userName);

      if (modules.length === 0) {
        await upsertScreen({
          bot,
          chatId,
          messageId: null,
          text: "No tenés módulos habilitados.",
          replyMarkup: null,
          log,
        });
        return;
      }

      await upsertScreen({ bot, chatId, messageId: null, text, replyMarkup, log });
    } catch (error) {
      log("Bot /start error", { telegramId: String(telegramId || ""), error: error?.message || String(error) });
      await upsertScreen({
        bot,
        chatId,
        messageId: null,
        text: "Bienvenido a GGO Automatizaciones 👋\nOcurrió un error. Usá /help para comandos.",
        replyMarkup: null,
        log,
      });
    }
  });

  bot.onText(/^\/help(?:@\w+)?$/i, async (msg) => {
    const chatId = msg?.chat?.id;
    if (!chatId) return;
    await bot.sendMessage(
      chatId,
      "Comandos disponibles:\n• /start - Menú principal\n• /abrir {id_porton} - Abrir portón por ID (modo avanzado)"
    );
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

    log("Bot /abrir fallido", { gateId, telegramId, status: result.status });
    await bot.sendMessage(chatId, "⚠️ No se pudo enviar el comando.");
  });
}
