# Canvas Design Skill — Integration & Verification Guide

## Local Development Setup

### Prerequisites

- Python 3.x installed locally
- `pip install pillow reportlab`
- Font files in `skills/canvas-design/canvas-fonts/`

### Environment Variables

```bash
# .env.local additions
LOOMIC_SANDBOX_ROOT=/tmp/loomic-sandbox-dev
LOOMIC_SKILLS_ROOT=../../skills
```

### Verification Steps

1. Start dev server: `pnpm dev`
2. Open a project in the web UI
3. Send message: "帮我生成一张极简主义风格的海报"
4. Verify:
   - Agent prompt contains enabled `canvas-design` instructions and its `SKILL.md` path
   - Agent uses `read_file` for any referenced files in that Skill
   - Agent calls `execute` tool with Python code
   - Generated PNG appears in sandbox tmpdir
   - Agent calls `persist_sandbox_file` to upload
   - User receives downloadable URL
   - Sandbox tmpdir cleaned up after run

### Production Deployment

The Dockerfile handles everything:
- Python + Pillow + reportlab installed in image
- Skills + fonts copied to `/opt/loomic/skills/`
- Default env vars work out of the box

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `execute` tool not available | Backend not sandbox | Check `LOOMIC_AGENT_BACKEND_MODE=state` and backend factory returns LocalShellBackend |
| Fonts not found | Wrong FONT_DIR | Check `LOOMIC_SKILLS_ROOT` env var |
| Sandbox dir fills up | Cleanup failed | Check runtime.ts finally block; add cron cleanup as safety net |
| Python not found | Not in Docker image | Rebuild Docker image |
| Skill not discovered | Skills path misconfigured or the workspace has disabled it | Check `LOOMIC_SKILLS_ROOT` and the workspace Skill setting |

### Adding New Skills

Place new skills in `skills/<skill-name>/SKILL.md` with `name` and `description`
frontmatter. Pi scans the configured directory on the next Agent run, advertises
the metadata, and includes enabled instructions in the Agent prompt. Referenced files
remain available through `read_file`. Skills
registered in the workspace database follow that workspace's enable setting.
