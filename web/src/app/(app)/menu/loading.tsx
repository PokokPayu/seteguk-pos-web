import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Rangka className="h-7 w-52" />
          <Rangka className="mt-2 h-4 w-72" />
        </div>
        <Rangka className="h-9 w-32" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Rangka className="h-4 w-40" />
                <Rangka className="h-3 w-20" />
              </div>
              <Rangka className="h-8 w-24" />
            </div>
            <Rangka className="mt-3 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
