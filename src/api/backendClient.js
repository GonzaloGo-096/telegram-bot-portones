/**
 * Cliente HTTP al backend. Único punto de comunicación bot → backend.
 *
 * Requisitos:
 * - BACKEND_BASE_URL obligatoria; si falta, no se hace fetch (evita "Failed to parse URL").
 * - GET /api/telegram/tenants, POST /api/telegram/command.
 * - Headers: X-Request-Id, X-API-Key opcional, Content-Type solo con body.
 * - Timeout 10s, 2 reintentos para 5xx/red; 4xx (salvo 429) sin reintento.
 * - Respuestas normalizadas para consumo por handlers.
 *
 * Contrato del backend:
 * - GET /api/telegram/tenants?telegram_id={id}
 *   → 200: { tenants: [ { tenantId, tenantName, gates: [ { gateId, gateName } ] } ] }
 *   → 400/500: { error } o body de error
 * - POST /api/telegram/command
 *   → Body: { telegramId, gateId, action }
 *   → 200: { accepted: true } | { accepted: false, reason: "FORBIDDEN" | "INVALID_ACTION" }
 *   → 403/400/500 según razón
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const BACKEND_PATH_TENANTS = "/api/telegram/tenants";
const BACKEND_PATH_COMMAND = "/api/telegram/command";

/**
 * Normaliza la base URL: quita espacios y barras finales.
 * @param {string} baseUrl
 * @returns {string} URL sin barra final, o "" si no válida
 */
function normalizeBaseUrl(baseUrl) {
  if (baseUrl == null || typeof baseUrl !== "string") return "";
  const trimmed = baseUrl.trim();
  if (trimmed === "") return "";
  return trimmed.replace(/\/+$/, "");
}

/**
 * Genera un ID único por petición (para X-Request-Id).
 * @returns {string}
 */
function genRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Construye la URL absoluta. Si baseUrl está vacía, devuelve null (no llamar a fetch).
 * @param {string} baseUrl - Base ya normalizada
 * @param {string} path - Path que empieza con /
 * @returns {string|null}
 */
function buildFullUrl(baseUrl, path) {
  if (!baseUrl || typeof path !== "string") return null;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${p}`;
}

/**
 * Crea el cliente HTTP al backend.
 *
 * @param {string} baseUrl - process.env.BACKEND_BASE_URL (obligatoria en producción)
 * @param {object} [options]
 * @param {string} [options.apiKey] - process.env.BACKEND_API_KEY (opcional)
 * @param {function} [options.log] - Logger inyectable para tests y producción
 * @returns {{ getTenants: (telegramId: string|number) => Promise<{ok: boolean, tenants?: array, error?: string}>, executeCommand: (telegramId, gateId, action) => Promise<{accepted: boolean, reason?: string, error?: string}> }}
 */
export function createBackendClient(baseUrl, options = {}) {
  const { apiKey = "", log = () => {} } = options;
  const base = normalizeBaseUrl(baseUrl);
  const disabled = base === "";

  if (disabled) {
    log("BackendClient: BACKEND_BASE_URL no está definida o es inválida. No se realizarán llamadas al backend.");
  }

  /**
   * Realiza una petición HTTP. Si el cliente está deshabilitado (sin base URL), no llama a fetch.
   * @param {string} method - GET | POST
   * @param {string} path - Path absoluto (ej. /api/telegram/tenants)
   * @param {object|null} body - Body para POST; null para GET
   * @returns {Promise<{ ok: boolean, status?: number, data?: object, error?: string }>}
   */
  async function request(method, path, body = null) {
    const fullUrl = buildFullUrl(base, path);
    if (!fullUrl) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "Backend no configurado (BACKEND_BASE_URL faltante o inválida).",
      };
    }

    const requestId = genRequestId();
    const headers = {
      "X-Request-Id": requestId,
      ...(body !== null && body !== undefined ? { "Content-Type": "application/json" } : {}),
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
          body: body != null ? JSON.stringify(body) : undefined,
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

        // 4xx (excepto 429) no se reintenta
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return {
            ok: false,
            status: res.status,
            data,
            error: data?.error || text?.slice(0, 100) || `HTTP ${res.status}`,
          };
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
    /** false si BACKEND_BASE_URL faltaba o era inválida; usar para no registrar handlers. */
    get isConfigured() {
      return !disabled;
    },

    /**
     * GET ${baseUrl}/api/telegram/tenants?telegram_id=...
     * @param {string|number} telegramId - ctx.from.id
     * @returns {Promise<{ ok: boolean, tenants?: Array, error?: string }>}
     */
    async getTenants(telegramId) {
      const query = encodeURIComponent(String(telegramId));
      const path = `${BACKEND_PATH_TENANTS}?telegram_id=${query}`;
      const res = await request("GET", path);
      if (!res.ok) {
        return {
          ok: false,
          tenants: [],
          error: res.error || res.data?.error || "Error al cargar edificios.",
        };
      }
      const tenants = res.data?.tenants ?? [];
      return { ok: true, tenants };
    },

    /**
     * POST ${baseUrl}/api/telegram/command con { telegramId, gateId, action }
     * @param {string|number} telegramId - ctx.from.id
     * @param {string|number} gateId
     * @param {string} action - ej. "OPEN"
     * @returns {Promise<{ accepted: boolean, reason?: string, error?: string }>}
     */
    async executeCommand(telegramId, gateId, action) {
      const body = {
        telegramId,
        gateId,
        action: String(action).trim(),
      };
      const res = await request("POST", BACKEND_PATH_COMMAND, body);
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
