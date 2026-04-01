"use client";

type Skill = {
  icon: React.ReactNode;
  label: string;
  prompt: string;
};

const PRESET_SKILLS: Skill[] = [
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" strokeWidth={1.5} />
        <rect x="5" y="14" width="4" height="6" rx="1" stroke="currentColor" strokeWidth={1.5} />
        <rect x="10" y="8" width="4" height="12" rx="1" stroke="currentColor" strokeWidth={1.5} />
        <rect x="15" y="11" width="4" height="9" rx="1" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
    label: "社媒轮播图",
    prompt: "帮我设计一组社交媒体轮播图，包含封面和多张内页，风格统一",
  },
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={1.5} />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
    label: "社交媒体",
    prompt: "帮我设计一张社交媒体海报，风格现代简洁",
  },
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    label: "Logo 与品牌",
    prompt: "帮我设计一个Logo和品牌视觉方案",
  },
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
    label: "分镜故事板",
    prompt: "帮我创建一组分镜故事板，用于展示创意概念",
  },
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path d="M4 4h16v16H4z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        <path d="M4 9h16M9 9v11" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
    label: "营销宣传册",
    prompt: "帮我设计一套营销宣传册页面，包含封面和内页",
  },
  {
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
    label: "产品展示图",
    prompt: "帮我设计一组产品展示图，适合电商平台使用",
  },
];

type ChatSkillsProps = {
  onSend: (text: string) => void;
};

export function ChatSkills({ onSend }: ChatSkillsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4">
      <p className="text-sm font-semibold text-[#2F3640]">
        试试这些 Loomic Skills
      </p>
      <div className="flex max-w-[320px] flex-wrap justify-center gap-2">
        {PRESET_SKILLS.map((skill) => (
          <button
            key={skill.label}
            type="button"
            onClick={() => onSend(skill.prompt)}
            className="inline-flex h-9 max-w-full items-center justify-center gap-1 rounded-full border border-[rgba(0,0,0,0.07)] bg-white px-[14px] text-sm text-[#2F3640] transition-colors hover:bg-[#F5F5F5] active:bg-[#EBEBEB]"
          >
            <span className="shrink-0 text-[#666]">{skill.icon}</span>
            <span className="truncate">{skill.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
