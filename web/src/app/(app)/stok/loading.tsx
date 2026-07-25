import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Rangka className="h-7 w-40" />
          <Rangka className="mt-2 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Rangka className="h-9 w-24" />
          <Rangka className="h-9 w-28" />
          <Rangka className="h-9 w-28" />
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 border-b border-[var(--garis)] py-3 last:border-0"
          >
            <Rangka className="h-4 w-40" />
            <Rangka className="h-4 w-24" />
            <Rangka className="h-4 w-20" />
            <Rangka className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
