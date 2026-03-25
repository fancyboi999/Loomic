"use client";

/**
 * Full-screen loading screen with animated Loomic logo.
 * - Body blob: gentle float + breathing
 * - Star eye: slow rotation (sparkle)
 * - Smile: stroke draw-in animation
 */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5">
        <div className="animate-logo-float">
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="size-14 text-foreground"
          >
            {/* 6-petal blob */}
            <path
              d="M50 4 C56 4, 64 8, 68 16 C74 10, 84 10, 90 18 C96 26, 96 36, 90 42 C98 48, 100 58, 96 66 C92 74, 84 78, 76 76 C72 84, 62 92, 50 92 C38 92, 28 84, 24 76 C16 78, 8 74, 4 66 C0 58, 2 48, 10 42 C4 36, 4 26, 10 18 C16 10, 26 10, 32 16 C36 8, 44 4, 50 4 Z"
              fill="currentColor"
            />
            {/* Star eye — rotates around its center */}
            <g className="animate-star-sparkle origin-center" style={{ transformOrigin: "35.5px 50.5px" }}>
              <path
                d="M31 46 L35.5 34 L40 46 L51 50.5 L40 55 L35.5 67 L31 55 L20 50.5 Z"
                className="fill-white dark:fill-black"
              />
            </g>
            {/* Smile — draws itself in */}
            <path
              d="M56 42 Q65 54, 74 42"
              className="stroke-white dark:stroke-black animate-smile-draw"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="28"
              strokeDashoffset="28"
            />
          </svg>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:0ms]" />
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:160ms]" />
          <span className="h-1 w-1 rounded-full bg-foreground/30 animate-loading-dot [animation-delay:320ms]" />
        </div>
      </div>
    </div>
  );
}
