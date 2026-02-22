/**
 * Handler /start: obtiene gates del backend y renderiza botones por portón.
 * Backend devuelve { gates: [...] }; sin paso de tenants.
 */

import { Markup } from "telegraf";
import { getTelegramUserId } from "../utils.js";
import { errors, prompts, gateLabel } from "../messages.js";

/**
 * @param {Telegraf} bot
 * @param {object} options - { backendClient, log }
 */
export function registerStartCommand(bot, { backendClient, log } = {}) {
  bot.start(async (ctx) => {
    try {
      const telegramUserId = getTelegramUserId(ctx);
      const chatId = ctx.chat?.id;

      if (!telegramUserId) {
        await ctx.reply(errors.noUser);
        return;
      }

      log?.(`[start] /start de ${telegramUserId} (chat: ${chatId})`);

      if (!backendClient?.getGates) {
        log?.("[start] backendClient no disponible");
        await ctx.reply("El servicio no está configurado. Contactá al administrador.");
        return;
      }

      const { ok, gates, error } = await backendClient.getGates(telegramUserId);

      log?.(`[start] getGates ok=${ok} gates=${Array.isArray(gates) ? gates.length : 0} error=${error ?? ""}`);

      if (!ok || error) {
        await ctx.reply(error || errors.loadGates);
        return;
      }

      if (!gates || gates.length === 0) {
        await ctx.reply(errors.noGates);
        return;
      }

      const buttons = gates.map((g) =>
        Markup.button.callback(gateLabel(g.gateName, g.gateId), `gate:${g.gateId}`)
      );

      await ctx.reply(prompts.selectGate, Markup.inlineKeyboard(buttons, { columns: 1 }));
    } catch (err) {
      log?.("[start] Error", { message: err?.message, stack: err?.stack });
      try {
        await ctx.reply("Error inesperado. Intentá de nuevo en un momento.");
      } catch (_) {}
    }
  });
}
