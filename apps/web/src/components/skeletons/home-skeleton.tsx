import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder for the recent projects section on the home page. */
export function HomeProjectsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {/* New project card placeholder */}
      <div className="flex aspect-[286/208] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E3E3E3]">
        <span className="text-2xl text-[#E3E3E3]">+</span>
        <Skeleton className="h-3 w-12" />
      </div>

      {/* Project card skeletons */}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-lg bg-white">
          <Skeleton className="aspect-[395/227] rounded-lg" />
          <div className="px-1 py-2 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
