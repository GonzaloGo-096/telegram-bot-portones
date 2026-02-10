/**
 * Configuración del bot de Telegram con Telegraf.
 * Solo UI: comandos y callbacks que llaman al backend vía backendClient.
 */

import { Telegraf } from "telegraf";
import { registerStartCommand } from "./commands/start.js";
import { registerTenantSelectionCallback } from "./callbacks/tenantSelection.js";
import { registerGateSelectionCallback } from "./callbacks/gateSelection.js";

function isValidBackendClient(client) {
  return (
    client != null &&
    typeof client.getTenants === "function" &&
    typeof client.executeCommand === "function"
  );
}

/**
 * Crea y configura el bot de Telegraf.
 * @param {object} options
 * @param {string} options.botToken - BOT_TOKEN
 * @param {object} options.backendClient - Cliente HTTP al backend (createBackendClient)
 * @param {function} [options.log] - Función de log
 * @returns {Telegraf|null}
 */
export function createBot({ botToken, backendClient, log }) {
  if (!botToken) {
    log?.("BOT_TOKEN no definido. Bot desactivado.");
    return null;
  }

  const bot = new Telegraf(botToken);

  bot.catch((err, ctx) => {
    log?.("Error en el bot:", { error: err.message, update: ctx.update });
  });

  const opts = { backendClient, log };
  if (isValidBackendClient(backendClient)) {
    registerStartCommand(bot, opts);
    registerTenantSelectionCallback(bot, opts);
    registerGateSelectionCallback(bot, opts);
  } else {
    log?.(
      "backendClient inválido o sin getTenants/executeCommand. Handlers de /start y callbacks no registrados."
    );
  }

  return bot;
}
