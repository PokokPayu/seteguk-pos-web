import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Rangka className="h-7 w-44" />
          <Rangka className="mt-2 h-4 w-72" />
        </div>
        <Rangka className="h-9 w-40" />
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--garis)] bg-[var(--enamel)] px-3 py-2">
        <Rangka className="h-6 w-32" />
        <Rangka className="h-4 w-40" />
      </div>
      <div className="mt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-3"
          >
            <div className="space-y-1.5">
              <Rangka className="h-4 w-40" />
              <Rangka className="h-3 w-28" />
            </div>
            <Rangka className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
