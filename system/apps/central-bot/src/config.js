import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8090),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-secret",
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  renewalPeriodDays: Number(process.env.RENEWAL_PERIOD_DAYS || 28),
  // Central Telegram control bot (optional)
  botToken: process.env.TELEGRAM_CENTRAL_BOT_TOKEN || "",
  publicUrl: (process.env.CENTRAL_PUBLIC_URL || "").replace(/\/$/, ""),
  // How often the in-process renewal sweep runs (minutes)
  renewalSweepMinutes: Number(process.env.RENEWAL_SWEEP_MINUTES || 360),
};

export function assertConfig() {
  const missing = [];
  if (!config.adminPassword) missing.push("ADMIN_PASSWORD");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) console.warn(`[config] missing env: ${missing.join(", ")}`);
}
