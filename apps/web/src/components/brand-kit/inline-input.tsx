"use client";

import { useCallback, useRef, useState } from "react";

import { cn } from "../../lib/utils";

interface InlineInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function InlineInput({
  value,
  onCommit,
  placeholder,
  className,
  inputClassName,
}: InlineInputProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = useCallback(() => {
    setEditing(true);
    setDraft(value);
  }, [value]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        inputRef.current?.blur();
      } else if (e.key === "Escape") {
        setDraft(value);
        // Defer blur so the reverted value is committed (no-op)
        requestAnimationFrame(() => inputRef.current?.blur());
      }
    },
    [value],
  );

  return (
    <div className={cn("group", className)}>
      <input
        ref={inputRef}
        type="text"
        value={editing ? draft : value}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "w-full bg-transparent border-b border-transparent outline-none transition-colors",
          "group-hover:border-dashed group-hover:border-muted-foreground/40",
          "focus:border-dashed focus:border-muted-foreground/40",
          inputClassName,
        )}
      />
    </div>
  );
}
