-- Fix Skills Toggle: Populate system skills content and auto-install for workspaces
--
-- Problem: System skills had empty skill_content in DB and were not installed
-- in workspace_skills, making the toggle non-functional.

-- =============================================================================
-- 1. Populate skill_content for system skills
-- =============================================================================

UPDATE public.skills
SET skill_content = $skill_content$
---
name: canvas-design
description: Create beautiful visual art as .png and .pdf files using design philosophy. Use when the user asks to create a poster, visual artwork, design piece, or static visual output via code generation. Requires the execute tool and Python with Pillow/reportlab.
license: Apache-2.0
metadata:
  author: anthropic
  version: "1.0"
  adapted-for: loomic
---

# Canvas Design Skill

These are instructions for creating visual artwork through code execution.
Output .md (philosophy) + .pdf or .png (artwork) files.

## Prerequisites

This skill requires:
- The `execute` tool (sandbox code execution)
- Python 3 with `Pillow` and `reportlab` installed
- Font files available at the path in `$FONT_DIR` environment variable

## Workflow

Complete in two steps:
1. Design Philosophy Creation (.md concept)
2. Express by creating it on a canvas via Python code execution (.pdf or .png)

## Step 1: Design Philosophy

Create a VISUAL PHILOSOPHY (not layouts or templates) that will be interpreted through:
- Form, space, color, composition
- Images, graphics, shapes, patterns
- Minimal text as visual accent

**Name the movement** (1-2 words): e.g., "Brutalist Joy" / "Chromatic Silence"

**Articulate the philosophy** (4-6 paragraphs) covering:
- Space and form
- Color and material
- Scale and rhythm
- Composition and balance
- Visual hierarchy

**Critical guidelines:**
- Avoid redundancy — each design aspect mentioned once
- Emphasize craftsmanship REPEATEDLY: "meticulously crafted", "master-level execution"
- Leave creative space for interpretation

## Step 2: Canvas Creation

Use the `execute` tool to run Python code that generates the artwork.

### IMPORTANT: Path Rules

**虚拟路径 vs 真实路径**：`ls` 和 `read_file` 工具使用虚拟路径（如 `/skills/...`），
但 `execute` 工具运行在真实 shell 中。Python 代码里**必须使用真实路径**。

规则：
1. **字体路径**：永远用 `os.environ["FONT_DIR"]`，不要硬编码
2. **输出文件**：永远用相对路径保存（如 `output.png`），文件会在沙箱工作目录中
3. **不要**把 `ls /skills/...` 看到的虚拟路径用在 Python 代码里

### Font Usage

字体通过 `$FONT_DIR` 环境变量访问（已在沙箱中预设）：

```python
import os
font_dir = os.environ["FONT_DIR"]  # 必须用环境变量，不要硬编码路径
fonts = [f for f in os.listdir(font_dir) if f.endswith(".ttf")]
```

Load fonts with Pillow:
```python
from PIL import ImageFont
font = ImageFont.truetype(os.path.join(font_dir, "WorkSans-Bold.ttf"), size=48)
```

Or with reportlab for PDF:
```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("WorkSans", os.path.join(font_dir, "WorkSans-Bold.ttf")))
```

### Available Font Families

**Serif:** CrimsonPro (Regular/Bold/Italic), Gloock, IBMPlexSerif (Regular/Bold/Italic/BoldItalic), InstrumentSerif, Italiana, LibreBaskerville, Lora, YoungSerif

**Sans-serif:** ArsenalSC, BricolageGrotesque (Regular/Bold), InstrumentSans, Jura, Outfit, PoiretOne, SmoochSans, WorkSans

**Monospace:** DMMono, GeistMono (Regular/Bold), IBMPlexMono (Regular/Bold), JetBrainsMono, RedHatMono, Tektur

**Display:** BigShoulders (Regular/Bold), Boldonse, EricaOne, NationalPark, Silkscreen, PixelifySans

**Handwritten:** NothingYouCouldDo

### Design Principles

- Create museum/magazine-quality work — dense patterns, systematic shapes, clinical typography
- Use a limited color palette (3-5 colors) that feels intentional and cohesive
- Text is always minimal and visual-first — never paragraphs, only essential words
- Use DIFFERENT fonts for different roles (display, body, labels, accents)
- Nothing may overlap; all elements must stay within canvas boundaries with proper margins
- Never cartoony or amateur — even for playful subjects, maintain sophistication

### Code Execution Pattern

Write a complete Python script, then execute it.

**所有路径必须用相对路径**（多用户并发时绝对路径会冲突）：

