import { masuk } from "./actions";

export default async function HalamanLogin({
  searchParams,
}: {
  searchParams: Promise<{ gagal?: string }>;
}) {
  const { gagal } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center bg-[#F5F1E6] p-4">
      <form
        action={masuk}
        className="w-full max-w-sm rounded-xl border border-[#E3DCC7] bg-[#FFFDF6] p-6"
      >
        <p className="text-xs tracking-[0.28em] uppercase text-[#7A7260]">
          Warung Kopi
        </p>
        <h1 className="text-3xl font-bold text-[#17493B]">SETEGUK</h1>
        {gagal ? (
          <p className="mt-3 rounded-lg border border-[#EAC6BB] bg-[#F9E9E4] px-3 py-2 text-sm text-[#C2452D]">
            Email atau password salah. Coba lagi.
          </p>
        ) : null}
        <label className="mt-5 block text-sm font-semibold text-[#7A7260]">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-[#CFC5A8] bg-white px-3 py-2 text-[#241F15]"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-[#7A7260]">
          Password
          <input
            name="password"
            type="password"
            required
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
