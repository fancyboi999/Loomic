import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the BrandKit sidebar + editor layout. */
export function BrandKitSkeleton() {
  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background md:flex-row">
      {/* Sidebar -- horizontal on mobile, vertical on md+ */}
      <aside className="flex w-full shrink-0 flex-col border-b bg-secondary md:w-[260px] md:border-b-0 md:border-r">
        {/* Header: "Brand Kit" + Beta badge */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8 rounded-md" />
        </div>

        {/* Create button */}
        <div className="px-3 pb-3">
          <div className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 px-3 py-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>

        {/* Kit list items -- horizontal on mobile, vertical on desktop */}
        <div className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:pb-4 md:space-y-1">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex w-auto shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 md:w-full"
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
              <Skeleton className="hidden h-4 flex-1 md:block" />
            </div>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex min-h-[64px] shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 md:h-[96px] md:flex-nowrap md:py-0">
          <Skeleton className="h-7 w-48" />
          <div className="flex shrink-0 items-center gap-3 ml-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-11 rounded-full" />
            <div className="h-5 w-px bg-border" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 md:px-[80px] xl:px-[160px]">
          <div className="mx-auto flex max-w-[960px] flex-col gap-8">
            {/* Extract from URL button placeholder */}
            <Skeleton className="h-10 w-44 self-start rounded-xl" />

            {/* Guidance section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
            </div>

            {/* Logo section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 w-24 rounded-lg sm:h-24 sm:w-32"
                  />
                ))}
                <div className="flex h-20 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border sm:h-24 sm:w-32">
                  <Skeleton className="h-5 w-5 rounded bg-transparent" />
                </div>
              </div>
            </div>

            {/* Color section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-12 w-12 rounded-lg sm:h-16 sm:w-16" />
                    <Skeleton className="h-3 w-10 sm:w-12" />
                  </div>
                ))}
              </div>
            </div>

            {/* Font section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-16 w-24 rounded-lg sm:h-20 sm:w-32"
                  />
                ))}
              </div>
            </div>

            {/* Image section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex flex-wrap gap-4">
                {Array.from({ length: 2 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 w-24 rounded-lg sm:h-24 sm:w-32"
                  />
                ))}
                <div className="flex h-20 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border sm:h-24 sm:w-32">
                  <Skeleton className="h-5 w-5 rounded bg-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
