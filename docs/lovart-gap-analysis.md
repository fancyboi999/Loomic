# Lovart vs Loomic 差距分析报告

> 基于 2026-03-24 对 lovart.ai 的深度逆向分析（DOM 结构、CSS 样式、API 端点、交互流程）

---

## 一、整体架构对比

| 维度 | Lovart | Loomic 现状 | 差距 |
|------|--------|------------|------|
| Canvas 引擎 | tldraw v4.3.1 | Excalidraw | ⚠️ 不同引擎，Excalidraw 更开源友好 |
| UI 框架 | Mantine + Tailwind CSS | shadcn/ui + Tailwind CSS | ⚠️ 功能对等，组件风格不同 |
| 聊天输入 | Lexical contenteditable | 原生 textarea | ❌ 缺少富文本能力 |
| 字体 | Inter + Outfit（备用） | Geist | ⚠️ 都是现代无衬线，风格略不同 |
| 设计 Token | 200+ CSS 自定义属性 | oklch 格式 shadcn 变量 + 硬编码色值 | ❌ 缺少系统化设计 Token |
| 页面路由 | /projects, /canvas, /brand-kit, /profile, /home | /projects, /canvas/:id, /settings | ⚠️ 已有基础路由，缺少 brand-kit/home |
| 音效反馈 | thinking.wav, rise.wav, over.wav | 无 | ❌ 无音效 |
| 错误监控 | Sentry | 无 | ❌ 无前端错误监控 |

---

## 二、页面布局对比

### 2.1 Canvas 页面

**Lovart 布局：**
```
┌──────────────────────────────────────────────┬────────────────┐
│  [Logo] [ProjectName ▾]         [⚡960] [👤] [💬对话]│ Header (48px)  │
├──────────────────────────────────────────────┼────────────────┤
│                                              │  新对话         │
│            tldraw Canvas                     │  (header 48px) │
│            (main, flex-1)                    │                │
│                                              │  Skills 空状态  │
│  输入你的想法开始创作，或按 C 开始对话          │  或 消息列表    │
│                                              │                │
│                                              │  ──升级提示──   │
│  [🔲][📂][🔍]  [-] 100% [+]                  │  [输入框 120px] │
│       [▶️][📍][🖼️][#][□][✏️][T][🖼️][📹]       │  [附件][Agent]  │
└──────────────────────────────────────────────┴────────────────┘
  Left controls (fixed)    Bottom toolbar (fixed)   Right panel (400px)
```

**Lovart 关键尺寸：**
- 整体：`flex h-screen w-screen bg-[#F5F5F5]`
- Canvas 区域：`main, flex-1` (width ≈ 800px at 1200px viewport)
- Right panel：`400px`, `border-l border-[rgba(26,26,25,0.06)]`
- Bottom toolbar：`375px × 46px`, `rounded-[14px]`, `bg-white`, `border rgba(0,0,0,0.07)`, `p-[6px]`, shadow
- Tool buttons：`32×32px`, `rounded-[8px]`, active: `bg-[#2C2C2C]`
- Left controls：`rounded-full`, `backdrop-blur-lg`, `32px height`, `bg rgba(245,245,245,0.9)`

**Loomic 现状：**
- 整体：`flex h-screen w-screen overflow-hidden`
- Canvas 引擎：Excalidraw（非 tldraw）
- Canvas 区域：`flex-1 relative min-w-0`
- Chat panel：可调宽度 `300-600px`（默认 400px），带 `w-2 cursor-col-resize` 拖拽条
- AI Toolbar：`absolute bottom-4 left-1/2 translate-x-[220px] z-50`（浮层按钮 `h-9 w-9 rounded-lg`）
- Chat panel 可收起（toggle 按钮）
- 缺少：底部完整工具栏、左侧缩放控件

### 2.2 项目列表页

**Lovart 项目列表页：**
- 左侧 icon-only 导航栏（52px 宽）
  - 创建新项目按钮：`52×52px`, `rounded-full`, `border-[0.5px] #C4C4C4`, `bg-white`, 内含 `36×36px bg-[#141414]` 图标
  - 导航项：Home, Projects, Brand Kit, Profile（`36×36px rounded-full`）
  - 设置：底部 `40×40px rounded-full bg-white`
