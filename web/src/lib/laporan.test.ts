import { describe, expect, it } from "vitest";
import {
  judulGrafik,
  jumlahHari,
  kelompokBulanan,
  labelHari,
  MAKS_HARI_LAPORAN,
  normalkanRentang,
  rentangSetelahUbah,
  rataPerTransaksi,
  ringkasRentang,
  type BarisHarian,
} from "./laporan";

function baris(
  tanggal: string,
  omzet: number,
  hpp: number,
  pengeluaran: number,
  transaksi = 1,
  tunai = 0,
  qris = 0
): BarisHarian {
  return {
    tanggal,
    omzet,
    hpp,
    pengeluaran,
    laba: omzet - hpp - pengeluaran,
    transaksi,
    tunai,
    qris,
    selisih_kasir: null,
  };
}

describe("ringkasRentang", () => {
  it("rentang kosong bernilai nol semua", () => {
    expect(ringkasRentang([])).toEqual({
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    });
  });
  it("menjumlahkan beberapa hari", () => {
    const r = ringkasRentang([
      baris("2026-07-23", 100000, 40000, 10000, 5, 60000, 40000),
      baris("2026-07-24", 200000, 80000, 5000, 8, 120000, 80000),
    ]);
    expect(r.omzet).toBe(300000);
    expect(r.hpp).toBe(120000);
    expect(r.pengeluaran).toBe(15000);
    expect(r.laba).toBe(165000);
    expect(r.transaksi).toBe(13);
    expect(r.tunai).toBe(180000);
    expect(r.qris).toBe(120000);
  });
  it("laba bisa negatif (rugi)", () => {
    expect(ringkasRentang([baris("2026-07-24", 50000, 30000, 40000)]).laba).toBe(
      -20000
    );
  });
});

describe("kelompokBulanan", () => {
  it("mengelompokkan per bulan dan menjumlahkan", () => {
    const hasil = kelompokBulanan([
      baris("2026-06-30", 100000, 40000, 10000),
      baris("2026-07-01", 200000, 80000, 20000),
      baris("2026-07-15", 300000, 90000, 10000),
    ]);
    expect(hasil).toHaveLength(2);
    expect(hasil[0].bulan).toBe("2026-06");
    expect(hasil[0].omzet).toBe(100000);
    expect(hasil[1].bulan).toBe("2026-07");
    expect(hasil[1].omzet).toBe(500000);
    expect(hasil[1].laba).toBe(500000 - 170000 - 30000);
  });
  it("rentang kosong menghasilkan array kosong", () => {
    expect(kelompokBulanan([])).toEqual([]);
  });
});

describe("rataPerTransaksi", () => {
  it("membagi omzet dengan jumlah transaksi", () => {
    expect(rataPerTransaksi(100000, 4)).toBe(25000);
  });
  it("nol transaksi menghasilkan nol, bukan bagi nol", () => {
    expect(rataPerTransaksi(0, 0)).toBe(0);
  });
});

describe("labelHari", () => {
  it("memberi nama hari yang benar", () => {
    expect(labelHari("2026-07-24")).toBe("Jum");
    expect(labelHari("2026-07-25")).toBe("Sab");
    expect(labelHari("2026-07-26")).toBe("Min");
    expect(labelHari("2026-07-23")).toBe("Kam");
  });
  it("tidak mundur satu hari karena offset zona waktu", () => {
    // regresi: memakai `${t}T00:00:00+07:00` membuat 24 Juli 2026 (Jumat)
    // terbaca sebagai Kamis
    expect(labelHari("2026-07-24")).not.toBe("Kam");
  });
});

describe("jumlahHari", () => {
  it("tanggal yang sama dihitung satu hari", () => {
    expect(jumlahHari("2026-08-06", "2026-08-06")).toBe(1);
  });

  it("menghitung inklusif dan menyeberangi batas bulan", () => {
    expect(jumlahHari("2026-07-31", "2026-08-06")).toBe(7);
  });

  it("menyeberangi batas tahun", () => {
    expect(jumlahHari("2025-12-31", "2026-01-01")).toBe(2);
  });
});

