"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { LoomicLogo } from "@/components/icons/loomic-logo";
import { CreditBalance } from "@/components/credits/credit-balance";
import { useAuth } from "@/lib/auth-context";

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  /** SVG path `d` attribute */
  icon: string;
  /** viewBox dimensions (square), e.g. 20 → "0 0 20 20" */
  viewBox: number;
}

const TOP_NAV_ITEMS: NavItem[] = [
  {
    href: "/home",
    label: "Home",
    viewBox: 20,
    icon: "M8.69 2.136a2 2 0 0 1 2.62 0l5.655 4.905A3 3 0 0 1 18 9.307v7.194a1.5 1.5 0 0 1-1.5 1.5h-3c-.777 0-1.415-.59-1.493-1.347L12 16.501v-5.188a.6.6 0 0 0-.48-.588l-.12-.011H8.6a.6.6 0 0 0-.6.6V16.5A1.5 1.5 0 0 1 6.5 18h-3A1.5 1.5 0 0 1 2 16.5V9.307c0-.815.332-1.593.915-2.157l.119-.11zm1.769.983a.7.7 0 0 0-.918 0L3.886 8.023A1.7 1.7 0 0 0 3.3 9.307v7.194c0 .11.09.2.2.2h3a.2.2 0 0 0 .2-.2v-5.188a1.9 1.9 0 0 1 1.9-1.9H11.4c1.05.001 1.9.851 1.9 1.9v5.188c0 .11.09.2.2.2h3a.2.2 0 0 0 .2-.2V9.307a1.7 1.7 0 0 0-.587-1.284z",
  },
  {
    href: "/projects",
    label: "Projects",
    viewBox: 20,
    icon: "M8.968 2.004c.69.038 1.337.361 1.782.895l1 1.201c.138.166.335.27.548.294l.092.006h3.087A2.523 2.523 0 0 1 18 6.923v8.554l-.013.258a2.524 2.524 0 0 1-2.252 2.252l-.258.013H4.522a2.524 2.524 0 0 1-2.51-2.265L2 15.477V4.522A2.523 2.523 0 0 1 4.522 2H8.83zM3.3 15.477c0 .675.547 1.223 1.222 1.223h10.955c.675 0 1.223-.548 1.223-1.223V9.4H3.3zM4.522 3.3c-.674 0-1.222.547-1.222 1.222V8.1h13.4V6.923c0-.675-.547-1.223-1.223-1.223H12.39a2.14 2.14 0 0 1-1.64-.768l-1-1.2A1.2 1.2 0 0 0 8.83 3.3z",
  },
  {
    href: "/brand-kit",
    label: "Brand Kit",
    viewBox: 18,
    icon: "M6.938 1.5c.545 0 1.056.156 1.488.426a2.8 2.8 0 0 1 1.5.375l2.273 1.312c.473.273.837.663 1.076 1.113.45.239.84.603 1.112 1.075L15.7 8.074a2.81 2.81 0 0 1-1.03 3.842l-6.966 4.021A4.125 4.125 0 0 1 1.5 12.376V4.313A2.813 2.813 0 0 1 4.313 1.5zm-.563 10.875a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0m7.175-5.774a2.8 2.8 0 0 1-.321.854l-3.46 5.99 4.339-2.503a1.69 1.69 0 0 0 .617-2.305zM7.5 12.375a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0m-4.875 0a3 3 0 1 0 6 0V4.313a1.684 1.684 0 0 0-1.687-1.688H4.313c-.932 0-1.688.756-1.688 1.688zm7.125-1.144 2.505-4.338a1.685 1.685 0 0 0-.618-2.306L9.6 3.412c.096.283.149.585.149.9z",
  },
  {
    href: "/skills",
    label: "Skills",
    viewBox: 24,
    icon: "M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z",
  },
];

const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  viewBox: 20,
  icon: "M10 1.667a5 5 0 0 1 2.525 9.313c3.355 1.035 5.844 4.047 6.03 7.37.013.22-.167.4-.388.4h-.5a.423.423 0 0 1-.414-.4C17.02 14.982 13.88 11.9 10 11.9s-7.02 3.082-7.252 6.45a.423.423 0 0 1-.414.4h-.501c-.22 0-.4-.18-.389-.4.187-3.323 2.675-6.333 6.029-7.369A5 5 0 0 1 10 1.667m0 1.3a3.7 3.7 0 1 0 .001 7.401A3.7 3.7 0 0 0 10 2.967",
};

// ---------------------------------------------------------------------------
// Reusable nav-button with active indicator
// ---------------------------------------------------------------------------

function NavButton({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const vb = `0 0 ${item.viewBox} ${item.viewBox}`;

  return (
    <Link
      href={item.href}
      title={item.label}
      className="relative flex h-9 w-9 items-center justify-center rounded-full"
    >
      {/* Animated active background */}
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-full bg-accent/10 border-l-2 border-accent"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <motion.svg
        viewBox={vb}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative h-5 w-5 ${active ? "text-foreground" : "text-muted-foreground"}`}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <path d={item.icon} />
      </motion.svg>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <aside className="flex h-screen w-[60px] flex-col items-center border-r border-border bg-card py-3 gap-1">
      {/* Logo */}
      <Link
        href="/home"
        title="Loomic"
        className="mb-1 flex h-9 w-9 items-center justify-center"
      >
        <motion.div
          whileHover={{ scale: 1.1, rotate: 8 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <LoomicLogo className="size-7 text-black" />
        </motion.div>
      </Link>

      {/* Top nav items */}
      {TOP_NAV_ITEMS.map((item) => (
        <NavButton key={item.href} item={item} active={isActive(item.href)} />
      ))}

      {/* Spacer pushes bottom section down */}
      <div className="flex-1" />

      {/* Credits balance */}
      <CreditBalance />

      {/* Settings / Profile */}
      <NavButton item={SETTINGS_ITEM} active={isActive(SETTINGS_ITEM.href)} />

      {/* Sign out */}
      <button
        type="button"
        onClick={handleSignOut}
        title="Sign out"
        className="flex h-9 w-9 items-center justify-center rounded-full"
      >
        <motion.svg
          viewBox="0 0 20 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-muted-foreground"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <path d="M3 4.5A2.5 2.5 0 0 1 5.5 2h5A2.5 2.5 0 0 1 13 4.5v1a.5.5 0 0 1-1 0v-1A1.5 1.5 0 0 0 10.5 3h-5A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h5a1.5 1.5 0 0 0 1.5-1.5v-1a.5.5 0 0 1 1 0v1A2.5 2.5 0 0 1 10.5 18h-5A2.5 2.5 0 0 1 3 15.5zm12.354-1.354a.5.5 0 0 0-.708.708L16.793 6H7.5a.5.5 0 0 0 0 1h9.293l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708z" transform="translate(0, 4)" />
        </motion.svg>
      </button>
    </aside>
  );
}
