# Shared Agent Workflows

`.agents/skills/` is the only source for reusable agent workflows in this repository.

- Put Agent Skills in `skills/<skill-name>/`, with a `SKILL.md` entry point.
- Add `skills/<skill-name>/agents/openai.yaml` for every shared skill. Define its Codex display name, short description, and default prompt there.
- Do not add command aliases or duplicate skill content.
- Do not edit through `.claude/` or `.codex/`; those paths expose the canonical skill files in each tool's native location.

Integration layout:

- Claude Code: `.claude/skills` is a symlink to `.agents/skills`.
- Codex: `.codex/skills` is a compatibility symlink to `.agents/skills`.