describe("normalkanRentang", () => {
  const hariIni = "2026-08-06";

  it("tanpa parameter, memakai hari ini", () => {
    expect(normalkanRentang(undefined, undefined, hariIni)).toEqual({
      dari: hariIni,
      sampai: hariIni,
      dipangkas: false,
    });
  });

  it("meneruskan rentang wajar apa adanya", () => {
    expect(normalkanRentang("2026-07-01", "2026-07-31", hariIni)).toEqual({
      dari: "2026-07-01",
      sampai: "2026-07-31",
      dipangkas: false,
    });
  });

  it("menolak tanggal yang lolos pola tapi tidak ada di kalender", () => {
    // 31 Februari lolos /^\d{4}-\d{2}-\d{2}$/ tapi bukan tanggal sungguhan
    expect(normalkanRentang("2026-02-31", "2026-08-06", hariIni).dari).toBe(
      hariIni
    );
  });

  it("sampai tidak boleh melewati hari ini walau URL diedit tangan", () => {
    expect(normalkanRentang("2026-08-01", "2030-01-01", hariIni).sampai).toBe(
      hariIni
    );
  });

  it("sampai lebih awal dari dari akan disamakan", () => {
    expect(normalkanRentang("2026-08-05", "2026-08-01", hariIni)).toEqual({
      dari: "2026-08-05",
      sampai: "2026-08-05",
      dipangkas: false,
    });
  });

  // Inti bug: laporan_harian mengembalikan satu baris per hari, dan PostgREST
  // memotong diam-diam di 1000 baris — memotong dari DEPAN, sehingga hari-hari
  // terkini justru yang hilang dan laporan tampil nol tanpa error apa pun.
  it("memangkas rentang yang melebihi batas, menyisakan hari terkini", () => {
    const r = normalkanRentang("1990-01-01", hariIni, hariIni);
    expect(r.dipangkas).toBe(true);
    expect(r.sampai).toBe(hariIni);
    expect(jumlahHari(r.dari, r.sampai)).toBe(MAKS_HARI_LAPORAN);
  });

  it("tahun setengah diketik pun tidak lolos jadi rentang raksasa", () => {
    // input type=date mengirim 0002-08-01 saat pengguna baru mengetik "2"
    const r = normalkanRentang("0002-08-01", hariIni, hariIni);
    expect(jumlahHari(r.dari, r.sampai)).toBe(MAKS_HARI_LAPORAN);
  });

  it("rentang tepat sebesar batas tidak dianggap dipangkas", () => {
    const r = normalkanRentang("2025-08-06", hariIni, hariIni);
    expect(jumlahHari(r.dari, r.sampai)).toBe(MAKS_HARI_LAPORAN);
    expect(r.dipangkas).toBe(false);
  });

  it("hasilnya selalu di bawah batas baris PostgREST", () => {
    const r = normalkanRentang("1900-01-01", hariIni, hariIni);
    expect(jumlahHari(r.dari, r.sampai)).toBeLessThan(1000);
  });
});

describe("rentangSetelahUbah", () => {
  const hariIni = "2026-08-06";

  // Bug: input mulai dulu dibatasi max={sampai} dan input akhir min={dari},
  // sehingga dari rentang 1–31 Juli seluruh tanggal Agustus terkunci di picker.
  it("maju sebulan lewat input mulai tidak terkunci", () => {
    expect(
      rentangSetelahUbah("dari", "2026-08-01", "2026-07-01", "2026-07-31", hariIni)
    ).toEqual({ dari: "2026-08-01", sampai: "2026-08-01" });
  });

  it("mundur sebulan lewat input akhir tidak terkunci", () => {
    expect(
      rentangSetelahUbah("sampai", "2026-06-15", "2026-07-01", "2026-07-31", hariIni)
    ).toEqual({ dari: "2026-06-15", sampai: "2026-06-15" });
  });

  it("perubahan biasa hanya menggeser sisi yang diubah", () => {
    expect(
      rentangSetelahUbah("sampai", "2026-07-20", "2026-07-01", "2026-07-31", hariIni)
    ).toEqual({ dari: "2026-07-01", sampai: "2026-07-20" });
    expect(
      rentangSetelahUbah("dari", "2026-07-10", "2026-07-01", "2026-07-31", hariIni)
    ).toEqual({ dari: "2026-07-10", sampai: "2026-07-31" });
  });

  it("mengabaikan ruas yang dikosongkan", () => {
    expect(
      rentangSetelahUbah("dari", "", "2026-07-01", "2026-07-31", hariIni)
    ).toBeNull();
  });

  it("mengabaikan tahun yang baru setengah diketik", () => {
    expect(
      rentangSetelahUbah("dari", "0002-08-01", "2026-07-01", "2026-07-31", hariIni)
    ).toBeNull();
  });

  it("mengabaikan hari yang belum terjadi", () => {
    expect(
      rentangSetelahUbah("sampai", "2026-09-01", "2026-07-01", "2026-07-31", hariIni)
    ).toBeNull();
  });

  it("mengabaikan tanggal yang tidak ada di kalender", () => {
    expect(
      rentangSetelahUbah("dari", "2026-02-31", "2026-07-01", "2026-07-31", hariIni)
    ).toBeNull();
  });
});

describe("judulGrafik", () => {
  it("menyebut rentang saat yang tampil hanya sebagian", () => {
    expect(judulGrafik(31, 7)).toBe("Laba bersih 7 hari terakhir dalam rentang");
  });

  it("tidak mengaku 7 hari terakhir saat seluruh rentang tampil", () => {
    expect(judulGrafik(7, 7)).toBe("Laba bersih per hari");
    expect(judulGrafik(3, 3)).toBe("Laba bersih per hari");
    expect(judulGrafik(1, 1)).toBe("Laba bersih per hari");
  });
});
