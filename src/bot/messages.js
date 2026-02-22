/**
 * Mensajes de validación para POST /api/telegram/notify.
 * Se mantiene en un módulo separado para reutilización y tests.
 */
export const notifyValidation = {
  bodyNotObject: "Body debe ser un objeto",
  deliveriesRequired: "deliveries es obligatorio y debe ser un array",
  deliveryInvalid: (i) => `deliveries[${i}] inválido`,
  telegramUserIdRequired: (i) => `deliveries[${i}].telegramUserId requerido`,
  messageMustBeString: (i) => `deliveries[${i}].message debe ser string`,
  bodyInvalid: "Body inválido",
};
