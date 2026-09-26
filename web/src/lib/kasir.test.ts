import { describe, expect, it } from "vitest";
import {
  awalHariJakarta,
  hitungKembalian,
  saringMenu,
  tanggalJakarta,
  totalKeranjang,
} from "./kasir";

describe("hitungKembalian", () => {
  it("uang pas menghasilkan nol", () => {
    expect(hitungKembalian(15000, 15000)).toBe(0);
  });
  it("uang lebih menghasilkan selisih", () => {
    expect(hitungKembalian(15000, 20000)).toBe(5000);
  });
  it("uang kurang menghasilkan negatif", () => {
    expect(hitungKembalian(15000, 10000)).toBe(-5000);
  });
});

describe("totalKeranjang", () => {
  it("keranjang kosong bernilai nol", () => {
    expect(totalKeranjang([])).toBe(0);
  });
  it("menjumlahkan qty x harga", () => {
    expect(
      totalKeranjang([
        { qty: 2, harga: 8000 },
        { qty: 1, harga: 15000 },
      ])
    ).toBe(31000);
  });
});

describe("tanggalJakarta", () => {
  it("siang UTC tetap tanggal yang sama", () => {
    expect(tanggalJakarta(new Date("2026-07-24T05:00:00Z"))).toBe("2026-07-24");
  });
  it("malam UTC sudah hari berikutnya di WIB", () => {
    // 20:00 UTC = 03:00 WIB keesokan harinya
    expect(tanggalJakarta(new Date("2026-07-24T20:00:00Z"))).toBe("2026-07-25");
  });
  it("tepat tengah malam WIB", () => {
    // 17:00 UTC = 00:00 WIB keesokan harinya
    expect(tanggalJakarta(new Date("2026-07-24T17:00:00Z"))).toBe("2026-07-25");
  });
});

describe("awalHariJakarta", () => {
  it("mengembalikan awal hari WIB dengan offset +07:00", () => {
    expect(awalHariJakarta(new Date("2026-07-24T20:00:00Z"))).toBe(
      "2026-07-25T00:00:00+07:00"
    );
  });
});

describe("saringMenu", () => {
  const menu = [
    { nama: "Kopi Susu", kategori: "Kopi", varian: [{ nama: "Es" }, { nama: "Panas" }] },
    { nama: "Americano", kategori: "Kopi", varian: [{ nama: "Es" }] },
    { nama: "Teh Tarik", kategori: "Non-kopi", varian: [{ nama: "Panas" }] },
    { nama: "Roti Bakar", kategori: "Makanan", varian: [{ nama: "Coklat" }] },
  ];
  const nama = (hasil: { nama: string }[]) => hasil.map((m) => m.nama);

  it("tanpa kata kunci hanya menyaring kategori", () => {
    expect(nama(saringMenu(menu, "Semua", ""))).toHaveLength(4);
    expect(nama(saringMenu(menu, "Kopi", "   "))).toEqual(["Kopi Susu", "Americano"]);
  });

  it("mencocokkan nama menu tanpa peduli huruf besar/kecil", () => {
    expect(nama(saringMenu(menu, "Semua", "TEH"))).toEqual(["Teh Tarik"]);
  });

  it("mencocokkan nama varian", () => {
    expect(nama(saringMenu(menu, "Semua", "coklat"))).toEqual(["Roti Bakar"]);
  });

  it("setiap kata harus ada, di nama menu atau variannya", () => {
    expect(nama(saringMenu(menu, "Semua", "kopi es"))).toEqual(["Kopi Susu"]);
    expect(nama(saringMenu(menu, "Semua", "es panas"))).toEqual(["Kopi Susu"]);
  });

  it("kata kunci digabung dengan kategori terpilih", () => {
    expect(nama(saringMenu(menu, "Non-kopi", "panas"))).toEqual(["Teh Tarik"]);
    expect(nama(saringMenu(menu, "Makanan", "kopi"))).toEqual([]);
  });
});
