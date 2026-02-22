/**
 * Resolución de JWT por usuario de Telegram y validaciones básicas de rol.
 * El backend sigue siendo la autoridad final de autorización.
 */

const ROLES_PERMITIDOS = new Set(["superadministrador", "administrador_cuenta", "operador"]);

function toBase64(input) {
  return input.replace(/-/g, "+").replace(/_/g, "/");
}

function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeJwtPayload(jwt) {
  if (typeof jwt !== "string" || !jwt.includes(".")) return null;
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1];
  const normalized = toBase64(payload);
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    return parseJsonSafe(json);
  } catch {
    return null;
  }
}

function resolveRole(payload) {
  if (!payload || typeof payload !== "object") return "";
  const direct = payload.rol ?? payload.role;
  if (typeof direct === "string") return direct.trim().toLowerCase();
  if (Array.isArray(payload.roles) && typeof payload.roles[0] === "string") {
    return payload.roles[0].trim().toLowerCase();
  }
  return "";
}

function parseTokenMapFromEnv(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return {};
  const parsed = parseJsonSafe(rawValue);
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function createAuthService({ tokenMapRaw, defaultJwt = "", log = () => {} } = {}) {
  const tokenMap = parseTokenMapFromEnv(tokenMapRaw);

  return {
    getJwtForTelegramUser(telegramUserId) {
      const key = String(telegramUserId ?? "");
      const byUser = tokenMap[key];
      if (typeof byUser === "string" && byUser.trim()) {
        return byUser.trim();
      }
      if (typeof defaultJwt === "string" && defaultJwt.trim()) {
        return defaultJwt.trim();
      }
      return "";
    },

    validateJwtRole(jwt) {
      if (typeof jwt !== "string" || !jwt.trim()) {
        return { ok: false, role: "", reason: "MISSING_JWT" };
      }
      const payload = decodeJwtPayload(jwt.trim());
      if (!payload) {
        return { ok: false, role: "", reason: "INVALID_JWT_FORMAT" };
      }

      const role = resolveRole(payload);
      const accountId = payload.account_id ?? payload.accountId ?? null;
      if (!ROLES_PERMITIDOS.has(role)) {
        log("Auth: rol no permitido", { role, telegramUserId: payload.telegram_user_id || null });
        return { ok: false, role, accountId, reason: "ROLE_NOT_ALLOWED" };
      }

      return { ok: true, role, accountId, reason: "" };
    },
  };
}
