import {
  CALLBACKS,
  getChatIdFromCallback,
  getTelegramUserIdFromCallback,
  resolveUserFromPayload,
  safeArray,
} from "./utils.js";
import {
  buildCultivosKeyboard,
  buildGruposKeyboard,
  buildMenuPrincipalKeyboard,
  buildPortonesKeyboard,
  cultivosText,
  gruposText,
  menuPrincipalText,
  portonesText,
} from "./render.js";

function parseId(data, prefix) {
  if (!data?.startsWith(prefix)) return null;
  const id = data.slice(prefix.length);
  return id || null;
}

function mapOpenResultToMessage(response) {
  if (response?.ok) return "✅ Comando enviado";
  if (response?.status === 401) return "⚠️ Error interno de autenticación del bot.";
  if (response?.status === 403) return "⚠️ Sin permisos";
  if (response?.status === 404) return "⚠️ Usuario o portón no encontrado";
  if (response?.status === 429) return "⏱ Debounce (esperar antes de enviar de nuevo)";
  return `⚠️ ${response?.error || "No se pudo enviar el comando"}`;
}

async function editMessage(bot, query, text, keyboard) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!chatId || !messageId) return;
  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: keyboard,
  });
}

/**
 * Handler de callback queries.
 * Cada callback consulta su endpoint correspondiente y solo renderiza resultados.
 */
export function registerCallbackHandler(bot, { backendClient, userSessions, log = () => {} } = {}) {
  bot.on("callback_query", async (query) => {
    const data = query?.data || "";
    const chatId = getChatIdFromCallback(query);
    const telegramId = getTelegramUserIdFromCallback(query);
    if (!chatId || !telegramId) return;

    const session = userSessions.get(chatId);
    try {
      if (data === "noop:cultivo") {
        await bot.answerCallbackQuery(query.id, { text: "Acciones de cultivo disponibles próximamente." });
        return;
      }

      if (data === CALLBACKS.MODULE_PORTONES || data === CALLBACKS.BACK_TO_GROUPS) {
        await bot.answerCallbackQuery(query.id);
        const sessionTelegramId = session?.telegramId || telegramId;
        if (!sessionTelegramId) {
          await editMessage(bot, query, "Sesión expirada. Enviá /start nuevamente.", {
            inline_keyboard: [[{ text: "Reiniciar", callback_data: CALLBACKS.BACK_TO_MENU }]],
          });
          return;
        }

        // GET /api/telegram/grupos-portones?telegram_id=<id>
        const groupsRes = await backendClient.getGateGroups(sessionTelegramId);
        if (!groupsRes.ok) {
          await editMessage(bot, query, `⚠️ ${groupsRes.error || "No se pudieron cargar grupos."}`, {
            inline_keyboard: [[{ text: "🔙 Volver", callback_data: CALLBACKS.BACK_TO_MENU }]],
          });
          return;
        }

        const groups = safeArray(groupsRes.data, ["portonGroups", "grupos", "groups"]);
        await editMessage(bot, query, gruposText(), buildGruposKeyboard(groups));
        return;
      }

      if (data === CALLBACKS.MODULE_CULTIVOS) {
        await bot.answerCallbackQuery(query.id);
        const sessionTelegramId = session?.telegramId || telegramId;
        if (!sessionTelegramId) {
          await editMessage(bot, query, "Sesión expirada. Enviá /start nuevamente.", {
            inline_keyboard: [[{ text: "Reiniciar", callback_data: CALLBACKS.BACK_TO_MENU }]],
          });
          return;
        }

        // GET /api/telegram/cultivos?telegram_id=<id>
        const cropsRes = await backendClient.getCultivos(sessionTelegramId);
        if (!cropsRes.ok) {
          await editMessage(bot, query, `⚠️ ${cropsRes.error || "No se pudieron cargar cultivos."}`, {
            inline_keyboard: [[{ text: "🔙 Volver", callback_data: CALLBACKS.BACK_TO_MENU }]],
          });
          return;
        }

        const cultivos = safeArray(cropsRes.data, ["cultivos", "items", "data"]);
        await editMessage(bot, query, cultivosText(), buildCultivosKeyboard(cultivos));
        return;
      }

      if (data === CALLBACKS.BACK_TO_MENU) {
        await bot.answerCallbackQuery(query.id);
        // GET /api/telegram/menu?telegram_id=<id>
        const userRes = await backendClient.getMenu(telegramId);
        if (!userRes.ok) {
          await editMessage(bot, query, `⚠️ ${userRes.error || "No se pudo recargar el menú."}`, {
            inline_keyboard: [],
          });
          return;
        }

        const user = resolveUserFromPayload(userRes.data, telegramId);
        userSessions.set(chatId, { telegramId: user.telegramId || telegramId });
        await editMessage(bot, query, menuPrincipalText(), buildMenuPrincipalKeyboard(user.modules));
        return;
      }

      const groupId = parseId(data, CALLBACKS.GROUP_PREFIX);
      if (groupId) {
        await bot.answerCallbackQuery(query.id);
        const sessionTelegramId = session?.telegramId || telegramId;
        // GET /api/telegram/portones?grupo_id=<id>&telegram_id=<id>
        const gatesRes = await backendClient.getGatesByGroup(groupId, sessionTelegramId);
        if (!gatesRes.ok) {
          await editMessage(bot, query, `⚠️ ${gatesRes.error || "No se pudieron cargar portones."}`, {
            inline_keyboard: [[{ text: "🔙 Volver", callback_data: CALLBACKS.BACK_TO_GROUPS }]],
          });
          return;
        }

        const gates = safeArray(gatesRes.data, ["gates", "portones", "items", "data"]);
        await editMessage(bot, query, portonesText(), buildPortonesKeyboard(gates));
        return;
      }

      const gateId = parseId(data, CALLBACKS.GATE_PREFIX);
      if (gateId) {
        await bot.answerCallbackQuery(query.id, { text: "Enviando comando..." });
        // POST /api/telegram/bot/portones/:id/abrir
        const openRes = await backendClient.openGate(gateId, telegramId);
        await bot.sendMessage(chatId, mapOpenResultToMessage(openRes));
        return;
      }

      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      log("Callback handler error", { data, chatId, error: error?.message || String(error) });
      try {
        await bot.answerCallbackQuery(query.id, { text: "Error inesperado." });
      } catch {}
    }
  });
}
