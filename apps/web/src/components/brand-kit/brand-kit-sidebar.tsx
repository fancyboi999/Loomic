"use client";

import type { BrandKitSummary } from "@loomic/shared";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "../../lib/utils";

interface BrandKitSidebarProps {
  kits: BrandKitSummary[];
  selectedKitId: string | null;
  onSelectKit: (kitId: string) => void;
  onCreateKit: () => void;
  onDeleteKit: (kitId: string) => void;
}

export function BrandKitSidebar({
  kits,
  selectedKitId,
  onSelectKit,
  onCreateKit,
  onDeleteKit,
}: BrandKitSidebarProps) {
  const router = useRouter();

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r bg-neutral-50">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="rounded-lg p-1.5 hover:bg-neutral-200 transition-colors cursor-pointer"
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="text-sm font-semibold text-foreground">Brand Kit</h1>
        <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Beta
        </span>
      </div>

      {/* Create button */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onCreateKit}
          className="flex w-full items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 px-3 py-2 text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Kit
        </button>
      </div>

      {/* Kit list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {kits.map((kit) => {
          const isSelected = kit.id === selectedKitId;
          return (
            <div
              role="button"
              tabIndex={0}
              key={kit.id}
              onClick={() => onSelectKit(kit.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectKit(kit.id);
                }
              }}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer",
                isSelected ? "bg-neutral-100" : "hover:bg-neutral-100/60",
              )}
            >
              {/* Thumbnail placeholder */}
              <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {kit.name.charAt(0).toUpperCase()}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {kit.name}
                  </span>
                  {kit.is_default && (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
              </div>

              {/* Hover delete */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteKit(kit.id);
                }}
                className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer"
                aria-label={`Delete ${kit.name}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
