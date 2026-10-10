# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## Status at the last stop (2026-10-10)

**Merged into `feat/jellyflick-v1`** (tip pushed, draft PR #38 open):

| Ticket | State |
|---|---|
| #2 Connect to a Server | merged |
| #3 Sign in with a password | merged |
| #5 Deployable container | merged |

Gate on the integration branch at that point: `lint` and `typecheck` clean,
**115 unit tests**, **33 Playwright tests** across desktop/phone/keyboard-only, and a
`chrome68` build.

**The frontier is #4 and #6** — both unblocked by #3, neither started. #6 was launched
and stopped before it committed anything; its branch holds no work. #7 needs both.

**Not yet done, and owed:** every ticket from #4 onward, the `code-review` pass over the
integration branch, the history rewrite in `decisions.md` §10, marking PR #38 ready, and
removing the agent worktrees.

### If you resume #4 and #6 together

They collide on the Home screen. Split ownership explicitly: **#6 owns** the theme,
wordmark, routing, the two navigation bars and the Back handler, keeping Home a thin
placeholder; **#4 owns** Home's contents and adds the first real Row. Tell each that the
other is in flight.

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
  `gh api repos/:owner/:repo/issues/<n> --jq .issue_dependencies_summary.blocked_by`.

## How to pick up

1. Read `docs/research/decisions.md` — binding, and it overrides spec #1 where they differ.
2. Read `docs/architecture.md` — the codebase map ticket #2 left for implementers.
3. Find the frontier: open tickets whose `blocked_by` count is 0.
4. For each, spawn one implementer per ticket in its own worktree on `ticket/<n>-<slug>`
   based on the current tip of `feat/jellyflick-v1`, briefed with **pointers only**
   (the ticket, the spec, `decisions.md`, the research notes, `docs/architecture.md`) —
   never by restating their content. Each implementer drives the `tdd` skill, and merges
   the integration tip into its own branch before reporting done.
5. Merge each finished branch into `feat/jellyflick-v1`. Spawn a merger subagent only
   when branches actually conflict; a clean merge is faster done inline.
6. Verify after every merge: `npm run lint && npm run typecheck && npm test &&
   npm run test:e2e && npm run build`.

## Recovering an interrupted implementer

Its context is gone; its files are not.

```
git log --oneline feat/jellyflick-v1..ticket/<n>-<slug>   # what it committed
git -C .claude/worktrees/agent-<id> status --short          # what it had not committed
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
4. Remove the agent worktrees (`git worktree list`, then `git worktree remove`).
