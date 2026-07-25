"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type TampilToast = (pesan: string) => void;

const KonteksToast = createContext<TampilToast | null>(null);

export function useToast(): TampilToast {
  const toast = useContext(KonteksToast);
  if (!toast) {
    throw new Error("useToast harus dipakai di dalam ToastProvider");
  }
  return toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [pesan, setPesan] = useState("");
  const [tampil, setTampil] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((teks: string) => {
    setPesan(teks);
    setTampil(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTampil(false), 2400);
  }, []);

  return (
    <KonteksToast.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6"
      >
        <span
          className={`max-w-[88vw] rounded-lg bg-[var(--tinta)] px-4 py-2.5 text-center text-sm text-[var(--kertas)] shadow-lg transition-all duration-200 ${
            tampil ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          {pesan}
        </span>
      </div>
    </KonteksToast.Provider>
  );
}
