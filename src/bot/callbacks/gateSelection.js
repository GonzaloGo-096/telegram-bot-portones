/**
 * Callback gate:X: envía comando al backend y muestra resultado.
 * Solo ctx → backendClient → render. Sin permisos locales ni DB.
 */

import { getTelegramUserId } from "../utils.js";
import { errors, errorPrefix, prompts, success } from "../messages.js";

/**
 * @param {Telegraf} bot
 * @param {object} options - { backendClient, log }
 */
export function registerGateSelectionCallback(bot, { backendClient, log } = {}) {
  bot.action(/^gate:(\d+)$/, async (ctx) => {
    const match = ctx.callbackQuery?.data?.match(/^gate:(\d+)$/);
    const gateId = match ? parseInt(match[1], 10) : null;

    if (!gateId || Number.isNaN(gateId)) {
      await ctx.answerCbQuery(errors.invalidData);
      return;
    }

    const telegramUserId = getTelegramUserId(ctx);
    if (!telegramUserId) {
      await ctx.answerCbQuery(errors.sessionError);
      return;
    }

    await ctx.answerCbQuery(prompts.sendingCommand);

    const result = await backendClient.executeCommand(telegramUserId, gateId, "OPEN");

    if (result.accepted) {
      await ctx.reply(success.commandSent);
      log?.(`[gateSelection] ${telegramUserId} → gate ${gateId} accepted`);
    } else {
      const msg = result.error || errors.commandFailed;
      await ctx.reply(errorPrefix + msg);
      log?.(`[gateSelection] ${telegramUserId} → gate ${gateId} rejected`, { reason: result.reason });
    }
  });
}
