/** Supabase client singleton: sole supabase-js touchpoint (ADR-0010).
 *
 * Config comes from public Expo config (URL + anon key); RLS — not
 * secrecy — is the protection. Auth persists in AsyncStorage with silent
 * anonymous provision at first run (no login screen; upgradeable later).
 * supabase-js is imported statically: its dual CJS/ESM exports map
 * (react-native→index.cjs vs import→index.mjs) made Metro's async-import
 * path ask for a file the module map never registered ("Requiring unknown
 * module"). A static import resolves once at build time. The native
 * async-storage import stays lazy so plain-Node tests never load it;
 * node never touches this file anyway (the store seam takes a fake).
 */

import { createClient } from "@supabase/supabase-js";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { SupabaseChatClient } from "./chat/supabase-store.ts";
import { wrapSupabaseClient } from "./chat/supabase-store.ts";

/** PostgREST builder subset the chat adapter needs (thenable at await). */
interface SupabaseTableBuilder {
  select(columns: string): SupabaseTableBuilder;
  insert(row: Record<string, unknown>): SupabaseTableBuilder;
  update(row: Record<string, unknown>): SupabaseTableBuilder;
  upsert(row: Record<string, unknown>): SupabaseTableBuilder;
  delete(): SupabaseTableBuilder;
}

type SupabaseInstance = {
  auth: {
    getSession(): Promise<{ data: { session: unknown } }>;
    signInAnonymously(): Promise<{ error: unknown }>;
  };
  from(table: string): SupabaseTableBuilder;
};

let client: SupabaseInstance | null | undefined;

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace itself.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** Lazily built client; null when URL/key are not configured.
 * Expo inlines EXPO_PUBLIC_* at bundle time, so plain process.env works
 * in-app and is simply undefined under node --test (→ null client). */
export async function getSupabase(): Promise<SupabaseInstance | null> {
  if (client !== undefined) return client;
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"];
  if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") {
    client = null;
    return client;
  }
  // SAFETY: structural use only (auth + from); the SDK's deep generics
  // stay behind this boundary so app code never names them.
  client = createClient(url, key, {
    auth: {
      storage: await rnStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }) as unknown as SupabaseInstance;
  return client;
}

/** Current user id for RLS writes; null when signed out/unconfigured. */
export async function getUserId(): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    const user = (data.session as { user?: { id?: unknown } } | null)?.user;
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

/** Silent anonymous provision (ADR-0010): idempotent, upgradeable later. */
export async function ensureAnonymous(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return false;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) return true;
    const { error } = await sb.auth.signInAnonymously();
    return !error;
  } catch {
    return false;
  }
}

/** Chat-shaped seam over the live client (adapter, never a second client). */
export async function getChatClient(): Promise<SupabaseChatClient | null> {
  const sb = await getSupabase();
  // SAFETY: wrapSupabaseClient only narrows the builder generics into the
  // structural chain; {data,error} thenables pass through untouched.
  return sb ? wrapSupabaseClient(sb) : null;
}
