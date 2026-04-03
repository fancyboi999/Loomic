"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronRight,
  Pen,
  ShieldCheck,
  Trash2,
  UserPen,
  Users,
} from "lucide-react";

import type { SkillDetail, SkillFileEntry, SkillSource } from "@loomic/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Source badge config (mirrors skill-card)
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
// FileTreeItem — expandable file row within the detail dialog
// ---------------------------------------------------------------------------

function FileTreeItem({ file }: { file: SkillFileEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-foreground hover:bg-muted/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
        <span className="truncate">{file.filePath}</span>
      </button>
      {expanded && (
        <pre className="px-3 pb-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words max-h-48 overflow-auto border-t border-border bg-secondary/50">
          {file.content}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillDetailDialog
// ---------------------------------------------------------------------------

interface SkillDetailDialogProps {
  skill: SkillDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstall: (skillId: string) => Promise<void>;
  onUninstall: (skillId: string) => Promise<void>;
  onDelete?: (skillId: string) => Promise<void>;
}

export function SkillDetailDialog({
  skill,
  open,
  onOpenChange,
  onInstall,
  onUninstall,
  onDelete,
}: SkillDetailDialogProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleAction = useCallback(
    async (action: () => Promise<void>, label: string) => {
      setActionLoading(label);
      try {
        await action();
      } finally {
        setActionLoading(null);
      }
    },
    [],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setConfirmDelete(false);
      onOpenChange(next);
    },
    [onOpenChange],
  );

  if (!skill) return null;

  const { label: sourceLabel, icon: SourceIcon } =
    SOURCE_CONFIG[skill.source];
  const isUserSkill = skill.source === "user";
  const isInstalled = skill.installed ?? false;

  const createdDate = new Date(skill.createdAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const updatedDate = new Date(skill.updatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {skill.name}
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <SourceIcon className="size-3" />
              {sourceLabel}
            </span>
          </DialogTitle>
          <DialogDescription>{skill.description}</DialogDescription>
        </DialogHeader>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">作者</span>
            <p className="font-medium text-foreground">{skill.author}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">版本</span>
            <p className="font-medium text-foreground">v{skill.version}</p>
          </div>
          {skill.license && (
            <div className="space-y-0.5">
              <span className="text-muted-foreground">许可证</span>
              <p className="font-medium text-foreground">{skill.license}</p>
            </div>
          )}
          <div className="space-y-0.5">
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3" />
              更新日期
            </span>
            <p className="font-medium text-foreground">{updatedDate}</p>
          </div>
        </div>

        {/* SKILL.md content */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            SKILL.md
          </span>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-secondary p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {skill.skillContent}
          </pre>
        </div>

        {/* Attached files tree */}
        {skill.files && skill.files.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              附属文件 ({skill.files.length})
            </span>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {skill.files.map((file) => (
                <FileTreeItem key={file.id} file={file} />
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <DialogFooter>
          {/* Delete (user skills only) */}
          {isUserSkill && onDelete && (
            <>
              {confirmDelete ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mr-auto flex items-center gap-2"
                >
                  <span className="text-xs text-destructive">确认删除?</span>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={actionLoading === "delete"}
                    onClick={() =>
                      handleAction(
                        () => onDelete(skill.id),
                        "delete",
                      )
                    }
                  >
                    {actionLoading === "delete" ? "删除中..." : "确认"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    取消
                  </Button>
                </motion.div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              )}
            </>
          )}

          {/* Edit (user skills only — placeholder) */}
          {isUserSkill && (
            <Button variant="outline" size="sm" disabled>
              <Pen className="size-3.5" />
              编辑
            </Button>
          )}

          {/* Install / Uninstall */}
          {isInstalled ? (
            <Button
              variant="outline"
              size="sm"
              disabled={actionLoading === "uninstall"}
              onClick={() =>
                handleAction(
                  () => onUninstall(skill.id),
                  "uninstall",
                )
              }
            >
              {actionLoading === "uninstall" ? "卸载中..." : "卸载"}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={actionLoading === "install"}
              onClick={() =>
                handleAction(
                  () => onInstall(skill.id),
                  "install",
                )
              }
            >
              {actionLoading === "install" ? "安装中..." : "安装"}
            </Button>
          )}
        </DialogFooter>

        {/* Created date small note */}
        <p className="text-center text-[10px] text-muted-foreground">
          创建于 {createdDate}
        </p>
      </DialogContent>
    </Dialog>
  );
}
