# Project skills

Skills live in `.agents/skills/` and are symlinked into `.claude/skills/` for Claude Code. The `skills` CLI manages both folders and `skills-lock.json`, so change skills through it rather than by editing the folders.

The CLI needs Node 22 (`.nvmrc`); under Node 20.12 it crashes on a missing `zlib.crc32`.

## Commands

- **Add:** `npx skills@latest add mattpocock/skills --skill <name> -y`. Write `--skill <name>` with a space: the `--skill=<name>` form is silently ignored and installs every skill in the source.
- **Remove:** `npx skills@latest remove <name> [<name>...] -y`
- **Restore from the lock file:** `npx skills@latest experimental_install`

The CLI asks questions when `-y` is missing, which a non-interactive shell can't answer.

## Left out on purpose

These upstream skills are not installed. Keep them out when updating or reinstalling:

- **Unfinished upstream** (`skills/in-progress/`): `chief-of-staff`, `claude-handoff`, `loop-me`, `setup-ts-deep-modules`, `writing-beats`, `writing-fragments`, `writing-shape`
- **Off-topic for this repo:** `migrate-to-shoehorn`, `scaffold-exercises`

Every installed skill's description loads into each agent turn, so add a skill only when this repo will use it.
