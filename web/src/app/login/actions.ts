"use server";

import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";

export async function masuk(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await buatClientServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?gagal=1");
  }
  redirect("/");
}
