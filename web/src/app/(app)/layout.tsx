import { redirect } from "next/navigation";
import { getPengguna } from "@/lib/auth";
import { filterNav } from "@/lib/nav";
import { Navigasi } from "@/components/navigasi";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <Navigasi items={filterNav(pengguna.izin)} nama={pengguna.nama} />
      <main className="min-w-0 flex-1 p-4 pb-24 md:p-7 md:pb-7">{children}</main>
    </div>
  );
}
