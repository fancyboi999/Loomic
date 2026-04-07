import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder for the recent projects section on the home page. */
export function HomeProjectsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {/* New project card placeholder */}
      <div className="aspect-[286/208] rounded-xl bg-card p-2 shadow-card sm:rounded-2xl sm:p-3">
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted sm:gap-3">
          <Skeleton className="h-5 w-5 rounded-full sm:h-6 sm:w-6" />
          <Skeleton className="h-3 w-12 sm:w-14" />
        </div>
      </div>

      {/* Project card skeletons */}
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="aspect-[286/208] rounded-lg bg-card p-2 shadow-card sm:p-3"
        >
          <Skeleton className="aspect-[395/227] w-full rounded-lg" />
          <div className="mt-2 space-y-1 sm:mt-3 sm:space-y-1.5">
            <Skeleton className="h-3 w-3/4 sm:h-3.5" />
            <Skeleton className="h-2 w-1/2 sm:h-2.5" />
          </div>
        </div>
      ))}
    </div>
  );
}