```
1. write_file path="generate.py"       ← 相对路径，不要用 /tmp/xxx
2. execute: python3 generate.py
3. Output: img.save("output.png")      ← 相对路径
4. execute: pwd                        ← 获取当前工作目录的完整路径
5. persist_sandbox_file filePath="{pwd输出}/output.png"
```

**禁止使用绝对路径写文件**：
- ❌ `write_file path="/tmp/script.py"` — 多用户会覆盖
- ✅ `write_file path="script.py"` — 每个用户独立沙箱

**Critical**: In Python scripts:
- Use `os.environ["FONT_DIR"]` for font paths（唯一允许的绝对路径）
- Save output with RELATIVE paths (e.g., `img.save("poster.png")`)
- Do NOT use `/skills/...` paths — those are virtual backend paths, not real filesystem

### Refinement Pass

After generating the initial artwork, take a second pass:
- Re-examine the code for alignment, spacing, color calibration
- Refine rather than add — make existing composition more cohesive
- The user expects "museum quality" — every detail matters

## Step 3: Persist Output

After generating the artwork file, use the `persist_sandbox_file` tool to upload
it to persistent storage. This gives the user a downloadable URL.

## Important Notes

- Always write complete Python scripts — do not use placeholders
- Canvas size recommendation: 2400×3200 px for posters, 1920×1080 for landscapes
- Save output as PNG (for raster) or PDF (for print-quality)
- The subtle reference from the user's request should be woven into the art like a jazz musician quoting another song — perceptible to insiders but invisible to others
$skill_content$
WHERE slug = 'canvas-design';

UPDATE public.skills
SET skill_content = $skill_content$
---
name: json-image-prompt
description: Use structured JSON prompts for AI image generation instead of free-form text. Produces more consistent, controllable, and high-quality results. Activate when the user asks to generate, create, or design images, illustrations, photos, posters, or any visual content via the generate_image tool.
license: Apache-2.0
metadata:
  author: loomic
  version: "1.0"
---

# JSON Image Prompt Skill

When generating images, always decompose the user's request into a structured JSON prompt before calling `generate_image`. JSON prompts eliminate ambiguity, improve consistency, and give the AI model clearer instructions.

## Why JSON Over Free-Form Text

| Free-form | JSON |
|-----------|------|
| "A beautiful sunset over mountains with dramatic lighting" | Each attribute is a separate, unambiguous key-value pair |
| Model guesses what "beautiful" and "dramatic" mean | You define exactly: golden hour, rim lighting, warm tones |
| Hard to iterate — rewrite everything | Change one field, keep the rest |
| Inconsistent results across runs | Same structure = reproducible quality |

## JSON Prompt Schema

Always structure the prompt as a JSON object with these fields:

```json
{
  "subject": {
    "type": "描述主体是什么（人物/物体/场景）",
    "details": "关键特征、姿态、表情、材质",
    "framing": "构图方式（全身/半身/特写/鸟瞰）"
  },
  "environment": {
    "setting": "场景描述",
    "time": "时间/时段",
    "weather": "天气/氛围条件"
  },
  "style": {
    "genre": "视觉风格（photorealistic/illustration/anime/oil-painting/3d-render/watercolor/flat-design）",
    "reference": "参考美学（如 Studio Ghibli / Swiss design / Brutalist / Art Deco）",
    "color_palette": "色彩倾向（warm/cool/monochrome/muted/vibrant + 具体色号如有）"
  },
  "lighting": {
    "type": "光源类型（natural/studio/neon/ambient/volumetric）",
    "direction": "光线方向（front/back/side/top/rim）",
    "quality": "光线质感（soft/harsh/diffused/dramatic/golden-hour）"
  },
  "camera": {
    "angle": "拍摄角度（eye-level/low-angle/high-angle/dutch-angle/overhead）",
    "lens": "镜头（wide-angle/telephoto/macro/fisheye/tilt-shift）",
    "depth_of_field": "景深（shallow/deep/selective）"
  },
  "mood": "情绪基调（1-3个关键词）",
  "negative": "需要避免的元素（可选）"
}
```

## 使用流程

### Step 1: 分析用户意图

用户说"帮我生成一张科技感的产品图"时，不要直接写一句话 prompt。先分解：
- 主体：产品（什么产品？什么角度？）
- 风格：科技感 → minimalist, clean, futuristic
- 灯光：科技感通常是 studio, rim lighting
- 情绪：professional, modern, premium

### Step 2: 构建 JSON Prompt

