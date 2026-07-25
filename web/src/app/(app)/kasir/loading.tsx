import { Rangka } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <Rangka className="h-7 w-32" />
      <Rangka className="mt-2 h-4 w-56" />
      <div className="mt-4 flex items-center justify-between">
        <Rangka className="h-9 w-40 rounded-full" />
        <Rangka className="h-9 w-28" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Rangka key={i} className="h-8 w-20 rounded-full" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Rangka key={i} className="h-28" />
            ))}
          </div>
        </div>
        <Rangka className="hidden h-64 lg:block" />
      </div>
    </div>
  );
}
