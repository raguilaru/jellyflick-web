# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## Status at the last stop (2026-10-10, second session)

**Merged into `feat/jellyflick-v1`** (tip `ed9603b`, draft PR #38 open):

| Ticket | State |
|---|---|
| #2 Connect to a Server | merged, issue closed |
| #3 Sign in with a password | merged, issue closed |
| #5 Deployable container | merged, issue closed (second box superseded — see below) |
| #4 New on Jellyflick on Home | merged at `ed9603b`, **issue still open** |

Gate on the integration tip `ed9603b`, each step's exit code checked individually:
`lint` 0, `typecheck` 0, **140 unit tests** in 13 files, **54 Playwright tests**
across desktop/phone/keyboard-only with none failing, `chrome68` build
40.09 kB / 14.49 kB gz. This one is real — see the trap below for why the previous
figures were not.

### Two traps that have already bitten this run

**1. A merged ticket is not a closed ticket.** #2, #3 and #5 were merged in the first
session and never closed, so GitHub reported `blocked_by: 1` for #4 and #6 long after
their work was on the branch. All three are closed now. Before trusting any
`blocked_by`, confirm every already-merged ticket is actually closed.

**2. Never pipe a gate command into `tail`.** The previous "33 Playwright tests" green
baseline in this document was false. The e2e suite was in fact **42 tests with 9
failing**, and the run was reported as passing because piping Playwright into `tail`
makes the shell report `tail`'s exit status, not Playwright's. Run each gate step on its
own and check its own exit code:

```
for step in lint typecheck test build; do npm run $step > /tmp/$step.log 2>&1; echo "$step exit=$?"; done
npm run test:e2e > /tmp/e2e.log 2>&1; echo "e2e exit=$?"
```

The 9 failures were real and pre-existing: #3 (`74091d9`) removed the
"Connected to {serverName}." string when connecting began handing over to sign-in, but
#5's container journeys still asserted it. #5 and #3 merged in that order and the gate
was never re-run. Fixed on #4's branch in a standalone commit, `b24e2c8`, which repoints
those three assertions at the sign-in heading.

### In flight right now

| Ticket | Branch | Worktree |
|---|---|---|
| #6 App shell | `ticket/6-app-shell` | `.claude/worktrees/ticket-6-app-shell` |

Launched in this session off `2d9d6d4`, briefed with pointers only. Not merged, not
pushed, issue not closed — that is the integrator's job. It has been told about the
`b24e2c8` fix so it does not write a competing one, and told to judge its gate against
the post-merge state rather than this document's older figures.

Home-screen ownership was split explicitly between #6 and #4, and both were told the
other was in flight: **#6 owns** the theme, wordmark, routing, the two navigation bars
and the Back handler, keeping Home a thin placeholder; **#4 owns** Home's contents and
the first real Row. **#7 needs both.**

#4 left #6 one provisional CSS modifier to absorb and delete: `.screen--top` (content
from the top rather than stretched). #4 also added a `session` prop to `HomeScreen` and
deliberately left the wordmark and "Signed in as …" markup in place for #6 to replace.

**Not yet done, and owed:** #6's merge and issue, closing #4, every ticket from #7
onward, the `code-review` pass over the integration branch, the history rewrite in
`decisions.md` §10, marking PR #38 ready, and removing the agent worktrees.

### Tickets whose acceptance boxes cannot be ticked as written

- **#5, second box** — it says the entrypoint writes the MDBList key into the runtime
  config. ADR 0004 forbids the key reaching the browser, so the box is superseded. This
  was recorded in the closing comment on #5 rather than ticked.

### Decisions #4 made that later tickets inherit

- **`groupItems=false`** on `/Items/Latest`, against `jellyfin-api.md`'s suggestion: a
  Series' place in the Row is its newest Episode's date added, and only the client has
  seen every library, so the collapsing is the client's job. The fake Jellyfin now
  refuses any other value with an explanatory 400.
- **A library that will not answer is left out of the Row, not treated as empty**, so one
  unreadable library cannot quietly shorten it. Only a Server that will not list
  libraries makes the Row unavailable.
- `/UserViews` and `/Items/Latest` now require a token on the fake, as the real Server
  does. `failLibraryQueriesWith` is how a test simulates a Server that will not say what
  it holds.
- New gateway methods: `getUserViews()`, `getLatestItems({parentId, limit})`,
  `itemImageUrl(id, type, {tag, maxWidth})`. Artwork is requested at `maxWidth=400`.
- `src/catalogue/catalogue.ts` is the only place a `BaseItemDto` is read.
- `docs/architecture.md` was updated with all of the above.

## Where the work lives

- **Integration branch**: `feat/jellyflick-v1`, draft PR #38 open against `main`.
- **Per-ticket branches**: `ticket/<n>-<slug>`, each built in its own git worktree under
  `.claude/worktrees/`. Commits on these branches are durable whether or not the agent
  that made them is still alive.
- **The task graph**: `docs/research/task-graph.md`. GitHub native issue dependencies are
  the source of truth; query a ticket's live gate with
  `gh api repos/:owner/:repo/issues/<n> --jq .issue_dependencies_summary.blocked_by`
  — but see trap 1 above before believing a non-zero answer.

## How to pick up

1. Read `docs/research/decisions.md` — binding, and it overrides spec #1 where they differ.
2. Read `docs/architecture.md` — the codebase map, kept current by each ticket.
3. Find the frontier: open tickets whose `blocked_by` count is 0, after confirming every
   already-merged ticket has actually been closed.
4. For each, spawn one implementer per ticket in its own worktree on `ticket/<n>-<slug>`
   based on the current tip of `feat/jellyflick-v1`, briefed with **pointers only**
   (the ticket, the spec, `decisions.md`, the research notes, `docs/architecture.md`) —
   never by restating their content. Each implementer drives the `tdd` skill, runs
   `npm ci` first in its fresh worktree, and merges the integration tip into its own
   branch before reporting done.
5. Merge each finished branch into `feat/jellyflick-v1` with `--no-ff`. Spawn a merger
   subagent only when branches actually conflict; a clean merge is faster done inline.
6. Verify after every merge, one step at a time with its own exit code (see trap 2).

## Recovering an interrupted implementer

Its context is gone; its files are not.

```
git log --oneline feat/jellyflick-v1..ticket/<n>-<slug>   # what it committed
git -C .claude/worktrees/<worktree> status --short         # what it had not committed
```

Commit or discard the leftovers deliberately, then either finish the ticket or re-brief a
fresh implementer pointing at the branch as a starting point. Do not assume an unfinished
branch is correct — check its tests pass before building on it.

## Still owed at the end of the run

1. `code-review` over the whole integration branch, with findings fixed in one implementer.
2. **The git history rewrite** described in `decisions.md` §10 — removing the inspiration
   product's name from the root commit. Must happen with no implementers in flight, and
   the host must then ask GitHub Support to purge the stale objects.
3. Mark PR #38 ready for review.
4. Remove the agent worktrees (`git worktree list`, then `git worktree remove`). As of this
   session that list includes three stale `agent-*` worktrees from the first session,
   `ticket-4-new-on-home` (merged, safe to remove), and `ticket-6-app-shell` (in flight).
