"use client";

import { useEffect } from "react";

export function Lembar({
  buka,
  judul,
  onTutup,
  children,
}: {
  buka: boolean;
  judul: string;
  onTutup: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!buka) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onTutup();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [buka, onTutup]);

  if (!buka) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onTutup}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="display text-lg">{judul}</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="rounded-lg px-2 py-1 text-xl leading-none text-[var(--pudar)] hover:bg-[var(--kertas)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
