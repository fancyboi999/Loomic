"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; description?: string }) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setLoading(true);
    setError(null);

    try {
      const payload: { name: string; description?: string } = { name: trimmedName };
      const trimmedDesc = description.trim();
      if (trimmedDesc) {
        payload.description = trimmedDesc;
      }
      await onSubmit(payload);
      // Success -- reset and close
      setName("");
      setDescription("");
      onOpenChange(false);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err) {
        const apiErr = err as { code: string };
        if (apiErr.code === "project_slug_taken") {
          setError("A project with this name already exists. Try a different name.");
        } else {
          setError("Failed to create project. Please try again.");
        }
      } else {
        setError("Failed to create project. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("");
      setDescription("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              placeholder="My Project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              placeholder="A brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
