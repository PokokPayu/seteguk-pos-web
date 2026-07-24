import { describe, expect, it } from "vitest";
import { bolehAkses, SEMUA_IZIN } from "./permissions";
import { filterNav, ITEM_NAV } from "./nav";

describe("bolehAkses", () => {
  it("true jika izin dimiliki", () => {
    expect(bolehAkses(["kasir", "stok"], "kasir")).toBe(true);
  });
  it("false jika izin tidak dimiliki", () => {
    expect(bolehAkses(["kasir"], "laporan")).toBe(false);
  });
  it("false untuk daftar kosong", () => {
    expect(bolehAkses([], "kasir")).toBe(false);
  });
});

describe("filterNav", () => {
  it("hanya menampilkan modul yang diizinkan", () => {
    const nav = filterNav(["kasir", "laporan"]);
    expect(nav.map((n) => n.href)).toEqual(["/kasir", "/laporan"]);
  });
  it("owner dengan semua izin melihat semua modul", () => {
    expect(filterNav([...SEMUA_IZIN])).toHaveLength(ITEM_NAV.length);
  });
  it("izin void tidak memunculkan item nav sendiri", () => {
    expect(filterNav(["void"])).toHaveLength(0);
  });
});