- 顶部：Mantine AppShell header（50px）
  - Logo, 语言选择器, 升级按钮, Credits 展示
- 内容：项目卡片网格
  - 卡片：`aspect-ratio: 286/208`, `rounded-[8px]`, `bg-white`, `cursor-pointer`
  - 缩略图：`aspect-ratio: 395/227`, `rounded-[8px]`, overflow hidden
  - 标题：`14px`, `color #0E1014`, inline editable（hover 展示编辑 bg）
  - 日期：`10-12px`, `color #919191`, "更新于 YYYY-MM-DD"
  - Hover overlay：右上角 `32×32px`, `rounded-[4px]`, `bg rgba(51,51,51,0.8)`, 更多操作

**Loomic 现状：**
- 已有 `/projects` 页面，但为列表视图（非卡片网格）
- 左侧导航：`w-60 shrink-0 border-r bg-neutral-50 p-4`（文字导航，非 icon-only）
- 项目列表项：`flex items-center gap-3 rounded-lg px-3 py-3 cursor-pointer hover:bg-neutral-50`
- 有 "+ New Project" 按钮
- ❌ 无缩略图预览，无网格卡片布局，无日期格式化
- ❌ 左侧导航缺少 Brand Kit、Home 入口

---

## 三、Chat 面板对比

### 3.1 Chat Header

**Lovart：**
- 高度 48px，白色背景，`pl-4`
- 标题：`14px`, `font-semibold (600)`, `text-lo-text-default (rgba(0,0,0,0.9))`，自动从用户首条消息提取
- 右侧按钮组（26×26px, `rounded-[8px]`）：
  - Undo/Redo（disabled when no history）
  - 历史对话（dropdown，14px 宽按钮）
  - 分享
  - 折叠/展开面板

**Loomic 现状：**
- 有 SessionSelector 组件（History dropdown + New Chat）
- 缺少：undo/redo、分享、面板折叠

### 3.2 Chat 空状态

**Lovart：**
- 居中标题："试试这些 Lovart Skills"（`14px font-semibold`）
- Skills 按钮网格：`flex-wrap justify-center gap-x-1 gap-y-2`
- 每个 skill 按钮：`h-9 (36px)`, `rounded-full`, `px-[14px]`, `border 1px solid rgba(0,0,0,0.07)`
  - 内含 icon（`18×18px`）+ 文本（`14px text-lo-text-default`）
  - 6 个预设：社媒轮播图、社交媒体、Logo与品牌、分镜故事板、营销宣传册、亚马逊产品套图

**Loomic 现状：** ❌ 聊天区域无空状态引导

### 3.3 Chat 消息渲染

**Lovart 用户消息：**
- 外层：`flex w-full items-start justify-end gap-1 pl-6`（右对齐）
- 气泡：`inline-block rounded-xl bg-[#F7F7F7] p-3`
  - `font-inter text-sm (14px) font-medium (500) leading-6 (24px) text-[#363636]`
  - `cursor-default select-none whitespace-pre-wrap break-words`
- Skill 标签：内嵌在消息气泡内

**Lovart Assistant 消息：**
- 外层：`agent-chat-message empty:hidden pr-6`
- Markdown 容器：`markdown-content agent rounded-xl leading-relaxed`
  - `color: rgb(47,54,64)` = `#2F3640`
  - `font-size: 14px`, `font-weight: 500`, `line-height: 22.4px`
  - Font: Inter, sans-serif
- Markdown 子元素：
  - `p`: margin 0, same color/size
  - `ul`: padding-left 16px
  - `li`: disc, margin-bottom 4px
  - `strong`: font-weight 600
- "思考中..." 动画指示器

**Loomic 现状：**
- 用户消息：`flex w-full justify-end pl-10`，无背景气泡，`text-sm leading-[1.6] text-[#2F3640]`
- Assistant 消息：`flex w-full flex-col gap-2 pr-10`，无背景，同色 `text-[#2F3640]`
- Streaming cursor：`w-[2px] h-[14px] bg-[#2F3640] animate-pulse rounded-full`
- Tool blocks：`text-[11px] text-[#A4A9B2]`，带 spinner/checkmark 状态
- 图片 artifact：`max-w-[200px] rounded-md border border-[#E3E3E3]`，带 title (`text-[11px] text-[#A4A9B2]`)

