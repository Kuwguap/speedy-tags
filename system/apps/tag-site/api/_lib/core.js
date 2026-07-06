/**
 * Shared serverless helpers: Stripe client, pricing, order finalize + dispatch.
 * Kept framework-agnostic so both the browser-driven verify path and the
 * Stripe webhook can reuse finalizeOrder() idempotently.
 */

import Stripe from "stripe";
import { getServiceClient } from "@speedy/shared/supabase";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

export const supa = () => getServiceClient();

export const pricing = {
  tag: Number(process.env.TAG_PRICE || 150),
  insuranceOptIn: Number(process.env.INSURANCE_OPT_IN_PRICE || 100),
  currency: "usd",
};

/** Total in dollars for a given opt-in flag. */
export function totalFor(insuranceOptIn) {
  return pricing.tag + (insuranceOptIn ? pricing.insuranceOptIn : 0);
}

/** Read raw request body (needed for Stripe webhook signature). */
export async function readRawBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** POST the paid order to the dispatch bot to generate the PDF + dispatch. */
async function pushToDispatch(orderId) {
  const base = (process.env.DISPATCH_BOT_URL || "").replace(/\/$/, "");
  if (!base) {
    console.warn("[finalize] DISPATCH_BOT_URL not set — order not dispatched");
    return;
  }
  try {
    const res = await fetch(`${base}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": process.env.DISPATCH_SHARED_SECRET || "",
      },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) console.warn("[finalize] dispatch returned", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.warn("[finalize] dispatch push failed:", err.message);
  }
}

/**
 * Mark an order paid, write the transaction, and trigger dispatch — exactly
 * once. Safe to call from both verify and webhook; the paid-status guard makes
 * it idempotent.
 * @param {string} orderId
 * @param {object} session Stripe checkout session (must be paid)
 */
export async function finalizeOrder(orderId, session) {
  const client = supa();
  const { data: order } = await client.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, reason: "order-not-found" };
  if (order.status === "paid") return { ok: true, already: true, order };

  const paidAt = new Date().toISOString();
  const renewalDays = Number(process.env.RENEWAL_PERIOD_DAYS || 28);
  const renewalDueAt = new Date(Date.now() + renewalDays * 86400000).toISOString();

  const { data: updated } = await client
    .from("orders")
    .update({
      status: "paid",
      paid_at: paidAt,
      renewal_due_at: renewalDueAt,
      stripe_session_id: session.id,
      price: (session.amount_total ?? 0) / 100,
    })
    .eq("id", orderId)
    .eq("status", "pending") // guard: only the first finalize wins
    .select("*")
    .maybeSingle();

  if (!updated) {
    // Someone else finalized between our read and write.
    return { ok: true, already: true };
  }

  await client.from("transactions").insert({
    source: "tag",
    stripe_id: session.payment_intent || session.id,
    amount_cents: session.amount_total ?? 0,
    status: "paid",
    user_id: updated.user_id,
    order_id: orderId,
  });

  await pushToDispatch(orderId);
  return { ok: true, order: updated };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
