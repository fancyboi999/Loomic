import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder for the recent projects section on the home page. */
export function HomeProjectsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {/* New project card placeholder */}
      <div className="aspect-[286/208] rounded-xl bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] sm:rounded-2xl">
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-[#0C0C0D]/[0.04]">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      {/* Project card skeletons */}
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="aspect-[286/208] rounded-lg bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <Skeleton className="aspect-[395/227] w-full rounded-lg" />
          <div className="mt-3 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
