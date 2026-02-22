/**
 * Textos y mensajes del bot. Única fuente de strings para handlers y rutas HTTP.
 */

/** Errores mostrados al usuario (Telegram) */
export const errors = {
  noUser: "No se pudo identificar tu usuario.",
  invalidData: "Datos inválidos",
  sessionError: "Error de sesión",
  loadBuildings: "No pudimos cargar los edificios. Intentá de nuevo más tarde.",
  noBuildings: "No tenés acceso a ningún edificio. Contactá al administrador.",
  loadGates: "Error al cargar portones. Intentá de nuevo.",
  noGates: "No tenés acceso a ningún portón.",
  commandFailed: "No se pudo enviar el comando. Intentá de nuevo.",
};

/** Prompts y títulos de pantallas */
export const prompts = {
  selectBuilding: "Seleccioná el edificio:",
  selectGate: "Seleccioná el portón:",
  sendingCommand: "Enviando comando...",
};

/** Mensajes de éxito */
export const success = {
  commandSent: "✅ Comando enviado correctamente.",
};

/** Prefijo para respuestas de error en Telegram */
export const errorPrefix = "⚠️ ";

/** Mensajes de validación para POST /api/telegram/notify (respuestas 400 al backend) */
export const notifyValidation = {
  bodyNotObject: "Body debe ser un objeto",
  deliveriesRequired: "deliveries es obligatorio y debe ser un array",
  deliveryInvalid: (i) => `deliveries[${i}] inválido`,
  telegramUserIdRequired: (i) => `deliveries[${i}].telegramUserId requerido`,
  messageMustBeString: (i) => `deliveries[${i}].message debe ser string`,
  bodyInvalid: "Body inválido",
};

export const gateLabel = (gateName, gateId) => gateName || `Portón ${gateId}`;
export const tenantLabel = (tenantName, tenantId) => tenantName || String(tenantId);
