"use client";

import { useRouter } from "next/navigation";

export function PilihRentang({
  dari,
  sampai,
  hariIni,
}: {
  dari: string;
  sampai: string;
  hariIni: string;
}) {
  const router = useRouter();

  function pergi(d: string, s: string) {
    router.push(`/laporan?dari=${d}&sampai=${s}`);
  }
  function mundur(hari: number): string {
    const t = new Date(`${hariIni}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - hari);
    return t.toISOString().slice(0, 10);
  }

  const preset: { label: string; dari: string; sampai: string }[] = [
    { label: "Hari ini", dari: hariIni, sampai: hariIni },
    { label: "7 hari", dari: mundur(6), sampai: hariIni },
    { label: "Bulan ini", dari: `${hariIni.slice(0, 7)}-01`, sampai: hariIni },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {preset.map((p) => {
        const aktif = p.dari === dari && p.sampai === sampai;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => pergi(p.dari, p.sampai)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              aktif
                ? "border-[var(--hijau)] bg-[var(--hijau)] text-[#F6F3E6]"
                : "border-[var(--garis-kuat)] bg-[var(--enamel)] text-[var(--pudar)]"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <input
        type="date"
        value={dari}
        max={sampai}
        onChange={(e) => pergi(e.target.value, sampai)}
        aria-label="Tanggal mulai"
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-sm"
      />
      <span className="text-sm text-[var(--pudar)]">s/d</span>
      <input
        type="date"
        value={sampai}
        min={dari}
        max={hariIni}
        onChange={(e) => pergi(dari, e.target.value)}
        aria-label="Tanggal akhir"
        className="rounded-lg border border-[var(--garis-kuat)] bg-white px-2 py-1 text-sm"
      />
    </div>
  );
}
