/**
 * Cliente HTTP para el Controlador Central de Portones.
 * Envía eventos (ej. PRESS) al endpoint /api/events con reintentos y timeout.
 */

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2; // 2 reintentos = 3 intentos totales

/**
 * Parsea la URL base y elimina trailing slash para construir rutas correctamente.
 * @param {string} baseUrl - URL base del Controlador (ej. https://controlador.railway.app)
 * @returns {string} URL normalizada
 */
function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== "string") return "";
  return baseUrl.trim().replace(/\/+$/, "");
}

/**
 * Envía un evento al Controlador Central.
 * @param {object} options - Opciones de configuración
 * @param {string} options.baseUrl - URL base del Controlador (CONTROLADOR_BASE_URL)
 * @param {string} options.apiKey - API key para autenticación (CONTROLADOR_API_KEY)
 * @param {string} options.portonId - ID del portón (ej. "porton1", "porton2")
 * @param {string} [options.event="PRESS"] - Tipo de evento
 * @param {function} [options.log] - Función de log (message, data)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function enviarEvento({ baseUrl, apiKey, portonId, event = "PRESS", log = () => {} }) {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) {
    log("Controlador: baseUrl no configurada", { portonId });
    return { success: false, error: "Controlador no configurado" };
  }

  const endpoint = `${url}/api/events`;
  const payload = { portonId, event };
  const headers = {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        log("Controlador: evento enviado correctamente", { portonId, event, status: res.status });
        return { success: true };
      }

      const text = await res.text();
      lastError = `HTTP ${res.status}: ${text.slice(0, 100)}`;
      log("Controlador: respuesta no OK", { portonId, status: res.status, body: text.slice(0, 200) });

      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // No reintentar en errores 4xx (excepto 429)
        return { success: false, error: lastError };
      }
    } catch (err) {
      lastError = err.name === "AbortError" ? "Timeout" : (err.message || String(err));
      log("Controlador: error en intento", {
        attempt: attempt + 1,
        maxAttempts: MAX_RETRIES + 1,
        portonId,
        error: lastError,
      });

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  return { success: false, error: lastError || "Error desconocido" };
}
