# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## Status at the last stop (2026-10-10, second session)

**Merged into `feat/jellyflick-v1`** (tip `49fed11`, draft PR #38 open):

| Ticket | State |
|---|---|
| #2 Connect to a Server | merged, issue closed |
| #3 Sign in with a password | merged, issue closed |
| #5 Deployable container | merged, issue closed (second box superseded — see below) |
| #4 New on Jellyflick on Home | merged at `ed9603b`, issue closed |
| #6 App shell | merged at `8225247`, issue closed |
| #7 Rows and arrow-key navigation | merged at `49fed11`, issue closed |

Gate on the integration tip `49fed11`, each step's exit code checked individually:
`lint` 0, `typecheck` 0, **173 unit tests** in 18 files, **114 Playwright tests — 102
passed, 12 skipped, 0 failed**, `chrome68` build 53.18 kB / 18.84 kB gz. Independently
re-run by the integrator, not taken from the implementers' reports.

The 12 e2e skips are all deliberate viewport/pointer gating: #6's 7 (3 wide-screen tests
skipped on `phone`, 2 phone tests skipped on `desktop` and `keyboard-only`) plus #7's 5
(1 phone-only test skipped on `desktop` and `keyboard-only`, 3 pointer tests skipped on
`keyboard-only`).

**Nothing is in flight.** No implementers are running; no worktree holds uncommitted
work. Three waves have landed this session (#4, #6, #7), all verified by the integrator.

### The frontier is six tickets wide, and verified open

#7 is closed, so nothing is falsely blocked. All six report `blocked_by: 0`:

| Ticket | Needs | Note |
|---|---|---|
| #8 Several Users and the User Picker | #6 | unblocked since the last wave, unstarted |
| #36 Installable app | #6 | unblocked since the last wave, unstarted |
| #10 Client Settings and Home Layout | #7 | **critical path** — 2 → 3 → 6 → 7 → 10 → … |
| #13 My List | #7 | gates #17, which gates the whole player chain |
| #14 Title Labels | #7 | |
| #24 Search | #7 | |

#10 and #13 are the two that unlock the most: #10 opens wave 6 (#11, #12, #15, #16) and
#13 gates #17 → #25 → #26 → #27 → #28, the deepest remaining chain. **Give any two
concurrent implementers distinct `APP_PORT` and `FAKE_JELLYFIN_PORT` values.**

### Three traps that have already bitten this run

**1. A merged ticket is not a closed ticket.** This bit twice. #2, #3 and #5 were merged
in the first session and never closed, so GitHub reported #4 and #6 as blocked long after
their work was on the branch; then #4 and #6 did the same to #7, #8 and #36. Before
trusting any `blocked_by`, confirm every already-merged ticket is actually closed, and
close each ticket as part of merging it.

**2. Never pipe a gate command into `tail`.** An earlier version of this document claimed
a green baseline of "33 Playwright tests". That was false: the suite was **42 tests with
9 failing**, and the run looked green because piping Playwright into `tail` makes the
shell report `tail`'s exit status rather than Playwright's. Run each step on its own and
check its own exit code:

```
for step in lint typecheck test build; do npm run $step > /tmp/$step.log 2>&1; echo "$step exit=$?"; done
npm run test:e2e > /tmp/e2e.log 2>&1; echo "e2e exit=$?"
```

Those 9 failures were real and pre-existing: #3 (`74091d9`) removed the
"Connected to {serverName}." string when connecting began handing over to sign-in, while
#5's container journeys still asserted it, and the gate was never re-run after they
merged in that order. Fixed by #4 in a standalone commit, `b24e2c8`, which repoints the
three assertions at the sign-in heading. #6 needed no further change to them.

**3. `npm ci` in the integration worktree after merging a branch that changed
`package.json`.** Merging #6 made the gate fail four ways (`typecheck` 2, `test` 1,
`build` 1, `e2e` 1) purely because #6 added `preact-iso@2.12.2` and the integration
worktree's `node_modules` predated it. Nothing was wrong with the merge. Check
`git diff <prev-tip> <new-tip> -- package.json` before concluding a merge broke something.

### Ticket numbers in code comments have been wrong once — check them

#7 found that #6's comments misattributed four sections: `section-placeholder.tsx`,
`app-shell.tsx` and `docs/architecture.md` said Movies/Series were #7, My List #8 and
Search #9 (they are **#23**, **#13**, **#24**), and `bottom-bar.tsx` credited switching
User and settings to #14/#35 (they are **#8** and **#11**). Fixed in `33e9b09`, comments
only, and verified against `task-graph.md` by the integrator. Worth a glance whenever a
ticket points the next one at a number.

### A hazard for the next parallel wave: fixed test ports

`npm test` and `npm run test:e2e` use fixed ports — **8787** (fake Jellyfin) and **4173**
(preview). With two implementers running at once, #6 hit `EADDRINUSE` on 8787, and worse,
`reuseExistingServer` on 4173 can silently serve *another worktree's* build, which would
make a gate run meaningless. #6 worked around it with `FAKE_JELLYFIN_PORT=8796` for
interim runs and took the final gate on free ports, but left shared config alone to avoid
colliding with #4.

