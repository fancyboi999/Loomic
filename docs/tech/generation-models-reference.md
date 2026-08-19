# Loomic 图片/视频生成模型参考手册

> 覆盖 Loomic 支持的全部图片和视频生成模型，包括每个模型的原始参数、工具层归一化方案、以及 Provider 层的参数映射逻辑。

---

## 一、架构概览

```
LLM Agent
  │
  ├─ generate_image tool (归一化 schema)
  │     │
  │     └─ ReplicateImageProvider.generate()  ← 参数映射到各模型
  │           │
  │           └─ POST replicate.com/v1/models/{model}/predictions
  │
  └─ generate_video tool (归一化 schema)
        │
        └─ Provider Registry
              ├─ ReplicateVideoProvider.generate()
              └─ MetasoVideoProvider.generate() ← MiniMax H3 V2 异步任务
```

### 三层归一化设计

| 层 | 职责 | 文件 |
|---|---|---|
| **Tool 层** | LLM 调用的统一 schema，语义化参数 | `agent/tools/image-generate.ts`, `video-generate.ts` |
| **Provider 层** | 将归一化参数映射到各模型的 Replicate API 输入 | `providers/replicate-image.ts`, `replicate-video.ts` |
| **API 层** | Replicate REST API，`Prefer: wait` 同步等待 | `api.replicate.com/v1` |

---

## 二、图片模型

### 2.1 Tool 层归一化 Schema (`generate_image`)

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `title` | string | (必填) | 图片元数据标题 |
| `prompt` | string | (必填) | 详细的图片描述 |
| `model` | enum | `flux-kontext-pro` | 从注册表动态构建 |
| `aspectRatio` | `1:1 \| 16:9 \| 9:16 \| 4:3 \| 3:4` | `1:1` | 宽高比 |
| `quality` | `standard \| hd \| ultra` | `hd` | 语义化质量级别 |
| `outputFormat` | `png \| jpg \| webp` | (可选) | 输出格式 |
| `inputImages` | string[] | (可选) | 参考图 URL |
| `placementX/Y` | number | (可选) | Canvas 放置坐标 |
| `placementWidth/Height` | number | 512 | Canvas 显示尺寸 |

### 2.2 模型清单（12 个）

| 模型 ID | 名称 | 厂商 | 图片输入 | 纯文本 | 最高分辨率 |
|---|---|---|---|---|---|
| `google/nano-banana-pro` | Nano Banana Pro | Google | 最多 14 张 | N | 4K |
| `google/nano-banana-2` | Nano Banana 2 | Google | 最多 14 张 | N | 4K |
| `google/nano-banana` | Nano Banana | Google | 最多 14 张 | N | 2K |
| `google/imagen-4` | Imagen 4 | Google | **不支持** | Y | 2K |
| `openai/gpt-image-1.5` | GPT Image 1.5 | OpenAI | 多张 | N | 2K |
| `black-forest-labs/flux-kontext-max` | Flux Kontext Max | BFL | **仅 1 张** | N | 1K |
| `black-forest-labs/flux-kontext-pro` | Flux Kontext Pro | BFL | **仅 1 张** | N | 1K |
| `bytedance/seedream-5-lite` | Seedream 5.0 Lite | ByteDance | 多张 | N | 3K |
| `bytedance/seedream-4.5` | Seedream 4.5 | ByteDance | 多张 | N | 4K |
| `bytedance/seedream-4` | Seedream 4 | ByteDance | 多张 | N | 4K |
| `recraft-ai/recraft-v3` | Recraft V3 | Recraft | **不支持** | Y | 1K |

### 2.3 Provider 层参数映射

#### 图片输入参数名（不同模型用不同字段名）

| 分组 | Replicate 参数名 | 模型 |
|---|---|---|
| **单图** | `input_image` (string) | Flux Kontext Pro/Max |
| **多图(OpenAI)** | `input_images` (string[]) | GPT Image 1.5 |
| **多图(默认)** | `image_input` (string[]) | Nano Banana 全系列, Seedream 全系列 |
| **纯文本** | (不传) | Imagen 4, Recraft V3 |

