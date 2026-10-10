## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for this repo and are managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See `docs/agents/triage-labels.md`.

### Codebase

Before writing app code, tests, CSS or a fake-Jellyfin endpoint, read `docs/architecture.md`: directory layout and where new code goes, how to run each test suite, how to add an endpoint to the fake Jellyfin, how to add a translated string, and the Chromium 68 traps.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Project skills

Before adding, removing or updating a skill in `.agents/skills/`, read `docs/agents/skills.md`.
