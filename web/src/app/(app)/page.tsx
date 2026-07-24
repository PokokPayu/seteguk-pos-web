import { getPengguna } from "@/lib/auth";
import { filterNav } from "@/lib/nav";
import Link from "next/link";

export default async function Beranda() {
  const pengguna = (await getPengguna())!;
  const nav = filterNav(pengguna.izin);
  return (
    <div>
      <h1 className="display text-2xl">Halo, {pengguna.nama}</h1>
      <p className="mt-1 text-sm text-[var(--pudar)]">
        Pilih modul untuk mulai bekerja.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 md:max-w-lg">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4 font-bold text-[var(--hijau-tua)] hover:border-[var(--hijau)]"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
