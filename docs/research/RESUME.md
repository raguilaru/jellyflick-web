# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## Status at the last stop (2026-10-10, second session)

**Merged into `feat/jellyflick-v1`** (tip `2d9d6d4`, pushed, draft PR #38 open):

| Ticket | State |
|---|---|
| #2 Connect to a Server | merged — **issue still open, needs closing** |
| #3 Sign in with a password | merged — **issue still open, needs closing** |
| #5 Deployable container | merged — **issue still open, needs closing** |

Gate re-verified on the integration tip at the start of this session and clean:
`lint` and `typecheck` pass, **115 unit tests**, **33 Playwright tests** across
desktop/phone/keyboard-only, and the `chrome68` build succeeds.

### Bookkeeping trap — read this before trusting `blocked_by`

The three merged tickets were **never closed**, so GitHub still reports
`blocked_by: 1` for both #4 and #6 (each blocked by the open #3). The dependency is
satisfied in substance — #3's work is on the integration branch. Closing #2, #3 and #5
is what makes the live graph truthful again. Do not read a non-zero `blocked_by` on #4
or #6 as real work remaining.

### In flight right now

Two implementers were launched in this session, in their own worktrees, both based on
`2d9d6d4`:

| Ticket | Branch | Worktree |
|---|---|---|
| #6 App shell | `ticket/6-app-shell` | `.claude/worktrees/ticket-6-app-shell` |
| #4 New on Jellyflick on Home | `ticket/4-new-on-jellyflick-on-home` | `.claude/worktrees/ticket-4-new-on-home` |

Neither has been merged, pushed, or had its issue closed — that was reserved for the
integrator. If this session died mid-flight, see *Recovering an interrupted implementer*
below; the branches are durable even though the agents' context is not.

They collide on the Home screen, so ownership was split explicitly in both briefs:
**#6 owns** the theme, wordmark, routing, the two navigation bars and the Back handler,
keeping Home a thin placeholder; **#4 owns** Home's contents and adds the first real Row.
Each was told the other is in flight. **#7 needs both.**

**Not yet done, and owed:** every ticket from #7 onward, the `code-review` pass over the
integration branch, the history rewrite in `decisions.md` §10, marking PR #38 ready, and
removing the agent worktrees.

### Tickets whose acceptance boxes cannot be ticked as written

- **#5, second box** — it says the entrypoint writes the MDBList key into the runtime
  config. ADR 0004 forbids the key reaching the browser, so the box is superseded. Say so
  when closing the ticket rather than ticking it.

## Where the work lives

- **Integration branch**: `feat/jellyflick-v1`, pushed, draft PR #38 open against `main`.
- **Per-ticket branches**: `ticket/<n>-<slug>`, each built in its own git worktree under
  `.claude/worktrees/`. Commits on these branches are durable whether or not the agent
  that made them is still alive.
- **The task graph**: `docs/research/task-graph.md`. GitHub native issue dependencies are
  the source of truth; query a ticket's live gate with
  `gh api repos/:owner/:repo/issues/<n> --jq .issue_dependencies_summary.blocked_by`
  — but see the bookkeeping trap above before believing a non-zero answer.

## How to pick up

1. Read `docs/research/decisions.md` — binding, and it overrides spec #1 where they differ.
2. Read `docs/architecture.md` — the codebase map ticket #2 left for implementers.
3. Find the frontier: open tickets whose `blocked_by` count is 0, after confirming every
   already-merged ticket has actually been closed.
4. For each, spawn one implementer per ticket in its own worktree on `ticket/<n>-<slug>`
   based on the current tip of `feat/jellyflick-v1`, briefed with **pointers only**
   (the ticket, the spec, `decisions.md`, the research notes, `docs/architecture.md`) —
   never by restating their content. Each implementer drives the `tdd` skill, runs
   `npm ci` first in its fresh worktree, and merges the integration tip into its own
   branch before reporting done.
5. Merge each finished branch into `feat/jellyflick-v1`. Spawn a merger subagent only
   when branches actually conflict; a clean merge is faster done inline.
6. Verify after every merge: `npm run lint && npm run typecheck && npm test &&
   npm run test:e2e && npm run build`.

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
   session that list includes three stale `agent-*` worktrees from the first session plus
   the two `ticket-*` worktrees created here.