#### Quality → 模型特定分辨率参数

Tool 层的 `standard / hd / ultra` 被翻译为每个模型各自的分辨率参数：

| 模型 | Replicate 参数名 | standard | hd | ultra |
|---|---|---|---|---|
| Nano Banana Pro / 2 | `resolution` | "1K" | "2K" | "4K" |
| Imagen 4 | `image_size` | "1K" | "2K" | "2K" (封顶) |
| GPT Image 1.5 | `quality` | "medium" | "high" | "high" (封顶) |
| Seedream 5 Lite | `size` | "2K" | "2K" | "3K" |
| Seedream 4.5 | `size` | "2K" | "2K" | "4K" |
| Seedream 4 | `size` | "1K" | "2K" | "4K" |
| Flux / Recraft / Nano Banana | (不传) | — | — | — |

#### Aspect Ratio 特殊处理

| 模型 | 处理方式 |
|---|---|
| Recraft V3 | 转为像素 `size`（如 `"1024x1024"`），不传 `aspect_ratio` |
| GPT Image 1.5 | 限制为 `1:1, 3:2, 2:3`，其他比例自动归一化到最近 |
| 其他所有模型 | 直接传 `aspect_ratio` |

#### Output Format 支持

| 模型 | 是否支持 `output_format` |
|---|---|
| Seedream 4/4.5, Recraft V3 | **不支持**（跳过） |
| 其他所有模型 | 支持 |

---

## 三、视频模型

### 3.1 Tool 层归一化 Schema (`generate_video`)

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `prompt` | string | (必填) | 详细视频描述（动作、镜头、光线、情绪） |
| `model` | enum | `wan-2.6` | 从注册表动态构建，含能力描述 |
| `duration` | int (3-16) | 5 | 视频时长（秒），按模型约束 |
| `resolution` | `480p \| 720p \| 1080p` | `720p` | 输出分辨率 |
| `aspectRatio` | `1:1 \| 16:9 \| 9:16 \| 4:3 \| 3:4` | `16:9` | 宽高比 |
| `inputImages` | string[] (max 7) | (可选) | I2V 参考图（首帧/参考） |
| `inputVideo` | string | (可选) | V2V 源视频（仅 Kling O1） |
| `enableAudio` | boolean | true | 是否生成同步音频 |

### 3.2 模型清单

| 模型 ID | 名称 | 厂商 | T2V | I2V | V2V | 音频 | 最大时长 | 分辨率 | 最大参考图 |
|---|---|---|---|---|---|---|---|---|---|
| `kwaivgi/kling-v3-video` | Kling 3.0 | 快手 | Y | Y | — | Y | 15s | 1080p | 1 |
| `kwaivgi/kling-v3-omni-video` | Kling 3.0 Omni | 快手 | Y | Y | Y | Y | 15s | 1080p | 7 |
| `kwaivgi/kling-v2.6` | Kling 2.6 | 快手 | Y | Y | — | Y | 10s | 1080p | 1 |
| `kwaivgi/kling-o1` | Kling O1 | 快手 | — | — | **Y** | Y | 10s | **4K** | 0 |
| `bytedance/seedance-1.5-pro` | Seedance 1.5 Pro | ByteDance | Y | Y | — | Y | 10s | 1080p | 1 |
| `wan-video/wan-2.6` | Wan 2.6 | Alibaba | Y | Y | — | Y | 10s | 1080p | 1 |
| `openai/sora-2` | Sora 2 | OpenAI | Y | Y | — | Y | 12s | 1080p | 1 |
| `openai/sora-2-pro` | Sora 2 Pro | OpenAI | Y | Y | — | Y | 12s | 1080p | 1 |
| `google/veo-3` | Veo 3 | Google | Y | — | — | Y | 8s | 1080p | 0 |
| `google/veo-3.1` | Veo 3.1 | Google | Y | Y | — | Y | 8s | 1080p | 3 |
| `google/veo-3.1-fast` | Veo 3.1 Fast | Google | Y | Y | — | Y | 8s | 1080p | 3 |
| `minimax/hailuo-2.3` | Hailuo 2.3 | MiniMax | Y | Y | — | **—** | 10s | 1080p | 1 |
| `vidu/q3-pro` | Vidu Q3 Pro | 生数科技 | Y | Y | — | Y | **16s** | 1080p | 1 |
| `metaso/minimax-h3` | MiniMax H3 (Metaso) | 秘塔 | Y | Y（首帧/首尾帧） | — | — | **15s** | 768P / 2K | 2 |

