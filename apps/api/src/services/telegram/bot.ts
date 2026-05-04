import { Bot } from "grammy";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

let botInstance: Bot | null = null;

export function getBot(): Bot | null {
  return botInstance;
}

export async function initBot(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) { logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled"); return; }
  botInstance = new Bot(env.TELEGRAM_BOT_TOKEN);

  botInstance.command("start", (ctx) => ctx.reply(
    "👋 Welcome to ISP Nexus!\n\n/status — Router status\n/customers — Customer stats\n/pending — Pending orders\n/help — All commands"
  ));

  botInstance.command("help", (ctx) => ctx.reply(
    "📋 ISP Nexus Commands:\n/status — Router status\n/customers — Total customers\n/pending — Pending orders\n/bandwidth — Live bandwidth"
  ));

  botInstance.command("status", async (ctx) => {
    ctx.reply("📡 Fetching router status... (connect via admin panel to configure)");
  });

  botInstance.command("pending", async (ctx) => {
    ctx.reply("📋 Check pending orders at your admin dashboard.");
  });

  botInstance.catch((err) => logger.error({ err }, "Telegram bot error"));

  await botInstance.start({ onStart: () => logger.info("Telegram bot started") });
}

export async function stopBot(): Promise<void> {
  if (botInstance) { await botInstance.stop(); botInstance = null; }
}

export async function sendAlert(chatId: string, message: string): Promise<void> {
  if (!botInstance) return;
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send Telegram alert"); }
}

export async function sendOrderNotification(chatId: string, order: any, customer: any, pkg: any): Promise<void> {
  if (!botInstance) return;
  const message = [
    `🛒 *New Order*`,
    ``,
    `Package: ${pkg?.name ?? "N/A"}`,
    `Amount: ${order?.amountBdt ?? 0} BDT`,
    `Method: ${order?.paymentMethod ?? "N/A"}`,
    `Customer: ${customer?.fullName ?? "N/A"}`,
    `Phone: ${customer?.phone ?? "N/A"}`,
  ].join("\n");
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send order notification"); }
}

export async function sendApprovalNotification(chatId: string, customer: any, pkg: any): Promise<void> {
  if (!botInstance) return;
  const message = [
    `✅ *Order Approved*`,
    ``,
    `Customer: ${customer?.fullName ?? "N/A"}`,
    `Phone: ${customer?.phone ?? "N/A"}`,
    `Package: ${pkg?.name ?? "N/A"}`,
  ].join("\n");
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send approval notification"); }
}
