import { formatRupiah } from "./format";
import { tanggalJakarta } from "./kasir";

export type AksiLog = "ubah" | "buka" | "tutup_ulang";

export type BarisLog = {
  tanggal: string;
  aksi: AksiLog;
  tunai_fisik_lama: number | null;
  tunai_fisik_baru: number | null;
  alasan: string;
  oleh: string;
  created_at: string;
};

export type BarisTutup = {
  tanggal: string;
  tunai_sistem: number;
  tunai_sistem_kini: number;
  tunai_fisik: number;
  selisih: number;
  catatan: string;
  oleh: string;
};

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export function alasanValid(alasan: string): boolean {
  return alasan.trim().length >= 3;
}

export function nominalValid(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

export function tanggalValid(tanggal: string): boolean {
  return POLA_TANGGAL.test(tanggal);
}

// Pesan `raise exception` dari RPC muncul apa adanya di error.message PostgREST.
// Yang dikenal diterjemahkan jadi kalimat utuh; sisanya diteruskan supaya
// kegagalan tak terduga tidak tersamarkan jadi pesan generik.
const PETA_PESAN: [string, string][] = [
  ["sudah ditutup", "Kasir tanggal ini sudah ditutup."],
  ["sudah dibuka", "Tutup kasir tanggal ini sudah dibuka oleh pengguna lain."],
  ["nominal tidak berubah", "Nominal tidak berubah."],
  ["nominal tidak valid", "Jumlah tunai fisik tidak valid."],
  ["alasan wajib", "Alasan wajib diisi, minimal 3 karakter."],
  ["butuh izin", "Anda tidak punya akses untuk aksi ini."],
  ["tanggal di masa depan", "Tanggal itu belum terjadi."],
  ["tanggal tidak valid", "Tanggal tidak valid."],
];

export function pesanErrorRpc(pesan: string): string {
  for (const [kunci, hasil] of PETA_PESAN) {
    if (pesan.includes(kunci)) return hasil;
  }
  return pesan;
}

// Ditulis manual, bukan Intl: singkatan bulan Indonesia berbeda antar versi ICU
// ("Agu" vs "Agt"), dan riwayat ini diuji dengan pencocokan persis.
const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export function formatTanggalPendek(tanggal: string): string {
  const [tahun, bulan, hari] = tanggal.split("-");
  return `${Number(hari)} ${BULAN[Number(bulan) - 1]} ${tahun}`;
}

// Log adalah jejak audit uang: nominal yang hilang harus terlihat hilang,
// bukan tersamar jadi Rp0 yang tak bisa dibedakan dari nol sungguhan.
function uangLog(n: number | null): string {
  return n === null ? "(tidak tercatat)" : formatRupiah(n);
}

export function kalimatRiwayat(b: BarisLog): string {
  const waktu = formatTanggalPendek(tanggalJakarta(new Date(b.created_at)));
  const inti =
    b.aksi === "ubah"
      ? `Nominal diubah ${uangLog(b.tunai_fisik_lama)} → ${uangLog(
          b.tunai_fisik_baru
        )}`
      : b.aksi === "buka"
        ? `Kasir dibuka kembali (fisik ${uangLog(b.tunai_fisik_lama)})`
        : `Ditutup ulang ${uangLog(b.tunai_fisik_baru)}`;
  return `${inti} — ${b.oleh}, ${waktu}, "${b.alasan}"`;
}
