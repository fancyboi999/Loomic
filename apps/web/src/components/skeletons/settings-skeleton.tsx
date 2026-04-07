import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the Settings page layout. */
export function SettingsSkeleton() {
  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      {/* Title */}
      <Skeleton className="mb-4 h-6 w-20 sm:mb-6 sm:h-7" />

      {/* Tab bar */}
      <div className="mb-6 inline-flex gap-1 rounded-lg bg-muted p-1 sm:mb-8">
        <Skeleton className="h-10 w-16 rounded-md bg-white sm:h-8" />
        <Skeleton className="h-10 w-14 rounded-md sm:h-8" />
      </div>

      {/* Form fields */}
      <div className="max-w-xl space-y-6">
        {/* Field 1 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        {/* Field 2 */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        {/* Save button */}
        <Skeleton className="h-9 w-20 rounded-md" />
      </div>
    </div>
  );
}
