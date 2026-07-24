import { redirect } from "next/navigation";
import { buatClientServer } from "@/lib/supabase/server";

// Mengakhiri sesi lalu kembali ke halaman masuk. Dipakai saat pengguna
// nonaktif masih memegang sesi valid — tanpa ini proxy dan layout saling
// melempar (redirect loop).
export async function GET() {
  const supabase = await buatClientServer();
  await supabase.auth.signOut();
  redirect("/login?nonaktif=1");
}
