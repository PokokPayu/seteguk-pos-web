import { describe, expect, it } from "vitest";
import { formatRupiah } from "./format";

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