### 3.3 Provider 层参数映射

#### Metaso MiniMax H3 V2 (`metaso/minimax-h3`)

| 归一化参数 | → Metaso 参数 | 说明 |
|---|---|---|
| `prompt` | `content[{type:"text", text}]` | 1–7000 字符 |
| `inputImages[0]` | `first_frame` | 首帧，可选 |
| `inputImages[1]` | `last_frame` | 尾帧，可选；有图片时 `ratio=adaptive` |
| `duration` | `duration` | 4–15 秒整数 |
| `resolution=720p` | `resolution=768P` | 10.2 H3 积分/秒 |
| `resolution=1080p` | `resolution=2K` | 17 H3 积分/秒 |

创建任务调用 `POST v2/video_generation`，随后轮询 `GET v2/query/video_generation/{task_id}`，仅将 `succeeded` 的 `task.content.url` 作为视频结果。当前集成不声明参考视频、音频或运行中取消能力。

项目统一使用共享的 `getVideoCreditCost()` 计算预估和实际扣分。Metaso H3 按“每秒费率 × 生成秒数”计费，并向上取整为整数 Loomic 积分；人民币区间只用于价格透明展示，不参与扣款。

#### 每个模型的 Replicate API 输入参数

**Kling 3.0 / 3.0 Omni / 2.6** (`kwaivgi/kling-v3-video`, `kwaivgi/kling-v3-omni-video`, `kwaivgi/kling-v2.6`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | **string** | `"5"`, `"10"`, `"15"` (字符串) |
| `aspectRatio` | `aspect_ratio` | string | |
| `inputImages[0]` | `image_url` | string | 首帧图 |
| `enableAudio` | `audio` | boolean | |

**Kling O1** (`kwaivgi/kling-o1`) — V2V 专用

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | 编辑指令 |
| `inputVideo` | `input_video` | string | **必填** |
| `duration` | `duration` | string | |

**Seedance 1.5 Pro** (`bytedance/seedance-1.5-pro`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | **number** | 5 或 10 (数字) |
| `aspectRatio` | `aspect_ratio` | string | |
| `inputImages[0]` | `image` | string | 首帧图 |
| `enableAudio` | `audio` | boolean | |

**Wan 2.6** (`wan-video/wan-2.6`) — 自动路由

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| (endpoint) | 有图: `wan-video/wan-2.6-i2v`<br>无图: `wan-video/wan-2.6-t2v` | | **自动选择端点** |
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | |
| `aspectRatio` | `aspect_ratio` | string | |
| `resolution` | `resolution` | string | (可选) |
| `inputImages[0]` | `image` | string | 首帧图 |
| `enableAudio` | `enable_audio` | boolean | |

**Sora 2 / 2 Pro** (`openai/sora-2`, `openai/sora-2-pro`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | 4-12 |
| `resolution` | `resolution` | string | 默认 "720p" |
| `aspectRatio` | `aspect_ratio` | string | |
| `inputImages[0]` | `image_url` | string | 首帧图 |

**Veo 3** (`google/veo-3`) — 纯 T2V

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | 固定 8 |
| `aspectRatio` | `aspect_ratio` | string | |
| `enableAudio` | `generate_audio` | boolean | |

**Veo 3.1 / 3.1 Fast** (`google/veo-3.1`, `google/veo-3.1-fast`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | 4, 6, 或 8 |
| `aspectRatio` | `aspect_ratio` | string | |
| `inputImages[0]` | `image` | string | 参考图 |
| `enableAudio` | `generate_audio` | boolean | |

**Hailuo 2.3** (`minimax/hailuo-2.3`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | 6 或 10 |
| `aspectRatio` | `aspect_ratio` | string | |
| `inputImages[0]` | `image_url` | string | 首帧图 |
| (enableAudio) | (不传) | — | **不支持音频** |

**Vidu Q3 Pro** (`vidu/q3-pro`)

| 归一化参数 | → Replicate 参数 | 类型 | 备注 |
|---|---|---|---|
| `prompt` | `prompt` | string | |
| `duration` | `duration` | number | 4-16 |
| `aspectRatio` | `aspect_ratio` | string | |
| `resolution` | `resolution` | string | (可选) |
| `inputImages[0]` | `image` | string | 首帧图 |
| `enableAudio` | `audio` | boolean | |

### 3.4 参数差异汇总

#### 图片输入参数名

| 参数名 | 使用模型 |
|---|---|
| `image_url` | Kling 3.0/Omni/2.6, Sora 2/Pro, Hailuo 2.3 |
| `image` | Seedance 1.5 Pro, Wan 2.6, Veo 3.1/Fast, Vidu Q3 Pro |
| `input_video` | Kling O1 (V2V 专用) |

#### 音频开关参数名

| 参数名 | 使用模型 |
|---|---|
| `audio` | Kling 全系列, Seedance, Vidu Q3 Pro |
| `enable_audio` | Wan 2.6 |
| `generate_audio` | Veo 3/3.1/3.1 Fast |
| (不支持) | Hailuo 2.3 |

#### Duration 类型差异

| 类型 | 使用模型 |
|---|---|
| **string** (`"5"`, `"10"`) | Kling 全系列 |
| **number** (`5`, `10`) | 其他所有模型 |

---

## 四、Job Queue 配置

| 参数 | 图片生成 | 视频生成 |
|---|---|---|
| Queue 名称 | `image_generation_jobs` | `video_generation_jobs` |
| Job Type | `image_generation` | `video_generation` |
| Visibility Timeout | 120s (2 分钟) | 300s (5 分钟) |
| Poll Interval | 2s | 3s |
| Max Wait (Agent) | 120s | 300s |
| Max Retries | 3 | 3 |
| 存储路径 | `{ws}/generated/{ts}-{id}.png` | `{ws}/generated/{ts}-{id}.mp4` |
| 存储 Bucket | `project-assets` (public) | `project-assets` (public) |

---

## 五、API 端点

| 端点 | 方法 | 说明 |
|---|---|---|
| `/api/image-models` | GET | 返回所有注册图片模型 |
| `/api/video-models` | GET | 返回所有注册视频模型（含 capabilities/limits） |
| `/api/jobs/image-generation` | POST | 创建图片生成任务 |
| `/api/jobs/video-generation` | POST | 创建视频生成任务 |
| `/api/jobs/:jobId` | GET | 查询任务状态 |
| `/api/jobs/:jobId/cancel` | POST | 取消任务 |

---

## 六、代码文件索引

| 文件 | 职责 |
|---|---|
| `apps/server/src/generation/types.ts` | 所有类型定义（Image/Video Params, Provider 接口, VideoModelInfo） |
| `apps/server/src/generation/providers/registry.ts` | Provider 注册表（注册、查找、模型枚举） |
| `apps/server/src/generation/providers/replicate-image.ts` | 图片 Provider（12 模型 + 参数映射） |
| `apps/server/src/generation/providers/replicate-video.ts` | 视频 Provider（13 模型 + 参数映射） |
| `apps/server/src/agent/tools/image-generate.ts` | 图片工具（动态 schema + job/direct 双模式） |
| `apps/server/src/agent/tools/video-generate.ts` | 视频工具（动态 schema + job/direct 双模式） |
| `apps/server/src/features/jobs/executors/image-generation.ts` | 图片任务执行器 |
| `apps/server/src/features/jobs/executors/video-generation.ts` | 视频任务执行器 |
| `apps/server/src/worker.ts` | Worker 进程（轮询两个队列） |
| `apps/server/src/features/jobs/job-service.ts` | Job 服务（创建/状态/取消） |
| `packages/shared/src/job-contracts.ts` | 共享类型和 API schema |
