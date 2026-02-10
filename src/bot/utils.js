/**
 * Helpers para handlers del bot. Sin lógica de negocio.
 */

/**
 * Obtiene el Telegram User ID del contexto (ctx.from.id).
 * @param {object} ctx - Contexto Telegraf
 * @returns {number|undefined} telegramUserId o undefined si no hay usuario
 */
export function getTelegramUserId(ctx) {
  return ctx.from?.id;
}
