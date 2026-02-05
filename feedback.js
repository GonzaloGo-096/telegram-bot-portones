/**
 * Módulo de feedback del Controlador Central.
 * Expone endpoint POST /api/feedback para recibir cambios de estado
 * y enviar notificaciones a los chats autorizados.
 */

/**
 * Valida el body del feedback.
 * @param {object} body - Body del request
 * @returns {{valid: boolean, data?: object, error?: string}}
 */
function validarFeedbackBody(body) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Body inválido o vacío" };
  }
  const { portonId, previousState, currentState, timestamp } = body;
  if (!portonId || typeof portonId !== "string") {
    return { valid: false, error: "portonId requerido (string)" };
  }
  if (!previousState || typeof previousState !== "string") {
    return { valid: false, error: "previousState requerido (string)" };
  }
  if (!currentState || typeof currentState !== "string") {
    return { valid: false, error: "currentState requerido (string)" };
  }
  return {
    valid: true,
    data: {
      portonId: String(portonId).trim(),
      previousState: String(previousState).trim(),
      currentState: String(currentState).trim(),
      timestamp: timestamp != null ? timestamp : new Date().toISOString(),
    },
  };
}

/**
 * Formatea el nombre del portón para mostrar al usuario.
 * @param {string} portonId - ej. "porton1", "porton2"
 * @returns {string} ej. "Portón 1", "Portón 2"
 */
function formatearNombrePorton(portonId) {
  const match = /porton(\d+)/i.exec(String(portonId));
  if (match) return `Portón ${match[1]}`;
  return portonId;
}

/**
 * Registra el endpoint POST /api/feedback en la app Express.
 * @param {object} app - Instancia de Express
 * @param {object} bot - Instancia de Telegraf (para enviar mensajes)
 * @param {number[]} allowedChatIds - Array de chat_ids autorizados
 * @param {function} log - Función de log (message, data)
 * @param {function} [logReq] - Función para loguear el request (req, res)
 */
export function registerFeedbackRoute(app, bot, allowedChatIds, log, logReq = () => {}) {
  app.post("/api/feedback", (req, res) => {
    logReq(req, res);
    const { valid, data, error } = validarFeedbackBody(req.body);

    if (!valid) {
      log("Feedback: body inválido", { error, requestId: req.requestId });
      res.status(400).json({ ok: false, error: error || "Body inválido" });
      return;
    }

    res.status(202).json({ ok: true, received: true });

    if (!bot) {
      log("Feedback: bot no disponible, no se envía notificación");
      return;
    }

    const chatIds = Array.isArray(allowedChatIds) ? allowedChatIds : [];
    if (chatIds.length === 0) {
      log("Feedback: no hay chats autorizados configurados");
      return;
    }

    const nombrePorton = formatearNombrePorton(data.portonId);
    const mensaje = `${nombrePorton} pasó de ${data.previousState} → ${data.currentState}`;

    log("Feedback: enviando a chats autorizados", {
      portonId: data.portonId,
      previousState: data.previousState,
      currentState: data.currentState,
      chatCount: chatIds.length,
    });

    for (const chatId of chatIds) {
      bot.telegram
        .sendMessage(chatId, mensaje)
        .then(() => {
          log("Feedback: mensaje enviado", { chatId });
        })
        .catch((err) => {
          log("Feedback: error al enviar a chat", { chatId, error: err.message });
        });
    }
  });
}
