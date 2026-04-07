import { Palette, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateKit: () => void;
}

export function EmptyState({ onCreateKit }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="rounded-2xl bg-muted p-4">
        <Palette className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground sm:text-lg">
          No brand kits yet
        </h2>
        <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
          Create a brand kit to keep your colors, fonts, and logos organized.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreateKit}
        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:min-h-0"
      >
        <Plus className="h-4 w-4" />
        Create Brand Kit
      </button>
    </div>
  );
}
