# Lovart Canvas & Agent Architecture Research

> Research date: 2026-03-24
> Method: Real Chrome browser automation (CDP port 9222), fetch/XHR interception, DOM inspection
> Target: https://www.lovart.ai/canvas?projectId=90e54b0f14174526bcafa941d3a2b7f0

---

## 1. Canvas Engine

**Lovart uses tldraw** (confirmed via `window.__tldraw__hardReset` global variable).

- React app (`#root`, NOT Next.js)
- UI libraries: Mantine + Ant Design + custom `lo-button` components
- Chat editor: Lexical (`data-lexical-editor="true"`)
- Analytics: Sentry, Statsig (feature flags), Hotjar

---

## 2. Canvas Toolbar (Bottom Bar)

| data-testid | Tool | Description |
|---|---|---|
| `nav-select-menu-button` | Select / Pan | Select elements or pan canvas (H key) |
| `nav-mark-button` | Mark | Marker/pointer tool |
| `nav-upload-menu-button` | Upload | Sub-menu: Upload Image / Upload Video |
| `nav-frame-button` | Frame | Create frames/artboards for organized layouts |
| `nav-shape-menu-button` | Shapes | Shape tools (rectangle, circle, etc.) |
| `nav-pen-menu-button` | Pen | Drawing/brush tools |
| `nav-text-button` | Text | Text insertion tool |
| `generate-menu-image` | **AI Image Gen** | Creates Image Generator frame ON canvas |
| `generate-menu-video` | **AI Video Gen** | Creates Video Generator frame ON canvas |

### Canvas Controls (Bottom-left)

| data-testid | Function |
|---|---|
| `canvas-background-button` | Canvas background color/settings |
| `float-layer-button` | Layer panel (sidebar, shows all elements with thumbnails) |
| `float-file-search-button` | File/asset search |
| `zoom-in-button` / `zoom-out-button` / `zoom-percentage` | Zoom controls |

---

## 3. AI Generation — Two Paths

### Path A: Canvas-Native (Direct Frame)

Clicking the toolbar's Image/Video button creates a **generator frame directly on the canvas**, independent of the Agent chat.

**Image Generator Frame:**
- Default size: 1024 × 1024
- Prompt input embedded in the frame: "今天我们要创作什么"
- Model selector dropdown (default: Nano Banana Pro)
- Resolution: 1K
- Aspect ratio: 1:1
- Generate button (costs ~10 credits)

**Video Generator Frame:**
- Default size: 1920 × 1080
- Prompt input + reference frame upload (首尾帧 first/last frame)
- Motion control tab (动作控制)
- Model: Kling 2.6
- Aspect ratio: 16:9, Duration: 5s
- Generate button (costs ~2 credits)

### Path B: Agent-Mediated (Chat)

User describes intent in chat → Agent (Coco) decides tool + model + parameters → generates image/video → places on canvas via `saveAgentImage` API.

**Key difference:** Path A gives user direct control over model/params. Path B is intent-driven — the Agent decides everything.

---

## 4. Agent Panel (Right Side)

### Panel Structure

| data-testid | Element |
|---|---|
| `agent-panel-container` | Full panel wrapper |
| `agent-new-chat-button` | Start new conversation |
| `agent-history-button` | View chat history list |
| `agent-share-button` | Share conversation |
| `agent-collapse-button` | Collapse/expand panel |

### Chat Input Area

| data-testid | Element |
|---|---|
| `agent-message-input` | Input container (Lexical rich editor) |
| `agent-attachment-button` | Attach files/images to message |
| `agent-thinking-mode-button` | Toggle extended thinking |
| `agent-fast-mode-button` | Toggle fast response mode |
| `agent-custom-settings-button` | Model preferences popup |
| `agent-send-button` | Send message |

**Placeholder:** `Start with an idea, or type "@" to mention`

### @ Mention System

- Triggered by typing `@` in chat input
- Opens a Typeahead menu (`role="listbox"`)
- Allows referencing canvas elements or uploaded files
- This is the **user-driven context injection** mechanism — the agent does NOT autonomously scan the canvas

### Message Types

| data-testid | Type | Description |
|---|---|---|
| `user-message` | User message | Contains `user-message-text` + optional `user-message-image-*` |
| `agent-text-message` | Agent text | Plain text response |
| `agent-tool-use-primary` | Tool use | Shows model name (e.g. "Nano Banana Pro") + task title |
| `image-generation-card` | Image card | Displays generated image with title |
| `agent-task-completed` | Completion | Task done marker |

