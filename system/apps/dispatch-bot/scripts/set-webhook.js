/** One-off: register the Telegram webhook to DISPATCH_PUBLIC_URL/telegram/webhook. */
import { setWebhook } from "../src/telegram.js";
import { config } from "../src/config.js";

if (!config.botToken) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}
const r = await setWebhook();
console.log(r.ok ? "Webhook registered." : `Failed: ${r.error || "see logs"}`);
process.exit(r.ok ? 0 : 1);
