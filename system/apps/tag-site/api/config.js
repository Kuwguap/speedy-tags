import { pricing } from "./_lib/core.js";

/** Public config for the browser (no secrets). */
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      currencySymbol: "$",
      tagPrice: pricing.tag,
      insuranceOptInPrice: pricing.insuranceOptIn,
      renewalPeriodDays: Number(process.env.RENEWAL_PERIOD_DAYS || 28),
    }),
  );
}
