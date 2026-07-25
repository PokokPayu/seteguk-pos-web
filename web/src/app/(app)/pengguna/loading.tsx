import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Rangka className="h-7 w-40" />
          <Rangka className="mt-2 h-4 w-72" />
        </div>
        <Rangka className="h-9 w-36" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4"
          >
            <Rangka className="h-4 w-28" />
            <Rangka className="mt-2 h-3 w-40" />
            <div className="mt-3 flex gap-1">
              <Rangka className="h-5 w-16 rounded-full" />
              <Rangka className="h-5 w-16 rounded-full" />
            </div>
            <Rangka className="mt-3 h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
