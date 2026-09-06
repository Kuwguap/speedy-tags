/**
 * POST /api/stripe/webhook
 * Secondary (best-effort) finalize path. Verifies the Stripe signature against
 * the raw body, then finalizes on checkout.session.completed. The browser-side
 * verify endpoint is the guaranteed path; this covers users who close the tab.
 *
 * Vercel note: bodyParser must be disabled so we can read the raw body.
 */

import { stripe, finalizeOrder, readRawBody, json } from "../_lib/core.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method-not-allowed" });

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    const raw = await readRawBody(req);
    event = secret
      ? stripe.webhooks.constructEvent(raw, sig, secret)
      : JSON.parse(raw.toString("utf8")); // dev without a secret
  } catch (err) {
    console.warn("[webhook] signature verification failed:", err.message);
    return json(res, 400, { error: `Webhook Error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (orderId && session.payment_status === "paid") {
        await finalizeOrder(orderId, session);
      }
    }
    return json(res, 200, { received: true });
  } catch (err) {
    console.error("[webhook] handler error:", err);
    return json(res, 500, { error: err.message });
  }
}
