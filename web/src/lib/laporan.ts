export type BarisHarian = {
  tanggal: string;
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
  selisih_kasir: number | null;
};

export type Ringkasan = {
  omzet: number;
  hpp: number;
  pengeluaran: number;
  laba: number;
  transaksi: number;
  tunai: number;
  qris: number;
};

export function ringkasRentang(baris: BarisHarian[]): Ringkasan {
  return baris.reduce<Ringkasan>(
    (s, b) => ({
      omzet: s.omzet + b.omzet,
      hpp: s.hpp + b.hpp,
      pengeluaran: s.pengeluaran + b.pengeluaran,
      laba: s.laba + b.laba,
      transaksi: s.transaksi + b.transaksi,
      tunai: s.tunai + b.tunai,
      qris: s.qris + b.qris,
    }),
    {
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
      transaksi: 0,
      tunai: 0,
      qris: 0,
    }
  );
}

export function kelompokBulanan(
  baris: BarisHarian[]
): { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }[] {
  const peta = new Map<
    string,
    { bulan: string; omzet: number; hpp: number; pengeluaran: number; laba: number }
  >();
  for (const b of baris) {
    const bulan = b.tanggal.slice(0, 7); // YYYY-MM
    const ada = peta.get(bulan) ?? {
      bulan,
      omzet: 0,
      hpp: 0,
      pengeluaran: 0,
      laba: 0,
    };
    ada.omzet += b.omzet;
    ada.hpp += b.hpp;
    ada.pengeluaran += b.pengeluaran;
    ada.laba += b.laba;
    peta.set(bulan, ada);
  }
  return [...peta.values()].sort((a, b) => a.bulan.localeCompare(b.bulan));
}

export function rataPerTransaksi(omzet: number, transaksi: number): number {
  return transaksi > 0 ? omzet / transaksi : 0;
}

/**
 * Batas lebar rentang laporan harian, dalam hari.
 *
 * laporan_harian mengembalikan satu baris per hari, dan PostgREST memotong
 * hasil di 1000 baris TANPA memberi tanda apa pun — dan memotongnya dari
 * depan. Rentang 1990–2026 karena itu mengembalikan 1990 s/d 1992 saja:
 * seluruh hari terkini hilang, dan laporan tampil Rp0 / 0 transaksi seolah
 * itu memang angkanya. Diam-diam salah jauh lebih berbahaya daripada gagal
 * terang-terangan.
 *
 * Setahun menjaga jarak lebar dari plafon itu sekaligus mencerminkan rentang
 * yang masih masuk akal dibaca sebagai laporan harian.
 */
export const MAKS_HARI_LAPORAN = 366;

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const SEHARI_MS = 86_400_000;

