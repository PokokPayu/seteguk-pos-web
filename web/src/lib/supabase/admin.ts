import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Klien Supabase dengan service role key — MENEMBUS SELURUH RLS.
 * Impor "server-only" di atas membuat build GAGAL bila modul ini sampai
 * terimpor dari komponen klien. Hanya boleh dipakai di server action yang
 * sudah memeriksa izin lebih dulu.
 */
export function buatClientAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kunci) return null;
  return createClient(url, kunci, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
