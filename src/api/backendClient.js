/**
 * Cliente HTTP único del bot hacia backend.
 * Solo consume el endpoint interno de apertura.
 */

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
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
  const { apiKey = "", botSecret = "", timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, log = () => {} } = options;
  const base = normalizeBaseUrl(baseUrl);
  const disabled = base === "";

  if (disabled) {
    log("BackendClient: BACKEND_BASE_URL inválida o vacía. Cliente deshabilitado.");
  }

  async function request(method, path, body, extraHeaders = {}) {
    const url = buildUrl(base, path);
    if (!url) {
      return { ok: false, status: 0, data: null, error: "Backend no configurado." };
    }

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const requestId = genRequestId();

      try {
        const res = await fetch(url, {
          method,
          headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            "X-Request-Id": requestId,
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const data = await parseJsonSafe(res);
        if (res.ok) {
          log("BackendClient request OK", {
            method,
            url,
            status: res.status,
          });
          return { ok: true, status: res.status, data };
        }

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

    log("BackendClient request fallido", {
      method,
      url,
      status: lastError?.status,
      error: lastError?.error,
      errorBody: lastError?.data ?? null,
    });
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

    // POST /api/telegram/bot/portones/:id/abrir
    async openGate(portonId, telegramId) {
      const encoded = encodeURIComponent(String(portonId));
      const result = await request(
        "POST",
        `/api/telegram/bot/portones/${encoded}/abrir`,
        { telegramId: String(telegramId) },
        {
          ...(botSecret ? { "x-bot-secret": botSecret } : {}),
        }
      );

      if (result.ok) return result;
      if (result.status === 401) {
        return { ...result, error: "Credencial interna del bot inválida o ausente." };
      }
      if (result.status === 403) {
        return { ...result, error: "Sin acceso al portón solicitado." };
      }
      if (result.status === 404) {
        return { ...result, error: "Usuario Telegram o portón no encontrado." };
      }
      if (result.status === 429) {
        return { ...result, error: "Comando repetido (debounce activo)." };
      }
      if (result.status >= 500) {
        return { ...result, error: "Error temporal del servidor." };
      }
      return result;
    },
  };
}
