// Animasi kosmetik: sekeping "item" meluncur dari tile menu ke keranjang
// (desktop) atau bilah keranjang mengambang (mobile). Murni efek visual —
// tidak memengaruhi state pesanan. Dilewati saat prefers-reduced-motion.

function targetKeranjang(): HTMLElement | null {
  const kartu = document.querySelector<HTMLElement>("[data-keranjang]");
  if (kartu && kartu.offsetParent !== null) return kartu;
  const bar = document.querySelector<HTMLElement>("[data-cart-bar]");
  if (bar && bar.offsetParent !== null) return bar;
  return null;
}

export function terbangKeKeranjang(sumber: HTMLElement): void {
  if (typeof window === "undefined") return;
  const kurangiGerak = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const target = targetKeranjang();

  const denyut = () => {
    if (kurangiGerak) return;
    target?.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.04)" },
        { transform: "scale(1)" },
      ],
      { duration: 220, easing: "ease-out" }
    );
  };

  if (kurangiGerak) return;

  const s = sumber.getBoundingClientRect();
  const x0 = s.left + s.width / 2;
  const y0 = s.top + s.height / 2;

  const t = target?.getBoundingClientRect();
  const x1 = t ? t.left + t.width / 2 : window.innerWidth / 2;
  const y1 = t ? t.top + t.height / 2 : window.innerHeight - 64;

  const keping = document.createElement("span");
  keping.style.cssText = [
    "position:fixed",
    `left:${x0}px`,
    `top:${y0}px`,
    "width:14px",
    "height:14px",
    "margin:-7px 0 0 -7px",
    "border-radius:9999px",
    "background:var(--hijau-daun)",
    "box-shadow:0 2px 8px rgba(15,61,46,.4)",
    "z-index:95",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(keping);

  const dx = x1 - x0;
  const dy = y1 - y0;
  const animasi = keping.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.15)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.4 },
    ],
    { duration: 520, easing: "cubic-bezier(.5,0,.75,1)" }
  );
  const bersihkan = () => {
    keping.remove();
    denyut();
  };
  animasi.onfinish = bersihkan;
  animasi.oncancel = () => keping.remove();
}
