"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Lembar } from "@/components/lembar";
import { useToast } from "@/components/toast";
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
  bolehSembunyi,
}: {
  transaksi: TransaksiRiwayat[];
  bolehVoid: boolean;
  /** Admin: boleh void tersembunyi, dan melihat transaksi yang disembunyikan. */
  bolehSembunyi: boolean;
}) {
  const toast = useToast();
  const [konfirm, setKonfirm] = useState<TransaksiRiwayat | null>(null);
  const [, startTransition] = useTransition();
  // Void ditampilkan optimistis: baris langsung tercoret sementara server
  // memproses. Bila gagal, state kembali ke asal saat transisi selesai.
  const [optimis, tandaiVoid] = useOptimistic(
    transaksi,
    (state, aksi: { id: string; sembunyi: boolean }) =>
      state.map((t) =>
        t.id === aksi.id
          ? { ...t, status: "void" as const, tersembunyi: aksi.sembunyi }
          : t
      )
  );

  const selesai = optimis.filter((t) => t.status === "selesai");
  const omzet = selesai.reduce((s, t) => s + totalTransaksi(t), 0);

  function konfirmasiVoid(sembunyi: boolean) {
    if (!konfirm) return;
    const id = konfirm.id;
    setKonfirm(null);
    startTransition(async () => {
      tandaiVoid({ id, sembunyi });
      const hasil = await voidPenjualan(id, sembunyi);
      toast(
        !hasil.ok
          ? hasil.pesan
          : sembunyi
            ? "Transaksi dibatalkan & disembunyikan dari pegawai"
            : "Transaksi dibatalkan — stok dikembalikan"
      );
    });
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

      <ul className="mt-3 space-y-2">
        {optimis.map((t) => (
          <li
            key={t.id}
            className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3 text-sm ${
              t.status === "void" ? "opacity-60" : ""
            }`}
          >
            <span className="uang w-12 text-[var(--pudar)]">
              {jamWib(t.waktu)}
            </span>
            <span
              className={`min-w-0 flex-1 ${
                t.status === "void" ? "line-through" : ""
              }`}
            >
              {t.items.map((i) => `${i.qty}× ${i.nama_snapshot}`).join(", ")}
              <br />
              <span className="text-xs uppercase tracking-wide text-[var(--pudar)] no-underline">
                {t.metode}
                {t.status === "void" ? " · dibatalkan" : ""}
              </span>
              {t.tersembunyi ? (
                <span className="ml-1.5 inline-block rounded-full bg-[var(--kunyit)] px-2 py-px text-[10px] font-bold uppercase tracking-wide text-[#241F15] no-underline">
                  Disembunyikan
                </span>
              ) : null}
            </span>
            <b className={`uang ${t.status === "void" ? "line-through" : ""}`}>
              {formatRupiah(totalTransaksi(t))}
            </b>
            {bolehVoid && t.status === "selesai" ? (
              <button
                type="button"
                onClick={() => setKonfirm(t)}
                className="rounded-lg border border-[var(--garis-kuat)] px-2.5 py-1 text-xs font-semibold text-[var(--merah)] hover:bg-[var(--merah-bg)]"
              >
                Void
              </button>
            ) : null}
          </li>
        ))}
        {optimis.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--garis-kuat)] bg-[var(--enamel)] p-6 text-center text-sm text-[var(--pudar)]">
            Belum ada transaksi hari ini.
          </li>
        ) : null}
      </ul>

      {konfirm ? (
        <Lembar
          buka
          judul="Batalkan transaksi?"
          onTutup={() => setKonfirm(null)}
        >
          <p className="text-sm">
            Transaksi pukul <b className="uang">{jamWib(konfirm.waktu)}</b>{" "}
            senilai{" "}
            <b className="uang">{formatRupiah(totalTransaksi(konfirm))}</b> akan
            dibatalkan dan stok bahan dikembalikan sesuai resep. Tindakan ini
            tidak bisa diurungkan.
          </p>
          {bolehSembunyi ? (
            <>
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--pudar)]">
                <li>
                  <b className="text-[var(--tinta)]">Void biasa</b> — tetap
                  tampil tercoret di riwayat pegawai.
                </li>
                <li>
                  <b className="text-[var(--tinta)]">Void & sembunyikan</b> —
                  hilang dari riwayat, omzet, dan tunai sistem di layar
                  pegawai. Hanya admin yang masih melihatnya.
                </li>
              </ul>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={() => konfirmasiVoid(false)}
                  className="rounded-lg bg-[var(--merah)] px-4 py-3 font-bold text-white active:scale-[.99]"
                >
                  Void biasa (tercoret)
                </button>
                <button
                  type="button"
                  onClick={() => konfirmasiVoid(true)}
                  className="rounded-lg border-2 border-[var(--merah)] px-4 py-3 font-bold text-[var(--merah)] hover:bg-[var(--merah-bg)] active:scale-[.99]"
                >
                  Void & sembunyikan
                </button>
                <button
                  type="button"
                  onClick={() => setKonfirm(null)}
                  className="rounded-lg border border-[var(--garis-kuat)] px-4 py-3 font-semibold text-[var(--pudar)]"
                >
                  Kembali
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKonfirm(null)}
                className="rounded-lg border border-[var(--garis-kuat)] px-4 py-3 font-semibold text-[var(--pudar)]"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => konfirmasiVoid(false)}
                className="rounded-lg bg-[var(--merah)] px-4 py-3 font-bold text-white active:scale-[.99]"
              >
                Ya, batalkan
              </button>
            </div>
          )}
        </Lembar>
      ) : null}
    </div>
  );
}