**差距：**
- ❌ 用户消息无背景气泡（Lovart 有 `bg-[#F7F7F7] rounded-xl p-3`）
- ❌ 无"思考中"动画（Lovart 有 "思考中..." 文字 + 动画）
- ❌ 无 skill 标签展示
- ⚠️ 消息整体风格接近（都是 flat text on white），但 Lovart 用户消息有明确气泡区分

### 3.4 Chat 输入区

**Lovart：**
- 容器：`min-h-[120px] w-full p-2 flex flex-col justify-between gap-2`
  - `bg-white border-[0.5px] border-[#E3E3E3] rounded-xl`
  - Focus 时边框变化（transition-[border]）
- 编辑器：Lexical contenteditable
  - `14px`, `line-height 1.8`, `color #141414`
  - `min-h-12 (48px)`, `max-h-60 (240px)`
  - placeholder: "Start with an idea, or type '@' to mention"
- 底部操作栏：
  - 左侧：附件按钮（`32px rounded-full border-[0.5px] #C4C4C4`），Agent 按钮（`border-[0.5px] #147DFF text-[#147DFF]` 蓝色 pill）
  - 右侧：额外工具按钮（pill shaped），发送按钮（`32px rounded-full bg-[#2F3640]`，hover `bg-[#4A535F]`）
  - 发送按钮在输入内容时变为活跃状态

**Loomic 现状：**
- 容器：`min-h-[100px] flex-col rounded-xl border-[0.5px] border-[#E3E3E3] bg-white p-2`
  - Focus: `border-[#C0C0C0]`
- 原生 textarea：`text-sm leading-[1.8] text-[#141414]`，max 200px auto-grow
- 发送按钮：`h-7 w-7 rounded-lg bg-[#0C0C0D] text-white`（方形 vs Lovart 圆形）
- ❌ 无 Lexical 富文本编辑器
- ❌ 无 @ mention 功能
- ❌ 无附件上传按钮
- ❌ 无 Agent 模式切换
- ⚠️ 输入框容器样式接近（都是 rounded-xl, border-0.5px, #E3E3E3），但高度较小（100px vs 120px）

---

## 四、Canvas 交互对比

### 4.1 Canvas 空状态提示

**Lovart：**
- 居中显示："输入你的想法开始创作，或按 `C` 开始对话"
- `16px`, `color rgba(0,0,0,0.3)`, `pointer-events-none`
- 支持快捷键 `C` 打开聊天

**Loomic 现状：** ❌ 无 canvas 空状态引导提示

### 4.2 底部工具栏

**Lovart 工具栏：**
- 固定底部居中，`375px × 46px`
- 白色背景，`rounded-[14px]`，`border rgba(0,0,0,0.07)`，`shadow`
- 10 个工具按钮（`32×32px`, `rounded-[8px]`）：
  1. Select（活跃时 `bg-[#2C2C2C] text-white`）
  2. 标注/定位
  3. 图片上传
  4. Frame（画框）
  5. Shape（形状）
  6. Pen（画笔）
  7. Text（文字）
  8. Generate Image（AI 生图）
  9. Generate Video（AI 生视频）
- 分隔线在某些工具组之间

**Loomic 现状：**
- 有 AI generation overlay toolbar（浮层）
- 缺少完整的 canvas 编辑工具栏
- 依赖 tldraw 自带 UI

### 4.3 左侧控件

**Lovart：**
- 固定左下角，`z-[49]`
- Pill 容器：`rounded-full`, `p-[2px]`, `backdrop-blur-lg`, `bg rgba(245,245,245,0.9)`
- 包含：
  - 图层按钮 (`28×28px rounded-full`)
  - 文件搜索按钮
  - 缩放控件：`-` / `100%` / `+`（`zoom-shape-button`）

**Loomic 现状：** ❌ 无自定义左侧控件，依赖 tldraw 默认

### 4.4 右侧浮动按钮

**Lovart：**
- 右侧边缘浮动两个按钮：
  - QR code / 分享按钮（带加号图标）
  - AI 生成快捷入口（带渐变色图标）

**Loomic 现状：** ❌ 无

---

## 五、API 端点对比

