// Blok penampung saat data dimuat. Animasi kerlip dinetralkan otomatis oleh
// aturan prefers-reduced-motion di globals.css.
export function Rangka({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-kerlip rounded-md bg-[var(--garis)] ${className}`}
    />
  );
}
