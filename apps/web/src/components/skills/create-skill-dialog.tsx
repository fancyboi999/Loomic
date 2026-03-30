"use client";

import { useCallback, useState } from "react";
import { FileText } from "lucide-react";

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

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: SkillCategory;
    skillContent: string;
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
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setCategory("custom");
    setSkillContent("");
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

      setSubmitting(true);
      try {
        await onSubmit({ name, description, category, skillContent });
        handleOpenChange(false);
      } finally {
        setSubmitting(false);
      }
    },
    [name, description, category, skillContent, onSubmit, handleOpenChange],
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
              className="w-full rounded-lg border border-input bg-neutral-50 px-3 py-2 font-mono text-xs leading-relaxed outline-none resize-y focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 placeholder:text-muted-foreground"
            />
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
