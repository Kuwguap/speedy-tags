/**
 * GET /api/checkout/verify?session_id=...
 * Guaranteed dispatch path: retrieves the session from Stripe, and if paid,
 * finalizes the order (mark paid + transaction + push to dispatch bot).
 * Idempotent — safe to poll from the success page.
 */

import { stripe, finalizeOrder, supa, json } from "../_lib/core.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return json(res, 400, { error: "session_id required" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = session.metadata?.orderId;
    if (!orderId) return json(res, 404, { error: "order not found for session" });

    if (session.payment_status === "paid") {
      await finalizeOrder(orderId, session);
    }

    const { data: order } = await supa()
      .from("orders")
      .select("id,status,state,plate,delivery_email,email,insurance_opt_in")
      .eq("id", orderId)
      .single();

    return json(res, 200, {
      status: order?.status || "pending",
      state: order?.state,
      plate: order?.plate || null,
      email: order?.delivery_email || order?.email,
      insuranceOptIn: order?.insurance_opt_in,
    });
  } catch (err) {
    console.error("[verify]", err);
    return json(res, 500, { error: err.message });
  }
}
