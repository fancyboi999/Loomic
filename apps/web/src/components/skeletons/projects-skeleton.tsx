import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the ProjectList card grid layout. */
export function ProjectsSkeleton() {
  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <Skeleton className="h-6 w-20 sm:h-7 sm:w-24" />
      </div>

      {/* Card grid -- matches responsive breakpoints of ProjectList */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* "+ 新建项目" placeholder */}
        <div className="aspect-[286/208] rounded-xl border-2 border-dashed border-[#E3E3E3] flex flex-col items-center justify-center gap-2">
          <span className="text-2xl text-[#E3E3E3]">+</span>
          <Skeleton className="h-3 w-12 sm:h-4 sm:w-14" />
        </div>

        {/* Project card skeletons */}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg bg-white">
            <Skeleton className="aspect-[395/227] rounded-lg" />
            <div className="space-y-1 px-1 py-2 sm:space-y-1.5">
              <Skeleton className="h-3 w-3/4 sm:h-4" />
              <Skeleton className="h-2 w-1/2 sm:h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
