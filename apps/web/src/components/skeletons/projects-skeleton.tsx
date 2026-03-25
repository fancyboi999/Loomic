import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the ProjectList card grid layout. */
export function ProjectsSkeleton() {
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="h-7 w-24" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {/* "+ 新建项目" placeholder */}
        <div className="aspect-[286/208] rounded-lg border-2 border-dashed border-[#E3E3E3] flex flex-col items-center justify-center gap-2">
          <span className="text-2xl text-[#E3E3E3]">+</span>
          <Skeleton className="h-4 w-14" />
        </div>

        {/* Project card skeletons */}
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-lg bg-white overflow-hidden">
            <Skeleton className="aspect-[395/227] rounded-lg" />
            <div className="px-1 py-2 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
