"use client";

import { updateProject } from "@/lib/server-api";
import { useCallback, useEffect, useRef, useState } from "react";

interface EditableProjectNameProps {
  accessToken: string;
  projectId: string;
  initialName: string;
}

export function EditableProjectName({
  accessToken,
  projectId,
  initialName,
}: EditableProjectNameProps) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevName = useRef(initialName);

  // Sync if initialName changes externally
  useEffect(() => {
    setName(initialName);
    prevName.current = initialName;
  }, [initialName]);

  const save = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim() || "Untitled";
      setName(trimmed);
      setEditing(false);
      if (trimmed !== prevName.current) {
        prevName.current = trimmed;
        try {
          await updateProject(accessToken, projectId, { name: trimmed });
        } catch (err) {
          console.warn("Failed to update project name:", err);
        }
      }
    },
    [accessToken, projectId],
  );

  const startEditing = useCallback(() => {
    setEditing(true);
    // Select all text after render
    requestAnimationFrame(() => inputRef.current?.select());
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save(name);
      } else if (e.key === "Escape") {
        setName(prevName.current);
        setEditing(false);
      }
    },
    [name, save],
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => save(name)}
        onKeyDown={handleKeyDown}
        className="h-8 rounded-lg bg-white/80 backdrop-blur-sm border border-black/[0.06] px-2.5 text-sm font-medium text-[#0E1014] outline-none focus:ring-1 focus:ring-black/10 max-w-[200px]"
        maxLength={100}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="h-8 rounded-lg bg-transparent hover:bg-white/60 backdrop-blur-sm px-2.5 text-sm font-medium text-[#0E1014] transition-colors truncate max-w-[200px] cursor-text"
      title={name}
    >
      {name}
    </button>
  );
}
