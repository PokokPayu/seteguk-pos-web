import Image from "next/image";
import { masuk } from "./actions";

export default async function HalamanLogin({
  searchParams,
}: {
  searchParams: Promise<{ gagal?: string; nonaktif?: string }>;
}) {
  const { gagal, nonaktif } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-[#F5F1E6] p-4">
      <form
        action={masuk}
        className="w-full max-w-sm rounded-xl border border-[#E3DCC7] bg-[#FFFDF6] p-6"
      >
        <Image
          src="/logo-seteguk.png"
          alt="Logo Seteguk"
          width={72}
          height={72}
          priority
          className="mb-4 rounded-xl"
        />
        <p className="text-xs tracking-[0.28em] uppercase text-[#7A7260]">
          Warung Kopi
        </p>
        <h1 className="display text-3xl text-[#17493B]">SETEGUK</h1>
        {gagal ? (
          <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[#C2452D]">
            Email atau kata sandi salah. Coba lagi.
          </p>
        ) : null}
        {nonaktif ? (
          <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[#C2452D]">
            Akun Anda dinonaktifkan. Hubungi pemilik warung.
          </p>
        ) : null}
        <label className="mt-5 block text-sm font-semibold text-[#7A7260]">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-[#7A7260]">
          Kata sandi
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
        <button
          type="submit"
          className="mt-5 w-full rounded-lg bg-[#17493B] px-4 py-3 font-bold text-[#F6F3E6] hover:bg-[#0F3D2E]"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}
