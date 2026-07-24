"use client";

import { useRouter } from "next/navigation";

export function PilihBulan({ bulan }: { bulan: string }) {
  const router = useRouter();
  return (
    <label className="text-sm font-semibold text-[var(--pudar)]">
      Bulan{" "}
      <input
        type="month"
        value={bulan}
        onChange={(e) => router.push(`/pengeluaran?bulan=${e.target.value}`)}
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-[var(--tinta)]"
      />
    </label>
  );
}
