/**
 * Supabase client factory — one place every app/bot imports from.
 *
 *  - getServiceClient(): service-role client for servers/bots. Bypasses RLS.
 *    NEVER expose the service key to a browser bundle.
 *  - getAnonClient(): anon client for browser / public reads.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 */

import { createClient } from "@supabase/supabase-js";

let _service = null;
let _anon = null;

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[supabase] missing env ${name}`);
  return v;
}

export function getServiceClient() {
  if (_service) return _service;
  _service = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _service;
}

export function getAnonClient() {
  if (_anon) return _anon;
  _anon = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _anon;
}

/** Storage bucket names used across the system. */
export const BUCKETS = {
  documents: "order-documents", // generated tag/insurance PDFs
  receipts: "delivery-receipts", // driver-submitted delivery proof
};

/**
 * Upload PDF/image bytes and return the storage path. Buckets are private;
 * read them back with createSignedUrl().
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} bucket
 * @param {string} path
 * @param {Uint8Array|Buffer} bytes
 * @param {string} [contentType]
 */
export async function uploadBytes(client, bucket, path, bytes, contentType = "application/pdf") {
  const { error } = await client.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`[supabase] upload ${bucket}/${path}: ${error.message}`);
  return path;
}

/**
 * @returns {Promise<string>} a time-limited signed URL for a stored object.
 */
export async function signedUrl(client, bucket, path, expiresInSeconds = 60 * 60 * 24 * 7) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(`[supabase] signedUrl ${bucket}/${path}: ${error.message}`);
  return data.signedUrl;
}
