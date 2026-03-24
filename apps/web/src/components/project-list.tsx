"use client";

import type { ProjectSummary } from "@loomic/shared";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ProjectListProps {
  projects: ProjectSummary[];
  highlightId?: string | null;
  onCreateClick: () => void;
  onDelete?: (projectId: string) => Promise<void>;
}

export function ProjectList({
  projects,
  highlightId,
  onCreateClick,
  onDelete,
}: ProjectListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleTrashClick(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    setConfirmId(projectId);
  }

  async function handleConfirmDelete(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    setDeletingId(projectId);
    try {
      await onDelete?.(projectId);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmId(null);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Projects</h1>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {/* "+ 新建项目" card */}
        <div
          onClick={onCreateClick}
          className="aspect-[286/208] rounded-lg border-2 border-dashed border-[#E3E3E3] cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors hover:border-[#C0C0C0] hover:bg-[#FAFAFA]"
        >
          <span className="text-2xl text-[#C0C0C0]">+</span>
          <span className="text-sm text-[#919191]">新建项目</span>
        </div>

        {/* Project cards */}
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() =>
              router.push(`/canvas?id=${project.primaryCanvas.id}`)
            }
            className={`group relative rounded-lg bg-white cursor-pointer transition-shadow hover:shadow-md overflow-hidden${
              highlightId === project.id ? " ring-2 ring-neutral-300" : ""
            }`}
            onMouseLeave={() => {
              if (confirmId === project.id) setConfirmId(null);
            }}
          >
            {/* Trash icon — hover reveal */}
            {onDelete && confirmId !== project.id && (
              <button
                type="button"
                onClick={(e) => handleTrashClick(e, project.id)}
                className="absolute top-2 right-2 z-10 size-7 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Confirm overlay */}
            {onDelete && confirmId === project.id && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
              >
                {deletingId === project.id ? (
                  <Loader2 size={20} className="text-white animate-spin" />
                ) : (
                  <>
                    <Trash2 size={22} className="text-white/80" />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleConfirmDelete(e, project.id)}
                        className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelDelete}
                        className="rounded-md bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Thumbnail placeholder */}
            <div className="aspect-[395/227] rounded-lg bg-[#F5F5F5] overflow-hidden" />
            {/* Info */}
            <div className="px-1 py-2">
              <div className="text-sm font-medium truncate text-[#0E1014]">
                {project.name}
              </div>
              <div className="text-[11px] text-[#919191] px-1">
                更新于 {formatDate(project.updatedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
