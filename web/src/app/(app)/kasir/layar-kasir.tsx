"use client";

import { useState } from "react";
import { formatRupiah } from "@/lib/format";
import { totalKeranjang } from "@/lib/kasir";
import { catatPenjualan } from "./actions";
import { GridMenu } from "./grid-menu";
import { Keranjang } from "./keranjang";
import { SheetBayar } from "./sheet-bayar";
import { Riwayat } from "./riwayat";
import type { BarisKeranjang, ProdukKasir, TransaksiRiwayat } from "./jenis";

function varianTerlaris(produk: ProdukKasir[]): Record<string, string> {
  const awal: Record<string, string> = {};
  for (const p of produk) {
    const terlaris = [...p.varian].sort((a, b) => b.terjual - a.terjual)[0];
    if (terlaris) awal[p.id] = terlaris.id;
  }
  return awal;
}

export function LayarKasir({
  produk,
  riwayat,
  bolehVoid,
}: {
  produk: ProdukKasir[];
  riwayat: TransaksiRiwayat[];
  bolehVoid: boolean;
}) {
  const [tab, setTab] = useState<"jual" | "riwayat">("jual");
  const [keranjang, setKeranjang] = useState<BarisKeranjang[]>([]);
  const [varianDefault, setVarianDefault] = useState<Record<string, string>>(
    () => varianTerlaris(produk)
  );
  const [bukaBayar, setBukaBayar] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState("");
  const [stokMinus, setStokMinus] = useState<string[]>([]);

  function tambah(produkId: string, variantId: string) {
    const p = produk.find((x) => x.id === produkId);
    const v = p?.varian.find((x) => x.id === variantId);
    if (!p || !v) return;
    setKeranjang((k) => {
      const ada = k.find((b) => b.variantId === variantId);
      if (ada) {
        return k.map((b) =>
          b.variantId === variantId ? { ...b, qty: b.qty + 1 } : b
        );
      }
      return [
        ...k,
        {
          variantId,
          produkNama: p.nama,
          varianNama: v.nama,
          harga: v.harga,
          qty: 1,
        },
      ];
    });
  }

  function ubahQty(variantId: string, delta: number) {
    setKeranjang((k) =>
      k.flatMap((b) => {
        if (b.variantId !== variantId) return [b];
        const qty = b.qty + delta;
        return qty <= 0 ? [] : [{ ...b, qty }];
      })
    );
  }

  async function bayar(metode: "tunai" | "qris", uangDiterima: number | null) {
    const total = totalKeranjang(keranjang);
    setSibuk(true);
    const hasil = await catatPenjualan(
      metode,
      uangDiterima,
      keranjang.map((b) => ({ variantId: b.variantId, qty: b.qty }))
    );
    setSibuk(false);
    if (!hasil.ok) {
      setPesan(hasil.pesan);
      return;
    }
    setSukses(
      metode === "tunai" && uangDiterima !== null
        ? `Kembalian ${formatRupiah(uangDiterima - total)}`
        : "Pembayaran QRIS tercatat"
    );
    setStokMinus(hasil.stokMinus);
    setKeranjang([]);
    setPesan("");
    setBukaBayar(false);
  }

  return (
    <div>
      <div className="flex gap-2 border-b border-[var(--garis)]">
        {(["jual", "riwayat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${
              tab === t
                ? "border-[var(--hijau)] text-[var(--hijau-tua)]"
                : "border-transparent text-[var(--pudar)]"
            }`}
          >
            {t === "jual"
              ? "Jual"
              : `Riwayat (${riwayat.filter((r) => r.status === "selesai").length})`}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "riwayat" ? (
          <Riwayat transaksi={riwayat} bolehVoid={bolehVoid} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <GridMenu
              produk={produk}
              varianDefault={varianDefault}
              onTambah={tambah}
              onPilihVarian={(produkId, variantId) =>
                setVarianDefault((d) => ({ ...d, [produkId]: variantId }))
              }
            />
            <Keranjang
              isi={keranjang}
              onUbahQty={ubahQty}
              onBayar={() => {
                setPesan("");
                setBukaBayar(true);
              }}
            />
          </div>
        )}
      </div>

      <SheetBayar
        buka={bukaBayar}
        total={totalKeranjang(keranjang)}
        sibuk={sibuk}
        pesan={pesan}
        onTutup={() => {
          setBukaBayar(false);
          setPesan("");
        }}
        onBayar={bayar}
      />

      {sukses ? (
        <button
          type="button"
          onClick={() => setSukses("")}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--hijau-tua)]/95 p-6 text-center text-[#F6F3E6]"
        >
          <span className="display text-3xl">Transaksi tersimpan</span>
          <span className="uang mt-2 text-xl">{sukses}</span>
          {stokMinus.length > 0 ? (
            <span className="mt-4 max-w-sm rounded-lg bg-[var(--kunyit)] px-3 py-2 text-sm font-semibold text-[#241F15]">
              Stok minus: {stokMinus.join(", ")} — segera lakukan opname.
            </span>
          ) : null}
          <span className="mt-6 text-sm opacity-80">Ketuk untuk lanjut</span>
        </button>
      ) : null}
    </div>
  );
}