### Model Preferences (agent-custom-settings)

Three tabs: **Image** | **Video** | **3D**

**Image Models:**
| Model | Description | Speed |
|---|---|---|
| Nano Banana Pro | Professional's choice for advanced outputs | ~20s |
| Nano Banana 2 | Generalist fast image generation model | ~15s |
| GPT Image 1.5 | OpenAI's most advanced image model | ~120s |

**Video Model:** Kling 2.6
**3D:** Tab present (not explored further)

Auto-select toggle (自动): Lets the agent choose the best model automatically.

---

## 5. Layer Panel

- Toggled via `float-layer-button`
- Shows as a left sidebar (`layer-panel`)
- Two tabs: **图层** (Layers) and **历史记录** (History)
- Layer list displays all canvas elements with:
  - Thumbnail preview
  - Element name (e.g. "Image Generator 1", "极简咖啡品牌海报")
  - Type icon (frame icon, image icon, AI-generated "A" icon)
- Drag-to-reorder layers (standard design tool behavior)

---

## 6. API Architecture

### Agent Chat APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/canva/agent/queryAgentInfo?agentName=custom&onlyPublished=true` | GET (XHR) | Load agent configuration |
| `/api/canva/agent/queryAgentLastThread` | GET (XHR) | Get last active conversation thread |
| `/api/canva/agent/chatHistoryV2?threadId={id}` | GET (XHR) | Load full chat history (4KB+ response) |
| `/api/canva/agent/threadStatusV2?threadId={id}` | GET (XHR) | Check thread execution status |
| `/api/canva/agent/agentThreadList` | POST (XHR) | List all conversation threads |
| `/api/canva/agent/genShareCode` | POST (XHR) | Generate share link |

### Task Execution APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/canva/agent-cashier/task/take/slot` | POST | **Poll for task execution slot** (called repeatedly during generation, returns `{"status":"SUCCESS"}`) |
| `/api/canva/agent-cashier/task/query/unlimited` | GET (XHR) | Query remaining task credits/limits |
| `/api/canva/agent-cashier/device/info` | GET (XHR) | Device/session registration |

### Canvas Bridge APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/canva/agent/saveAgentImage` | POST (XHR, 359 bytes) | **Place generated image on canvas** — Agent decides position, this API executes it |
| `/api/canva/project/saveProject` | POST | Save full project/canvas state |

### Asset Delivery

| Pattern | Purpose |
|---|---|
| `/artifacts/agent/{hash}.jpg?x-oss-process=image/resize,w_1080,m_lfit/format,webp` | CDN-served generated images with OSS image processing |
| `/lovart_assets/loadingLottie-v2.gif` | Loading animation |

### User/Account APIs

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/www/lovart/member/account` | GET | Account type/subscription (returns package type, level, credits) |
| `/api/www/lovart/login/query/user/info` | GET | User authentication check |
| `/api/www/lovart/teams/queryCurrentAccount` | POST | Team/workspace info |

---

## 7. Agent Execution Flow

```
User sends message in chat
  │
  ├─► Streaming response begins (SSE — not captured, established before interceptor)
  │   └─► Agent text streams to chat panel
  │
  ├─► Agent decides to generate image
  │   ├─► task/take/slot polling begins (every ~2-3s)
  │   │   └─► Returns {"status":"SUCCESS"} when slot available
  │   ├─► Image generation starts (server-side, ~15-20s)
  │   ├─► Artifact URL becomes available: /artifacts/agent/{hash}.jpg
  │   └─► task/take/slot polling continues until completion
  │
  ├─► Image generation complete
  │   ├─► saveAgentImage POST (agent-decided position/size → canvas placement)
  │   ├─► Image rendered in chat as image-generation-card
  │   └─► Image rendered on tldraw canvas
  │
  └─► Agent sends completion text + agent-task-completed marker
