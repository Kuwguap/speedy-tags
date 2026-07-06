/**
 * POST /api/checkout/create-session
 * Body: tag order fields. Creates a pending order + upserts the user, then a
 * Stripe Checkout session. Returns { url } to redirect the buyer to.
 */

import { stripe, supa, totalFor, pricing, json } from "../_lib/core.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method-not-allowed" });
  try {
    const b = await readJson(req);
    const email = String(b.email || "").trim().toLowerCase();
    if (!email.includes("@")) return json(res, 400, { error: "valid email required" });
    if (!b.firstName || !b.lastName || !b.state) {
      return json(res, 400, { error: "firstName, lastName and state are required" });
    }

    const client = supa();

    // Upsert user by email.
    const { data: user } = await client
      .from("users")
      .upsert(
        { email, first_name: b.firstName, last_name: b.lastName, phone: b.phone || null },
        { onConflict: "email" },
      )
      .select("id")
      .single();

    const insuranceOptIn = Boolean(b.insuranceOptIn);

    // Create the pending order.
    const { data: order, error } = await client
      .from("orders")
      .insert({
        reference: `kt_${Date.now().toString(36)}`,
        user_id: user?.id || null,
        status: "pending",
        state: String(b.state).toUpperCase(),
        first_name: b.firstName,
        last_name: b.lastName,
        email,
        phone: b.phone || null,
        address: b.address || null,
        address2: b.address2 || null,
        city: b.city || null,
        zip: b.zip || null,
        vin: b.vin || null,
        year: b.year || null,
        make: b.make || null,
        model: b.model || null,
        color: b.color || null,
        body: b.body || null,
        insurance_opt_in: insuranceOptIn,
        insurance_company: b.insuranceCompany || null,
        insurance_policy: b.insurancePolicy || null,
        notes: b.notes || null,
        delivery_method: b.deliveryMethod || "email",
        delivery_email: b.deliveryEmail || email,
        delivery_address: b.deliveryAddress || null,
      })
      .select("*")
      .single();
    if (error) return json(res, 500, { error: error.message });

    const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
    const total = totalFor(insuranceOptIn);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pricing.currency,
            unit_amount: Math.round(total * 100),
            product_data: {
              name: "New Jersey 30-day Temporary Tag",
              description: insuranceOptIn ? "Includes 1-month coverage card" : undefined,
            },
          },
        },
      ],
      metadata: { orderId: order.id },
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout?canceled=1`,
    });

    await client.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return json(res, 200, { url: session.url, orderId: order.id });
  } catch (err) {
    console.error("[create-session]", err);
    return json(res, 500, { error: err.message });
  }
}
