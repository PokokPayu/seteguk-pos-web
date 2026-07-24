"use client";

import { useEffect } from "react";

export default function ErrorApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--garis)] bg-[var(--enamel)] p-6">
        <p className="text-xs tracking-[0.28em] uppercase text-[var(--pudar)]">
          Seteguk
        </p>
        <h1 className="display mt-1 text-2xl text-[var(--merah)]">
          Terjadi masalah
        </h1>
        <p className="mt-2 text-sm text-[var(--pudar)]">
          Ada gangguan saat memuat halaman ini. Coba lagi — kalau masih
          gagal, periksa koneksi internet lalu ulangi beberapa saat lagi.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 w-full rounded-lg bg-[var(--hijau)] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[var(--hijau-tua)]"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}
