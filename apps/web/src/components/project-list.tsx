"use client";

import type { ProjectSummary } from "@loomic/shared";
import { useRouter } from "next/navigation";

import { Button } from "./ui/button";

interface ProjectListProps {
  projects: ProjectSummary[];
  highlightId?: string | null;
  onCreateClick: () => void;
}

export function ProjectList({ projects, highlightId, onCreateClick }: ProjectListProps) {
  const router = useRouter();
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button size="sm" onClick={onCreateClick}>
          + New Project
        </Button>
      </div>

      {/* List or empty state */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <h2 className="text-lg font-medium mb-2">No projects yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Create your first project to get started
          </p>
          <Button onClick={onCreateClick}>+ New Project</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-px">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() =>
                router.push(`/canvas?id=${project.primaryCanvas.id}`)
              }
              className={`flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-neutral-50 transition-colors ${
                highlightId === project.id ? "bg-neutral-100 ring-1 ring-neutral-200" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{project.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {project.description ?? "No description"}
                  {" · "}
                  Updated {formatRelativeTime(project.updatedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}
