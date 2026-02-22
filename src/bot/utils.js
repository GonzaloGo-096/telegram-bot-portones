/**
 * Utilidades del bot para navegación y extracción de datos.
 */

export const CALLBACKS = {
  MODULE_PORTONES: "mod:portones",
  MODULE_CULTIVOS: "mod:cultivos",
  BACK_TO_MENU: "back:menu",
  BACK_TO_GROUPS: "back:groups",
  GROUP_PREFIX: "group:",
  GATE_PREFIX: "gate:",
};

export function getChatIdFromMessage(msg) {
  return msg?.chat?.id;
}

export function getTelegramUserIdFromMessage(msg) {
  return msg?.from?.id;
}

export function getChatIdFromCallback(query) {
  return query?.message?.chat?.id;
}

export function getTelegramUserIdFromCallback(query) {
  return query?.from?.id;
}

export function safeArray(source, keys = []) {
  if (Array.isArray(source)) return source;
  if (!source || typeof source !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
  }
  return [];
}

export function resolveUserFromPayload(payload, telegramId) {
  if (!payload || typeof payload !== "object") {
    return { id: null, modules: [] };
  }

  const user = payload.usuario || payload.user || payload.data || payload;
  const userId = user?.id ?? user?.usuario_id ?? user?.user_id ?? null;

  const modulesRaw = user?.modulos ?? user?.modules ?? payload?.modulos ?? payload?.modules ?? [];
  let modules = [];
  if (Array.isArray(modulesRaw)) {
    modules = modulesRaw.map((module) =>
      typeof module === "string"
        ? module.toLowerCase()
        : String(module?.nombre || module?.code || module?.modulo || "").toLowerCase()
    );
  } else if (modulesRaw && typeof modulesRaw === "object") {
    modules = Object.entries(modulesRaw)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => String(key).toLowerCase());
  }

  return {
    id: userId,
    telegramId: user?.telegram_id ?? telegramId,
    modules: modules.filter(Boolean),
  };
}
