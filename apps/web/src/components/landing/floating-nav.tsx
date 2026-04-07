"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Loomic Logo SVG (reused from loading-screen)
// ---------------------------------------------------------------------------

function LoomicLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      aria-hidden="true"
    >
      <path
        d="M50 4 C56 4, 64 8, 68 16 C74 10, 84 10, 90 18 C96 26, 96 36, 90 42 C98 48, 100 58, 96 66 C92 74, 84 78, 76 76 C72 84, 62 92, 50 92 C38 92, 28 84, 24 76 C16 78, 8 74, 4 66 C0 58, 2 48, 10 42 C4 36, 4 26, 10 18 C16 10, 26 10, 32 16 C36 8, 44 4, 50 4 Z"
        fill="currentColor"
      />
      <g style={{ transformOrigin: "35.5px 50.5px" }}>
        <path
          d="M31 46 L35.5 34 L40 46 L51 50.5 L40 55 L35.5 67 L31 55 L20 50.5 Z"
          className="fill-white dark:fill-black"
        />
      </g>
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

// ---------------------------------------------------------------------------
// Nav links config
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { label: "功能", href: "#features" },
  { label: "案例", href: "#showcase" },
  { label: "定价", href: "#pricing" },
] as const;

function handleAnchorClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  onClose?: () => void,
) {
  if (href.startsWith("#")) {
    e.preventDefault();
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    onClose?.();
  }
}

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="size-9" aria-hidden="true" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// NavCTA -- CTA button with one-time accent glow pulse
// Keyframe `landing-nav-cta-glow` is defined in globals.css
// ---------------------------------------------------------------------------

function NavCTA() {
  const [glowActive, setGlowActive] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setGlowActive(false), 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Link
      href="/login"
      className={cn(
        "hidden md:inline-flex items-center justify-center h-8 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors",
        glowActive && "landing-nav-cta-glow",
      )}
    >
      开始创作
    </Link>
  );
}

// ---------------------------------------------------------------------------
// FloatingNav
// ---------------------------------------------------------------------------

export function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-b border-border"
          : "bg-transparent",
      )}
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo with hover animation */}
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group"
          >
            <LoomicLogo className="size-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" />
            <span className="font-bold text-lg tracking-tight">Loomic</span>
          </Link>

          {/* Desktop Nav Links with underline animation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={(e) => handleAnchorClick(e, href)}
                className={cn(
                  "relative px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md",
                  "after:absolute after:bottom-1 after:left-4 after:right-4 after:h-px after:w-0 after:bg-foreground after:transition-all after:duration-300",
                  "hover:after:w-[calc(100%-2rem)]",
                )}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavCTA />
            {/* Hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <X className="size-4" />
              ) : (
                <Menu className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden overflow-hidden border-t border-border bg-background/95 backdrop-blur-xl"
          >
            <nav className="px-4 py-3 flex flex-col gap-1" aria-label="Mobile navigation">
              {NAV_LINKS.map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  onClick={(e) =>
                    handleAnchorClick(e, href, () => setMobileOpen(false))
                  }
                  className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                  {label}
                </a>
              ))}
              <div className="pt-2 pb-1">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center h-9 w-full rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors"
                >
                  开始创作
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
