/**
 * POST /api/telegram/notify: el backend envía la lista de mensajes a entregar.
 * El bot no decide destinatarios ni contenido; solo envía lo que recibe.
 */

import { notifyValidation } from "../bot/messages.js";

/**
 * Valida el body: { deliveries: [ { telegramUserId, message } ] }
 * @param {object} body
 * @returns {{ valid: boolean, deliveries?: Array<{ telegramUserId: string|number, message: string }>, error?: string }}
 */
function validateNotifyBody(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: notifyValidation.bodyNotObject };
  }
  const deliveries = body.deliveries;
  if (!Array.isArray(deliveries)) {
    return { valid: false, error: notifyValidation.deliveriesRequired };
  }
  const out = [];
  for (let i = 0; i < deliveries.length; i++) {
    const d = deliveries[i];
    if (d == null || typeof d !== "object") {
      return { valid: false, error: notifyValidation.deliveryInvalid(i) };
    }
    const telegramUserId = d.telegramUserId;
    const message = d.message;
    if (telegramUserId === undefined || telegramUserId === null) {
      return { valid: false, error: notifyValidation.telegramUserIdRequired(i) };
    }
    if (typeof message !== "string") {
      return { valid: false, error: notifyValidation.messageMustBeString(i) };
    }
    out.push({ telegramUserId, message: String(message).trim() });
  }
  return { valid: true, deliveries: out };
}

/**
 * Registra POST /api/telegram/notify. El backend llama con la lista; el bot solo envía.
 * @param {object} app - Express app
 * @param {object} bot - Instancia node-telegram-bot-api
 * @param {function} log
 * @param {function} [logReq]
 */
export function registerNotifyRoute(app, bot, log, logReq = () => {}) {
  app.post("/api/telegram/notify", async (req, res) => {
    logReq(req, res);
    const { valid, deliveries, error } = validateNotifyBody(req.body);

    if (!valid) {
      log("Notify: body inválido", { error, requestId: req.requestId });
      res.status(400).json({ ok: false, error: error || notifyValidation.bodyInvalid });
      return;
    }

    res.status(202).json({ ok: true, received: deliveries.length });

    if (!bot) {
      log("Notify: bot no disponible");
      return;
    }

    for (const { telegramUserId, message } of deliveries) {
      const chatId = Number(telegramUserId);
      if (Number.isNaN(chatId)) {
        log("Notify: telegramUserId inválido", { telegramUserId });
        continue;
      }
      bot
        .sendMessage(chatId, message)
        .then(() => log("Notify: enviado", { chatId }))
        .catch((err) => log("Notify: error al enviar", { chatId, error: err.message }));
    }
  });
}
