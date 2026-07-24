import { wajibIzin } from "@/lib/auth";

export default async function HalamanKasir() {
  await wajibIzin("kasir");
  return (
    <div>
      <h1 className="display text-2xl">Kasir</h1>
      <p className="mt-2 rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-sm text-[var(--pudar)]">
        Modul ini dibangun di rencana berikutnya.
      </p>
    </div>
  );
}
