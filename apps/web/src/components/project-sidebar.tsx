"use client";

import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "./ui/avatar";
import { Separator } from "./ui/separator";

interface ProjectSidebarProps {
  workspace: { name: string; type: string } | null;
  projects: Array<{
    id: string;
    name: string;
    primaryCanvas: { id: string };
  }>;
}

export function ProjectSidebar({ workspace, projects }: ProjectSidebarProps) {
  const router = useRouter();
  const initial = workspace?.name?.charAt(0).toUpperCase() ?? "L";
  const recentProjects = projects.slice(0, 5);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-neutral-50 p-4">
      {/* Workspace header */}
      <div className="flex items-center gap-3 mb-6">
        <Avatar className="h-7 w-7 rounded">
          <AvatarFallback className="bg-black text-white text-xs font-bold rounded">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {workspace?.name ?? "Workspace"}
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {workspace?.type ?? "Personal"}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        Workspace
      </div>
      <div className="text-sm font-medium bg-neutral-100 rounded px-2 py-1.5 mb-1">
        Projects
      </div>
      <button
        type="button"
        onClick={() => router.push("/brand-kit")}
        className="block w-full text-left text-sm text-muted-foreground px-2 py-1.5 rounded hover:bg-neutral-100 cursor-pointer"
      >
        Brand Kit
      </button>
      <button
        type="button"
        onClick={() => router.push("/settings")}
        className="block w-full text-left text-sm text-muted-foreground px-2 py-1.5 rounded hover:bg-neutral-100 cursor-pointer"
      >
        Settings
      </button>

      <Separator className="my-4" />

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Recent
          </div>
          <div className="space-y-0.5">
            {recentProjects.map((project) => (
              <button
                type="button"
                key={project.id}
                onClick={() =>
                  router.push(`/canvas?id=${project.primaryCanvas.id}`)
                }
                className="block w-full text-left text-sm text-muted-foreground px-2 py-1 rounded hover:bg-neutral-100 cursor-pointer truncate"
              >
                {project.name}
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
