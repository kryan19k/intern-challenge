import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { TxSecureRecord } from "./crypto";

/**
 * PostgreSQL-backed persistent storage via Supabase.
 *
 * Uses @supabase/supabase-js to connect to a hosted PostgreSQL database.
 * Works identically in local dev and Vercel serverless — no filesystem
 * access needed, no WASM, no native modules.
 *
 * Environment variables required:
 *   SUPABASE_URL        — your Supabase project URL
 *   SUPABASE_SERVICE_KEY — service_role key (server-side only, never expose)
 */

let supabase: SupabaseClient | null = null;

/**
 * Initialize the Supabase client. Must be called once before any
 * read/write operations (called from the server entry point).
 */
export async function initStore(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.warn("⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY not set — using in-memory fallback");
    return;
  }

  supabase = createClient(url, key);
}

// ── In-memory fallback (if Supabase is not configured) ───────────────
const fallbackStore = new Map<string, TxSecureRecord>();

/** Store a new encrypted record */
export async function saveRecord(record: TxSecureRecord): Promise<void> {
  if (!supabase) {
    fallbackStore.set(record.id, record);
    return;
  }

  const { error } = await supabase.from("transactions").insert({
    id: record.id,
    party_id: record.partyId,
    created_at: record.createdAt,
    payload_nonce: record.payload_nonce,
    payload_ct: record.payload_ct,
    payload_tag: record.payload_tag,
    dek_wrap_nonce: record.dek_wrap_nonce,
    dek_wrapped: record.dek_wrapped,
    dek_wrap_tag: record.dek_wrap_tag,
    alg: record.alg,
    mk_version: record.mk_version,
  });

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}

/** Retrieve a record by ID, or undefined if not found */
export async function getRecord(id: string): Promise<TxSecureRecord | undefined> {
  if (!supabase) {
    return fallbackStore.get(id);
  }

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    partyId: data.party_id,
    createdAt: data.created_at,
    payload_nonce: data.payload_nonce,
    payload_ct: data.payload_ct,
    payload_tag: data.payload_tag,
    dek_wrap_nonce: data.dek_wrap_nonce,
    dek_wrapped: data.dek_wrapped,
    dek_wrap_tag: data.dek_wrap_tag,
    alg: data.alg,
    mk_version: data.mk_version,
  };
}

/** Get the total number of stored records */
export async function getRecordCount(): Promise<number> {
  if (!supabase) {
    return fallbackStore.size;
  }

  const { count, error } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true });

  if (error) return 0;
  return count ?? 0;
}
