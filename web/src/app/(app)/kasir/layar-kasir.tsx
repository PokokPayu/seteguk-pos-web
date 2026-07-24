"use client";

import { useState } from "react";
import { GridMenu } from "./grid-menu";
import { Keranjang } from "./keranjang";
import type { BarisKeranjang, ProdukKasir } from "./jenis";

function varianTerlaris(produk: ProdukKasir[]): Record<string, string> {
  const awal: Record<string, string> = {};
  for (const p of produk) {
    const terlaris = [...p.varian].sort((a, b) => b.terjual - a.terjual)[0];
    if (terlaris) awal[p.id] = terlaris.id;
  }
  return awal;
}

export function LayarKasir({ produk }: { produk: ProdukKasir[] }) {
  const [keranjang, setKeranjang] = useState<BarisKeranjang[]>([]);
  // Default varian per produk: mulai dari varian terlaris, lalu mengikuti
  // pilihan terakhir kasir selama sesi ini.
  const [varianDefault, setVarianDefault] = useState<Record<string, string>>(
    () => varianTerlaris(produk)
  );

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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <GridMenu
        produk={produk}
        varianDefault={varianDefault}
        onTambah={tambah}
        onPilihVarian={(produkId, variantId) =>
          setVarianDefault((d) => ({ ...d, [produkId]: variantId }))
        }
      />
      <Keranjang isi={keranjang} onUbahQty={ubahQty} />
    </div>
  );
}
