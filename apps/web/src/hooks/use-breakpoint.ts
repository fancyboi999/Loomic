import { useEffect, useState } from "react";

/**
 * Viewport breakpoint categories matching Tailwind's default breakpoints.
 * - "mobile": <768px
 * - "tablet": 768px-1023px
 * - "desktop": >=1024px
 */
export type Breakpoint = "mobile" | "tablet" | "desktop";

function getBreakpoint(width: number): Breakpoint {
  if (width >= 1024) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

/**
 * Returns the current viewport breakpoint category.
 * Uses matchMedia listeners for efficient, paint-free updates.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "desktop";
    return getBreakpoint(window.innerWidth);
  });

  useEffect(() => {
    const mqTablet = window.matchMedia("(min-width: 768px)");
    const mqDesktop = window.matchMedia("(min-width: 1024px)");

    function update() {
      if (mqDesktop.matches) {
        setBreakpoint("desktop");
      } else if (mqTablet.matches) {
        setBreakpoint("tablet");
      } else {
        setBreakpoint("mobile");
      }
    }

    // Sync initial value (SSR may differ)
    update();

    mqTablet.addEventListener("change", update);
    mqDesktop.addEventListener("change", update);

    return () => {
      mqTablet.removeEventListener("change", update);
      mqDesktop.removeEventListener("change", update);
    };
  }, []);

  return breakpoint;
}
