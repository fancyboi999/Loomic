import type { SVGProps } from "react";

/**
 * Loomic brand logo — 6-petal blob with star (left) and smile (right).
 *
 * Uses `currentColor` for the blob fill so the icon automatically adapts to
 * light / dark themes.  Inner elements are always the opposite colour.
 *
 * @example
 * <LoomicLogo className="size-7 text-black dark:text-white" />
 */
export function LoomicLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* 6-petal blob outline */}
      <path
        d="M50 4 C56 4, 64 8, 68 16 C74 10, 84 10, 90 18 C96 26, 96 36, 90 42 C98 48, 100 58, 96 66 C92 74, 84 78, 76 76 C72 84, 62 92, 50 92 C38 92, 28 84, 24 76 C16 78, 8 74, 4 66 C0 58, 2 48, 10 42 C4 36, 4 26, 10 18 C16 10, 26 10, 32 16 C36 8, 44 4, 50 4 Z"
        fill="currentColor"
      />
      {/* Left: four-pointed star */}
      <path
        d="M31 46 L35.5 34 L40 46 L51 50.5 L40 55 L35.5 67 L31 55 L20 50.5 Z"
        className="fill-white dark:fill-black"
      />
      {/* Right: smile curve */}
      <path
        d="M56 42 Q65 54, 74 42"
        className="stroke-white dark:stroke-black"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Inverted variant for dark backgrounds — white blob, dark inner elements.
 * Use this when you need explicit colour control (e.g. OG images, login panel).
 */
export function LoomicLogoInverted(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M50 4 C56 4, 64 8, 68 16 C74 10, 84 10, 90 18 C96 26, 96 36, 90 42 C98 48, 100 58, 96 66 C92 74, 84 78, 76 76 C72 84, 62 92, 50 92 C38 92, 28 84, 24 76 C16 78, 8 74, 4 66 C0 58, 2 48, 10 42 C4 36, 4 26, 10 18 C16 10, 26 10, 32 16 C36 8, 44 4, 50 4 Z"
        fill="white"
      />
      <path
        d="M31 46 L35.5 34 L40 46 L51 50.5 L40 55 L35.5 67 L31 55 L20 50.5 Z"
        fill="#111"
      />
      <path
        d="M56 42 Q65 54, 74 42"
        stroke="#111"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