**This is now fixed.** `APP_PORT` reads `process.env.APP_PORT ?? 4173` in
`playwright.config.ts`, and `FAKE_JELLYFIN_PORT` already read
`process.env.FAKE_JELLYFIN_PORT ?? 8787`. Verified by running the whole e2e suite on
`APP_PORT=4199 FAKE_JELLYFIN_PORT=8799` — identical 102 passed / 12 skipped.

So concurrent implementers just need distinct values for both. Say so in each brief when
launching two or more at once; the defaults are fine for a lone implementer.

### Tickets whose acceptance boxes cannot be ticked as written

- **#5, second box** — it says the entrypoint writes the MDBList key into the runtime
  config. ADR 0004 forbids the key reaching the browser, so the box is superseded. This
  was recorded in the closing comment on #5 rather than ticked.
- #4 and #6: every box can be ticked.
- **#7, two caveats on its six boxes.** *Touch swipe* is `overflow-x: auto` doing its job
  and is asserted structurally (the strip is the scroller, it overflows,
  `overscroll-behavior-x: contain`, the page does not move) rather than by a real swipe —
  no Playwright project sets `hasTouch`. Adding a touch project is a one-line config
  change and would close the gap properly. *Opening a card* **cannot be ticked until
  #17**, because there is no title page yet; #7 wired the seam (`Row` takes `onCardPress`,
  Enter clicks the focused card, the e2e asserts the press and that Home survives), so
  #17 passes a handler and the box closes.

### Decisions #4 and #6 made that later tickets inherit

From #4:

- **`groupItems=false`** on `/Items/Latest`, against `jellyfin-api.md`'s suggestion: a
  Series' place in the Row is its newest Episode's date added, and only the client has
  seen every library, so the collapsing is the client's job. The fake Jellyfin now
  refuses any other value with an explanatory 400.
- **A library that will not answer is left out of the Row, not treated as empty**, so one
  unreadable library cannot quietly shorten it. Only a Server that will not list
  libraries makes the Row unavailable.
- `/UserViews` and `/Items/Latest` now require a token on the fake, as the real Server
  does. `failLibraryQueriesWith` simulates a Server that will not say what it holds.
- New gateway methods: `getUserViews()`, `getLatestItems({parentId, limit})`,
  `itemImageUrl(id, type, {tag, maxWidth})`. Artwork is requested at `maxWidth=400`.
- `src/catalogue/catalogue.ts` is the only place a `BaseItemDto` is read.

From #6:

- **`src/shell/sections.ts` is the single list of sections and addresses.** Both bars and
  the router read it; #7/#8/#9 only repoint their own `Route`.
- **Only one navigation bar is in the document at a time**, chosen in JS via `matchMedia`
  at a 768px breakpoint (`src/shell/layout.ts`) — not CSS hiding, which would leave both
  link sets in the DOM for a screen reader or a test to find.
- **Back is the browser's back button.** The Back key (remote 461 or `Escape`, via
  `device.keyFor`) calls `history.back()`; the entry the app opened on is marked in
  `history.state`, which is how Back knows not to leave Jellyflick from Home and to go to
  Home from a section opened directly. Backspace inside a field is left to the field, for #9.
- **`preact-iso` calls `scrollTo(0, 0)` on a push navigation and it is not configurable**
  — this answers the open question in `toolchain.md`. Harmless now, but whoever restores a
  Row's scroll position must work around it.
- **Bebas Neue has one weight only.** "Bold condensed" is the face's own weight, so type
  must differ by size and letter-spacing, never by weight — a synthesised bold looks
  wrong. Vendored at `public/fonts/` with `bebas-neue-OFL.txt` beside it.
- The bottom bar's User picture is **inert and not a focus stop** until #14/#35 own
  switching User and settings.
