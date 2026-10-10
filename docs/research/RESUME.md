# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## Status at the last stop (2026-10-10, third session)

**Merged into `feat/jellyflick-v1`** (tip `9c0ed1a`, draft PR #38 open):

| Ticket | State |
|---|---|
| #2 Connect to a Server | merged, issue closed |
| #3 Sign in with a password | merged, issue closed |
| #5 Deployable container | merged, issue closed (second box superseded — see below) |
| #4 New on Jellyflick on Home | merged at `ed9603b`, issue closed |
| #6 App shell | merged at `8225247`, issue closed |
| #7 Rows and arrow-key navigation | merged at `49fed11`, issue closed |
| #36 Installable app | merged at `e0a85ac`, issue closed (service-worker box superseded — see below) |
| #10 Client Settings and Home Layout | merged at `9c0ed1a`, issue closed (touch caveat — see below) |

Gate on the integration tip `9c0ed1a` after #10 merged, each step's exit code checked
individually: `lint` 0, `typecheck` 0, `build` 0, **224 unit tests** in 22 files,
**150 Playwright tests — 138 passed, 12 skipped, 0 failed**, `chrome68` build
**60.13 kB / 20.73 kB gz**. Independently re-run by the integrator after each merge, not
taken from the implementers' reports; both matched their implementer's numbers exactly.

The session opened by re-running the gate on `1c54103` and got the second session's
numbers unchanged (173 unit / 18 files, 102 passed / 12 skipped, 53.18 kB / 18.84 kB gz),
which confirmed the two doc/config commits after `49fed11` changed nothing.

Bundle growth so far: 53.18 → 60.13 kB raw, 18.84 → 20.73 kB gz. All of it is #10 — one
new screen, a provider and ~20 strings, not lazily loaded. #36 added nothing to the JS
(its manifest and icons are static files in `public/`).

The 12 e2e skips are all deliberate viewport/pointer gating: #6's 7 (3 wide-screen tests
skipped on `phone`, 2 phone tests skipped on `desktop` and `keyboard-only`) plus #7's 5
(1 phone-only test skipped on `desktop` and `keyboard-only`, 3 pointer tests skipped on
`keyboard-only`).

### In flight right now — #13 and #24

Launched in the third session, each in its own worktree, each driving the `tdd` skill,
each briefed with pointers only:

| Ticket | Branch | Worktree | `APP_PORT` / `FAKE_JELLYFIN_PORT` | Based on |
|---|---|---|---|---|
| #13 My List | `ticket/13-my-list` | `.claude/worktrees/ticket-13-my-list` | 4213 / 8813 | `1c54103` |
| #24 Search | `ticket/24-search` | `.claude/worktrees/ticket-24-search` | 4224 / 8824 | `e0a85ac` |

Neither had reported as of the last write of this file. **Their context may be gone but
their branches are not** — see "Recovering an interrupted implementer" below, and check
each branch before assuming it is empty or correct.

**#13 was based on `1c54103`, before #10 landed, and #10 rewrote Home.** So #13's own
merge of the integration tip is where the conflict lands. It is a real conflict, not a
mistake: #10 made Home draw from a stored layout through the registry in
`src/home/home-rows.tsx`, and #13 adds a Row to Home. The resolution #10 designed for is
that **#13 adds a loader, a case in `HomeRowFor`, and its kind to `BUILT_ROW_KINDS`** —
no change to the layout format. If #13's branch instead edits `home-screen.tsx` directly,
prefer #10's registry and port #13's Row onto it.

#24 was based on the post-#36 tip and was told to expect #10 and #13 to land under it.

### The frontier is six tickets wide again

#36 and #10 closing opened wave 6. All six verified `blocked_by: 0` after #10 merged:

