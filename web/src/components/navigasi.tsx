"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function Navigasi({ items, nama }: { items: Item[]; nama: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[216px] shrink-0 flex-col sticky top-0 h-screen bg-[var(--hijau)] text-[#F2EEDF]">
        <div className="border-b border-white/15 px-4 py-5 [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_5px,transparent_5px_11px)]">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#BFD4C4]">
            Warung Kopi
          </p>
          <p className="display text-3xl leading-tight">SETEGUK</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                pathname.startsWith(item.href)
                  ? "bg-[var(--kertas)] font-bold text-[var(--hijau-tua)]"
                  : "text-[#D8E2D3] hover:bg-white/10"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/15 px-4 py-3 text-xs text-[#BFD4C4]">
          Masuk sebagai <b className="text-[#F2EEDF]">{nama}</b>
        </div>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[60px] border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 items-center justify-center text-[11px] font-semibold ${
              pathname.startsWith(item.href)
                ? "text-[var(--hijau-tua)]"
                : "text-[var(--pudar)]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
