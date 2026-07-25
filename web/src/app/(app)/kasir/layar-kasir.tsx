"use client";

import { useMemo, useState } from "react";
import { formatRupiah } from "@/lib/format";
import { totalKeranjang } from "@/lib/kasir";
import { catatPenjualan } from "./actions";
import { GridMenu } from "./grid-menu";
import { Keranjang } from "./keranjang";
import { SheetBayar } from "./sheet-bayar";
import { SheetTutupKasir } from "./sheet-tutup-kasir";
import { Riwayat } from "./riwayat";
import { Lembar } from "@/components/lembar";
import { useToast } from "@/components/toast";
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
  tunaiSistem,
  sudahDitutup,
}: {
  produk: ProdukKasir[];
  riwayat: TransaksiRiwayat[];
  bolehVoid: boolean;
  tunaiSistem: number;
  sudahDitutup: { tunai_fisik: number; selisih: number } | null;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<"jual" | "riwayat">("jual");
  const [keranjang, setKeranjang] = useState<BarisKeranjang[]>([]);
  const [varianDefault, setVarianDefault] = useState<Record<string, string>>(
    () => varianTerlaris(produk)
  );
  const [bukaBayar, setBukaBayar] = useState(false);
  const [keranjangBuka, setKeranjangBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState("");
  const [stokMinus, setStokMinus] = useState<string[]>([]);

  // Urutan tile dibekukan pada saat pertama dimuat: revalidatePath setelah
  // tiap transaksi menyegarkan `produk` (peringkat_varian re-ranking), tapi
  // tile tidak boleh bergeser posisi selagi kasir bekerja (bahaya salah tap
  // di layar sentuh). Data (harga, terjual, dsb) tetap ikut refresh.
  const [urutanAwal] = useState(() => produk.map((p) => p.id));
  const produkTerurut = useMemo(() => {
    const posisi = new Map(urutanAwal.map((id, i) => [id, i]));
    return [...produk].sort(
      (a, b) =>
        (posisi.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (posisi.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [produk, urutanAwal]);

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
    toast(`${p.nama} masuk pesanan`);
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
        ? `Kembalian ${formatRupiah(hasil.kembalian)}`
        : "Pembayaran QRIS tercatat"
    );
    setStokMinus(hasil.stokMinus);
    setKeranjang([]);
    setPesan("");
    setBukaBayar(false);
    setKeranjangBuka(false);
  }

  const selesaiCount = riwayat.filter((r) => r.status === "selesai").length;
  const jumlahItem = keranjang.reduce((s, b) => s + b.qty, 0);

  function mulaiBayar() {
    setPesan("");
    setBukaBayar(true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Mode kasir"
          className="inline-flex gap-0.5 rounded-full border-[1.5px] border-[var(--garis-kuat)] bg-[var(--enamel)] p-[3px]"
        >
          {(["jual", "riwayat"] as const).map((t) => {
            const aktif = tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={aktif}
                onClick={() => setTab(t)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  aktif
                    ? "bg-[var(--hijau)] text-[#F6F3E6]"
                    : "text-[var(--pudar)]"
                }`}
              >
                {t === "jual" ? (
                  "Jual"
                ) : (
                  <>
                    Riwayat{" "}
                    <span
                      className={`ml-0.5 inline-block min-w-5 rounded-full px-1.5 text-center text-[11px] ${
                        aktif
                          ? "bg-white/20"
                          : "bg-[#EDE7D6] text-[var(--tinta)]"
                      }`}
                    >
                      {selesaiCount}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <SheetTutupKasir tunaiSistem={tunaiSistem} sudahDitutup={sudahDitutup} />
      </div>

      <div className="mt-4">
        {tab === "riwayat" ? (
          <Riwayat transaksi={riwayat} bolehVoid={bolehVoid} />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <GridMenu
                produk={produkTerurut}
                varianDefault={varianDefault}
                onTambah={tambah}
                onPilihVarian={(produkId, variantId) =>
                  setVarianDefault((d) => ({ ...d, [produkId]: variantId }))
                }
              />
              <div className="hidden lg:block">
                <Keranjang
                  isi={keranjang}
                  onUbahQty={ubahQty}
                  onBayar={mulaiBayar}
                />
              </div>
            </div>

            {/* Bilah keranjang mengambang — mobile */}
            {jumlahItem > 0 ? (
              <button
                type="button"
                data-cart-bar
                onClick={() => setKeranjangBuka(true)}
                className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex items-center justify-between gap-3 rounded-xl bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] shadow-[0_6px_18px_rgba(15,61,46,.35)] lg:hidden"
              >
                <span>{jumlahItem} item — lihat pesanan</span>
                <span className="uang">
                  {formatRupiah(totalKeranjang(keranjang))}
                </span>
              </button>
            ) : null}

            {/* Lembar keranjang — mobile */}
            {keranjangBuka ? (
              <Lembar
                buka
                judul={`Pesanan · ${jumlahItem} item`}
                onTutup={() => setKeranjangBuka(false)}
              >
                <Keranjang
                  tampilan="lembar"
                  isi={keranjang}
                  onUbahQty={ubahQty}
                  onBayar={() => {
                    setKeranjangBuka(false);
                    mulaiBayar();
                  }}
                />
              </Lembar>
            ) : null}
          </>
        )}
      </div>

      {bukaBayar ? (
        <SheetBayar
          buka
          total={totalKeranjang(keranjang)}
          sibuk={sibuk}
          pesan={pesan}
          onTutup={() => {
            setBukaBayar(false);
            setPesan("");
          }}
          onBayar={bayar}
        />
      ) : null}

      {sukses ? (
        <button
          type="button"
          onClick={() => setSukses("")}
          className="fixed inset-0 z-[90] grid place-items-center bg-[var(--hijau)] p-6 text-center text-[#F2EEDF] [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.05)_0_6px,transparent_6px_13px)]"
        >
          <span className="block">
            <span className="animate-stempel display inline-block rounded-[10px] border-4 border-[#F6F3E6] px-8 py-1.5 text-5xl text-[#F6F3E6]">
              Lunas
            </span>
            <span className="mt-6 block text-sm text-[#CBDCCF]">{sukses}</span>
            {stokMinus.length > 0 ? (
              <span className="mx-auto mt-4 block max-w-sm rounded-lg bg-[var(--kunyit)] px-3 py-2 text-sm font-semibold text-[#241F15]">
                Stok minus: {stokMinus.join(", ")} — segera lakukan opname.
              </span>
            ) : null}
            <span className="mt-8 block text-xs uppercase tracking-[0.14em] text-[#A9C4AF]">
              Ketuk di mana saja untuk lanjut
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
