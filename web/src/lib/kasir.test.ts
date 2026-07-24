import { describe, expect, it } from "vitest";
import {
  awalHariJakarta,
  hitungKembalian,
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