| Ticket | Needs | Note |
|---|---|---|
| #8 Several Users and the User Picker | #6 | unstarted; gates #9 |
| #14 Title Labels | #7 | unstarted; touches cards, so it conflicts with #13 — hold it until #13 lands |
| #11 Settings screen: Accent Colour and language | #10 | newly open; gates #35. `jf.uiLanguage` is already keyed and defaulted by #10, unread |
| #12 Continue Watching | #10 | newly open; adds a Row via #10's registry |
| #15 More Row types | #10 | newly open; `HomeRow.parameter` is already round-tripped unread for its genre/Collection Rows |
| #16 Billboard with Spotlight | #10 | newly open; the natural place for the leftover "Signed in as Rafael." line to disappear |

**None of these six were launched**, and the reason is spend, not readiness — see below.
#13 still gates #17 → #25 → #26 → #27 → #28, the deepest remaining chain, so it is the
one whose landing matters most.

### Why the third session stopped launching implementers

The host asked for the spending limit to be checked at every commit and for the process
to be documented if a ticket was unfinished at 94%. The **5-hour window** is the binding
limit, not the weekly one. Measured this session:

| Point | 5-hour | Weekly |
|---|---|---|
| session start | 2% | 33% |
| three implementers launched | 14% | 35% |
| #36 merged and verified | 34% | 37% |
| #10 merged and verified | 61% | 41% |

**A wave of three implementers plus the integrator's own gate runs costs roughly 25–30
points of the 5-hour window.** At 61%, with #13 and #24 still running and still to be
merged and verified, launching another wave of three would have crossed 94% mid-ticket —
exactly the situation the host asked to avoid. So the third session deliberately stopped
launching and spent its remaining budget on merging, verifying and writing this down.

**For the next session:** check the 5-hour window first. If it has reset, three
concurrent implementers is a comfortable wave and #11, #12, #15 and #16 are all open. If
it has not, launch one or two. Note also that the integrator's own verification is not
free: a full gate run (lint, typecheck, test, build, then the e2e suite) is a few points
each time, and it must still be run after every merge.

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
- **#36, second box** — it asks for "a minimal service worker for installability only".
  `decisions.md` §8 is binding and says the manifest alone is enough, so the box is
  superseded, recorded in #36's closing comment rather than ticked. A worker would only
  buy `beforeinstallprompt` for a custom in-app Install button that nothing asks for, and
  a registered worker outlives the page that registered it, which works against #36's own
  third box. **Two tests now fail if a service worker appears by accident.** A later
  ticket wanting a custom Install button owns adding the worker and its update story.
- **#10, third box, partially** — "adds, hides and reorders with touch, mouse and arrow
  keys" is ticked for mouse and arrow keys (two Playwright tests drive the editor with
  arrows and Enter, and the whole spec also runs under `keyboard-only`). **Touch is not
  directly exercised** — the same `hasTouch` gap as #7's touch-swipe box. The controls are
  plain `<button>`s so a tap is a click, but nothing asserts it.
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

From #10 (all recorded in `docs/architecture.md`):

- **`src/home/home-rows.tsx` is the Row registry, not the layout.** A layout may name a
  Row whose feature does not exist yet; Home draws only `BUILT_ROW_KINDS` and leaves the
  rest out rather than drawing an empty Row. **#12, #13 and #15 each add a loader, a case
  in `HomeRowFor`, and their kind to that list — no layout format change.**
  `HomeRow.parameter` is carried and round-tripped unread, ready for #15's genre and
  Collection Rows.
- **`CLIENT_SETTINGS_CLIENT = 'jellyflick'` is a storage partition, deliberately not
  `CLIENT_NAME` ('Jellyflick').** Every key is prefixed `jf.`; the store strips everything
  non-`jf.` out of a GET so nothing the Server injected is ever POSTed back. POST is 204,
  so the gateway gained `requestWithoutAnswer`.
- **`src/settings/settings-provider.tsx` holds one copy of the settings above the
  router.** Changes apply at once and save behind the screen; saves are serialised because
  each is a read-modify-write; a first read landing after the User has already edited is
  dropped (a real bug the editor tests caught). A failed save says so and keeps the
  change; a failed read yields the defaults so Home always draws.
