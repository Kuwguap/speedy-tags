/** Standalone renewal sweep (for a Render Cron Job or manual run). */
import { runRenewalSweep } from "./renewals.js";

runRenewalSweep()
  .then((r) => {
    console.log(`Renewals: sent ${r.sent} of ${r.considered} due (${r.errors} errors).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Renewal sweep failed:", err.message);
    process.exit(1);
  });
