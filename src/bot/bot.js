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
    typeof client.executeCommand === "function" &&
    client.isConfigured !== false
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
    log?.("Bot: handlers de /start y callbacks registrados (backend configurado).");
  } else {
    log?.(
      "Bot: backendClient inválido o BACKEND_BASE_URL no configurada. Handlers de /start y callbacks NO registrados."
    );
    // Respuesta cuando el usuario escribe /start pero el backend no está configurado
    bot.start(async (ctx) => {
      await ctx.reply(
        "El servicio de edificios no está configurado. Revisá que BACKEND_BASE_URL o CONTROLADOR_BASE_URL esté definido en .env y reiniciá el bot."
      );
    });
  }

  return bot;
}
