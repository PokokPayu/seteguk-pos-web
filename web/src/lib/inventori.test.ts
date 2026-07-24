import { describe, expect, it } from "vitest";
import { hitungHPP, hitungRataRata } from "./inventori";

describe("hitungRataRata", () => {
  it("contoh spec: stok 500 @Rp100, beli 1000 total Rp130.000 -> Rp120", () => {
    expect(hitungRataRata(500, 100, 1000, 130000)).toBe(120);
  });
  it("stok lama 0: rata = total / qty", () => {
    expect(hitungRataRata(0, 0, 200, 50000)).toBe(250);
  });
  it("stok lama minus diperlakukan 0", () => {
    expect(hitungRataRata(-50, 100, 200, 50000)).toBe(250);
  });
  it("membulatkan ke 4 desimal", () => {
    expect(hitungRataRata(3, 100, 7, 1000)).toBe(130);
    expect(hitungRataRata(1, 100, 2, 100)).toBe(66.6667);
  });
});

describe("hitungHPP", () => {
  it("menjumlahkan qty × harga rata-rata", () => {
    expect(
      hitungHPP([
        { qty: 18, hargaRata: 120 },
        { qty: 30, hargaRata: 50 },
      ])
    ).toBe(3660);
  });
  it("resep sebagian tetap dihitung dari bahan terdaftar", () => {
    expect(hitungHPP([{ qty: 15, hargaRata: 120 }])).toBe(1800);
  });
  it("tanpa baris -> null (belum ada resep)", () => {
    expect(hitungHPP([])).toBeNull();
  });
  it("membulatkan ke 2 desimal", () => {
    expect(hitungHPP([{ qty: 1, hargaRata: 0.333 }])).toBe(0.33);
  });
});
