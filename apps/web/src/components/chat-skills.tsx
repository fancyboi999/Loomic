"use client";

type Skill = {
  emoji: string;
  label: string;
  prompt: string;
};

const PRESET_SKILLS: Skill[] = [
  { emoji: "🖼️", label: "生成图片", prompt: "帮我生成一张图片" },
  { emoji: "📐", label: "设计排版", prompt: "帮我设计一个排版方案" },
  { emoji: "✏️", label: "编辑画布", prompt: "帮我编辑当前画布" },
  { emoji: "💡", label: "创意灵感", prompt: "给我一些创意灵感" },
];

type ChatSkillsProps = {
  onSend: (text: string) => void;
};

export function ChatSkills({ onSend }: ChatSkillsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm font-semibold text-[#2F3640]">
        试试这些快捷指令
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
