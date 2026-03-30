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
