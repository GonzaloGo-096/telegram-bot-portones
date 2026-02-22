/**
 * Cliente HTTP bot -> backend para apertura de portones desde Telegram.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function normalizeBaseUrl(baseUrl) {
  if (baseUrl == null || typeof baseUrl !== "string") return "";
  const trimmed = baseUrl.trim();
  if (trimmed === "") return "";
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return "";
  return trimmed.replace(/\/+$/, "");
}

function genRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildUrl(baseUrl, path) {
  if (!baseUrl || !path) return null;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function createBackendClient(baseUrl, options = {}) {
  const { apiKey = "", log = () => {} } = options;
  const base = normalizeBaseUrl(baseUrl);
  const disabled = base === "";

  if (disabled) {
    log("BackendClient: BACKEND_BASE_URL inválida o vacía. Cliente deshabilitado.");
  }

  async function post(path, body, headers = {}) {
    const url = buildUrl(base, path);
    if (!url) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: "Backend no configurado.",
      };
    }

    const requestId = genRequestId();
    const finalHeaders = {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...headers,
    };

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, {
          method: "POST",
          headers: finalHeaders,
          body: JSON.stringify(body ?? {}),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await readJsonSafe(res);
        if (res.ok) {
          return { ok: true, status: res.status, data };
        }

        lastError = {
          status: res.status,
          data,
          message: data?.error || `HTTP ${res.status}`,
        };

        // 4xx (excepto 429) no se reintenta.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          break;
        }
      } catch (error) {
        lastError = {
          status: 0,
          data: null,
          message: error?.name === "AbortError" ? "Timeout" : error?.message || String(error),
        };
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }

    log("BackendClient: POST fallido", { path, error: lastError?.message, status: lastError?.status });
    return {
      ok: false,
      status: lastError?.status || 0,
      data: lastError?.data || null,
      error: lastError?.message || "No se pudo completar la operación.",
    };
  }

  return {
    get isConfigured() {
      return !disabled;
    },

    /**
     * Llama al endpoint protegido del backend:
     * POST /api/telegram/portones/:id/abrir
     * El backend valida JWT + roles + account_id + debounce Redis y registra evento canal=telegram.
     */
    async openGate({ gateId, jwt, telegramUserId }) {
      const parsedGateId = Number(gateId);
      if (!Number.isInteger(parsedGateId) || parsedGateId <= 0) {
        return {
          ok: false,
          status: 400,
          data: null,
          error: "ID de portón inválido.",
        };
      }

      const authHeader =
        typeof jwt === "string" && jwt.trim() ? { Authorization: `Bearer ${jwt.trim()}` } : {};

      const path = `/api/telegram/portones/${parsedGateId}/abrir`;
      const body = { canal: "telegram", telegram_user_id: String(telegramUserId ?? "") };

      const result = await post(path, body, authHeader);
      if (result.ok) return result;

      if (result.status === 403) {
        return {
          ok: false,
          status: 403,
          data: result.data,
          error: "No tenés permisos para abrir este portón.",
        };
      }

      if (result.status === 429) {
        return {
          ok: false,
          status: 429,
          data: result.data,
          error: "Intento duplicado detectado. Esperá unos segundos.",
        };
      }

      return {
        ok: false,
        status: result.status,
        data: result.data,
        error: result.error || "No se pudo abrir el portón.",
      };
    },
  };
}
