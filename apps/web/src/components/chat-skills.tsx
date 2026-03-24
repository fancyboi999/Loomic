"use client";

type Skill = {
  emoji: string;
  label: string;
  prompt: string;
};

const PRESET_SKILLS: Skill[] = [
  { emoji: "\uD83D\uDDBC\uFE0F", label: "\u751F\u6210\u56FE\u7247", prompt: "\u5E2E\u6211\u751F\u6210\u4E00\u5F20\u56FE\u7247\uFF1A" },
  { emoji: "\uD83D\uDCD0", label: "\u8BBE\u8BA1\u6392\u7248", prompt: "\u5E2E\u6211\u8BBE\u8BA1\u4E00\u4E2A\u6392\u7248\u65B9\u6848\uFF1A" },
  { emoji: "\u270F\uFE0F", label: "\u7F16\u8F91\u753B\u5E03", prompt: "\u5E2E\u6211\u7F16\u8F91\u5F53\u524D\u753B\u5E03\uFF1A" },
  { emoji: "\uD83D\uDCA1", label: "\u521B\u610F\u7075\u611F", prompt: "\u7ED9\u6211\u4E00\u4E9B\u521B\u610F\u7075\u611F\uFF0C\u4E3B\u9898\u662F\uFF1A" },
];

type ChatSkillsProps = {
  onSend: (text: string) => void;
};

export function ChatSkills({ onSend }: ChatSkillsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm font-semibold text-[#2F3640]">
        {"\u8BD5\u8BD5\u8FD9\u4E9B\u5FEB\u6377\u6307\u4EE4"}
      </p>
      <div className="flex flex-wrap gap-x-1 gap-y-2 justify-center">
        {PRESET_SKILLS.map((skill) => (
          <button
            key={skill.label}
            type="button"
            onClick={() => onSend(skill.prompt)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[rgba(0,0,0,0.07)] bg-white px-[14px] text-sm text-[#2F3640] transition-colors hover:bg-[#F5F5F5] active:bg-[#EBEBEB]"
          >
            <span>{skill.emoji}</span>
            <span>{skill.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
