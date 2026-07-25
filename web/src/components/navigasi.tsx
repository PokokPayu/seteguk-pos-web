"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = { href: string; label: string };

const IKON: Record<string, ReactNode> = {
  "/kasir": (
    <>
      <rect x="2" y="6" width="16" height="11" rx="2" />
      <path d="M2 10h16M6 14h3" />
    </>
  ),
  "/stok": (
    <>
      <path d="M3 7l7-4 7 4v9l-7 4-7-4V7z" />
      <path d="M3 7l7 4 7-4M10 11v9" />
    </>
  ),
  "/pengeluaran": (
    <>
      <path d="M4 3h12v16l-2-1.4L12 19l-2-1.4L8 19l-2-1.4L4 19V3z" />
      <path d="M7 8h6M7 11.5h4" />
    </>
  ),
  "/laporan": <path d="M3 17V9M8 17V4M13 17v-6M18 17V7" />,
  "/menu": (
    <>
      <path d="M4 6h10v9a3 3 0 01-3 3H7a3 3 0 01-3-3V6z" />
      <path d="M14 8h2a2 2 0 010 4h-2" />
    </>
  ),
  "/pengguna": (
    <>
      <circle cx="10" cy="7" r="3.4" />
      <path d="M3.5 18a6.5 6.5 0 0 1 13 0" />
    </>
  ),
};

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Navigasi({ items, nama }: { items: Item[]; nama: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-[216px] shrink-0 flex-col sticky top-0 h-screen bg-[var(--hijau)] text-[#F2EEDF]">
        <div className="border-b border-white/15 px-4 py-5 [background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.06)_0_5px,transparent_5px_11px)]">
          <svg
            width="26"
            height="30"
            viewBox="0 0 26 30"
            fill="none"
            stroke="#F2EEDF"
            strokeWidth="1.6"
            aria-hidden="true"
            className="mb-1"
          >
            <path d="M3 2h20l-2.5 26h-15L3 2z" />
            <path
              d="M8 5v20M13 5v21M18 5v20"
              strokeOpacity="0.55"
              strokeWidth="1.1"
            />
          </svg>
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#BFD4C4]">
            Warung Kopi
          </p>
          <p className="display text-3xl leading-tight">SETEGUK</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2.5">
          {items.map((item) => {
            const aktif = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  aktif
                    ? "bg-[var(--kertas)] font-bold text-[var(--hijau-tua)]"
                    : "text-[#D8E2D3] hover:bg-white/10"
                }`}
              >
                <span className={`shrink-0 ${aktif ? "" : "opacity-80"}`}>
                  <Ikon>{IKON[item.href]}</Ikon>
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/15 px-4 py-3 text-xs text-[#BFD4C4]">
          Masuk sebagai <b className="text-[#F2EEDF]">{nama}</b>
        </div>
      </aside>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[60px] border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map((item) => {
          const aktif = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                aktif ? "text-[var(--hijau-tua)]" : "text-[var(--pudar)]"
              }`}
            >
              <Ikon>{IKON[item.href]}</Ikon>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
