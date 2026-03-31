import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the Skills page layout. */
export function SkillsSkeleton() {
  return (
    <div className="p-8">
      {/* Title + subtitle */}
      <Skeleton className="h-7 w-16 mb-2" />
      <Skeleton className="h-4 w-72 mb-8" />

      {/* Search + filter bar */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 flex-1 max-w-sm rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>

      {/* Banner card */}
      <Skeleton className="h-28 w-full rounded-xl mb-6" />

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