/** Tanggal WIB berformat YYYY-MM-DD → milidetik UTC, atau null bila bukan tanggal sungguhan. */
function keUtc(tanggal: string): number | null {
  if (!POLA_TANGGAL.test(tanggal)) return null;
  const ms = Date.parse(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Date.parse menelan 2026-02-31 lalu menggesernya diam-diam ke 3 Maret.
  // Bandingkan balik supaya tanggal yang tidak ada di kalender ikut ditolak.
  return new Date(ms).toISOString().slice(0, 10) === tanggal ? ms : null;
}

function keTanggal(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Jumlah hari dari `dari` sampai `sampai`, inklusif kedua ujungnya. */
export function jumlahHari(dari: string, sampai: string): number {
  const a = keUtc(dari);
  const b = keUtc(sampai);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / SEHARI_MS) + 1;
}

export type Rentang = { dari: string; sampai: string; dipangkas: boolean };

/**
 * Membersihkan rentang dari search param jadi rentang yang pasti aman diminta
 * ke laporan_harian. Search param datang dari URL, jadi bisa berisi apa saja:
 * diedit tangan, atau dikirim input type=date saat tahunnya baru setengah
 * diketik ("2" jadi tahun 0002).
 *
 * `dipangkas` menandai bahwa rentangnya dipersempit, supaya halaman bisa
 * mengatakannya kepada pengguna alih-alih menyajikan potongan sebagai
 * keseluruhan.
 */
export function normalkanRentang(
  dariMentah: string | undefined,
  sampaiMentah: string | undefined,
  hariIni: string
): Rentang {
  const kini = keUtc(hariIni) ?? Date.parse(`${hariIni}T00:00:00Z`);

  // Hari yang belum terjadi tidak punya angka; jangan sampai rentangnya
  // dimulai atau berakhir di sana.
  let dari = Math.min(keUtc(dariMentah ?? "") ?? kini, kini);
  let sampai = Math.min(keUtc(sampaiMentah ?? "") ?? kini, kini);
  if (sampai < dari) sampai = dari;

  const lebar = Math.round((sampai - dari) / SEHARI_MS) + 1;
  const dipangkas = lebar > MAKS_HARI_LAPORAN;
  if (dipangkas) {
    // Sisakan hari TERKINI, bukan terlama: itu yang sedang dicari orang.
    dari = sampai - (MAKS_HARI_LAPORAN - 1) * SEHARI_MS;
  }

  return { dari: keTanggal(dari), sampai: keTanggal(sampai), dipangkas };
}

/**
 * Tanggal paling awal yang masuk akal diminta. Skema aplikasi ini baru dibuat
 * Juli 2026, jadi tidak ada data yang bisa mendahuluinya — tanggal sebelum ini
 * pasti salah ketik, bukan permintaan sungguhan.
 */
export const AWAL_LAPORAN = "2026-01-01";

/**
 * Rentang baru setelah salah satu ujung diubah di pemilih tanggal, atau null
 * bila perubahan itu harus diabaikan.
 *
 * Sebelumnya kedua input saling mengunci lewat max={sampai} dan min={dari}:
 * dari rentang 1–31 Juli, seluruh tanggal Agustus tidak bisa diklik di input
 * mulai, dan di picker iPad benar-benar mati. Alih-alih mengunci, ujung yang
 * tidak diubah ikut digeser supaya rentangnya tetap sah — memilih tanggal
 * mulai setelah tanggal akhir berarti pindah ke hari itu.
 */
export function rentangSetelahUbah(
  sisi: "dari" | "sampai",
  nilai: string,
  dari: string,
  sampai: string,
  hariIni: string
): { dari: string; sampai: string } | null {
  // Input type=date memicu onChange di tiap perubahan, termasuk saat ruasnya
  // dikosongkan atau tahunnya baru setengah diketik ("2" jadi tahun 0002).
  const ms = keUtc(nilai);
  if (ms === null || nilai < AWAL_LAPORAN || nilai > hariIni) return null;

  return sisi === "dari"
    ? { dari: nilai, sampai: nilai > sampai ? nilai : sampai }
    : { dari: nilai < dari ? nilai : dari, sampai: nilai };
}

export type SatuanGrafik = "hari" | "minggu" | "bulan";

export function judulGrafik(satuan: SatuanGrafik): string {
  return `Laba bersih per ${satuan}`;
}

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Label hari untuk tanggal WIB berformat YYYY-MM-DD.
 * Sengaja memakai sufiks Z: string tanggal ini SUDAH tanggal WIB, jadi
 * menambahkan offset +07:00 justru menggesernya ke 17:00 UTC hari sebelumnya
 * dan membuat nama harinya mundur satu hari.
 */
export function labelHari(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  return HARI[d.getUTCDay()] ?? tanggal;
}

export type TitikGrafik = {
  kunci: string;
  /** Label pendek di bawah batang. */
  label: string;
  /** Label lengkap untuk tabel, tooltip, dan pembaca layar. */
  labelPanjang: string;
  laba: number;
  /** Label pendek dijarangkan supaya tidak bertumpuk di layar sempit. */
  tampilLabel: boolean;
};

// Di atas 31 batang, batang harian terlalu tipis dibaca di HP — sebulan penuh
// masih harian, tiga bulan jadi mingguan, lebih dari itu bulanan.
const MAKS_BATANG_HARIAN = 31;
const MAKS_HARI_MINGGUAN = 92;
const MAKS_LABEL = 8;

const BULAN_PENDEK = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  timeZone: "UTC",
});
const BULAN_PANJANG = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function tanggalPendek(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  return `${d.getUTCDate()} ${BULAN_PENDEK.format(d)}`;
}

/** Senin pada minggu tanggal ini (YYYY-MM-DD). */
function seninnya(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  const mundur = (d.getUTCDay() + 6) % 7;
  return keTanggal(d.getTime() - mundur * SEHARI_MS);
}

/**
 * Batang grafik laba untuk seluruh rentang terpilih — tidak dipotong. Rentang
 * yang terlalu panjang untuk batang harian dikelompokkan per minggu (Senin–
 * Minggu) atau per bulan; kelompok di tepi rentang boleh terpotong.
 */
export function seriGrafik(baris: BarisHarian[]): {
  satuan: SatuanGrafik;
  titik: TitikGrafik[];
} {
  const satuan: SatuanGrafik =
    baris.length <= MAKS_BATANG_HARIAN
      ? "hari"
      : baris.length <= MAKS_HARI_MINGGUAN
        ? "minggu"
        : "bulan";

  const kelompok = new Map<string, BarisHarian[]>();
  for (const b of baris) {
    const kunci =
      satuan === "hari"
        ? b.tanggal
        : satuan === "minggu"
          ? seninnya(b.tanggal)
          : b.tanggal.slice(0, 7);
    const isi = kelompok.get(kunci);
    if (isi) isi.push(b);
    else kelompok.set(kunci, [b]);
  }

  const n = kelompok.size;
  const langkah = satuan === "hari" && n <= 7 ? 1 : Math.ceil(n / MAKS_LABEL);
  const titik = [...kelompok.entries()].map(([kunci, isi], i) => {
    const awal = isi[0].tanggal;
    const akhir = isi[isi.length - 1].tanggal;
    const laba = isi.reduce((s, b) => s + b.laba, 0);
    const [label, labelPanjang] =
      satuan === "hari"
        ? [
            n <= 7 ? labelHari(awal) : String(Number(awal.slice(8))),
            `${labelHari(awal)}, ${awal}`,
          ]
        : satuan === "minggu"
          ? [tanggalPendek(awal), `${tanggalPendek(awal)} – ${tanggalPendek(akhir)}`]
          : [
              BULAN_PENDEK.format(new Date(`${awal}T00:00:00Z`)),
              BULAN_PANJANG.format(new Date(`${awal}T00:00:00Z`)),
            ];
    // Dihitung dari belakang supaya batang terakhir (paling kini) selalu berlabel.
    return { kunci, label, labelPanjang, laba, tampilLabel: (n - 1 - i) % langkah === 0 };
  });

  return { satuan, titik };
}
