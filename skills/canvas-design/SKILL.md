---
name: canvas-design
description: Create beautiful visual art as .png and .pdf files using design philosophy. Use when the user asks to create a poster, visual artwork, design piece, or static visual output via code generation. Requires the execute_code tool and Python with Pillow/reportlab.
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

Use the `execute_code` tool (or `execute` if available) to run Python code that generates the artwork.

### Font Usage

Fonts are available at the path specified by the `$FONT_DIR` environment variable.
To list available fonts:

```python
import os
font_dir = os.environ.get("FONT_DIR", "/opt/loomic/skills/canvas-design/canvas-fonts")
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

Write a complete Python script, then execute it:

```
1. Use execute tool to write the Python script to a file
2. Use execute tool to run: python3 /path/to/script.py
3. The output file will be in the sandbox directory
4. Use persist_sandbox_file tool to upload it for the user
```

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
