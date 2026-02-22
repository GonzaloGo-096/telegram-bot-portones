/**
 * Snippet: comando /start con node-telegram-bot-api.
 * Backend devuelve { gates: [...] }; se muestran por gateName con botones inline.
 *
 * Placeholders: BACKEND_URL (ej. process.env.BACKEND_BASE_URL), chatId (msg.chat.id).
 * Uso: pegar en tu bot y reemplazar BACKEND_URL y asegurar que chatId sea el del mensaje.
 */

const TelegramBot = require("node-telegram-bot-api");

// Reemplazá por tu URL base del backend (ej. process.env.BACKEND_BASE_URL o process.env.CONTROLADOR_BASE_URL).
const BACKEND_URL = process.env.BACKEND_BASE_URL || process.env.CONTROLADOR_BASE_URL || "";

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ——— Handler del comando /start ———
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id ?? chatId;

  try {
    // 1. Validar que tengamos URL del backend para no hacer fetch inválido.
    if (!BACKEND_URL || !BACKEND_URL.startsWith("http")) {
      await bot.sendMessage(chatId, "El servicio no está configurado. Contactá al administrador.");
      return;
    }

    // 2. Llamar al endpoint que devuelve los gates del usuario.
    const url = `${BACKEND_URL.replace(/\/+$/, "")}/api/telegram/tenants?telegramId=${encodeURIComponent(telegramId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      await bot.sendMessage(chatId, "Error al leer la respuesta del servidor. Intentá más tarde.");
      return;
    }

    // 3. Procesar la respuesta { gates: [...] }.
    const gates = Array.isArray(data?.gates) ? data.gates : [];

    // 4. Si no hay gates, informar al usuario.
    if (gates.length === 0) {
      await bot.sendMessage(chatId, "No tenés acceso a ningún portón.");
      return;
    }

    // 5. Mostrar lista de gates por gateName y menú interactivo (un botón por gate).
    const gateListText = gates.map((g, i) => `${i + 1}. ${g.gateName || g.identifier || `Portón ${g.gateId}`}`).join("\n");
    const message =
      "Portones disponibles:\n\n" + gateListText + "\n\nElegí un portón:";

    // 6. Botones inline: un botón por gate (callback_data: gate:gateId para luego manejar con bot.on("callback_query")).
    const keyboard = gates.map((g) => [
      {
        text: g.gateName || g.identifier || `Portón ${g.gateId}`,
        callback_data: `gate:${g.gateId}`,
      },
    ]);

    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (err) {
    console.error("[start] Error:", err?.message || err);
    try {
      await bot.sendMessage(chatId, "Error inesperado. Intentá de nuevo en un momento.");
    } catch (_) {}
  }
});

// ——— Opcional: manejar el callback cuando el usuario toca un botón (gate:X) ———
bot.on("callback_query", async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  const telegramId = callbackQuery.from?.id;

  if (!data?.startsWith("gate:")) return;

  const gateId = data.replace(/^gate:/, "");
  await bot.answerCallbackQuery(callbackQuery.id, { text: "Enviando comando..." });

  try {
    const url = `${BACKEND_URL.replace(/\/+$/, "")}/api/telegram/command`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, gateId: Number(gateId) || gateId, action: "OPEN" }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await res.json();

    if (result.accepted) {
      await bot.sendMessage(chatId, "✅ Comando enviado correctamente.");
    } else {
      await bot.sendMessage(
        chatId,
        "⚠️ " + (result.reason === "FORBIDDEN" ? "No tenés permiso para este portón." : "No se pudo enviar el comando.")
      );
    }
  } catch (err) {
    console.error("[callback_query gate] Error:", err?.message || err);
    await bot.sendMessage(chatId, "Error inesperado. Intentá de nuevo.");
  }
});