- The accent token in `src/styles/base.css` is the knob per-User Accent Colours (#11) will turn.
- An unknown address gets a short "nothing here" screen rather than silently becoming Home.
- `docs/architecture.md` has a new "The shell: sections, routing and Back" section.

From #7 (`src/navigation/`, installed once in `src/app.tsx`):

- **A Row's focus memory *is* its tab stop.** The remembered card holds `tabindex="0"`,
  the rest `-1`; the navigator enters a group at its tab stop — one fact read two ways, no
  store. Any new strip opts in with `FOCUS_GROUP_ATTRIBUTE` and one tab stop, so
  #12/#13/#15 get it free by using `Row`.
- **Moving inside a group is plain geometry; only *arriving* honours the memory**, or
  Left/Right could never leave the remembered card.
- **The page's own flow is tried before anything fixed.** Without this the phone's fixed
  bottom bar is the nearest thing downwards from anywhere and Down never reaches the next
  Row. From inside a fixed overlay the overlay *is* the flow, so the player (#26) and the
  title-page pop-up (#17) inherit working behaviour.
- **A card is a focus stop, not a button.** Enter deliberately leaves real links, buttons
  and fields to the browser — clicking them would press them twice.
- **The navigator owns Up/Down/Left/Right/Enter; `src/shell/back.ts` still owns Back
  alone.** A screen needing different arrow behaviour — the Subtitle Offset panel (#28),
  where Left/Right adjust the offset — should take the keys *before* this handler rather
  than adding a parallel one. A field owns its own arrow keys via `isEditable`, which
  matters for Search (#24).
- **`input-modality.ts` sets `data-input` on the root element** and `base.css` removes the
  focus ring under `html[data-input='pointer']`. This replaced #4/#6's
  `@supports selector(:focus-visible)` block, which could not satisfy the "no ring on
  mouse click" box on the Chromium 68 floor.
- **ADR 0002 rules out `scroll-snap-*`, so `reveal.ts` is how a Row scrolls at all** —
  one axis, with a margin, serving both the Row sideways and the page downwards.
- `.screen--top` is gone, folded into `.shell .screen` as #4 intended.

Every implementer kept `docs/architecture.md` current. Read it rather than this file for
the codebase map.

### Loose ends neither ticket owned

- **No wordmark at phone width.** The bottom bar has no room and story 61 does not ask
  for one; the Billboard ticket may want a small phone header.
- **Bebas Neue still wants crediting on an about/licences screen**, which no ticket owns yet.
- `.screen--top` is now resolved — #7 folded it in.
- **The navigation bars have no focus memory**, deliberately: entering a bar is geometric
  (the link above the card you came from). Story 65 asks Rows to remember, and a roving
  tabindex in a bar would stop Tab visiting every link, which is worse for a keyboard user.
- **Focus and Row scroll position do not survive leaving a section.** Home unmounts and
  re-reads from the Server, so `preact-iso`'s unconfigurable `scrollTo(0, 0)` stays
  harmless. Whoever makes a section's state outlive a navigation inherits that problem.
- **No Playwright project sets `hasTouch`**, so real touch gestures are untested
  anywhere, and #7's touch-swipe box rests on a structural assertion. This is *not* a
  one-line config fix, despite how it looks: a fourth project would run all 38 specs
  under touch emulation (114 → ~152 tests), including keyboard journeys and hover tests
  that would likely fail with no owner. The contained version is a project scoped with
  `testMatch` to the Row spec **plus a real swipe test that does not exist yet** — so it
  is ticket work, not config. Sized and left for whoever picks it up.

## Where the work lives

- **Integration branch**: `feat/jellyflick-v1`, pushed, draft PR #38 open against `main`.
- **Per-ticket branches**: `ticket/<n>-<slug>`, each built in its own git worktree under
  `.claude/worktrees/`. Commits on these branches are durable whether or not the agent
  that made them is still alive.
- **The task graph**: `docs/research/task-graph.md`. GitHub native issue dependencies are
  the source of truth; query a ticket's live gate with
  `gh api repos/:owner/:repo/issues/<n> --jq .issue_dependencies_summary.blocked_by`
  — but see trap 1 before believing a non-zero answer.

## How to pick up

1. Read `docs/research/decisions.md` — binding, and it overrides spec #1 where they differ.
2. Read `docs/architecture.md` — the codebase map, kept current by each ticket.
3. Close any merged-but-open ticket, then find the frontier: open tickets whose
   `blocked_by` count is 0.
4. For each, spawn one implementer per ticket in its own worktree on `ticket/<n>-<slug>`
   based on the current tip of `feat/jellyflick-v1`, briefed with **pointers only**
   (the ticket, the spec, `decisions.md`, the research notes, `docs/architecture.md`) —
   never by restating their content. Each implementer drives the `tdd` skill, runs
   `npm ci` first in its fresh worktree, and merges the integration tip into its own
   branch before reporting done. Give concurrent implementers distinct test ports.
5. Merge each finished branch into `feat/jellyflick-v1` with `--no-ff`, then `npm ci` if
   `package.json` changed. Spawn a merger subagent only when branches actually conflict;
   a clean merge is faster done inline.
6. Verify after every merge, one step at a time with its own exit code (see trap 2).
7. Close the ticket as part of merging it (see trap 1).

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

1. Every ticket from #8 onward. Six are unblocked and unstarted: #8, #36, #10, #13,
   #14, #24.
2. `code-review` over the whole integration branch, with findings fixed in one implementer.
3. **The git history rewrite** described in `decisions.md` §10 — removing the inspiration
   product's name from the root commit. Must happen with no implementers in flight, and
   the host must then ask GitHub Support to purge the stale objects.
4. Mark PR #38 ready for review.
5. Remove the agent worktrees (`git worktree list`, then `git worktree remove`). As of this
   session that is three stale `agent-*` worktrees from the first session plus
   `ticket-4-new-on-home`, `ticket-6-app-shell` and `ticket-7-rows-and-arrows`, all three
   merged and safe to remove.
