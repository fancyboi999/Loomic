"use client";

import {
  Copy,
  FolderOpen,
  Home,
  ImagePlus,
  Maximize2,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { LoomicLogo } from "@/components/icons/loomic-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createExcalidrawImageElement,
  getViewportCenter,
  scaleToFit,
} from "@/lib/canvas-elements";
import { deleteProject } from "@/lib/server-api";
import { useToast } from "@/components/toast";
import { useCreateProject } from "@/hooks/use-create-project";

interface CanvasLogoMenuProps {
  accessToken: string;
  projectId: string;
  canvasId: string;
  // biome-ignore lint/suspicious/noExplicitAny: Excalidraw API has no public type definition
  excalidrawApi: any | null;
}

function dispatchKeyToExcalidraw(
  key: string,
  opts: { metaKey?: boolean; shiftKey?: boolean } = {},
) {
  const el = document.querySelector(".excalidraw-container");
  if (!el) return;
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: `Key${key.toUpperCase()}`,
      metaKey: opts.metaKey ?? false,
      ctrlKey: opts.metaKey ?? false,
      shiftKey: opts.shiftKey ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function generateFileId(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  ).slice(0, 20);
}

export function CanvasLogoMenu({
  accessToken,
  projectId,
  canvasId,
  excalidrawApi,
}: CanvasLogoMenuProps) {
  const router = useRouter();
  const { error: toastError } = useToast();
  const { create: createNewProject } = useCreateProject();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDuplicateElements = useCallback(() => {
    if (!excalidrawApi) return;
    const appState = excalidrawApi.getAppState();
    const selectedIds: Record<string, boolean> =
      appState.selectedElementIds ?? {};
    const allElements = excalidrawApi.getSceneElements();
    const selected = allElements.filter(
      (el: any) => selectedIds[el.id] && !el.isDeleted,
    );

    if (!selected.length) return;

    const OFFSET = 10;
    const newSelectedIds: Record<string, boolean> = {};
    const clones = selected.map((el: any) => {
      const newId = generateFileId();
      newSelectedIds[newId] = true;
      return { ...el, id: newId, x: el.x + OFFSET, y: el.y + OFFSET };
    });

    excalidrawApi.updateScene({
      elements: [...allElements, ...clones],
      appState: { selectedElementIds: newSelectedIds },
      captureUpdate: "IMMEDIATELY",
    });
  }, [excalidrawApi]);

  const handleDeleteProject = useCallback(async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await deleteProject(accessToken, projectId);
      router.push("/projects");
    } catch (err) {
      console.warn("Failed to delete project:", err);
      toastError("项目删除失败");
    } finally {
      setConfirmingDelete(false);
    }
  }, [accessToken, projectId, router, confirmingDelete, toastError]);

  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !excalidrawApi) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataURL = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const fileId = generateFileId();

          excalidrawApi.addFiles([
            {
              id: fileId,
              dataURL,
              mimeType: file.type || "image/png",
              created: Date.now(),
            },
          ]);

          const scaled = scaleToFit(img.width, img.height, 600);
          const center = getViewportCenter(excalidrawApi.getAppState());
          const x = center.x - scaled.width / 2;
          const y = center.y - scaled.height / 2;

          const element = createExcalidrawImageElement({
            fileId,
            x,
            y,
            width: scaled.width,
            height: scaled.height,
            title: file.name,
          });

          excalidrawApi.updateScene({
            elements: [...excalidrawApi.getSceneElements(), element],
            captureUpdate: "IMMEDIATELY",
          });
        };
        img.src = dataURL;
      };
      reader.readAsDataURL(file);

      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [excalidrawApi],
  );

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
      >
        <DropdownMenuTrigger
          className="flex items-center justify-center size-8 rounded-xl bg-card/80 backdrop-blur-sm shadow-sm border border-border hover:bg-card transition-colors cursor-pointer outline-none"
          aria-label="菜单"
        >
          <LoomicLogo className="size-5 text-foreground" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" sideOffset={6} className="w-56">
          {/* Group 1 — Navigation */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => router.push("/home")}>
              <Home className="size-4" />
              主页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/projects")}>
              <FolderOpen className="size-4" />
              项目库
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Group 2 — Project actions */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => createNewProject()}>
              <Plus className="size-4" />
              新建项目
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={handleDeleteProject}
            >
              <Trash2 className="size-4" />
              {confirmingDelete ? "确认删除?" : "删除当前项目"}
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Group 3 — Canvas import */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="size-4" />
              导入图片
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Group 4 — Edit operations */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => dispatchKeyToExcalidraw("z", { metaKey: true })}
            >
              <Undo2 className="size-4" />
              撤销
              <DropdownMenuShortcut>⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                dispatchKeyToExcalidraw("z", {
                  metaKey: true,
                  shiftKey: true,
                })
              }
            >
              <Redo2 className="size-4" />
              重做
              <DropdownMenuShortcut>⇧⌘Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicateElements}>
              <Copy className="size-4" />
              复制对象
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Group 5 — View controls */}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => excalidrawApi?.scrollToContent()}>
              <Maximize2 className="size-4" />
              显示画布所有元素
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileImport}
      />
    </>
  );
}
