"use client";

import type { ProjectSummary } from "@loomic/shared";
import { useRouter } from "next/navigation";

interface ProjectListProps {
  projects: ProjectSummary[];
  highlightId?: string | null;
  onCreateClick: () => void;
}

export function ProjectList({
  projects,
  highlightId,
  onCreateClick,
}: ProjectListProps) {
  const router = useRouter();

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
            className={`aspect-[286/208] rounded-lg bg-white cursor-pointer transition-shadow hover:shadow-md overflow-hidden flex flex-col${
              highlightId === project.id ? " ring-2 ring-neutral-300" : ""
            }`}
          >
            {/* Thumbnail placeholder */}
            <div className="flex-1 rounded-lg bg-[#F5F5F5] overflow-hidden" />
            {/* Info */}
            <div className="py-2">
              <div className="text-sm font-medium truncate px-1 text-[#0E1014]">
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
