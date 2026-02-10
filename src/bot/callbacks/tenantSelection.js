/**
 * Callback tenant:X: obtiene gates del backend y renderiza menú.
 * Solo ctx → backendClient → render. Sin DB, permisos ni auditoría.
 */

import { Markup } from "telegraf";
import { getTelegramUserId } from "../utils.js";
import { errors, prompts, gateLabel } from "../messages.js";

/**
 * @param {Telegraf} bot
 * @param {object} options - { backendClient, log }
 */
export function registerTenantSelectionCallback(bot, { backendClient, log } = {}) {
  bot.action(/^tenant:(\d+)$/, async (ctx) => {
    const match = ctx.callbackQuery?.data?.match(/^tenant:(\d+)$/);
    const tenantId = match ? parseInt(match[1], 10) : null;

    if (!tenantId || Number.isNaN(tenantId)) {
      await ctx.answerCbQuery(errors.invalidData);
      return;
    }

    const telegramUserId = getTelegramUserId(ctx);
    if (!telegramUserId) {
      await ctx.answerCbQuery(errors.sessionError);
      return;
    }

    await ctx.answerCbQuery();

    const { ok, tenants, error } = await backendClient.getTenants(telegramUserId);

    if (!ok || error) {
      await ctx.reply(error || errors.loadGates);
      return;
    }

    const tenant = tenants?.find((t) => Number(t.tenantId) === tenantId);
    const gates = tenant?.gates ?? [];

    if (gates.length === 0) {
      await ctx.reply(errors.noGates);
      return;
    }

    log?.(`[tenantSelection] ${telegramUserId} → tenant ${tenantId}, ${gates.length} gates`);

    const buttons = gates.map((g) =>
      Markup.button.callback(gateLabel(g.gateName, g.gateId), `gate:${g.gateId}`)
    );

    await ctx.reply(prompts.selectGate, Markup.inlineKeyboard(buttons, { columns: 1 }));
  });
}
