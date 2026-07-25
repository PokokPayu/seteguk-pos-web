import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <Rangka className="h-7 w-40" />
      <Rangka className="mt-2 h-4 w-52" />
      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Rangka key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
        <Rangka className="h-6 w-28" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Rangka className="h-4 w-40" />
              <Rangka className="h-4 w-24" />
            </div>
          ))}
        </div>
        <Rangka className="mx-auto mt-4 h-20 w-52" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Rangka key={i} className="h-16" />
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--garis)] bg-[var(--enamel)] p-4">
        <Rangka className="h-6 w-56" />
        <Rangka className="mt-3 h-36 w-full" />
      </div>
    </div>
  );
}
