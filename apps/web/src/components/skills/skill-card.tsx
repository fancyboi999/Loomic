"use client";

import { motion } from "framer-motion";
import {
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Users,
  UserPen,
} from "lucide-react";
import { useCallback } from "react";

import type { SkillCategory, SkillListItem, SkillSource } from "@loomic/shared";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Category badge colour mapping
// ---------------------------------------------------------------------------

const CATEGORY_STYLES: Record<SkillCategory, string> = {
  design: "bg-violet-100 text-violet-700",
  generation: "bg-amber-100 text-amber-700",
  code: "bg-emerald-100 text-emerald-700",
  data: "bg-blue-100 text-blue-700",
  writing: "bg-pink-100 text-pink-700",
  custom: "bg-neutral-100 text-neutral-500",
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  design: "Design",
  generation: "Generation",
  code: "Code",
  data: "Data",
  writing: "Writing",
  custom: "Custom",
};

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<
  SkillSource,
  { label: string; icon: typeof ShieldCheck }
> = {
  system: { label: "官方", icon: ShieldCheck },
  community: { label: "社区", icon: Users },
  user: { label: "自定义", icon: UserPen },
};

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200",
        checked ? "bg-blue-500" : "bg-neutral-200",
      )}
    >
      <motion.span
        className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 18 : 3 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// SkillCard
// ---------------------------------------------------------------------------

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

interface SkillCardProps {
  skill: SkillListItem;
  onToggle: (skillId: string, enabled: boolean) => void;
  onClick: (skill: SkillListItem) => void;
  onUninstall?: (skillId: string) => void;
}

export function SkillCard({
  skill,
  onToggle,
  onClick,
  onUninstall,
}: SkillCardProps) {
  const { label: sourceLabel, icon: SourceIcon } =
    SOURCE_CONFIG[skill.source];

  const handleToggle = useCallback(
    (next: boolean) => {
      onToggle(skill.id, next);
    },
    [onToggle, skill.id],
  );

  const formattedDate = new Date(skill.updatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <motion.div
      variants={cardVariants}
      layout
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={() => onClick(skill)}
      className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              CATEGORY_STYLES[skill.category],
            )}
          >
            {CATEGORY_LABELS[skill.category]}
          </span>
          <span className="truncate text-sm font-medium text-foreground">
            {skill.name}
          </span>
          {skill.isFeatured && (
            <Sparkles className="size-3.5 shrink-0 text-amber-400" />
          )}
        </div>

        <ToggleSwitch
          checked={skill.enabled ?? false}
          onChange={handleToggle}
        />
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {skill.description}
      </p>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <SourceIcon className="size-3" />
          {sourceLabel}
        </span>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {formattedDate}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-neutral-100 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onClick(skill);
                }}
              >
                查看详情
              </DropdownMenuItem>
              {skill.installed && onUninstall && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUninstall(skill.id);
                  }}
                >
                  卸载
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}