### Lovart API 架构
两个域名分工：
- `www.lovart.ai/api/` — 主站 API（项目、用户、会员、团队）
- `lgw.lovart.ai/v1/` — 专用网关（brand kit、generator）

**核心 API 端点：**

| 类别 | 端点 | 用途 |
|------|------|------|
| 项目 | `/api/canva/project/queryProject` | 查询项目详情 |
| 项目 | `/api/canva/project/updateProjectName` | 更新项目名 |
| Agent | `/api/canva/agent/queryAgentInfo` | 查询 agent 信息 |
| Agent | `/api/canva/agent/queryAgentLastThread` | 最近一次对话 |
| Agent | `/api/canva/agent/agentThreadList` | 对话列表 |
| Agent | `/api/canva/agent/genShareCode` | 生成分享码 |
| 计费 | `/api/canva/agent-cashier/device/info` | 设备信息 |
| 计费 | `/api/canva/agent-cashier/task/query/unlimited` | 无限制任务查询 |
| 用户 | `/api/www/user/getUserInfo` | 用户信息 |
| 会员 | `/api/www/lovart/member/account` | 会员账户 |
| 会员 | `/api/www/lovart/member/free/power` | 免费算力 |
| 团队 | `/api/www/lovart/teams/queryCurrentAccount` | 团队账户 |
| Brand Kit | `lgw.lovart.ai/v1/kit/list` | 品牌套件列表 |
| Brand Kit | `lgw.lovart.ai/v1/kit/project/kits` | 项目关联套件 |
| Generator | `lgw.lovart.ai/v1/generator/list` | 生成器列表 |
| 遥测 | `/api/www/log/acceptor/f` | 前端日志上报 |

**Loomic API：**
- `/api/canvases/:canvasId` — GET/PUT canvas
- `/api/canvases/:canvasId/sessions` — GET/POST sessions
- `/api/sessions/:sessionId` — PATCH/DELETE session
- `/api/sessions/:sessionId/messages` — GET/POST messages
- `/api/sessions/:sessionId/runs` — POST (agent run, SSE streaming)
- `/api/canvases/:canvasId/generate-image` — POST

**差距：**
- ❌ 无项目 CRUD（只有单 canvas 级别）
- ❌ 无用户计费/会员体系
- ❌ 无团队协作 API
- ❌ 无品牌套件 API
- ❌ 无分享 API
- ❌ 无前端日志上报

---

## 六、设计 Token 系统对比

### Lovart 设计 Token 体系（部分重点）

```css
/* 基础语义色 */
--bg-base-default: #f9f8f6;
--bg-base-secondary: #f2f1ee;
--bg-bg-canvas: #f5f5f5;
--bg-input: #fff;
--bg-invert: #100f09;

/* 文字 */
--text-default: #100f09;        /* rgba(0,0,0,0.9) */
--text-secondary: #525251;
--text-tertiary: #7c7c79;       /* rgba(0,0,0,0.3) */

/* 边框 */
--border-neutral-l1: rgba(26,26,25,0.06);
--border-neutral-l2: rgba(26,26,25,0.12);
--border-neutral-l3: rgba(26,26,25,0.18);
--border-width-hairline: 0.5px;

/* 品牌色 */
--color-primary: #0ca0eb;
--color-brand-600: #147DFF;     /* CTA blue */

/* 中性色阶 */
--color-neutral-g0 ~ g10: #fff → #0E1014;

/* 组件尺寸 */
--comp-xxs: 14px; --comp-xs: 16px; --comp-s: 28px;
--comp-m: 32px; --comp-l: 40px; --comp-xl: 50px;

/* 特殊 */
--special-bg-chatbox: rgba(0,0,0,0.4);
--surface-translucent-panel-white-95: rgba(255,255,255,0.95);
```

### Loomic 现状
- 使用 shadcn oklch 格式 CSS 变量（`--background`, `--foreground`, `--primary` 等）
- 有暗色模式支持（oklch 格式 dark theme 变量）
- 硬编码颜色值与 Lovart 接近：`#2F3640`（主文字），`#E3E3E3`（边框），`#A4A9B2`（次要文字），`#141414`（输入文字）
- 发送按钮：`#0C0C0D`（接近 Lovart 的 `#2F3640`）
- Base radius: `0.625rem (10px)`
- 无语义化的颜色阶梯（neutral-g0~g10）和组件尺寸 token

