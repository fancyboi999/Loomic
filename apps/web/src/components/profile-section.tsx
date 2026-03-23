"use client";

import { useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ProfileSectionProps {
  displayName: string;
  email: string;
  onSave: (displayName: string) => Promise<void>;
}

export function ProfileSection({
  displayName: initialName,
  email,
  onSave,
}: ProfileSectionProps) {
  const [displayName, setDisplayName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const hasChanges = displayName.trim() !== initialName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    setSaving(true);
    setFeedback(null);

    try {
      await onSave(trimmed);
      setFeedback({ type: "success", message: "Profile updated." });
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to update profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Profile</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Manage your personal information.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled className="opacity-60" />
          <p className="text-xs text-muted-foreground">
            Email cannot be changed.
          </p>
        </div>

        {feedback && (
          <p
            className={`text-sm ${feedback.type === "success" ? "text-green-600" : "text-destructive"}`}
          >
            {feedback.message}
          </p>
        )}

        <Button type="submit" disabled={saving || !hasChanges} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}
