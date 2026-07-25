"use client";

import { useEffect, useRef } from "react";

const FOKUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    const dialog = dialogRef.current;
    const sebelumnya = document.activeElement as HTMLElement | null;

    // Fokus awal ke dalam lembar supaya pembaca layar mengumumkannya.
    const fokusPertama = dialog?.querySelector<HTMLElement>(FOKUSABLE);
    (fokusPertama ?? dialog)?.focus();

    // Kunci scroll latar selama lembar terbuka.
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onTutup();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const fokusable = dialog.querySelectorAll<HTMLElement>(FOKUSABLE);
      if (fokusable.length === 0) return;
      const pertama = fokusable[0];
      const terakhir = fokusable[fokusable.length - 1];
      if (e.shiftKey && document.activeElement === pertama) {
        e.preventDefault();
        terakhir.focus();
      } else if (!e.shiftKey && document.activeElement === terakhir) {
        e.preventDefault();
        pertama.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflowLama;
      sebelumnya?.focus?.();
    };
  }, [buka, onTutup]);

  if (!buka) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onTutup}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t-2 border-[var(--garis-kuat)] bg-[var(--enamel)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border-2"
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