```json
{
  "subject": {
    "type": "wireless earbuds",
    "details": "matte black finish, floating in air, slight rotation showing both sides",
    "framing": "centered product shot"
  },
  "environment": {
    "setting": "pure dark gradient background",
    "time": "N/A (studio)",
    "weather": "N/A"
  },
  "style": {
    "genre": "photorealistic product photography",
    "reference": "Apple product page aesthetic",
    "color_palette": "dark with selective blue and white accents"
  },
  "lighting": {
    "type": "studio",
    "direction": "rim lighting from behind, subtle fill from front",
    "quality": "dramatic, high contrast"
  },
  "camera": {
    "angle": "eye-level, slightly elevated",
    "lens": "macro, 100mm equivalent",
    "depth_of_field": "shallow, product in sharp focus"
  },
  "mood": "premium, futuristic, minimal",
  "negative": "text, watermark, human hands, cluttered background"
}
```

### Step 3: 转换为 Prompt 字符串

将 JSON 扁平化为一段结构化的 prompt 文本传给 `generate_image`：

```
Product photography of wireless earbuds, matte black finish, floating in air with slight rotation showing both sides. Centered product shot. Pure dark gradient background. Photorealistic product photography, Apple product page aesthetic. Dark palette with selective blue and white accents. Studio rim lighting from behind with subtle fill from front, dramatic high contrast. Eye-level macro shot at 100mm, shallow depth of field with product in sharp focus. Premium, futuristic, minimal mood. --no text, watermark, human hands, cluttered background
```

**规则：JSON → prompt 转换时，按重要性排序：subject > style > lighting > camera > environment > mood > negative**

## 场景模板

### 人像摄影

```json
{
  "subject": {
    "type": "portrait of [person description]",
    "details": "[expression], [clothing], [pose]",
    "framing": "bust shot / headshot / full body"
  },
  "style": {
    "genre": "editorial photography",
    "color_palette": "warm skin tones, muted background"
  },
  "lighting": {
    "type": "natural",
    "direction": "side, Rembrandt lighting pattern",
    "quality": "soft, golden hour"
  },
  "camera": {
    "lens": "85mm portrait lens",
    "depth_of_field": "shallow, f/1.8"
  },
  "mood": "intimate, contemplative"
}
```

### 概念插画

```json
{
  "subject": {
    "type": "[concept or scene]",
    "details": "[key visual elements]",
    "framing": "wide establishing shot"
  },
  "style": {
    "genre": "digital illustration",
    "reference": "[art style reference]",
    "color_palette": "[specific palette or mood-based]"
  },
  "lighting": {
    "type": "volumetric / atmospheric",
    "quality": "cinematic"
  },
  "mood": "[2-3 emotion keywords]"
}
```

### 品牌/营销视觉

```json
{
  "subject": {
    "type": "[product or brand element]",
    "details": "[brand-specific details]",
    "framing": "hero shot"
  },
  "style": {
    "genre": "commercial photography / 3d-render",
    "reference": "[brand aesthetic]",
    "color_palette": "[brand colors]"
  },
  "lighting": {
    "type": "studio, three-point",
    "quality": "clean, professional"
  },
  "mood": "aspirational, on-brand"
}
```

## 重要原则

1. **每次生成图片前，先在内心构建 JSON 结构**，即使不输出给用户看
2. **Subject 永远最重要** — 如果描述不清楚主体，其他参数再好也没用
3. **少即是多** — 每个字段用精准的 2-5 个词，不要写散文
4. **negative 字段很关键** — 明确排除不想要的元素（文字、水印、变形等）
5. **迭代优化** — 如果第一次结果不理想，只调整 1-2 个字段重试，不要全部重写
6. **色彩要具体** — "warm tones" 不如 "golden amber (#D4A574) with deep burgundy (#722F37) accents"
7. **有品牌套件时** — 用 `get_brand_kit` 获取品牌色和字体，注入到 style.color_palette 和 subject.details
$skill_content$
WHERE slug = 'json-image-prompt';

-- =============================================================================
-- 2. Auto-install system skills for new workspaces
-- =============================================================================

CREATE OR REPLACE FUNCTION public.init_workspace_skills()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspace_skills (workspace_id, skill_id, enabled)
  SELECT NEW.id, s.id, true
  FROM public.skills s
  WHERE s.source = 'system'
  ON CONFLICT (workspace_id, skill_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_init_workspace_skills
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.init_workspace_skills();

-- =============================================================================
-- 3. Backfill existing workspaces with system skills
-- =============================================================================

INSERT INTO public.workspace_skills (workspace_id, skill_id, enabled)
SELECT w.id, s.id, true
FROM public.workspaces w
CROSS JOIN public.skills s
WHERE s.source = 'system'
ON CONFLICT (workspace_id, skill_id) DO NOTHING;
