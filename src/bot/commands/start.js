/**
 * Handler /start: obtiene tenants del backend y renderiza botones.
 * Solo ctx → backendClient → render. Sin DB, permisos ni auditoría.
 */

import { Markup } from "telegraf";
import { getTelegramUserId } from "../utils.js";
import { errors, prompts, tenantLabel } from "../messages.js";

/**
 * @param {Telegraf} bot
 * @param {object} options - { backendClient, log }
 */
export function registerStartCommand(bot, { backendClient, log } = {}) {
  bot.start(async (ctx) => {
    const telegramUserId = getTelegramUserId(ctx);
    const chatId = ctx.chat?.id;

    if (!telegramUserId) {
      await ctx.reply(errors.noUser);
      return;
    }

    log?.(`[start] /start de ${telegramUserId} (chat: ${chatId})`);

    const { ok, tenants, error } = await backendClient.getTenants(telegramUserId);

    if (!ok || error) {
      await ctx.reply(error || errors.loadBuildings);
      return;
    }

    if (!tenants || tenants.length === 0) {
      await ctx.reply(errors.noBuildings);
      return;
    }

    const buttons = tenants.map((t) =>
      Markup.button.callback(tenantLabel(t.tenantName, t.tenantId), `tenant:${t.tenantId}`)
    );

    await ctx.reply(prompts.selectBuilding, Markup.inlineKeyboard(buttons, { columns: 1 }));
  });
}
