"use client";

import { useState, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// useTypewriter hook
// ---------------------------------------------------------------------------

interface UseTypewriterOptions {
  text: string;
  /** Milliseconds per character (default: 50) */
  speed?: number | undefined;
  /** Delay in ms before animation starts (default: 0) */
  delay?: number | undefined;
}

interface UseTypewriterReturn {
  displayText: string;
  isComplete: boolean;
  cursor: boolean;
}

export function useTypewriter({
  text,
  speed = 50,
  delay = 0,
}: UseTypewriterOptions): UseTypewriterReturn {
  const shouldReduce = useReducedMotion();
  const reduceMotion = shouldReduce === true;
  const [displayText, setDisplayText] = useState(
    reduceMotion ? text : "",
  );
  const [isComplete, setIsComplete] = useState(reduceMotion);
  const [cursor, setCursor] = useState(true);
  const indexRef = useRef(0);

  // Typing effect
  useEffect(() => {
    if (reduceMotion) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    // Reset on text change
    indexRef.current = 0;
    setDisplayText("");
    setIsComplete(false);

    let startTimeout: ReturnType<typeof setTimeout>;
    let typingInterval: ReturnType<typeof setInterval>;

    startTimeout = setTimeout(() => {
      typingInterval = setInterval(() => {
        const next = indexRef.current + 1;
        setDisplayText(text.slice(0, next));
        indexRef.current = next;

        if (next >= text.length) {
          clearInterval(typingInterval);
          setIsComplete(true);
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(startTimeout);
      clearInterval(typingInterval);
    };
  }, [text, speed, delay, reduceMotion]);

  // Cursor blink — starts immediately, keeps blinking after completion
  useEffect(() => {
    const blink = setInterval(() => {
      setCursor((v) => !v);
    }, 530);
    return () => clearInterval(blink);
  }, []);

  return { displayText, isComplete, cursor };
}

// ---------------------------------------------------------------------------
// TypewriterText component
// ---------------------------------------------------------------------------

interface TypewriterTextProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  cursorClassName?: string;
}

export function TypewriterText({
  text,
  speed,
  delay,
  className,
  cursorClassName,
}: TypewriterTextProps) {
  const { displayText, cursor } = useTypewriter({ text, speed, delay });

  return (
    <span className={cn("inline", className)}>
      {displayText}
      <span
        aria-hidden="true"
        className={cn(
          "inline-block w-[2px] h-[1em] align-middle ml-[1px] bg-current",
          "transition-opacity duration-100",
          cursor ? "opacity-100" : "opacity-0",
          cursorClassName
        )}
      />
    </span>
  );
}
