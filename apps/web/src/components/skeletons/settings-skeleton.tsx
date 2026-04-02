import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the Settings page layout. */
export function SettingsSkeleton() {
  return (
    <div className="p-8">
      {/* Title */}
      <Skeleton className="h-7 w-20 mb-6" />

      {/* Tab bar */}
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1 mb-8">
        <Skeleton className="h-8 w-16 rounded-md bg-white" />
        <Skeleton className="h-8 w-14 rounded-md" />
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
