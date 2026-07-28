import { describe, expect, it } from "vitest";
import {
  alasanValid,
  formatTanggalPendek,
  kalimatRiwayat,
  nominalValid,
  pesanErrorRpc,
  tanggalValid,
  type BarisLog,
} from "./tutup-kasir";

describe("alasanValid", () => {
  it("kosong ditolak", () => {
    expect(alasanValid("")).toBe(false);
  });
  it("spasi saja ditolak", () => {
    expect(alasanValid("   ")).toBe(false);
  });
  it("dua karakter ditolak", () => {
    expect(alasanValid("ok")).toBe(false);
  });
  it("tiga karakter diterima", () => {
    expect(alasanValid("typo")).toBe(true);
  });
  it("dihitung setelah trim", () => {
    expect(alasanValid("  ab  ")).toBe(false);
  });
});

describe("nominalValid", () => {
  it("nol diterima", () => {
    expect(nominalValid(0)).toBe(true);
  });
  it("negatif ditolak", () => {
    expect(nominalValid(-1)).toBe(false);
  });
  it("pecahan ditolak", () => {
    expect(nominalValid(1500.5)).toBe(false);
  });
  it("NaN ditolak", () => {
    expect(nominalValid(Number.NaN)).toBe(false);
  });
});

describe("tanggalValid", () => {
  it("format YYYY-MM-DD diterima", () => {
    expect(tanggalValid("2026-07-28")).toBe(true);
  });
  it("format lain ditolak", () => {
    expect(tanggalValid("28-07-2026")).toBe(false);
  });
  it("kosong ditolak", () => {
    expect(tanggalValid("")).toBe(false);
  });
});

describe("pesanErrorRpc", () => {
  it("sudah ditutup", () => {
    expect(pesanErrorRpc("kasir tanggal ini sudah ditutup")).toBe(
      "Kasir tanggal ini sudah ditutup."
    );
  });
  it("sudah dibuka orang lain", () => {
    expect(pesanErrorRpc("tutup kasir tanggal ini sudah dibuka")).toBe(
      "Tutup kasir tanggal ini sudah dibuka oleh pengguna lain."
    );
  });
  it("nominal tidak berubah", () => {
    expect(pesanErrorRpc("nominal tidak berubah")).toBe(
      "Nominal tidak berubah."
    );
  });
  it("izin kurang", () => {
    expect(pesanErrorRpc("butuh izin user")).toBe(
      "Anda tidak punya akses untuk aksi ini."
    );
  });
  it("tanggal di masa depan", () => {
    expect(pesanErrorRpc("tanggal di masa depan")).toBe(
      "Tanggal itu belum terjadi."
    );
  });
  it("pesan tak dikenal diteruskan apa adanya", () => {
    expect(pesanErrorRpc("connection reset")).toBe("connection reset");
  });
});

describe("formatTanggalPendek", () => {
  it("menghapus nol di depan tanggal", () => {
    expect(formatTanggalPendek("2026-08-03")).toBe("3 Agu 2026");
  });
  it("bulan Juli", () => {
    expect(formatTanggalPendek("2026-07-28")).toBe("28 Jul 2026");
  });
  it("Desember", () => {
    expect(formatTanggalPendek("2025-12-31")).toBe("31 Des 2025");
  });
});

const DASAR: BarisLog = {
  tanggal: "2026-07-27",
  aksi: "ubah",
  tunai_fisik_lama: 350000,
  tunai_fisik_baru: 380000,
  alasan: "salah ketik nol",
  oleh: "Arvin",
  created_at: "2026-08-03T02:00:00Z",
};

describe("kalimatRiwayat", () => {
  it("aksi ubah menyebut nilai lama dan baru", () => {
    expect(kalimatRiwayat(DASAR)).toBe(
      'Nominal diubah Rp350.000 → Rp380.000 — Arvin, 3 Agu 2026, "salah ketik nol"'
    );
  });
  it("aksi buka menyebut nilai yang dibatalkan", () => {
    expect(
      kalimatRiwayat({
        ...DASAR,
        aksi: "buka",
        tunai_fisik_baru: null,
        alasan: "kasir salah pencet",
      })
    ).toBe(
      'Kasir dibuka kembali (fisik Rp350.000) — Arvin, 3 Agu 2026, "kasir salah pencet"'
    );
  });
  it("aksi tutup_ulang menyebut nilai baru", () => {
    expect(
      kalimatRiwayat({
        ...DASAR,
        aksi: "tutup_ulang",
        tunai_fisik_lama: null,
        alasan: "tutup ulang setelah dibuka",
      })
    ).toBe(
      'Ditutup ulang Rp380.000 — Arvin, 3 Agu 2026, "tutup ulang setelah dibuka"'
    );
  });
  it("waktu aksi dibaca dalam WIB, bukan UTC", () => {
    // 20:00 UTC = 03:00 WIB keesokan harinya
    expect(
      kalimatRiwayat({ ...DASAR, created_at: "2026-08-03T20:00:00Z" })
    ).toContain("4 Agu 2026");
  });
});
