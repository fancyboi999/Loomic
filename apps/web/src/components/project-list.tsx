"use client";

import type { ProjectSummary } from "@loomic/shared";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { DeleteProjectDialog } from "./delete-project-dialog";
import { useDeleteProject } from "@/hooks/use-delete-project";

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
  const router = useRouter();
  const { pendingId, deleting, requestDelete, confirmDelete, cancelDelete } =
    useDeleteProject({ onDeleted });

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium text-[#141414]">项目</h1>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {/* "+ 新建项目" card */}
        <div
          onClick={onCreateClick}
          className="aspect-[286/208] cursor-pointer rounded-xl bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-md sm:rounded-2xl"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl bg-[#0C0C0D]/[0.04]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14" className="h-6 w-6 text-[#0E1014]">
              <path fill="currentColor" fillRule="evenodd" d="M6.417 2.917a.583.583 0 0 1 1.166 0v3.5h3.5a.583.583 0 0 1 0 1.166h-3.5v3.5a.583.583 0 1 1-1.166 0v-3.5h-3.5a.583.583 0 1 1 0-1.166h3.5z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-[#0E1014]">新建项目</span>
          </div>
        </div>

        {/* Project cards */}
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() =>
              router.push(`/canvas?id=${project.primaryCanvas.id}`)
            }
            className={`group relative aspect-[286/208] rounded-lg bg-white p-3 cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-md${
              highlightId === project.id ? " ring-2 ring-neutral-300" : ""
            }`}
          >
            {/* Trash icon — hover reveal */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                requestDelete(project.id);
              }}
              className="absolute top-5 right-5 z-10 size-8 flex items-center justify-center rounded-[4px] bg-[rgba(51,51,51,0.8)] text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-black/70"
            >
              <Trash2 size={14} />
            </button>

            {/* Thumbnail */}
            <div className="aspect-[395/227] w-full overflow-hidden rounded-lg bg-[#0C0C0D]/[0.04]">
              {project.thumbnailUrl && (
                <img
                  src={project.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
            </div>
            {/* Info */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm truncate text-[#141414]">
                {project.name}
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-[#919191]">
              更新于 {formatDate(project.updatedAt)}
            </div>
          </div>
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

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
