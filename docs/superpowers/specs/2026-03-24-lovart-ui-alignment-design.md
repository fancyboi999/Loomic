# Lovart UI Alignment — Phase 1 Design Spec

> Date: 2026-03-24
> Scope: 高 ROI 的视觉/交互对齐项，聚焦 P0 small/medium 项

---

## 目标

将 Loomic 的核心 UI 体验对齐 Lovart，选择工作量小但视觉冲击大的改进项。本阶段不涉及大工程（Lexical 编辑器、自定义 canvas toolbar）。

## 选定范围（5 项）

### 1. Chat 空状态 & Skills 引导

**现状：** 聊天区域空白时只显示 "Start a conversation" 文字
**目标：** 仿 Lovart 的 Skills 快捷按钮引导

**设计：**
- 居中显示标题："试试这些快捷指令"（`text-sm font-semibold text-[#2F3640]`）
- 下方 flex-wrap 按钮组（`gap-x-1 gap-y-2 justify-center`）
- 每个按钮：`h-9 rounded-full px-[14px] border border-[rgba(0,0,0,0.07)]`
  - 内含 emoji icon + 文本（`text-sm`）
- 预设 skills（可配置）：
  - 🖼️ 生成图片
  - 📐 设计排版
  - ✏️ 编辑画布
  - 💡 创意灵感
- 点击后自动填入对应 prompt 模板到输入框并发送

**文件改动：**
- `apps/web/src/components/chat-sidebar.tsx` — 空状态区域
- 新建 `apps/web/src/components/chat-skills.tsx` — Skills 组件

### 2. 用户消息气泡样式

**现状：** 用户消息无背景，纯文本右对齐
**目标：** 添加 Lovart 风格浅灰气泡

**设计：**
- 用户消息包裹容器：`inline-block rounded-xl bg-[#F7F7F7] px-3 py-2.5`
- 文字：`text-sm font-medium leading-6 text-[#363636]`（保持现有 `whitespace-pre-wrap break-words`）
- 消息容器保持 `flex w-full justify-end pl-10`

**文件改动：**
- `apps/web/src/components/chat-message.tsx` — 用户消息渲染

### 3. "思考中" 动画指示器

**现状：** Assistant 消息有 streaming cursor（`animate-pulse` 竖线），但无"思考中"文字
**目标：** Agent 开始响应时显示 "思考中..." 动画

**设计：**
- 在 assistant 消息开头（content 为空/极短时）显示
- 三点跳动动画 + "思考中" 文字
- 样式：`text-sm text-[#A4A9B2]` + 自定义 `@keyframes bounce-dot`
- 当 content 开始流入时自动隐藏

**文件改动：**
- `apps/web/src/components/chat-message.tsx` — 添加 thinking indicator
- `apps/web/src/app/globals.css` — 添加动画 keyframes

### 4. Canvas 空状态提示

**现状：** Canvas 空白无引导
**目标：** 仿 Lovart 居中提示文字

**设计：**
- 居中浮层（`pointer-events-none fixed inset-0 z-20 flex items-center justify-center`）
- 文字："输入你的想法开始创作，或按 `C` 开始对话"
- 样式：`text-base text-[rgba(0,0,0,0.3)]`
- 仅在 canvas 无元素时显示
- `C` 键用 kbd 样式标签包裹（`px-1.5 py-0.5 rounded bg-[rgba(0,0,0,0.06)] text-sm`）
- 按 `C` 键 focus 到聊天输入框

**文件改动：**
- `apps/web/src/app/canvas/page.tsx` — 添加空状态提示 + 键盘监听
- 或新建 `apps/web/src/components/canvas-empty-hint.tsx`

### 5. 项目列表页升级为卡片网格

**现状：** 纯列表视图，无缩略图
**目标：** 仿 Lovart 的卡片网格

**设计：**
- 网格布局：`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4`
- 项目卡片：
  - `aspect-[286/208] rounded-lg bg-white cursor-pointer transition-shadow hover:shadow-md`
  - 缩略图区域：`aspect-[395/227] rounded-lg bg-[#F5F5F5] overflow-hidden`
    - 暂用占位色块（后续可加 canvas snapshot）
  - 标题：`text-sm font-medium truncate mt-2 px-1`，color `#0E1014`
  - 日期：`text-[11px] text-[#919191] px-1`，格式 "更新于 YYYY-MM-DD"
- "+ 新建项目" 卡片：
  - 同尺寸，虚线边框，居中 `+` 号 + "新建项目" 文字
  - `border-2 border-dashed border-[#E3E3E3] rounded-lg`

**文件改动：**
- `apps/web/src/app/projects/page.tsx` — 改为卡片网格布局
- 可能需要调整数据接口返回 `updatedAt` 字段

## 不在范围内

- Lexical 编辑器替换（P0 #4，大工程，下一阶段）
- 自定义 canvas 底部工具栏（P0 #6，需要深度 Excalidraw 定制）
- Brand Kit、会员计费等 P2 功能
- Inter 字体替换（Geist 已够用）
- 音效系统

## 技术约束

- 所有改动限于 `apps/web/src/` 前端代码
- 不涉及后端 API 改动
- 保持现有组件结构，最小化新文件
- 样式使用 Tailwind 工具类 + 少量 CSS keyframes
