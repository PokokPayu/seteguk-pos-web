import Image from "next/image";
import { redirect } from "next/navigation";
import { getPengguna } from "@/lib/auth";
import { filterNav } from "@/lib/nav";
import { Navigasi } from "@/components/navigasi";
import { ToastProvider } from "@/components/toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pengguna = await getPengguna();
  if (!pengguna) redirect("/keluar");
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Navigasi items={filterNav(pengguna.izin)} nama={pengguna.nama} />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar mobile */}
          <header className="sticky top-0 z-40 flex items-center justify-between bg-[var(--hijau)] px-4 py-3 text-[#F2EEDF] [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_5px,transparent_5px_11px)] desktop:hidden">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-seteguk.png"
                alt="Logo Seteguk"
                width={30}
                height={30}
                className="rounded-md"
              />
              <div>
                <p className="text-[9px] uppercase tracking-[0.24em] text-[#BFD4C4]">
                  Warung Kopi
                </p>
                <p className="display text-xl leading-none">SETEGUK</p>
              </div>
            </div>
            <p className="text-right text-xs text-[#CBDCCF]">
              <b className="block text-[13px] text-white">{pengguna.nama}</b>
              Seteguk POS
            </p>
          </header>
          <main className="min-w-0 flex-1 p-4 pb-24 desktop:p-7 desktop:pb-7">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
