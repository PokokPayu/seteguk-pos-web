"use server";

import { redirect } from "next/navigation";
import { buatClientServer } from "./supabase/server";

// Aksi logout untuk tombol "Keluar". Server action (POST) supaya tidak
// terpicu prefetch seperti link GET; akhiri sesi lalu ke halaman masuk bersih.
export async function keluar() {
  const supabase = await buatClientServer();
  await supabase.auth.signOut();
  redirect("/login");
}
