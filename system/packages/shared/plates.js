/**
 * Plate allocation, Supabase-backed (replaces v2's settings.json counters).
 *
 * Allocation is atomic via the `allocate_plate(p_is_nj boolean)` Postgres
 * function (see migrations) so concurrent serverless invocations never mint
 * duplicate plates. Format helpers here are for admin *previews* only.
 *
 *   NJ:     prefix letter (H) + zero-padded digits      → "H150706"
 *   non-NJ: zero-padded digits + suffix letter (V)       → "150706V"
 */

/** Preview only — the real number comes from the atomic RPC. */
export function formatNjPlate(settings) {
  const prefix = settings.nj_plate_prefix ?? "H";
  const digits = settings.nj_plate_digits ?? 6;
  const n = settings.nj_plate_next_number ?? 150706;
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

/** Preview only — the real number comes from the atomic RPC. */
export function formatNonNjPlate(settings) {
  const suffix = settings.non_nj_plate_suffix ?? "V";
  const digits = settings.non_nj_plate_digits ?? 6;
  const n = settings.non_nj_plate_next_number ?? 150706;
  return `${String(n).padStart(digits, "0")}${suffix}`;
}

/**
 * Atomically allocate + persist the next plate for a buyer's state.
 * Pass this (bound to a client) as `allocatePlate` to generateDocumentsForOrder.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} state
 * @returns {Promise<{plate:string}>}
 */
export async function allocateNextPlate(client, state) {
  const isNj = String(state || "").toUpperCase() === "NJ";
  const { data, error } = await client.rpc("allocate_plate", { p_is_nj: isNj });
  if (error) throw new Error(`[plates] allocate_plate failed: ${error.message}`);
  return { plate: data };
}

/** Convenience: returns an allocator bound to a client for a single call. */
export function makeAllocator(client) {
  return (state) => allocateNextPlate(client, state);
}

/** Read the settings row (for admin preview / display). */
export async function loadSettings(client) {
  const { data, error } = await client.from("settings").select("*").eq("id", 1).single();
  if (error) throw new Error(`[plates] loadSettings: ${error.message}`);
  return data;
}
