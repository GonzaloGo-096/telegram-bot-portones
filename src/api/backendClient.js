/**
 * Cliente HTTP del bot.
 * El backend concentra toda la lógica de permisos y validación.
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

async function parseJsonSafe(res) {
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

  async function request(method, path, body) {
    const url = buildUrl(base, path);
    if (!url) {
      return { ok: false, status: 0, data: null, error: "Backend no configurado." };
    }

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const requestId = genRequestId();

      try {
        const res = await fetch(url, {
          method,
          headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            "X-Request-Id": requestId,
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await parseJsonSafe(res);
        if (res.ok) return { ok: true, status: res.status, data };

        lastError = {
          status: res.status,
          data,
          error: data?.error || `HTTP ${res.status}`,
        };

        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = {
          status: 0,
          data: null,
          error: error?.name === "AbortError" ? "Timeout" : error?.message || String(error),
        };
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }

    log("BackendClient request fallido", { method, path, status: lastError?.status, error: lastError?.error });
    return {
      ok: false,
      status: lastError?.status || 0,
      data: lastError?.data || null,
      error: lastError?.error || "No se pudo completar la operación.",
    };
  }

  return {
    get isConfigured() {
      return !disabled;
    },

    // GET /api/usuarios/telegram/{telegram_id}
    async getUserByTelegramId(telegramId) {
      const encoded = encodeURIComponent(String(telegramId));
      return request("GET", `/api/usuarios/telegram/${encoded}`);
    },

    // GET /api/portones/grupos/{usuario_id}
    async getGateGroups(userId) {
      const encoded = encodeURIComponent(String(userId));
      return request("GET", `/api/portones/grupos/${encoded}`);
    },

    // GET /api/portones/{grupo_id}
    async getGatesByGroup(groupId) {
      const encoded = encodeURIComponent(String(groupId));
      return request("GET", `/api/portones/${encoded}`);
    },

    // POST /api/portones/{porton_id}/abrir
    async openGate(portonId) {
      const encoded = encodeURIComponent(String(portonId));
      return request("POST", `/api/portones/${encoded}/abrir`, {});
    },

    // GET /api/cultivos/{usuario_id}
    async getCultivos(userId) {
      const encoded = encodeURIComponent(String(userId));
      return request("GET", `/api/cultivos/${encoded}`);
    },
  };
}
