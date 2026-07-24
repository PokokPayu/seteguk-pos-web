"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { voidPenjualan } from "./actions";
import type { TransaksiRiwayat } from "./jenis";

function jamWib(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function totalTransaksi(t: TransaksiRiwayat): number {
  return t.items.reduce((s, i) => s + i.qty * i.harga, 0);
}

export function Riwayat({
  transaksi,
  bolehVoid,
}: {
  transaksi: TransaksiRiwayat[];
  bolehVoid: boolean;
}) {
  const [sibuk, setSibuk] = useState("");
  const [pesan, setPesan] = useState("");

  const selesai = transaksi.filter((t) => t.status === "selesai");
  const omzet = selesai.reduce((s, t) => s + totalTransaksi(t), 0);

  async function batalkan(id: string) {
    if (
      !confirm("Batalkan transaksi ini? Stok bahan akan dikembalikan.")
    ) {
      return;
    }
    setSibuk(id);
    const hasil = await voidPenjualan(id);
    setSibuk("");
    setPesan(hasil.ok ? "" : hasil.pesan);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2 text-sm">
        <span>
          <b>{selesai.length}</b> transaksi selesai
        </span>
        <span>
          Omzet hari ini <b className="uang">{formatRupiah(omzet)}</b>
        </span>
      </div>

      {pesan ? (
        <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[var(--merah)]">
          {pesan}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {transaksi.map((t) => (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3 text-sm ${
              t.status === "void" ? "opacity-60" : ""
            }`}
          >
            <span className="uang w-12 text-[var(--pudar)]">
              {jamWib(t.waktu)}
            </span>
            <span className="min-w-0 flex-1">
              {t.items.map((i) => `${i.qty}× ${i.nama_snapshot}`).join(", ")}
              <br />
              <span className="text-xs uppercase tracking-wide text-[var(--pudar)]">
                {t.metode}
                {t.status === "void" ? " · dibatalkan" : ""}
              </span>
            </span>
            <b className="uang">{formatRupiah(totalTransaksi(t))}</b>
            {bolehVoid && t.status === "selesai" ? (
              <button
                type="button"
                disabled={sibuk === t.id}
                onClick={() => batalkan(t.id)}
                className="rounded-lg border border-[var(--garis-kuat)] px-2.5 py-1 text-xs font-semibold text-[var(--merah)] disabled:opacity-50"
              >
                {sibuk === t.id ? "…" : "Void"}
              </button>
            ) : null}
          </li>
        ))}
        {transaksi.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-center text-sm text-[var(--pudar)]">
            Belum ada transaksi hari ini.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
