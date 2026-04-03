"use client";

import { useCallback, useState } from "react";
import { FileText, Plus, X } from "lucide-react";

import type { SkillCategory } from "@loomic/shared";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// SKILL.md boilerplate template
// ---------------------------------------------------------------------------

const SKILL_TEMPLATE = `# Skill Name

## Description
Describe what this skill does and when the agent should use it.

## Instructions
1. Step-by-step instructions for the agent.
2. Be specific about inputs, outputs, and constraints.

## Examples
\`\`\`
User: example prompt
Agent: example response
\`\`\`

## Constraints
- List any limitations or boundaries.
`;

// ---------------------------------------------------------------------------
// Category options
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: Array<{ value: SkillCategory; label: string }> = [
  { value: "design", label: "Design" },
  { value: "generation", label: "Generation" },
  { value: "code", label: "Code" },
  { value: "data", label: "Data" },
  { value: "writing", label: "Writing" },
  { value: "custom", label: "Custom" },
];

// ---------------------------------------------------------------------------
// CreateSkillDialog
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Valid path prefixes for attached files
// ---------------------------------------------------------------------------

const VALID_PATH_PREFIXES = ["scripts/", "references/", "assets/"];

function isValidFilePath(path: string): boolean {
  return VALID_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: SkillCategory;
    skillContent: string;
    files?: Array<{ filePath: string; content: string }>;
  }) => Promise<void>;
}

export function CreateSkillDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateSkillDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("custom");
  const [skillContent, setSkillContent] = useState("");
  const [files, setFiles] = useState<Array<{ filePath: string; content: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // -- File management helpers --

  const addFile = useCallback(() => {
    setFiles((prev) => [...prev, { filePath: "", content: "" }]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateFile = useCallback(
    (index: number, field: "filePath" | "content", value: string) => {
      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
      );
    },
    [],
  );

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("custom");
    setSkillContent("");
    setFiles([]);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetForm();
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !description.trim() || !skillContent.trim()) return;

      // Only include files where both filePath and content are non-empty
      const validFiles = files.filter(
        (f) => f.filePath.trim() && f.content.trim(),
      );

      setSubmitting(true);
      try {
        await onSubmit({
          name,
          description,
          category,
          skillContent,
          ...(validFiles.length > 0 ? { files: validFiles } : {}),
        });
        handleOpenChange(false);
      } finally {
        setSubmitting(false);
      }
    },
    [name, description, category, skillContent, files, onSubmit, handleOpenChange],
  );

  const canSubmit =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    skillContent.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>添加自定义技能</DialogTitle>
          <DialogDescription>
            创建新的技能来扩展智能体的能力。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">名称</Label>
            <Input
              id="skill-name"
              placeholder="e.g. UI Design Expert"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-category">分类</Label>
            <select
              id="skill-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as SkillCategory)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="skill-desc">描述</Label>
            <textarea
              id="skill-desc"
              rows={2}
              placeholder="简述技能的功能和用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none resize-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
          </div>

          {/* Skill content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="skill-content">SKILL.md 内容</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setSkillContent(SKILL_TEMPLATE)}
              >
                <FileText className="size-3" />
                使用模板
              </Button>
            </div>
            <textarea
              id="skill-content"
              rows={8}
              placeholder="# Skill Name&#10;&#10;## Instructions&#10;..."
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              className="w-full rounded-lg border border-input bg-secondary px-3 py-2 font-mono text-xs leading-relaxed outline-none resize-y focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
          </div>

          {/* Attached files (optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>附属文件（可选）</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={addFile}
              >
                <Plus className="size-3" />
                添加
              </Button>
            </div>

            {files.length > 0 && (
              <div className="space-y-3">
                {files.map((file, index) => {
                  const pathTrimmed = file.filePath.trim();
                  const showPathError =
                    pathTrimmed.length > 0 && !isValidFilePath(pathTrimmed);

                  return (
                    <div
                      key={index}
                      className="relative rounded-lg border border-border bg-secondary/40 p-3 space-y-2"
                    >
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-2 right-2 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="删除文件"
                      >
                        <X className="size-3.5" />
                      </button>

                      {/* File path input */}
                      <div className="pr-6">
                        <Input
                          placeholder="scripts/analyze.py"
                          value={file.filePath}
                          onChange={(e) =>
                            updateFile(index, "filePath", e.target.value)
                          }
                          className="font-mono text-xs h-7"
                          maxLength={500}
                        />
                        {showPathError && (
                          <p className="mt-1 text-[11px] text-destructive">
                            路径必须以 scripts/、references/ 或 assets/ 开头
                          </p>
                        )}
                      </div>

                      {/* File content textarea */}
                      <textarea
                        rows={4}
                        placeholder="文件内容..."
                        value={file.content}
                        onChange={(e) =>
                          updateFile(index, "content", e.target.value)
                        }
                        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs leading-relaxed outline-none resize-y focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
                      />
                    </div>
                  );
                })}

                <p className="text-[11px] text-muted-foreground">
                  支持的路径前缀：scripts/、references/、assets/
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
