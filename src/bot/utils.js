/**
 * Utilidades del bot para extraer datos y validar comandos.
 */

export function getTelegramUserIdFromMessage(msg) {
  return msg?.from?.id;
}

export function getChatIdFromMessage(msg) {
  return msg?.chat?.id;
}

export function parseAbrirCommand(text = "") {
  const normalized = String(text || "").trim();
  const match = normalized.match(/^\/abrir(?:@\w+)?\s+(\d+)$/i);
  if (!match) {
    return { ok: false, gateId: null };
  }

  const gateId = Number(match[1]);
  if (!Number.isInteger(gateId) || gateId <= 0) {
    return { ok: false, gateId: null };
  }
  return { ok: true, gateId };
}
