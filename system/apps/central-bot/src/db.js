/** Supabase data access for the central dashboard (service role). */

import { getServiceClient, signedUrl, BUCKETS } from "@speedy/shared/supabase";

export const supa = () => getServiceClient();

// ─── Overview metrics ────────────────────────────────────────────────────────
export async function overview() {
  const client = supa();
  const [txns, users, deliveries, dueRenewals] = await Promise.all([
    client.from("transactions").select("source, amount_cents, status"),
    client.from("users").select("id", { count: "exact", head: true }),
    client.from("deliveries").select("status"),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .lte("renewal_due_at", new Date().toISOString())
      .is("renewal_reminded_at", null),
  ]);

  const rows = txns.data || [];
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (arr) => arr.reduce((n, r) => n + (r.amount_cents || 0), 0);
  const bySource = (s) => paid.filter((r) => r.source === s);

  const dels = deliveries.data || [];
  return {
    revenueCents: sum(paid),
    txnCount: paid.length,
    tagRevenueCents: sum(bySource("tag")),
    tagCount: bySource("tag").length,
    insRevenueCents: sum(bySource("insurance")),
    insCount: bySource("insurance").length,
    userCount: users.count || 0,
    deliveriesOpen: dels.filter((d) => d.status === "accepted").length,
    deliveriesDone: dels.filter((d) => d.status === "delivered").length,
    renewalsDue: dueRenewals.count || 0,
  };
}

export async function listTransactions(limit = 100) {
  const { data } = await supa()
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Drivers CRUD ────────────────────────────────────────────────────────────
export async function listDrivers() {
  const { data } = await supa().from("drivers").select("*").order("created_at", { ascending: true });
  return data || [];
}
export async function addDriver({ name, email, telegram_id }) {
  const { error } = await supa().from("drivers").insert({ name, email, telegram_id: String(telegram_id), active: true });
  if (error) throw new Error(error.message);
}
export async function setDriverActive(id, active) {
  await supa().from("drivers").update({ active }).eq("id", id);
}
export async function deleteDriver(id) {
  await supa().from("drivers").delete().eq("id", id);
}

// ─── Supervisors CRUD ────────────────────────────────────────────────────────
export async function listSupervisors() {
  const { data } = await supa().from("supervisors").select("*").order("created_at", { ascending: true });
  return data || [];
}
export async function addSupervisor({ name, telegram_id }) {
  const { error } = await supa().from("supervisors").insert({ name, telegram_id: String(telegram_id), active: true });
  if (error) throw new Error(error.message);
}
export async function setSupervisorActive(id, active) {
  await supa().from("supervisors").update({ active }).eq("id", id);
}
export async function deleteSupervisor(id) {
  await supa().from("supervisors").delete().eq("id", id);
}

// ─── Deliveries (+ receipt links, driver names) ──────────────────────────────
export async function listDeliveries(limit = 100) {
  const { data } = await supa()
    .from("deliveries")
    .select("*, drivers(name), orders(plate, first_name, last_name, state)")
    .order("assigned_at", { ascending: false })
    .limit(limit);
  const rows = data || [];
  for (const r of rows) {
    if (r.receipt_path) {
      try {
        r.receipt_url = await signedUrl(supa(), BUCKETS.receipts, r.receipt_path, 3600);
      } catch {
        r.receipt_url = null;
      }
    }
  }
  return rows;
}

// ─── Renewals ────────────────────────────────────────────────────────────────
export async function upcomingRenewals(limit = 100) {
  const { data } = await supa()
    .from("orders")
    .select("id, first_name, last_name, email, plate, paid_at, renewal_due_at, renewal_reminded_at, renewal_count")
    .eq("status", "paid")
    .not("renewal_due_at", "is", null)
    .order("renewal_due_at", { ascending: true })
    .limit(limit);
  return data || [];
}
