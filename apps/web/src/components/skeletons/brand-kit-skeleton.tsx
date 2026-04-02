import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton placeholder matching the BrandKit sidebar + editor layout. */
export function BrandKitSkeleton() {
  return (
    <div className="flex h-[100dvh] w-full bg-background">
      {/* Sidebar — matches BrandKitSidebar: w-[260px], border-r, bg-neutral-50 */}
      <aside className="flex w-[260px] shrink-0 flex-col border-r bg-secondary">
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

        {/* Kit list items: 32px avatar + name */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2"
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </aside>

      {/* Editor — matches BrandKitEditor */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header: 96px, border-b, name + toggle + menu */}
        <header className="flex h-[96px] shrink-0 items-center justify-between border-b px-6">
          <Skeleton className="h-7 w-48" />
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-11 rounded-full" />
            <div className="h-5 w-px bg-border" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        </header>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-[80px] xl:px-[160px]">
          <div className="flex flex-col gap-8 max-w-[960px] mx-auto">
            {/* Extract from URL button placeholder */}
            <Skeleton className="h-10 w-44 rounded-xl self-start" />

            {/* Guidance section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-[60px] w-full rounded-lg" />
            </div>

            {/* Logo section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-24 w-32 rounded-lg" />
                ))}
                <div className="flex h-24 w-32 items-center justify-center rounded-lg border-2 border-dashed border-border">
                  <Skeleton className="h-5 w-5 rounded bg-transparent" />
                </div>
              </div>
            </div>

            {/* Color section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                ))}
              </div>
            </div>

            {/* Font section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-20 w-32 rounded-lg" />
                ))}
              </div>
            </div>

            {/* Image section */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-10" />
              <div className="flex gap-4">
                {Array.from({ length: 2 }, (_, i) => (
                  <Skeleton key={i} className="h-24 w-32 rounded-lg" />
                ))}
                <div className="flex h-24 w-32 items-center justify-center rounded-lg border-2 border-dashed border-border">
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