```

**Key insight: `saveAgentImage` is called with positioning data. The agent (server-side) decides WHERE on the canvas to place the image — it's not hardcoded client-side logic.**

---

## 8. Canvas Context Model

Based on the leaked system prompt analysis + browser observation:

1. **Agent does NOT autonomously inspect the canvas** — The leaked prompt explicitly says "do not guess image content"
2. **`@` mention = explicit context injection** — Users select which elements to reference
3. **MCoT engine** (Multi-Chain of Thought) — Server-side spatial reasoning layer that helps the agent make layout decisions
4. **Agent CAN respond to layout instructions** — Tested with "put the coffee poster image to the center of the canvas", agent entered "思考中" (thinking) and was processing the request

**Context injection strategy:** Lightweight → On-demand
- The agent doesn't receive full canvas state on every message
- Canvas context is injected when the user explicitly references elements via `@` mention
- The agent can request canvas state through internal tools when needed for layout tasks

---

## 9. Feature Comparison: Lovart vs Loomic

| Feature | Lovart | Loomic (Current) | Priority |
|---|---|---|---|
| **Canvas engine** | tldraw ($6K/yr license) | Excalidraw (open source) | — (keep Excalidraw) |
| **Canvas-native AI gen** | Image/Video Generator frames on canvas | None (chat-only) | Medium |
| **Agent architecture** | Main (Coco) + Sub-agents (Lumen, Cameron) | Single agent, 3 tools | **High** |
| **System prompt** | Rich product persona + role boundaries | Generic one-liner | **High** |
| **Canvas awareness** | `@` mention (user-driven context injection) | None | **High** |
| **Canvas control** | Server-driven placement (saveAgentImage with coordinates) | Client-driven fixed-center placement | **High** |
| **Layer management** | Full layer panel + history | None | Low |
| **Model selection** | Multiple models per category, auto-select | Single model | Medium |
| **Chat features** | Thinking mode, Fast mode, Attachments, Share | Basic chat | Low |
| **Frames/Artboards** | Frame tool for organized design | None | Low |
| **Feedback** | Like/Dislike per message | None | Low |
| **Credits system** | Per-task credit consumption | None | Low |

---

## 10. Implications for Loomic Agent Architecture

### High Priority (Agent Redesign)

1. **Product-identity system prompt**: Lovart's Coco has a full persona, role boundaries, and behavioral rules. Loomic's agent needs a comparable identity that reflects the product's creative tool DNA.

2. **Sub-agent architecture**: Lovart separates conversation/routing (Coco) from execution (Lumen for images). Loomic should adopt a similar pattern:
   - Main agent: conversation, planning, canvas layout decisions
   - Image sub-agent: image generation task execution
   - Video sub-agent: video generation task execution

3. **`inspect_canvas` tool**: Lovart uses `@` mention for context injection. Loomic can go further with a tool that gives the agent a structured view of canvas state (elements, positions, sizes) without polluting the conversation context.

4. **Agent-controlled placement**: Move from client-side fixed-center placement to agent-decided positioning. The `saveAgentImage`-equivalent should accept `{ imageUrl, x, y, width, height }` so the agent can make spatial decisions.

### Medium Priority (Feature Parity)

5. **Canvas-native generation frames**: Allow image/video generation directly on canvas without going through chat (good for rapid iteration).

6. **Model selector**: Let users choose or let the agent auto-select the best model for the task.

### Low Priority (Polish)

7. Layer panel, chat attachments, thinking/fast mode toggles, share functionality, message feedback.

---

## Appendix: Raw Data

### Captured API Response Samples

**task/take/slot response:**
```json
{"code":0,"msg":null,"data":{"status":"SUCCESS"}}
```

**member/account response (truncated):**
```json
{
  "code": 0,
  "data": {
    "userId": 2900207,
    "name": "HOBBY",
    "accountLevel": 0,
    "accountLevelDesc": "None",
    ...
  }
}
```

### Key DOM Structure

```
#root
  └── .tlui-layout (tldraw)
       ├── [data-testid="canvas"] (tldraw canvas)
       ├── [data-testid="bottom-toolbar"] (custom toolbar)
       │    ├── nav-select-menu-button
       │    ├── nav-mark-button
       │    ├── nav-upload-menu-button
       │    ├── nav-frame-button
       │    ├── nav-shape-menu-button
       │    ├── nav-pen-menu-button
       │    ├── nav-text-button
       │    ├── generate-menu-image
       │    └── generate-menu-video
       ├── float-layer-button / float-file-search-button
       ├── zoom controls
       └── right-panel-wrapper
            └── [data-testid="agent-panel-container"]
                 ├── agent header (new chat / history / share / collapse)
                 ├── #agent-chat-sessions (scrollable message list)
                 │    ├── user-message → user-message-text / user-message-image-*
                 │    └── agent-chat-messages → agent-text-message / agent-tool-use-primary / image-generation-card
                 └── agent input area
                      ├── agent-message-input (Lexical contenteditable)
                      ├── agent-attachment-button
                      ├── agent-thinking-mode-button
                      ├── agent-fast-mode-button
                      ├── agent-custom-settings-button
                      └── agent-send-button
```