**差距：** ⚠️ 基础色值已比较接近 Lovart，但缺少系统化的颜色阶梯和语义化 token 体系

---

## 七、功能差距汇总（按优先级）

### P0 — 核心体验差距

| # | 功能 | 描述 | 工作量估计 |
|---|------|------|-----------|
| 1 | 项目列表页升级 | 从列表视图改为卡片网格（缩略图 + 标题 + 日期） | 中 |
| 2 | Chat 空状态 & Skills | 引导用户使用预设 skill 快捷按钮 | 小 |
| 3 | 用户消息气泡 | 添加 `bg-[#F7F7F7] rounded-xl p-3` 样式区分 | 小 |
| 4 | Chat 输入升级 | Lexical 编辑器，@ mention，附件上传，Agent 切换 | 大 |
| 5 | Canvas 空状态提示 | "输入你的想法开始创作，或按 C 开始对话" | 小 |
| 6 | 底部工具栏 | 自定义 canvas 编辑工具条（覆盖 Excalidraw 默认） | 中 |

### P1 — 体验增强

| # | 功能 | 描述 | 工作量估计 |
|---|------|------|-----------|
| 7 | "思考中" 动画 | Agent 响应时的 loading 状态 | 小 |
| 8 | 设计 Token 系统 | 系统化 CSS 变量，语义化颜色 | 中 |
| 9 | Inter 字体 | 全站统一使用 Inter 字体 | 小 |
| 10 | 左侧画布控件 | 自定义缩放、图层、搜索控件 | 中 |
| 11 | Chat panel 折叠 | 点击按钮展开/收起聊天面板 | 小 |
| 12 | 对话分享功能 | 生成分享链接 | 中 |
| 13 | 音效反馈 | thinking/complete/rise 音效 | 小 |

### P2 — 差异化功能

| # | 功能 | 描述 | 工作量估计 |
|---|------|------|-----------|
| 14 | Brand Kit | 品牌套件管理（logo、颜色、字体） | 大 |
| 15 | 会员 / 计费体系 | Credits 系统，订阅管理 | 大 |
| 16 | 团队协作 | 多人项目 + 权限管理 | 大 |
| 17 | AI 生视频 | 视频生成工具 | 大 |
| 18 | 右侧浮动按钮 | QR/分享 + AI 快捷入口 | 小 |
| 19 | 前端监控 | Sentry 错误上报 + 日志遥测 | 中 |

---

## 八、可直接采纳的样式规范

### 颜色体系建议
```css
:root {
  /* Canvas */
  --canvas-bg: #f5f5f5;

  /* Chat */
  --chat-user-bubble-bg: #f7f7f7;
  --chat-user-bubble-text: #363636;
  --chat-assistant-text: #2f3640;
  --chat-input-border: #e3e3e3;
  --chat-input-border-focus: #147dff;

  /* Text hierarchy */
  --text-primary: rgba(0, 0, 0, 0.9);
  --text-secondary: rgba(0, 0, 0, 0.6);
  --text-tertiary: rgba(0, 0, 0, 0.3);

  /* Border */
  --border-light: rgba(0, 0, 0, 0.07);
  --border-medium: rgba(0, 0, 0, 0.12);
  --border-hairline: 0.5px;

  /* Brand */
  --brand-blue: #147dff;
  --brand-dark: #2f3640;

  /* Component sizes */
  --size-xs: 16px;
  --size-s: 28px;
  --size-m: 32px;
  --size-l: 40px;
}
```

### 关键组件样式
```css
/* 用户消息气泡 */
.user-bubble {
  background: #f7f7f7;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  color: #363636;
}

/* 工具栏按钮 */
.tool-button {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  transition: background 150ms;
}
.tool-button.active {
  background: #2c2c2c;
  color: white;
}

/* Skill 标签 */
.skill-pill {
  height: 36px;
  border-radius: 9999px;
  padding: 0 14px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  font-size: 14px;
}

/* 发送按钮 */
.send-button {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  background: #2f3640;
  color: white;
}
.send-button:hover {
  background: #4a535f;
}

/* Agent pill */
.agent-pill {
  border-radius: 9999px;
  border: 0.5px solid #147dff;
  color: #147dff;
  height: 32px;
  padding: 0 8px;
}
```