- **The editor's address `/settings/home-layout` is not a section** — its own `<Route>`,
  in neither bar; `SECTIONS` is still the single section list. **#11 and #35 should link to
  it from the settings screen.**
- **Reordering is Move up / Move down buttons, not a drag**, so the navigator keeps the
  arrow keys (a screen that stole them could not be left) and one control serves touch,
  mouse and keyboard alike.
- The fake's `/DisplayPreferences` reproduces the real controller: `client` required, its
  own keys injected on GET and consumed on POST, and a **500** for a `homesection…` key
  with a non-numeric suffix. Seed a User's settings with
  `state.displayPreferences['jellyflick|jellyflick|<userId>']`; `failDisplayPreferencesWith`
  fails the endpoint.
- `jf.uiLanguage` is keyed and defaulted but **nothing reads it yet** — for #11/#35.
- Unit journeys navigate for real, so that spec resets `history` between tests. Worth
  copying in any later spec that visits a second address.
- **Adding a Row can only offer kinds absent from the layout**, so with the default layout
  nothing is addable and hiding is the only way a Row leaves Home. There is no "remove".

From #36:

- **No service worker, by design** (see the superseded box above). Recorded in the new
  "Installing the app" section of `docs/architecture.md`.
- **The manifest's `theme_color`/`background_color` are `--surface-base`, not the
  accent.** Accent Colour is per-User (#11); the manifest is one file for the whole
  household. **A unit test fails if the CSS token and the manifest drift apart** — so #11
  must not try to make the manifest follow the accent.
- **Icons are generated by `node scripts/make-icons.mjs`, run by hand, output committed.**
  Dependency-free, deliberately not wired into `npm run build` so shipped artwork shows up
  in a diff. The mark is a plain generated "J" — no design asset existed. **Worth a human
  look before release**; re-run the script after editing its glyph constants.

Every implementer kept `docs/architecture.md` current. Read it rather than this file for
the codebase map.

### Loose ends neither ticket owned

- **No wordmark at phone width.** The bottom bar has no room and story 61 does not ask
  for one; the Billboard ticket may want a small phone header.
- **Bebas Neue still wants crediting on an about/licences screen**, which no ticket owns yet.
- `.screen--top` is now resolved — #7 folded it in.
- **"Signed in as Rafael." is still scaffolding on Home** and no ticket owns removing it.
  #3 put it on the placeholder Home, #4 built the Row below it, #6 absorbed the wordmark
  above it into the top bar but left this line. It is the one visibly unfinished thing on
  the screen; #16 (Billboard) is the natural place for it to disappear.
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

1. Every ticket from #8 onward except #10 and #36, which have landed. #13 and #24 are in
   flight; #8, #14, #11, #12, #15 and #16 are unblocked and unstarted; #9 waits on #8, #17
   and its whole chain wait on #13.
2. `code-review` over the whole integration branch, with findings fixed in one implementer.
3. **The git history rewrite** described in `decisions.md` §10 — removing the inspiration
   product's name from the root commit. Must happen with no implementers in flight, and
   the host must then ask GitHub Support to purge the stale objects.
4. Mark PR #38 ready for review.
5. Remove the implementer worktrees (`git worktree list`, then `git worktree remove`).
   **Done for every worktree merged so far**: the three stale `agent-*` worktrees from the
   first session and `ticket-4-new-on-home`, `ticket-6-app-shell`,
   `ticket-7-rows-and-arrows` were removed in the third session, each verified clean
   (`git status --short` empty) and fully merged (`git rev-list --count <branch>
   ^feat/jellyflick-v1` = 0) first. The branches were kept. Still to remove when they
   merge: `ticket-13-my-list` and `ticket-24-search`. `ticket-10-client-settings` and
   `ticket-36-installable-app` have merged and can be removed once nothing needs them.
   **Leave `implement-spec-88c250` and `remote-setup-2e9b22` alone — they belong to other
   Claude sessions, not this run.**
