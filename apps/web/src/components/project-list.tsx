"use client";

import type { ProjectSummary } from "@loomic/shared";
import { Trash2 } from "lucide-react";
import Link from "next/link";

import { DeleteProjectDialog } from "./delete-project-dialog";
import { useDeleteProject } from "@/hooks/use-delete-project";
import { formatDate } from "@/lib/utils";

interface ProjectListProps {
  projects: ProjectSummary[];
  highlightId?: string | null;
  onCreateClick: () => void;
  onDeleted?: (projectId: string) => void;
}

export function ProjectList({
  projects,
  highlightId,
  onCreateClick,
  onDeleted,
}: ProjectListProps) {
  const { pendingId, deleting, requestDelete, confirmDelete, cancelDelete } =
    useDeleteProject(onDeleted ? { onDeleted } : undefined);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-base font-medium text-foreground sm:text-lg">
          项目
        </h1>
      </div>

      {/* Card grid -- consistent responsive breakpoints */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* "+ 新建项目" card */}
        <div
          role="button"
          tabIndex={0}
          onClick={onCreateClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onCreateClick();
            }
          }}
          className="aspect-[286/208] cursor-pointer rounded-xl bg-card p-2 shadow-card transition-all duration-300 hover:shadow-md sm:rounded-2xl sm:p-3"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted sm:gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 14 14"
              className="h-5 w-5 text-foreground sm:h-6 sm:w-6"
            >
              <path
                fill="currentColor"
                fillRule="evenodd"
                d="M6.417 2.917a.583.583 0 0 1 1.166 0v3.5h3.5a.583.583 0 0 1 0 1.166h-3.5v3.5a.583.583 0 1 1-1.166 0v-3.5h-3.5a.583.583 0 1 1 0-1.166h3.5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-xs font-semibold text-foreground sm:text-sm">
              新建项目
            </span>
          </div>
        </div>

        {/* Project cards */}
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/canvas?id=${project.primaryCanvas.id}`}
            className={`group relative block aspect-[286/208] rounded-lg bg-card p-2 cursor-pointer shadow-card transition-all duration-300 hover:shadow-md sm:p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1${
              highlightId === project.id ? " ring-2 ring-border" : ""
            }`}
          >
            {/* Trash icon -- hover reveal on desktop */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                requestDelete(project.id);
              }}
              aria-label={`Delete ${project.name}`}
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-[4px] bg-foreground/70 text-background opacity-0 transition-all duration-300 hover:bg-foreground/80 group-hover:opacity-100 sm:right-5 sm:top-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:opacity-100"
            >
              <Trash2 size={14} />
            </button>

            {/* Thumbnail */}
            <div className="aspect-[395/227] w-full overflow-hidden rounded-lg bg-muted">
              {project.thumbnailUrl && (
                <img
                  src={project.thumbnailUrl}
                  alt={project.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
            {/* Info */}
            <div className="mt-2 flex items-center justify-between sm:mt-3">
              <div className="truncate text-xs text-foreground sm:text-sm">
                {project.name}
              </div>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground sm:text-[11px]">
              更新于 {formatDate(project.updatedAt)}
            </div>
          </Link>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <DeleteProjectDialog
        open={pendingId !== null}
        deleting={deleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
