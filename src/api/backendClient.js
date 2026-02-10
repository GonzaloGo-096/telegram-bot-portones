/**
 * Cliente HTTP al backend profesional. Todas las llamadas al backend pasan por aquí.
 * Timeout 10s, 2 reintentos, X-Request-Id, X-API-Key opcional. Content-Type solo si hay body.
 * Sin lógica de negocio.
 *
 * Contrato del backend:
 *
 * GET /api/telegram/tenants?telegram_id={id}
 * - 200: { tenants: [ { tenantId, tenantName, gates: [ { gateId, gateName } ] } ] }
 * - 400: { error } (telegram_id faltante o inválido)
 * - 500: error de servidor
 *
 * POST /api/telegram/command
 * Body: { telegramId, gateId, action }
 * - 200: { accepted: true } | { accepted: false, reason: "FORBIDDEN" | "INVALID_ACTION" }
 * - 403: { accepted: false, reason: "FORBIDDEN" }
 * - 400: { accepted: false, reason: "INVALID_ACTION" }
 * - 500: error de servidor
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== "string") return "";
  return baseUrl.trim().replace(/\/+$/, "");
}

function genRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} baseUrl - BACKEND_BASE_URL
 * @param {object} [options] - { apiKey?, log? }
 * @returns {{ getTenants: Function, executeCommand: Function }}
 */
export function createBackendClient(baseUrl, options = {}) {
  const { apiKey = "", log = () => {} } = options;
  const url = normalizeBaseUrl(baseUrl);

  async function request(method, path, body = null) {
    const requestId = genRequestId();
    const fullUrl = `${url}${path}`;
    const headers = {
      "X-Request-Id": requestId,
      ...(body !== null ? { "Content-Type": "application/json" } : {}),
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    };

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const res = await fetch(fullUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (res.ok) {
          return { ok: true, status: res.status, data };
        }

        lastError = { status: res.status, data, text: text?.slice(0, 200) };
        log("BackendClient: respuesta no OK", { requestId, method, path, ...lastError });

        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, status: res.status, data, error: data?.error || text?.slice(0, 100) };
        }
      } catch (err) {
        lastError = err.name === "AbortError" ? new Error("Timeout") : err;
        log("BackendClient: error en intento", {
          requestId,
          attempt: attempt + 1,
          maxAttempts: MAX_RETRIES + 1,
          error: lastError?.message || String(lastError),
        });
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    return {
      ok: false,
      status: 0,
      data: null,
      error: lastError?.message || "Error desconocido",
    };
  }

  return {
    /**
     * GET /api/telegram/tenants?telegram_id=X
     * @param {string|number} telegramId - ctx.from.id
     * @returns {Promise<{ ok: boolean, tenants?: Array<{ tenantId: number, tenantName: string, gates: Array<{ gateId: number, gateName: string }> }>, error?: string }>}
     */
    async getTenants(telegramId) {
      const q = encodeURIComponent(String(telegramId));
      const res = await request("GET", `/api/telegram/tenants?telegram_id=${q}`);
      if (!res.ok) {
        return { ok: false, tenants: [], error: res.error || res.data?.error || "Error al cargar edificios." };
      }
      const tenants = res.data?.tenants ?? [];
      return { ok: true, tenants };
    },

    /**
     * POST /api/telegram/command
     * Contrato de respuesta del backend:
     * - 200 + { accepted: true } → comando aceptado
     * - 403 + { accepted: false, reason: "FORBIDDEN" } → sin permiso
     * - 400 + { accepted: false, reason: "INVALID_ACTION" } → acción no válida
     * - 500 u otro → error de servidor
     *
     * @param {string|number} telegramId - ctx.from.id
     * @param {string|number} gateId
     * @param {string} action - e.g. "OPEN"
     * @returns {Promise<{ accepted: boolean, reason?: 'FORBIDDEN'|'INVALID_ACTION'|'ERROR'|'UNKNOWN', error?: string }>}
     */
    async executeCommand(telegramId, gateId, action) {
      const res = await request("POST", "/api/telegram/command", {
        telegramId,
        gateId,
        action: String(action).trim(),
      });
      if (!res.ok) {
        return {
          accepted: false,
          reason: "ERROR",
          error: res.error || res.data?.error || "Error de conexión con el servidor.",
        };
      }
      const d = res.data;
      if (d && d.accepted === true) {
        return { accepted: true };
      }
      const reason = d?.reason || "UNKNOWN";
      const error =
        reason === "FORBIDDEN"
          ? "No tenés permiso para usar este portón."
          : reason === "INVALID_ACTION"
            ? "Acción no válida."
            : res.error || "Error al enviar comando.";
      return { accepted: false, reason, error };
    },
  };
}
