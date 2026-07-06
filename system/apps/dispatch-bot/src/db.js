/**
 * Supabase data access for the dispatch bot. Uses the service-role client
 * (bypasses RLS). All the row-shape ↔ camelCase mapping lives here.
 */

import { getServiceClient, uploadBytes, signedUrl, BUCKETS } from "@speedy/shared/supabase";

export const supa = () => getServiceClient();

export async function getOrder(orderId) {
  const { data, error } = await supa().from("orders").select("*").eq("id", orderId).single();
  if (error) throw new Error(`[db] getOrder ${orderId}: ${error.message}`);
  return data;
}

export async function updateOrder(orderId, patch) {
  const { data, error } = await supa()
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .single();
  if (error) throw new Error(`[db] updateOrder ${orderId}: ${error.message}`);
  return data;
}

export async function insertOrder(row) {
  const { data, error } = await supa().from("orders").insert(row).select("*").single();
  if (error) throw new Error(`[db] insertOrder: ${error.message}`);
  return data;
}

export async function activeDrivers() {
  const { data, error } = await supa()
    .from("drivers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[db] activeDrivers: ${error.message}`);
  return data || [];
}

export async function driverByTelegramId(tgId) {
  const { data } = await supa()
    .from("drivers")
    .select("*")
    .eq("telegram_id", String(tgId))
    .maybeSingle();
  return data || null;
}

export async function driverById(id) {
  const { data } = await supa().from("drivers").select("*").eq("id", id).maybeSingle();
  return data || null;
}

export async function activeSupervisors() {
  const { data, error } = await supa().from("supervisors").select("*").eq("active", true);
  if (error) throw new Error(`[db] activeSupervisors: ${error.message}`);
  return data || [];
}

export async function isKnownSupervisor(tgId) {
  const { data } = await supa()
    .from("supervisors")
    .select("id")
    .eq("telegram_id", String(tgId))
    .maybeSingle();
  return Boolean(data);
}

/**
 * Atomic first-to-accept-wins. Returns the updated order iff THIS driver won
 * (the row was still unclaimed); null if someone already accepted.
 */
export async function tryAcceptOrder(orderId, driver) {
  const { data, error } = await supa()
    .from("orders")
    .update({
      telegram_accepted_by: driver.telegram_id,
      telegram_accepted_driver_id: driver.id,
      telegram_accepted_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("telegram_accepted_by", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] tryAcceptOrder ${orderId}: ${error.message}`);
  return data || null;
}

export async function createDelivery({ orderId, driverId, status = "accepted" }) {
  const now = new Date().toISOString();
  const row = {
    order_id: orderId,
    driver_id: driverId,
    status,
    accepted_at: status === "accepted" ? now : null,
  };
  const { data, error } = await supa().from("deliveries").insert(row).select("*").single();
  if (error) throw new Error(`[db] createDelivery: ${error.message}`);
  return data;
}

export async function markDelivered(deliveryId, receiptPath) {
  const { error } = await supa()
    .from("deliveries")
    .update({ status: "delivered", delivered_at: new Date().toISOString(), receipt_path: receiptPath })
    .eq("id", deliveryId);
  if (error) throw new Error(`[db] markDelivered ${deliveryId}: ${error.message}`);
}

export async function latestDeliveryForDriver(driverId) {
  const { data } = await supa()
    .from("deliveries")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ─── storage helpers ─────────────────────────────────────────────────────────
export async function storeDocument(orderId, name, bytes) {
  return uploadBytes(supa(), BUCKETS.documents, `${orderId}/${name}`, bytes);
}

export async function storeReceipt(orderId, name, bytes, contentType) {
  return uploadBytes(supa(), BUCKETS.receipts, `${orderId}/${name}`, bytes, contentType);
}

export async function documentUrl(path) {
  return signedUrl(supa(), BUCKETS.documents, path);
}

export async function downloadDocument(path) {
  const { data, error } = await supa().storage.from(BUCKETS.documents).download(path);
  if (error) throw new Error(`[db] downloadDocument ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
