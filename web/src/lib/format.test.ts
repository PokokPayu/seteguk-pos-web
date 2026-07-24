import { describe, expect, it } from "vitest";
import { formatJumlah, formatRupiah, formatRupiahDesimal } from "./format";

describe("formatRupiah", () => {
  it("memformat nol", () => {
    expect(formatRupiah(0)).toBe("Rp0");
  });
  it("memakai titik pemisah ribuan gaya id-ID", () => {
    expect(formatRupiah(15000)).toBe("Rp15.000");
    expect(formatRupiah(1234567)).toBe("Rp1.234.567");
  });
  it("membulatkan pecahan HPP", () => {
    expect(formatRupiah(5390.4)).toBe("Rp5.390");
    expect(formatRupiah(5390.5)).toBe("Rp5.391");
  });
  it("menampilkan negatif dengan tanda minus di depan Rp", () => {
    expect(formatRupiah(-45000)).toBe("−Rp45.000");
  });
});

describe("formatJumlah", () => {
  it("ribuan gaya id-ID", () => {
    expect(formatJumlah(1500)).toBe("1.500");
  });
  it("desimal koma", () => {
    expect(formatJumlah(0.5)).toBe("0,5");
  });
  it("maksimal 3 desimal", () => {
    expect(formatJumlah(12.345)).toBe("12,345");
  });
  it("minus tipografis", () => {
    expect(formatJumlah(-100)).toBe("−100");
  });
});

describe("formatRupiahDesimal", () => {
  it("bilangan bulat tanpa desimal", () => {
    expect(formatRupiahDesimal(120)).toBe("Rp120");
  });
  it("maksimal 2 desimal, koma id-ID", () => {
    expect(formatRupiahDesimal(66.6667)).toBe("Rp66,67");
  });
  it("ribuan dengan titik", () => {
    expect(formatRupiahDesimal(1234.5)).toBe("Rp1.234,5");
  });
});
