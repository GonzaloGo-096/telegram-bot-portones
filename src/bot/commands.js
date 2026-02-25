/**
 * Bot modo pantalla única: edita el mismo mensaje en cada paso.
 * /start crea el mensaje raíz; callbacks editan ese mensaje con editMessageText.
 * Sistema visual: breadcrumbs, separador, 1 botón por fila, íconos por nivel.
 */

/** rootMessageId por chatId (memoria) */
const rootByChatId = new Map();

/** Separador visual consistente */
const SEP = "━━━━━━━━━━━━━━";

/**
 * Mensaje de error según status HTTP.
 */
function errorMessageForStatus(status) {
  switch (status) {
    case 401:
      return "⚠️ Error de autenticación interna del bot";
    case 403:
      return "⚠️ No tenés permiso para este módulo.";
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
 * Una fila con el botón Inicio (1 botón por fila).
 */
function btnInicio() {
  return [{ text: "🏠 Inicio", callback_data: "NAV:HOME" }];
}

/**
 * Una fila con el botón Atrás (1 botón por fila).
 */
function btnAtras(backData) {
  return [{ text: "⬅️ Atrás", callback_data: backData }];
}

/**
 * Ensambla filas con navegación. Un botón por fila.
 * @param {Array<Array>} rows - cada fila es [botón]
 * @param {boolean} showInicio
 * @param {string|null} backData - ej. "NAV:BACK:GROUPS"
 */
function withNav(rows, showInicio = true, backData = null) {
  const out = [...rows];
  if (backData) out.push(btnAtras(backData));
  if (showInicio) out.push(btnInicio());
  return out;
}

/**
 * Render home (módulos).
 * @param {Array} modules - [{ key, label }]
 * @param {string} [userName]
 * @param {string} [accountName]
 */
function renderHome(modules, userName = "Usuario", accountName = "") {
  const name = (userName || "Usuario").trim();
  const account = (accountName || "—").trim();
  const text =
    `👋 *Hola, ${name}*\n\n` +
    `Bienvenido a *GGO Automatizaciones*\n\n` +
    `${SEP}\n` +
    `🏢 *Cuenta activa:*\n${account}\n\n` +
    `Seleccioná un módulo:`;

  const rows = (modules || [])
    .filter((m) => m?.key && m?.enabled !== false)
    .map((m) => {
      const key = String(m.key).toLowerCase();
      const label = String(m.label || key).trim();
      const emoji = key === "portones" ? "🚪" : key === "cultivos" ? "🌱" : "📦";
      return [{ text: `${emoji} ${label}`, callback_data: `mod:${key}` }];
    });
  rows.push([{ text: "ℹ️ Ayuda", callback_data: "mod:ayuda" }]);
  return { text, replyMarkup: { inline_keyboard: rows } };
}

/**
 * Render lista de grupos.
 * Breadcrumb: 🏠 Inicio › 🚪 Portones
 */
function renderGroups(groups) {
  const header = "🏠 Inicio › 🚪 Portones\n\n" + SEP + "\n\nSeleccioná un grupo:";
  const rows = (groups || []).map((g) => [
    { text: `🗂 ${g.name || "Grupo " + g.id}`, callback_data: `PORTONES:GROUP:${g.id}` },
  ]);
  return { text: header, replyMarkup: { inline_keyboard: withNav(rows, true, "NAV:HOME") } };
}

/**
 * Render lista de gates.
 * Breadcrumb: 🏠 Inicio › 🚪 Portones › 🗂 {groupName}
 */
function renderGates(groupName, gates, grupoId) {
  const groupLabel = groupName || "Grupo";
  const header = `🏠 Inicio › 🚪 Portones › 🗂 ${groupLabel}\n\n${SEP}\n\nSeleccioná un portón:`;
  const rows = (gates || []).map((g) => [
    {
      text: `🔐 ${g.name || "Portón " + g.id}`,
      callback_data: `PORTONES:GATE:${g.id}:GROUP:${grupoId}`,
    },
  ]);
  return { text: header, replyMarkup: { inline_keyboard: withNav(rows, true, "NAV:BACK:GROUPS") } };
}

/**
 * Render detalle de un gate.
 * Breadcrumb: 🏠 Inicio › 🚪 Portones › 🗂 {groupName}
 * @param {string} gateId
 * @param {string} gateName
 * @param {string} [groupName] - para breadcrumb
 * @param {string} [grupoId] - para botón Atrás
 */
function renderGateDetail(gateId, gateName = "Portón", groupName = "", grupoId = null) {
  const groupLabel = groupName || "Grupo";
  const header = `🏠 Inicio › 🚪 Portones › 🗂 ${groupLabel}\n\n${SEP}\n\n`;
  const body = `🔐 *${gateName}*\n\nTocá el botón para abrir:`;
  const text = header + body;
  const backData = grupoId ? `NAV:BACK:GATES:${grupoId}` : "NAV:BACK:GROUPS";
  const rows = [[{ text: "🔓 Abrir", callback_data: `GATE:OPEN:${gateId}:GROUP:${grupoId || ""}` }]];
  return { text, replyMarkup: { inline_keyboard: withNav(rows, true, backData) } };
}

/**
 * Render lista de cultivos.
 * Breadcrumb: 🏠 Inicio › 🌱 Cultivos
 */
function renderCultivos(cultivos) {
  const header = "🏠 Inicio › 🌱 Cultivos\n\n" + SEP + "\n\nSeleccioná un cultivo:";
  const rows = (cultivos || []).map((c) => [
    { text: `🌱 ${c.nombre || "Cultivo " + c.id}`, callback_data: `cultivo_${c.id}` },
  ]);
  return { text: header, replyMarkup: { inline_keyboard: withNav(rows, true, "NAV:HOME") } };
}

/**
 * Agrupa un array en chunks de tamaño n.
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) {
    out.push(arr.slice(i, i + n));
  }
  return out;
}

/**
 * Render lista de macetas. Máximo 2 botones por fila.
 * Breadcrumb: 🏠 Inicio › 🌱 Cultivos › {cultivoName}
 */
function renderMacetas(cultivoName, macetas, cultivoId) {
  const label = cultivoName || "Cultivo";
  const header = `🏠 Inicio › 🌱 Cultivos › ${label}\n\n` + SEP + "\n\nSeleccioná una maceta:";
  const buttons = (macetas || []).map((m) => ({
    text: m.nombre || "Maceta",
    callback_data: `maceta_${m.id}`,
  }));
  const rows = chunk(buttons, 2);
  const backData = "NAV:BACK:CULTIVOS";
  return { text: header, replyMarkup: { inline_keyboard: withNav(rows, true, backData) } };
}

/**
 * Render Ayuda.
 */
function renderAyuda() {
  const text =
    `ℹ️ *Ayuda*\n\n` +
    `• Usá los botones para navegar.\n` +
    `• Si no ves tus portones, consultá al administrador.`;
  return { text, replyMarkup: { inline_keyboard: [btnInicio()] } };
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

    if (!chatId) return;

    if (query.data?.startsWith("GATE:OPEN:")) {
      const match = query.data.match(/^GATE:OPEN:(\d+):GROUP:(\d*)$/);
      const gateId = match?.[1];
      const grupoId = match?.[2] || "";
      if (gateId && telegramId) {
        const result = await backendClient.openGate(gateId, telegramId);
        try {
          if (result.ok) {
            await bot.answerCallbackQuery(query.id, { text: "✅ Comando enviado" });
          } else if (result.status === 401) {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ Error de autenticación", show_alert: true });
          } else if (result.status === 403) {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ Sin permiso", show_alert: true });
          } else if (result.status === 404) {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ No encontrado", show_alert: true });
          } else if (result.status === 429) {
            await bot.answerCallbackQuery(query.id, { text: "⏱ Esperá 2 segundos" });
          } else {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ Error", show_alert: true });
          }
        } catch (e) {
          log("answerCallbackQuery error", { queryId: query?.id });
        }
      }
      return;
    }

    try {
      await bot.answerCallbackQuery(query.id);
    } catch (e) {
      log("answerCallbackQuery error", { queryId: query?.id });
    }

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
        const accountName = menu?.data?.user?.accountName ?? "";
        const { text, replyMarkup } = renderHome(modules, userName, accountName);
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
          const menu = await backendClient.getBotMenu(telegramId);
          const modules = menu?.data?.modules ?? [];
          const userName = menu?.data?.user?.fullName ?? null;
          const accountName = menu?.data?.user?.accountName ?? "";
          const { text, replyMarkup } = renderHome(modules, userName, accountName);
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
          const menu = await backendClient.getBotMenu(telegramId);
          const modules = menu?.data?.modules ?? [];
          const userName = menu?.data?.user?.fullName ?? null;
          const accountName = menu?.data?.user?.accountName ?? "";
          const { text, replyMarkup } = renderHome(modules, userName, accountName);
          await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
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
        let gateName = "Portón " + (gateId || "");
        let groupName = "Grupo";
        if (grupoId && telegramId) {
          const res = await backendClient.getGatesByGroup(telegramId, grupoId);
          if (res?.ok) {
            groupName = res.data?.group?.name || groupName;
            const g = (res.data?.gates ?? []).find((x) => String(x.id) === String(gateId));
            if (g?.name) gateName = g.name;
          }
        }
        const { text, replyMarkup } = renderGateDetail(gateId, gateName, groupName, grupoId);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "mod:ayuda") {
        const { text, replyMarkup } = renderAyuda();
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "NAV:BACK:CULTIVOS") {
        if (!telegramId) return;
        const result = await backendClient.getCultivos(telegramId);
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
        const cultivos = result.data?.cultivos ?? [];
        if (cultivos.length === 0) {
          const menu = await backendClient.getBotMenu(telegramId);
          const modules = menu?.data?.modules ?? [];
          const userName = menu?.data?.user?.fullName ?? null;
          const accountName = menu?.data?.user?.accountName ?? "";
          const { text, replyMarkup } = renderHome(modules, userName, accountName);
          await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
          return;
        }
        const { text, replyMarkup } = renderCultivos(cultivos);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data === "mod:cultivos") {
        if (!telegramId) return;
        const result = await backendClient.getCultivos(telegramId);
        if (!result.ok) {
          log("Bot mod:cultivos getCultivos error", { status: result.status });
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: null,
            log,
          });
          return;
        }
        const cultivos = result.data?.cultivos ?? [];
        if (cultivos.length === 0) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: "No hay cultivos configurados.",
            replyMarkup: { inline_keyboard: withNav([], true, "NAV:HOME") },
            log,
          });
          return;
        }
        const { text, replyMarkup } = renderCultivos(cultivos);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("cultivo_")) {
        const cultivoId = data.replace("cultivo_", "").trim();
        if (!telegramId || !cultivoId) return;
        const result = await backendClient.getMacetasByCultivo(telegramId, cultivoId);
        if (!result.ok) {
          log("Bot getMacetasByCultivo error", { cultivoId, status: result.status });
          await upsertScreen({
            ...ctx,
            messageId,
            text: errorMessageForStatus(result.status ?? 0),
            replyMarkup: { inline_keyboard: withNav([], true, "NAV:BACK:CULTIVOS") },
            log,
          });
          return;
        }
        const macetas = result.data?.macetas ?? [];
        const cultivo = result.data?.cultivo ?? null;
        const cultivoName = cultivo?.nombre || "Cultivo";
        if (macetas.length === 0) {
          await upsertScreen({
            ...ctx,
            messageId,
            text: "Este cultivo no tiene macetas configuradas.",
            replyMarkup: { inline_keyboard: withNav([], true, "NAV:BACK:CULTIVOS") },
            log,
          });
          return;
        }
        const { text, replyMarkup } = renderMacetas(cultivoName, macetas, cultivoId);
        await upsertScreen({ ...ctx, messageId, text, replyMarkup, log });
        return;
      }

      if (data.startsWith("mod:")) {
        const menu = telegramId ? await backendClient.getBotMenu(telegramId) : null;
        const modules = menu?.data?.modules ?? [];
        const userName = menu?.data?.user?.fullName ?? null;
        const accountName = menu?.data?.user?.accountName ?? "";
        const { text, replyMarkup } = renderHome(modules, userName, accountName);
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
      const accountName = menu?.data?.user?.accountName ?? "";
      const { text, replyMarkup } = renderHome(modules, userName, accountName);

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
    const rootId = rootByChatId.get(String(chatId));
    const { text, replyMarkup } = renderAyuda();
    const msgId = await upsertScreen({
      bot,
      chatId,
      messageId: rootId || null,
      text,
      replyMarkup,
      log,
    });
    if (!rootId) rootByChatId.set(String(chatId), msgId);
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
