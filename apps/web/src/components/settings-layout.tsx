"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Separator } from "./ui/separator";

type SettingsSection = "profile" | "agent";

interface SettingsLayoutProps {
  children: (activeSection: SettingsSection) => React.ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  const sections: Array<{ id: SettingsSection; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "agent", label: "Agent" },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r bg-neutral-50 p-4">
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="text-sm text-muted-foreground hover:text-foreground mb-6 flex items-center gap-1"
        >
          <span aria-hidden>&larr;</span> Back to Projects
        </button>

        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Settings
        </div>

        <div className="space-y-0.5">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`block w-full text-left text-sm px-2 py-1.5 rounded ${
                activeSection === section.id
                  ? "font-medium bg-neutral-100"
                  : "text-muted-foreground hover:bg-neutral-100"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>

        <Separator className="my-4" />
      </aside>

      {/* Content */}
      <main className="flex-1 p-8">
        <div className="max-w-xl">{children(activeSection)}</div>
      </main>
    </div>
  );
}
