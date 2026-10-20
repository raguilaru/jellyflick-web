# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## ELEVENTH SESSION — the last two spec tickets, and the host's agenda cleared

**Read this, then "TENTH SESSION" below it, then the seventh session's section, which is
still the standing guidance on traps, costs and process and has never been superseded.**

Opened on tip `cae92f8`, confirmed on `origin` with `git ls-remote`, with nothing in
flight — no agent, no dev server, fake Jellyfin or browser process, checked with `pgrep`
rather than assumed. The tenth session's handover was accurate in every particular.

### The host answered four of the six items on the agenda that was theirs

This is the thing the tenth session said stood between this branch and a release, and most
of it is now gone. The decisions are written up as comments **on the issues themselves**,
which is where an implementer will look; they are summarised here only so a reader of this
doc knows they exist.

- **#54 — closed, no code.** "The session" means **the playback**. A speed survives a
  re-negotiation and resets when the player is closed, which is what #32 shipped, so the
  acceptance box stays ticked as read.
- **#51 — decided and now an agent's: links on Home at phone width.** Not a fifth
  bottom-bar item, not a phone header. Story 61's four items stay, the
  `moving-around-the-app` assertion in both suites stays true rather than being rewritten,
  and the comment beside `BOTTOM_BAR_SECTION_IDS` becomes true for the first time.
  **#23's three `phone` skips are the acceptance test** — this ticket should take the suite
  from 45 skips to 42.
- **#48 — decided and now an agent's: licence texts committed, served, linked from
  Settings.** The `public/fonts/bebas-neue-OFL.txt` precedent, in the image as well as the
  repo, with no new screen. **`org.opencontainers.image.licenses="NOASSERTION"` is left
  alone deliberately** — it waits on the project's own licence, which the spec's "later"
  list holds.
- **#45 and #47 — the host has both an MDBList key and a real Jellyfin.** These were the
  two items no agent could ever finish. Spend the key on **one** call to pin the
  `ratings[]` element shape and the per-source scales; ask the real Server whether
  `MediaStream.Path` comes back for an **external** subtitle, because if it is withheld
  story 102's cross-Episode half is lost quietly. Do these when the player tickets are out
  of the way, not in the middle of a wave.

**Still the host's and still open: #12's saves** — #46 made the suite honest about a
fire-and-forget Client Settings write, and the app still does not wait for one. Whether it
should is a change to #12's design, not a test fix.

### In flight

Two implementers, launched together, in worktrees the integrator created and ran `npm ci`
in — the worktree-per-implementer rule, which is the most expensive thing that ever went
wrong on this run.

| Ticket | Branch | Ports | Touches |
|---|---|---|---|
| **#33 Cast** | `ticket/33-cast` | 4337 / 8337 | `src/playback/` |
| **#51 Phone sections** | `ticket/51-phone-sections` | 4351 / 8351 | `src/home/`, `src/shell/` |

They are in different conflict groups, so this is a legitimate wave of two. Both were told
their ports apply to **Vitest as well as Playwright**, and both were told to check
`pgrep -f playwright` before starting a suite and to wait rather than interleave.

**#34 Play On comes after #33 and cannot run beside it** — `src/playback/` has never taken
two implementers, and the glossary's distinction is the thing to hold onto: Play On is
telling another running Jellyfin app on the same Server to play something; Cast is
Chromecast or AirPlay.

### #51's branch moved the e2e skip count 45 → 42, by removing three

Recorded here in the same commit, which is this doc's own rule — and this is the one
direction the rule has not had to cover before.

`test/e2e/movies-and-series.spec.ts` kept the six tests #23 gave it. The three that walk
into a section through the navigation — `the Movies section holds the Movies…`, `each
section is headed by the genres its own library earned` and `the section names the page
and the Billboard names a Title under it` — **skipped on `phone` only because a phone
could not reach either section**. Home now carries the pair of links at that width, so
`skipWithoutTheLinks` is gone and all three run in all three projects: **−3 skips, +3
passes**.

The fourth skip, the 375px measurement, is unchanged in kind and still skips in `desktop`
and `keyboard-only` — **2 skips, as before**. It gained Home's own scroll-width
assertion rather than a second test, deliberately: a new runtime-skipped test would have
moved the count again for a measurement rather than for a gap. Its name changed from
`[phone] a section fits a 375px screen` to `[phone] the way into a section, and the
section, fit a 375px screen`.

**The 42 skips are therefore: 26 original, 3 the screenshot tour, 10
`desktop-hover-cards.spec.ts` in `keyboard-only`, 2 in `movies-and-series.spec.ts` (the
375px measurement, outside `phone`) and 1 in `trickplay-speed-and-quality.spec.ts`.**
Nothing pre-existing moved.

### #33 merged at `59730d1`, #51 at `d6e485c`, both closed

Both gated by the integrator on the merge result rather than taken from the reports, and
both implementers' numbers matched exactly — as every implementer's have, which is the
reason to keep checking rather than to stop.

**#33 Cast.** `lint` 0, `typecheck` 0, `build` 0, **1076 unit tests in 80 files**, main JS
**188.64 kB / 56.54 kB gz** (+3.64 raw, +1.06 gz), CSS 21.56 kB unchanged, `cast-sender`
its own lazy chunk at 1.11 kB / 0.63 kB gz. Its merge tree was **byte-identical** to the
tree it had run the full suite on (507 passed / 45 skipped / 0 failed), so that run carried
rather than re-running the same bytes — the standing rule for a clean merge.

**#51 Phone sections.** `lint` 0, `typecheck` 0, `build` 0, **1082 unit tests in 81
files**, **510 Playwright passed / 42 skipped / 0 failed**, 0 flaky, main JS
**188.81 kB / 56.64 kB gz**, CSS 21.63 kB. This one got a **full** e2e run from the
integrator because its own gate never finished — see below.

### The fifth time a browser found what the unit suite could not — and it hid a whole feature

**#33's e2e found that the Cast button never appeared at all.** The inherited capability
gate was `window.chrome`, copied from Jellyfin's own plugin bailing on `if (!chrome)` — but
`window.chrome` is a Chrome **branding** object, absent from plain Chromium and from
derivatives where the Cast SDK works perfectly. It is `window.PresentationRequest` now,
with `window.chrome` behind it for older Chromium.

This is the fifth player ticket in a row to ship something an entirely green unit suite was
silent about, and the first where the thing hidden was **the whole feature**. The brief's
instruction to hold the e2e against the failure it exists for is what caught it: the
implementer broke four things deliberately and reported which break reddened which test.
The most valuable break was removing the `<script>` `error` listener — dead code to the
unit suite, since happy-dom loads no scripts, and without it a User on a LAN with no route
out presses Cast and gets nothing, for ever.

### The skip count went **down** for the first time: 45 → 42

#51 removed `skipWithoutTheLinks` from `movies-and-series.spec.ts`, so #23's three `phone`
journeys run everywhere now. **The 42 are: 26 original, 3 the screenshot tour, 10
`desktop-hover-cards.spec.ts` in `keyboard-only`, 2 in `movies-and-series.spec.ts` (the
375px measurement, outside `phone`) and 1 in `trickplay-speed-and-quality.spec.ts`.**
Verified the way this doc has insisted since the fourth session, and the check is easier in
this direction than it sounds: the only skip *site* that changed anywhere in the tree is the
one removed, and the count moved by exactly the three it freed.

### A session limit stopped both implementers of this wave, and the habit paid again

The eighth and ninth interruptions on this run, both at once, with the limit resetting at
4:10am. **#33 had already finished, gated and pushed.** #51 was stopped mid-gate, with its
own message saying two tests had passed on re-run and it was starting a full suite for an
authoritative number.

Cost: almost nothing, because the commit-and-push-as-you-go rule was in both briefs. #51's
two real commits were pushed; the only leftover was an **uncommitted relocation of its own
prose** in this file, which it had written into the ninth session's section before the
eleventh existed. The integrator read the diff, committed it as a relocation with the
boundary named as the integrator's, and pushed. Then gated #51 fully, since its own gate
never finished — which is the rule for any branch whose gate was interrupted.

### #56: a control clipped by the edge of the screen is invisible to *every* assertion

Found by the integrator while merging #51, by rendering Home at phone width and looking at
it — which this doc has asked for since #35 and #44, and which found something on the first
look.

**The Billboard's trailer row does not wrap, and "Pause the trailer" is clipped by the
right edge**: `right=393.23` on a 390px viewport. #51's own new links are well inside
(`Movies` 127.7, `Series` 233.2), so this is #19's row, not #51's.

What makes it worth a section rather than a line: **the document's `scrollWidth` is 390,
exactly equal to `clientWidth`.** The control is *clipped*, not scrolled to, so it never
lengthens the document — and the scroll-width assertion this project adopted after #44, as
"the one shape of assertion scrolling cannot paper over", **is blind to it.** The honest
assertion is each control's **own right edge against the viewport width**, which is what
found it, and it catches a strictly larger class. The measurements are English; `es.ts`
labels are longer and were not measured.

### What is left after this wave

**#34 Play On and #48 licences are in flight now**, in integrator-created worktrees on
ports 4334/8334 and 4348/8348 — `src/playback/` and `public/`+`src/settings/`+`Dockerfile`
respectively, so they are in different conflict groups. **#34 is the last ticket in the
spec's task graph.**

1. ~~**#34 Play On**, alone, once #33 is merged.~~ In flight.
2. **The player's three loose ends** — **#50** (the `aria-disabled` dim rule is scoped to
   tracks #30 removed, so "Sync to this line" looks pressable when it is not), **#53**
   (`TrackPicker` loses focus to the document when Done closes it — the *same* defect #32
   fixed in the options menu, so the fix is written already) and **#52** if anything of it
   survives #32's shared guard.
3. ~~**#48**, which is now an agent's.~~ In flight.
3a. **#55** (`architecture.md` has no section for #32) and **#56** (the clipped trailer
   button). #55 is a docs-only edit and collides with everything, so it belongs **between**
   waves, which is the #43 precedent.
4. **#42**, the `[desktop]` arrow-key Row-scroll assertion that has recurred twice — once
   on a line that is **already** an `expect.poll`, so the fix suggested on the issue is
   probably wrong, and both assertions really want to know whether `reveal.ts` is meant to
   land exactly on 0.
5. **#45 and #47**, with the host's key and Server.
6. **`code-review` over the whole branch**, then **the git history rewrite** in
   `decisions.md` §10 with nothing in flight, then **mark PR #38 ready**. The host must
   then ask GitHub Support to purge the stale objects — the branch tips are all clean, but
   merged PR #37's diff is still reachable by direct `/commit/<sha>` URL and only Support
   can purge that.

## TENTH SESSION STARTS HERE — two tickets left, then the end of the run

**Read this section, then "NINTH SESSION" below it for what the current code assumes, then
the seventh session's section, which is still the standing guidance on traps, costs and
process and has never been superseded.**

Integration tip **`b7fa388`** plus this commit, pushed and verified with `git ls-remote`.
Draft PR #38 open, still draft. **Nothing is in flight: no agent, no worktree of this
run's, no dev server, fake Jellyfin or browser process** — checked with `pgrep`, not
assumed.

### The state in one paragraph

**The spec's task graph is down to #33 Cast and #34 Play On.** Both are `src/playback/`,
so they run **one at a time** — `src/playback/` has never taken two implementers. Nine
tickets merged in the ninth session alone. After those two come the three end-of-run jobs,
and then a short agenda that is **yours rather than an agent's** and is what actually
stands between this branch and a release.

### Do these, in this order

1. **#33 Cast.** `decisions.md` §8 says it must read `user.Configuration.CastReceiverId`
   **at runtime**, and #35 already made the fake serve it.
2. **#34 Play On.** Not Cast — the glossary is explicit that Play On is telling another
   running Jellyfin app on the same Server to play something, and Cast is Chromecast or
   AirPlay.
3. **The player's three loose ends, with whichever of those two is in flight or just
   after**: **#50** ("Sync to this line" looks pressable when it is not — the
   `aria-disabled` dim rule is scoped to tracks #30 removed), **#53** (`TrackPicker` loses
   focus to the document when Done closes it — the *same* defect #32 just fixed in the
   options menu, so the fix is written already) and **#52** if anything of it survives
   (#32 folded it into one shared guard across seven journeys; it should be closeable).
4. **`code-review` over the whole branch.** The first run found four real bugs, and #40
   showed the navigator is the thinnest-covered part of the codebase.
5. **The git history rewrite** in `decisions.md` §10, with no implementer in flight. The
   host must then ask GitHub Support to purge the stale objects.
6. **Mark PR #38 ready.**

### The one thing to carry into every player brief

**Three tickets in a row shipped something an entirely green unit suite could not see.**
#29's styled-subtitle renderer never started in a browser. #30 drew nothing, pushed the
controls out of the window, and left a disabled control looking pressable. #32 let a
remote walk out of the player and into the page behind it — on `phone` only, green on the
other two projects.

The cause is the same each time and it is structural, not carelessness: **the unit journey
fakes the device layer, happy-dom gives every box a zero size, and nothing runs a WASM
binary or honours a picture-in-picture request there.** So for anything in the player:
write the e2e, and **check it against the failure it exists for** — break the thing
deliberately, watch the test go red, put it back. #32's report is the model for how to
write that down.

### Current gate numbers, measured on the tip rather than reported

`lint` 0, `typecheck` 0, `build` 0, **1042 unit tests in 77 files**, **492 Playwright
passed / 45 skipped / 0 failed** under `E2E_CPU_THROTTLE=4`, main JS **185.00 kB /
55.48 kB gz**, CSS 21.56 kB. hls.js, libass and libpgs each sit in their own lazy chunk
that only a User who needs it ever fetches; **nothing else has been split, and nothing
else has needed to be.**

**The 45 skips are all accounted for**, read by name rather than counted: 26 original, 3
the screenshot tour (one test in three projects, runtime-skipped unless `SCREENSHOTS` is
set), 10 `desktop-hover-cards.spec.ts` in `keyboard-only` because that project disables
pointer events, 5 in `movies-and-series.spec.ts` — **three of those exist because of
#51** — and 1 in `trickplay-speed-and-quality.spec.ts`, which hovers along the seek bar.

### Process, in four lines, because six implementers were stopped by a session limit

- **Commit at each green step and push as you go.** A commit survives the agent; only a
  push survives the worktree. Once that was in every brief, an interruption cost nothing.
- **Create the worktree and run `npm ci` in it yourself.** Still the most expensive thing
  that ever went wrong on this run.
- **Gate every merge yourself.** Every implementer's numbers have matched the
  integrator's exactly, every time — which is the reason to keep checking, not to stop.
- **Never run two Playwright suites at once** (`pgrep -f playwright` first), and capture
  the whole log to a file. A gate once reported **321 failures on a tree that was clean
  minutes later**, many in under 100 ms. A wall of instant failures is an environment
  report, not a test report.

### The agenda that is yours rather than an agent's

Nothing below can be finished by an implementer, and together they are what stands between
this branch and a release.

| | What it needs from you |
|---|---|
| **#45** | An MDBList key, to make **one** real call. The ratings code is written against an OpenAPI schema that types the elements as a bare object with no example. A wrong guess omits a rating rather than drawing one wrong — quiet by design, and therefore quiet about being wrong. |
| **#47** | A real Jellyfin, to check `MediaStream.Path` for external subtitles. If a real Server withholds it, the fallback key still works and **story 102's cross-Episode half is lost silently**. |
| **#48** | A decision on where licence texts go. The build ships **4.3 MB of libass's LGPL-2.1 WebAssembly** and libpgs under MIT. There is no licences screen, and this is tangled with the spec's own "choosing a licence" item. |
| **#51** | A navigation design call. **A phone cannot reach the Movies or Series sections.** The bottom bar carries four items by story 61 and nothing on Home links to either. Harmless while both were placeholders; they are now two real screens reachable only by typing an address, and three of the suite's skips exist because of it. |
| **#54** | One word's reading. A playback speed survives a re-negotiation but resets when the player is closed. The ticket's own wording put the quality ceiling in "device storage" and speed only "for the session", so speed was clearly not meant to persist to the device — but whether "session" means the playback or the app session is yours. Small either way. |
| **#12's saves** | #46 made the suite honest about a fire-and-forget Client Settings write; **the app still does not wait for one.** Whether it should is a design change, not a test fix. |

Also open and genuinely an agent's: **#42**, a `[desktop]` arrow-key Row-scroll assertion
that has now recurred twice — once on a line that is **already** an `expect.poll`, so the
fix originally suggested on the issue is probably wrong, and both assertions really want
to know whether `reveal.ts` is meant to land exactly on 0.

## NINTH SESSION — nine merged, and what the current code assumes

**Read this, then the eighth session's section below for the two paused branches, then the
seventh's, which is still the standing guidance and has not been superseded.**

The eighth session's pause was a clean one: everything it described was still true when
this session opened it. Both paused worktrees were intact, both branches were exactly
where the doc said on `origin`, and no dev server, fake Jellyfin or browser process was
left running — all checked rather than assumed.

### #32's branch moved the e2e skip count 44 → 45, and this is the one

Recorded here in the same commit, which is this doc's own rule.

`test/e2e/trickplay-speed-and-quality.spec.ts` adds **six** tests. Five run in all three
projects. The sixth — `with a pointer over the bar › follows the pointer, onto the second
row of the sheet` — hovers along the seek bar, and the `keyboard-only` project disables
pointer events outright, so that one skips there and nowhere else. **18 collected, 17
passed, 1 skipped**, and no pre-existing skip moved. The trickplay preview's other trigger
is focus on the bar, which is what a remote gets, so every other preview assertion runs in
`keyboard-only` rather than being excused from it.

### #32: the e2e found a defect every unit assertion was green through — again

The sixth time on this run that a browser or a look found what the suite could not, and
the second time it was **focus escaping the player**.

Every choice in the new playback options menu closes it, which takes the focused button
away with it — and the browser then hands focus to the **document**. The flow rule (#7,
#40) only keeps focus inside an overlay that focus is already in, so from the document the
arrow keys are not in the player at all: on a 390px screen a remote that had just left
picture-in-picture walked **My List, Mark as watched and the suggestion Row on the title
page behind the picture**, with the player still open in front of it. It passed on the
desktop and keyboard-only viewports and failed on the phone one, which is #40's own story
exactly — the geometry decides whether the bug is visible, so the rule is what gets
pinned, not the layout.

`playback-options.tsx` now hands focus back to the control it was opened from, unless that
control went with a re-negotiation, in which case the controls' own effect has it. Two
unit tests pin both halves, and the fix was held against the failure: take the cleanup out
and the first goes red every time.

**`TrackPicker` has the identical gap and was left alone** — it is #27's control, Done
closes it the same way, and it is outside #32's scope. Filed rather than widened, which is
the #50 precedent.

### #52 was already fixed on #32's branch, and is now one shared guard

#32's predecessor had independently met the stop-report leak and written a private
`reportsHaveSettled` into `playing-a-title.test.tsx`'s `beforeEach` — which is why the
file would not reproduce: **six full runs, zero failures** on the merged tree before
anything was changed. With that one line taken out again it reproduces as #52 describes.

The private copy is now the shared `savesHaveSettled()`, and so are the three
`afterEach` copies `architecture.md` asked to be folded in when #32 landed —
`shifting-the-subtitles`, `styled-subtitles`, `image-subtitles`. All three moved to
`beforeEach` at the same time, because the `afterEach` position cannot catch a write that
**unmounting** starts: `cleanup` is registered in `test/setup.ts` and runs after the
file's own hooks. `choosing-tracks`, `skipping-and-the-next-episode` and
`scrubbing-speed-and-quality` had no guard at all and have one now. Those seven are every
unit journey that ends with the player still open.

### The tip's own gate, re-measured before anything was launched

`2cbbf2d` had gained two commits since the numbers in the eighth session's section were
taken, so they were re-measured on this worktree, each step its own exit code: `lint` 0,
`typecheck` 0, `build` 0, **851 unit tests in 62 files**, main JS **161.22 kB /
48.88 kB gz**. Identical to the recorded figures, so those two commits changed nothing the
gate measures.

### The screenshot tour moved the skip count, and nobody had written that down

`2cbbf2d` added `test/e2e/screenshots.spec.ts`. Its single `tour` test is collected in
**all three projects** and skips at runtime unless `SCREENSHOTS` is set, so the suite's
baseline went **26 → 29 skipped** the moment that commit landed — before any ticket in
this wave touched anything.

This matters more than it sounds. Since the fourth session this doc has insisted that a
moved skip count be justified by reading every name, and both implementers in this wave
had been briefed to do exactly that. A baseline that moves for an unrecorded reason spends
two agents' time proving the integrator's own commit innocent. Both were told as soon as
it was found. **When you add a runtime-skipped test, record the new count here in the same
commit.**

**#23 moved it again, 39 → 44, and these are the five.**
`test/e2e/movies-and-series.spec.ts` adds six tests. Three of them walk into a section
through the navigation, and a **phone's bottom bar carries no Movies or Series link** —
four items is what story 61 asks for, so at that width a section is reached by its
address — which is three skips in the `phone` project. The fourth measures the
document's scroll width at 375px and is the `phone` project's own question, which is two
skips, in `desktop` and `keyboard-only`. Nothing pre-existing moved, and the other two
tests run in all three projects.

### #21 merged at `a4ee6c8`, closed

Resumed from `13ef239` per the eighth session's instruction. The integrator's WIP snapshot
turned out to hold **only the half-finished docs edit** — no app logic was uncommitted, and
the feature passed `lint`, `typecheck`, `build` and the unit suite untouched. So the
snapshot's real cost was the gating and the merge, not lost work.

Gate re-run by the integrator on the merge result, not taken from the report: `lint` 0,
`typecheck` 0, `build` 0, **868 unit tests in 64 files**, main JS **164.36 kB /
49.61 kB gz** (+3.14 kB raw, +0.73 kB gz), CSS 20.84 kB / 4.40 kB gz. Every number matched
the implementer's exactly, as all of them have.

**The merge tree was byte-identical to the branch tip the implementer had run Playwright
on** (verified with `git rev-parse HEAD^{tree}`, not assumed from the log shape), so the
e2e run was carried rather than repeated — the same exception #22's merge took. That run
was **420 passed, 39 skipped, 0 failed** under `E2E_CPU_THROTTLE=4`.

**Skips 29 → 39, legitimate:** all ten are `desktop-hover-cards.spec.ts` in the
`keyboard-only` project, which disables pointer events, and the enlarged card is a
pointer's to open by AC 1. All 39 names were read. No pre-existing skip moved.

### Two defects #21 found that every assertion was green through

Both are worth generalising, and neither was in #21's scope as written.

- **Two e2e tests told Home from the title page by an `h1` reading "Arrival".** That
  heading is the **Billboard's** — it draws the featured Title's name in an `h1`, and the
  sample Server features Arrival. One test failed on Home itself; the other would have
  passed against a screen that never changed. Both now assert `toHaveURL`. **The player is
  an overlay over Home, not an address** (#40's lesson again), so on this app a screen's
  identity is its URL or something only it draws, never a Title's name.
- **`.button` wins on source order.** It is written *below* the component rules in
  `base.css`, sets `font: inherit` — the shorthand, which resets font-size — and a
  page-sized `padding`. At equal specificity it beat `.card__hover-more`, so More info was
  drawn at the page's font size and broke across two lines on a 150px card. **Filed as
  #49**, which lists three more rules losing the same way: `.user-list__sign-out`, and
  `.genres__genre`/`.genres__leave`, the last two directly contradicting the comment above
  them.

The second was found by **rendering a rested card and looking at it**, with every e2e
assertion green before and after. That is now three times on this run — #44, #40 and this
— that looking found what the suite could not. `npm run screenshots` exists for it.

### #29 merged at `44de7fa`, closed — and it was not finished when it was paused

The eighth session paused #29 looking complete: five authored commits, every unit test
green. **libass had never started in a browser, and nothing said so.** Two faults, the
second hiding the first:

- `workerUrl` pointed at `jassub/dist/wasm/jassub-worker.js`, the Emscripten glue loaded
  *inside* the worker. The worker is `dist/worker/worker.js` and imports bare specifiers,
  so it has to be bundled. The fix is to pass **neither** `workerUrl` nor the WASM URLs and
  let Vite resolve JASSUB's own `new Worker(new URL(…), {type:'module'})` — it already
  emitted the worker, both binaries and the default font.
- **`renderer.ready` was never awaited**, so `loadStyledSubtitleRenderer` resolved for a
  renderer that would never draw and `onUnsupported` could not fire. A User would have got
  a blank canvas: no words, no error.

**No unit test could have found this**, and that is the part to carry forward. The unit
journey fakes the device layer, and nothing runs a 2 MB WASM binary in happy-dom — the
same blind spot `#40` found in the navigator, where happy-dom gives every box a zero size.
`test/e2e/styled-subtitles.spec.ts` is what found it. It asserts on **requests and boxes,
never pixels**: that no WebAssembly is fetched while a plain track draws, that the engine
really loads, that both embedded fonts are really fetched — read off the fake's
`/__fake/requests`, because **a worker's requests are not the page's** — and that the
canvas fills the picture without reaching the controls.

So: **a paused branch's green unit suite is not evidence that its feature works.** Both
branches this session were resumed with the brief "finish and gate", and only one of them
was actually finished.

Gate re-run by the integrator on the merge result, after an `npm ci` for the new runtime
dependency: `lint` 0, `typecheck` 0, `build` 0, **911 unit tests in 67 files**, **429
Playwright passed / 39 skipped / 0 failed** under `E2E_CPU_THROTTLE=4`, main JS **169.00 kB
/ 51.07 kB gz** (+4.64 kB raw, +1.46 kB gz), CSS 20.92 kB. Every number matched the
implementer's. The merge tree was byte-identical to the gated branch tip, but the e2e run
was **repeated rather than carried** — this changes the player and adds a worker and a WASM
path the whole suite leans on, which is the exception #31's merge established.

Skips **39, unchanged**; all nine new tests run.

**The libass payload is entirely lazy and none of it is in the main-bundle number:**
`jassub` 15.15 kB, the bundled worker 112.75 + 30.02 kB, two WASM builds at 2,105.59 and
2,176.54 kB, and a 145.97 kB default woff2. Do not read the build listing as a regression.

**What later tickets inherit:** `src/playback/styled-subtitles.ts` is now
`subtitle-presentation.ts` and `styled-subtitles.tsx` is a new, different component;
`test/unit/choosing-a-subtitle-renderer.test.ts` is now
`choosing-how-to-draw-subtitles.test.ts`; **`PlaybackPlan` gained a required `fonts`
field**, so every plan literal in a test needs it; `DeviceLayer` gained
`loadStyledSubtitleRenderer`, which the webOS port will answer with libass-wasm because
JASSUB needs Chrome 69; and `jassub@2.5.20` is in `dependencies`, so **any branch merging
this needs `npm ci`**.

**#48 filed:** libass is LGPL-2.1 and the build now ships 4.3 MB of its WebAssembly. The
repo and the image owe the licence texts and there is no licences screen to put them on —
tangled with the spec's own "choosing a licence" item, so it is the host's call.

**#42 moved rather than being duplicated.** It recurred once during #29's run and the
recurrence contradicts the original report twice: it was **`[desktop]`, not `[phone]`**,
and it failed on **line 151, which is already an `expect.poll`**, sitting at 3 for the
full five seconds. So "make the first assertion a poll" is probably not the fix; both
assertions want to know whether `reveal.ts` is meant to land exactly on 0. It passed
10/10 on `--repeat-each` and did not recur in the integrator's own run.

### A session limit stopped both implementers at once — and neither branch had ever been pushed

The third interruption of this run, and it exposed a gap the earlier two had hidden.

Both agents had **committed as they went**, which is what the seventh session's lesson
asked for and it worked: #19 had five authored commits and a clean tree, #30 had three and
a one-file dependency install uncommitted. Nothing was mid-thought.

**But neither branch existed on `origin`.** Every commit lived only inside a worktree, one
`git worktree remove` away from being gone. Worse, it *looked* fine: `git log
origin/ticket/19-…..HEAD | wc -l` printed `0`, which reads as "nothing unpushed" and
actually meant the range was empty because **the remote ref did not exist at all**. The
integrator nearly accepted that number.

So the standing advice was half a rule. Commit at each green step **and push the branch**;
the commit is what survives the agent, the push is what survives the worktree. Implementer
briefs now say both. And when checking whether a branch is safe, **verify the remote ref
exists** with `git ls-remote` before reading any count of unpushed commits — an empty range
against a missing ref is indistinguishable from a clean one.

Recovery was cheap because of the commits: #19's branch was pushed as-is, and #30's
dependency install was committed as a WIP snapshot whose message says what it is and tells
the next agent to keep the three authored commits beneath it rather than reset past them.

### #19 merged at `42a596f`, closed — finished, and stopped mid-gate

Its implementer's last act was re-running the gate; the work itself was done. The
integrator pushed the branch, ran the gate from the ticket's own worktree after an
`npm ci`, and merged.

`lint` 0, `typecheck` 0, `build` 0, **938 unit tests in 69 files** (+27 tests, +2 files),
**450 Playwright passed / 39 skipped / 0 failed** under `E2E_CPU_THROTTLE=4` (+21 tests,
all new), main JS **171.64 kB / 51.92 kB gz** (+2.64 kB raw), CSS 21.26 kB.

**Skips 39, unchanged** — all 21 new tests run, the keyboard-only ones included, so both
new controls are reachable by direction alone rather than excused from that project.

The merge result differed from the gated branch tip in `docs/research/RESUME.md` **alone** —
checked with a diff rather than assumed from the log shape — so the e2e run was carried
and the fast steps and unit suite re-run on the merge result. That is the third shape this
carry/repeat decision has taken on this run: byte-identical (#21, #22), docs-only delta
(#19), and repeat-anyway because the change is something the whole suite leans on (#29,
#31).

#19's implementer had independently hit and fixed the **same heading trap** as #21 and #29:
a test telling a title page from Home by an `h1` that is really the Billboard's. Three
tickets in a row. It is now in every implementer brief.

### #23 merged at `73b34fe`, closed

Two addresses over one component, because the sections differ in exactly one fact. The
layout is a fixed `HomeLayout` literal drawn by Home's own registry, so every Row inherits
Home's rules and nothing stores or edits it — a User who hid New on Jellyflick on Home
still has it in the section, which a unit test pins.

Gate re-run by the integrator on the merge result: `lint` 0, `typecheck` 0, `build` 0,
**965 unit tests in 72 files** (+27, +3 files), **463 Playwright passed / 44 skipped /
0 failed**, main JS **174.51 kB / 52.61 kB gz** (+2.87 kB raw), **CSS 21.26 kB unchanged**.
The merge tree was byte-identical to the gated tip and the e2e was **repeated anyway** —
this touches the gateway, Home's Row registry and the fake's field gating, which the whole
suite leans on. Third shape of that decision, and the rule is now clear: byte-identical
buys you the carry only when the change is *narrow*, not merely when the tree matches.

**Skips 39 → 44, read by the integrator rather than taken from the report.** All five are
in `movies-and-series.spec.ts`: three walk into a section through the navigation and skip
on `phone`, one is a 375px scroll-width check that skips in `desktop` and `keyboard-only`.
No pre-existing skip moved.

**Two findings in it that outlive the ticket:**

- **The fake was more permissive than a real Server, and it would have shipped a blank
  feature.** The fake did not gate `Genres`; the real Server does, and no gateway query
  asked for the field. So #21's hover-card genres line and the title page's would have been
  **full against the fake and empty against a real Jellyfin** — green suite, blank screen.
  The fake now gates it and `TITLE_DETAIL_FIELDS` asks for it. This is the same class as
  #47 and it is worth a standing suspicion: **where the fake is laxer than the Server, the
  tests cannot see the feature fail.**
- **A library's `CollectionType` says what it is *for*, not what it holds.** Narrowing New
  on Jellyflick to `movies` libraries cost the Series section **Bluey**, because the sample
  Server's Kids library is typed `movies` and holds a Series. Written, tested, and taken
  back out; the Row narrows the merge instead.

**#51 filed, and it is the host's call:** a phone cannot reach either section. The bottom
bar carries four items by story 61 and nothing on Home links to either, despite a comment
in `sections.ts` and a line in `architecture.md` that claimed otherwise. Harmless while
both were placeholders; now they are two real screens a phone User can only reach by typing
the address. Fixing it changes #6/#8's navigation design and is asserted by
`moving-around-the-app` in both suites — **three of the five new skips exist because of
it.**

**Inherited by later tickets:** `RowCard` gained a **required `kind`**, so any card literal
in a test needs one; `useOpenTitle`'s parameter narrowed to `Pick<RowCard, 'titleId'>`;
`use-billboard.ts` now keys the pick on the address, and only one pick is live at a time.

**No `GLOSSARY.md` edit**, deliberately, with #30 in flight. The sections, and the derived
top genres, are owed an entry at the next between-waves sweep — that is the #43 precedent.

### #30 resumed and finished on `ticket/30-image-subtitles` — read this before merging it

Resumed from the integrator's WIP `d6078a8`. That snapshot held **only** the
`libpgs@0.9.0` install, exactly as its message said, and the three authored commits below
it were real work and were kept. The install stayed where it was rather than being folded
into the first commit that uses it: it sits below a merge already on `origin`, and
rewriting published history to move an `npm install` two commits later is the worse trade.

**The research box was already answered on the ticket** by the predecessor, before the
limit, and it closes two of the three bitmap families for two independent reasons: no
maintained client-side VobSub renderer runs on the Chromium 68 floor (the one new
candidate, `libbitsub`, needs Chrome 75 and Chrome 96 WASM proposals by its own binary),
**and** Jellyfin's graphical passthrough never hands over the `.idx` a VobSub renderer
needs for its palette — so even a perfect one would have the bitmaps and no colours.
VobSub and DVB are burned in everywhere. PGS is drawn here with `libpgs`.

**The scope grew by one thing the ticket implies but does not list.** Choosing a burned-in
track has to **re-negotiate** — the Server produces a different transcode — so it moved to
the sound's side of #27's "switching subtitles never touches the media element" line.
Leaving one re-negotiates too, which is the half easy to miss: the words are in the
picture until a new stream replaces it, so a client that only asked on the way in would
strand a User with subtitles they had just switched off. Without this, choosing a VobSub
track would have done nothing visible at all, which is worse than #27's honest "cannot
draw".

**#29's lesson was spent rather than repeated.** `test/e2e/image-subtitles.spec.ts` was
written before the ticket could be called done, and checked against the failure it exists
for: with `workerUrl` removed, the two decoding tests fail and the two box tests still
pass. That is exactly #29's signature — a canvas in the right place drawing nothing — and
it confirms presence-and-geometry could not have caught either ticket's bug. libpgs has
the **same `workerUrl` trap as JASSUB**, in a different shape: it defaults to a bare
relative string that resolves against the document, so the SPA answers `index.html` and
the worker parses HTML as JavaScript and never replies.

**Looking found three things every suite was green through**, which is now the fifth time
on this run:

- **Nothing was drawn.** libpgs renders only when the display-set *index* changes, and the
  index it compares against starts at **0**, which is also a valid index — so a stream
  whose first set is already on screen when the renderer starts draws nothing, silently.
  The fake now leads with an empty display set at zero.
- **The picture grew and pushed the controls out of the window.** A grid item's
  `min-height` is `auto`, and libpgs sets the canvas's `height` attribute to the stream's
  1080. `.player__video` has carried `min-height: 0` since #26 for exactly this reason.
  Every box assertion compared the canvas with the picture and the two grew together, so
  none of them moved.
- **The disabled control did not look disabled.** The only `aria-disabled` dimming rule was
  scoped to the undrawable tracks #27 added, which #30 removed — so the rule matched
  nothing and the Subtitle timing button looked pressable.

**Baseline moved, deliberately and recorded here in the same commit**, per this doc's own
rule: **70 unit files, 974 tests** (was 69/938 at `42a596f`; the predecessor's three
commits account for 23 of those and `image-subtitles.test.tsx` for 13). Playwright gains
**12** (4 tests × 3 projects) with **no new runtime skip**, so the skip count must stay at
**39**.

**`libpgs` is MIT**, a notice obligation rather than LGPL's source one. Added to **#48**
beside libass's rather than filed separately, as the brief asked. **#50 filed**: #28's
"Sync to this line" carries `aria-disabled` with nothing dimming it either — the same
defect, in a panel outside #30's scope, so it was reported rather than fixed.

**What the integrator should know:** `DeviceLayer` gained `loadImageSubtitleRenderer`, so
**any branch merging this needs `npm ci`** for `libpgs@0.9.0`; `StyledSubtitleRenderer`
and `ImageSubtitleRenderer` are now aliases of one `SubtitleRenderer`;
`deviceProfileFor` takes subtitle capabilities as a second argument; `TrackPicker` gained
`subtitlesBurnedIn`; and **Arrival gained two subtitle streams**, `pgssub` at 6 and
`dvdsub` at 7, in languages nothing else prefers.


### #30 and #41 merged; the whole spec graph is now done but for the player's last three

**#30 Image subtitles merged**, after two session-limit interruptions it survived because
its implementer committed as it went. Its research box closed two of the three bitmap
families for two independent reasons — no maintained client-side VobSub renderer runs on
the Chromium 68 floor, **and** Jellyfin's graphical passthrough never hands over the `.idx`
a VobSub renderer needs for its palette, so even a perfect one would have bitmaps and no
colours. PGS is drawn here with `libpgs`, lazily, the decoder and its 65.95 kB worker
outside the main bundle. VobSub and DVB are burned in.

**#27's line moved**, and later player tickets inherit the new shape: "switching subtitles
never touches the media element" now has an exception, because a burned-in track
re-negotiates. **Leaving one re-negotiates too** — the words are in the picture until a new
stream replaces it, so a client that only asked on the way in would strand a User with
subtitles they had just switched off.

**libpgs had the same `workerUrl` trap as JASSUB, in a different shape**: a bare relative
string that resolves against the document, so the SPA answers `index.html` and the worker
parses HTML as JavaScript. Two libraries, two tickets, one trap. **Let the bundler resolve
a library's own worker and WASM URLs; do not pass them by hand.**

**#41 merged**: a Row and a Billboard Source that want the same data now read it once.
**Six library reads become three** on Home with Resume featured and Continue Watching on
screen, sixteen become thirteen across Home, eight become four for Newest Addition. The
second acceptance criterion was the binding one and it held — `src/home/shared-reads.ts`
knows nothing about Rows, Titles or the Billboard, and the Billboard still reaches
Continue Watching only through `loadContinueWatching`, so no rule was copied anywhere.

Three things about that cache worth not rediscovering: **it lives exactly one screen**, a
fresh one per `path|serverAddress|userId`, which is the same moment a Row re-reads anyway,
so the lifetime *is* the invalidation; **it is replaced during render, not in an effect**,
because a child's effect runs before its parent's and clearing it in an effect would clear
it *after* the Rows had filled it, making the first screen after every navigation read
everything twice; and **the key carries the kind and the limit**, because a Movies section
asks Continue Watching one question where Home asks three, and handing Series what Movies
was told would be invisible — the Row would just come out short.

### Two flaky tests, both settled by counting rather than by reasoning

This is now the house method and it should stay that way. A flake argued about is a flake
kept.

- **#30's burned-in test failed about one run in three**, and only in a full suite — never
  alone. **Waiting for a control to be visible is not waiting for it to be settled.** The
  re-negotiation the test exists to exercise tears the controls down and rebuilds them, so
  the wait resolved the button on its way out, the press landed on it, and the rebuild
  discarded the dialog it opened. It now presses again when nothing happened, which is what
  a User does, guarded so a press only ever goes to a closed picker. **Twice failed in six
  phone-project runs before, zero in four after**, then a clean full suite.
- **#41's own read-counting test failed five runs in fifteen**: it forgot the request log
  as soon as Home's Row appeared, while Home's three reads were still arriving, so they
  were counted against the section. Fixed by settling Home first; **12/12 after.**

### Two full Playwright suites on one machine will lie to you

The integrator ran #30's gate while an implementer was running its own suite and a build.
The result was **321 failures**, many of them in under 100 ms, because the gate's own
preview server never came up. Nothing was wrong with the code: the same tree, run alone
minutes later, was **475 passed / 44 skipped / 0 failed**.

Two lessons. **Check for a running suite before starting one** — `pgrep -f playwright` —
and wait rather than interleave. And **a wall of instant failures is an environment
report, not a test report**: read the shape before reading the first failure.

A third, smaller: `npx playwright test ... | tail -12` writes only twelve lines to the log
and the counts in them cannot be reconciled with anything. **Capture the whole log to a
file**, then grep it.

### #49 fixed and the glossary swept, between waves

Both collide with every branch, so both were done with nothing in flight — the #43
precedent, and it is still the right call.

**#49**: `.button` is written below the component rules and sets `margin-top`, `padding`
and a `font` shorthand that carries font-size with it, so at equal specificity it won on
source order and three rules did nothing. All three elements already carry `.button`, so
the selectors are now doubled. **The `font` shorthand was left alone deliberately** —
replacing it with `font-family` would hand every button the UA's own font-size, which is a
change to every screen rather than a fix to three rules.

**Glossary**: the Movies and Series sections, top genres, styled subtitles, image
subtitles, and **burned in** — the last of these matters because it is the one subtitle
choice that reloads the video, and that is a fact a reader needs the word for.

### How the ninth session ended

**Eight merged and closed: #21, #29, #19, #23, #30, #41, #49 and #46.** Every one was
gated by the integrator on the merge result, and every implementer's numbers matched the
integrator's exactly.

**#46 was the last of them**, and it is worth knowing what it did and did not do. The
guard #29 wrote for its own journey, and #41 copied for its own, is now **one helper in
the fake's control surface**, used by all four exposed journeys and by the two that had
their own copies. `architecture.md` carries the rule and says which hook it belongs in and
why it is not simply `afterEach`. **It makes the suite honest, not the app correct** — the
fire-and-forget Client Settings save is still there, and whether it should be awaited is a
change to #12's design and the host's call.

**#32 was the ninth and last**, finished across two sessions: a limit stopped its first
implementer with all four features built and pushed, and a second added the e2e spec and
the gate. That spec found a focus escape on `phone` within its first run — see the tenth
session's section above for why that keeps happening in the player and what to do about
it.

The session ended with **nothing in flight** and two spec tickets left.

### Bundle trend

147.05 → 149.46 (#22) → 153.13 (#31) → 155.95 (#20) → 161.22 (#28) → 164.36 (#21) →
169.00 (#29) → 171.64 (#19) → 174.51 (#23) → 176.48 (#30) → **177.55 kB** raw, 53.47 gz.
CSS 21.33 kB. Still feature code. Nothing is newly split beyond hls.js, #29's libass and
#30's libpgs — **all three lazy, and none of them in that number.**

## EIGHTH SESSION — PAUSED FOR TOKENS, two branches snapshotted mid-flight

**Read this, then the seventh session's section below, which is still the standing guidance
and has not been superseded.** The seventh session's traps, conflict groups and wave costs
all still apply.

The session was **paused deliberately**, by the host, to free tokens — not interrupted and
not finished. Two implementers were running and were **stopped on purpose**, with their
trees snapshotted first. Nothing is running now: no agent, no dev server, no fake Jellyfin,
no browser process (checked with `pgrep`, not assumed).

### What landed

**#43 is merged and closed at `d99b590`**, done inline by the integrator before launching
anything, which is where the seventh session said a `GLOSSARY.md` edit belongs. The sweep
found **three** gaps rather than the one #43 suspected: the **Subtitle timing** panel
(#28), kept as a separate entry from the Subtitle Offset it moves; **Extra Ratings** (#20);
and **Trailer**, which the Billboard has shown since #16 and which no entry had ever
defined. **Billboard Source was already in** — #43's body was wrong about that one.
Docs-only, so no gate was re-run beyond the integration tip's own.

**Integration tip `26f6bff`, pushed; origin verified with `git ls-remote`, not with a quiet
push.** Draft PR #38 still draft. Nothing has merged into the branch since #28 except #43
and these two doc commits, so **the seventh session's gate numbers still describe the tip**:
851 unit tests in 62 files, 400 Playwright passed / 26 skipped / 0 failed, main JS
161.22 kB / 48.88 kB gz.

### The two paused branches — both pushed, both ungated

Both were created by the integrator, `npm ci` run in each before either agent was briefed,
and both branches are based on `d99b590` (verified with `git merge-base --is-ancestor`).
**Both are pushed to `origin` and both worktrees are clean** — `git status --short` empty in
each. The work is durable whether or not the worktrees survive.

| | #29 Styled subtitles | #21 Desktop hover cards |
|---|---|---|
| Branch | `ticket/29-styled-subtitles` | `ticket/21-desktop-hover-cards` |
| Worktree | `.claude/worktrees/ticket-29-styled-subtitles` | `.claude/worktrees/ticket-21-desktop-hover-cards` |
| Ports (**both suites**) | `APP_PORT=8331` `FAKE_JELLYFIN_PORT=8332` | `APP_PORT=8341` `FAKE_JELLYFIN_PORT=8342` |
| Last **real** commit | `69ccf08` | `13ef239` |
| WIP snapshot tip | `287b8a0` | `24a5184` |
| Real commits | 5 | 4 |
| In the snapshot | 17 files, +837/−14 | 6 files, +125/−24 |
| Whole branch so far | 27 files, +2124/−13 | 18 files, +1497/−45 |

**The last commit on each branch is a WIP snapshot the integrator made, not the author.**
Its boundary is arbitrary — wherever the agent happened to be, not a green step — and
**nothing on either branch has been gated at all.** Each WIP message says so and names the
commit to `git reset --soft` back to. Do that and recommit in the author's own steps rather
than building on top of it.

**Resuming either one:**

1. `npm ci` in its worktree first. **#29 adds `jassub@2.5.20` as a runtime dependency** —
   the project's second after hls.js — so its worktree's `node_modules` is stale and will
   fail `typecheck`, `test` and `build` at once (trap 3).
2. `git reset --soft <its last real commit>`, inspect, recommit properly.
3. **#29 renames `src/playback/styled-subtitles.ts` → `subtitle-presentation.ts` while
   adding a new `styled-subtitles.tsx`.** Read the rename before assuming which file you
   are looking at; the name is now reused for a different thing.
4. **#21's `docs/architecture.md` edit is half-finished.** Its last words were that it was
   flipping stale forward-references in that file to past tense, so expect a file mid-edit
   rather than a wrong one.
5. Re-brief a fresh implementer with **pointers only**, plus how far the integration tip has
   moved and what is in those commits — not just that it moved.
6. Then gate: `lint`, `typecheck`, `build`, unit, Playwright, **each with its own exit
   code**, and a bundle measurement. Nothing on either branch has passed any of these yet.

### Two things these branches found that change the plan below

- **#21 never touched `src/title/title-screen.tsx`.** It is entirely in `src/home/`:
  `hover-card-panel.tsx`, `hover-card.ts`, `card-actions.tsx`, `home-screen.tsx`,
  `home-rows.tsx`, `row.tsx`. So the seventh session's conflict grouping was wrong in both
  directions: **#19 is not blocked by #21 at all** and can run beside it, while **#21 now
  collides with #23 and #41**, which are the `src/home/` tickets. Re-read the conflict
  groups below with that correction in hand.
- **The only file the two paused branches share is `src/styles/base.css`**, and #21 is the
  only one of them that touched `src/i18n/`. So the usual every-wave `en.ts`/`es.ts`
  conflict does **not** apply between these two — but **#21 also added four lines to
  `GLOSSARY.md`** on top of #43, so a glossary conflict is possible now where there was
  none before.

### The frontier when work resumes

- **In flight, paused, ungated:** #29 and #21 as above. Finish these before launching
  anything new in `src/playback/` or `src/home/`.
- **Spec tickets open and unblocked:** #19, #23, #30, #32, #33, #34. All six report
  `blocked_by` 0 live. #30 and #32 are `src/playback/` and wait on #29 in practice; #23
  waits on #21 now, not on #22; **#19 is free immediately** — see the correction above.
- **The run's own findings:** #41, #42, #46 open. #43 is now closed.
- **`needs-info`, both needing the host rather than an agent:** #45 (MDBList's ratings
  shape, no key available to make one real call) and #47 (`MediaStream.Path` for subtitles
  against a real Jellyfin).
- **Still owed at the end:** `code-review` over the whole branch, the git history rewrite in
  `decisions.md` §10, and marking PR #38 ready. See "Still owed at the end of the run" at
  the bottom — it is current.

### Worktrees

Four exist. **Keep all four:**

- `implement-spec-c273ce` — the integrator's own, on `feat/jellyflick-v1`.
- `ticket-29-styled-subtitles`, `ticket-21-desktop-hover-cards` — **the paused work. Do not
  remove these**; they are clean and pushed, so removing them would lose nothing, but
  keeping them saves an `npm ci` each and keeps the resume cheap.
- `implement-spec-88c250` and `remote-setup-2e9b22` — **other Claude sessions, not this
  run. Leave them alone.**

## SEVENTH SESSION — the standing guidance on traps, costs and process

The seventh session fixed the **last of the four e2e failures** and launched **#31 and
#22**. CI's `e2e` job had failed on **every run of this branch since it began**; it passes
now, confirmed on CI's own hardware, which is the only place the bug it was hiding ever
showed itself.

Integration tip **`0ba7c23`**, pushed, draft PR #38 open (still draft). Gate on this
worktree, each step's own exit code: `lint` 0, `typecheck` 0, `build` 0, **690 unit
tests** in 53 files, **384 Playwright tests (359 passed, 25 skipped, 0 failed)** under
`E2E_CPU_THROTTLE=4`, main JS **147.05 kB / 44.54 kB gz**, a 13.97 kB / 4.60 kB gz Spanish
chunk, 17.97 kB / 3.91 kB gz CSS, and hls.js still in its own lazy
584.35 kB / 181.54 kB gz chunk that only a transcode fetches.

**#22 merged at `a639c1d`, #31 at `c0b7298`, #20 at `6d6ca49`, #28 at `2bbe785`**, all
closed. **Nothing is in flight and no implementer is running.** Integrator's own gate on the `2bbe785` tip,
each step its own exit code: `lint` 0, `typecheck` 0, `build` 0, **851 unit tests in 62
files**, **400 Playwright passed, 26 skipped, 0 failed** under `E2E_CPU_THROTTLE=4`, main
JS **161.22 kB / 48.88 kB gz**. **All four implementers' numbers matched the integrator's
exactly** — re-run rather than taken from their reports, every time.

The #31, #20 and #28 merges each got a **full** e2e re-run rather than a carried gate: #31
changed a helper the whole suite leans on, #20's own run had #42 fail, and #28 moved the
skip count. #22's merge tree was byte-identical to the branch tip it had gated, so only the
fast steps were re-run there.

**The skip count rose 25 → 26 at #28, and the rise is legitimate** — checked by reading
all 26 names, as this doc has insisted since the fourth session. The new one is
`[keyboard-only] the-subtitle-offset.spec.ts › repeats while a button is held`: that
project disables pointer events outright and the test needs a held mouse button.

**Bundle trend, which is the one gate number that moves every merge:** 147.05 → 149.46
(#22) → 153.13 (#31) → 155.95 (#20) → 161.22 kB raw. Each implementer measured its own
share before merging: #20 +2.82 kB, #28 +5.13 kB. The growth is feature code, not noise,
and nothing new has been lazily split since hls.js.

All four ticket worktrees have been removed after checking each was a full ancestor of the
integration branch with nothing uncommitted and nothing unpushed. Their branches remain on
`origin`. No stray dev server, fake Jellyfin or browser process is left running.

**CI is green and has stayed green.** Every run since `587eddb` has passed, through three
merges. Before this session the `e2e` job had failed on every run of this branch since it
began.

### #31 fixed the shared arrow-key search — know this before writing an e2e that reaches a control

`reachByArrowKeys` and its helpers moved out of `playing-a-title.spec.ts` into
**`test/e2e/arrow-keys.ts`**, and off the seek bar the search now steps in whichever
vertical direction the target lies instead of always Down. Down is correct for #27's track
picker, which sits below the bar, and walks *away* from #31's Skip button above it: the
search ping-ponged between the bar and play/pause until its 40 presses ran out, and
reported a button a remote reaches in two presses as unreachable.

Any later ticket adding a focusable control **over the picture** uses this helper and
inherits that fix. #40's in-menu pin came through the move verbatim.

### Tell an implementer to commit as it goes — a limit can stop it with nothing durable

A session limit stopped **#20 and #28 together**, mid-flight. What each had to show for
its work was entirely a matter of habit:

- **#20** had one real commit and ten files uncommitted.
- **#28** had **no commits at all** — eleven files, 1,306 insertions, every line of it
  uncommitted, including two finished unit specs.

Nothing was lost, because the integrator committed both trees as **WIP commits whose
messages tell the reader to distrust them** and pushed the branches. But #28 came within
one worktree cleanup of losing a ticket's worth of work, and the recovery is only possible
while the worktree still exists.

So brief implementers to **commit at each green step**, which the `tdd` loop asks for
anyway, and not to save it all for the end. And when recovering one:

1. Snapshot the tree as a patch *and* as a WIP commit; push the branch. A pushed commit is
   the only thing that survives a worktree going away.
2. Say in the WIP message that its boundaries are the integrator's, not the author's, and
   tell whoever resumes to `git reset --soft <their last real commit>` and recommit it
   properly rather than build on top of it.
3. Tell the resumed implementer **how far the integration tip has moved and what is in
   those commits**, not just that it moved — #20's base had gained #31, which touches the
   same `src/title/` files, so it faced a real conflict rather than the usual `i18n` one.

This is the second interruption in this session. The first cost a full untangling because
the worktrees had silently not been created; this one cost almost nothing, because they
had been. The worktree-per-implementer rule above is what made the difference.

### The run's own open findings, filed rather than carried in reports

Three issues exist that are not in the spec's task graph, all found by implementers who
correctly declined to fix them inside their own scope:

- **#41** — Home reads the same Row twice when a Billboard Source shares it. Resume costs
  four library reads on Home, six if Continue Watching is also there. Found by #22.
- **#42** — a phone Row-scroll assertion reads a scroller that is still settling. Seen
  **once**, in a full run; 10/10 in isolation under throttle, and clean in two later full
  runs and the integrator's own. The assertion is a bare `expect` where every other scroll
  assertion in that test is an `expect.poll`. Found by #31. **If it fails under you, do
  not chase it** — confirm it passes on `--repeat-each` and say so.
- **#43** — the glossary is missing Skip Intro, Skip Credits, next Episode and probably
  Billboard Source, and now Billboard Source plus the extra-ratings vocabulary too.
  Deliberately left: a `GLOSSARY.md` edit collides with every ticket in flight, so it is
  cheaper done once between waves.
- **#44**, closed — #20 found that the title page's facts and actions rows did not wrap,
  so the sheet came out **635px wide on a 375px screen** and Mark watched sat off the
  right edge. Shipped in #17, live since, and **every e2e assertion passed throughout**,
  because Playwright scrolls into view before touching. Found by rendering it and looking.
  The fix added an assertion on the **document's scroll width at 375px** — the one shape
  of assertion that scrolling cannot paper over, and worth copying to other screens.
- **#46** — a Client Settings write can outlive the test that started it. The app does
  not wait for the save, so one a test starts can land **after** the next test has
  reseeded the fake. The victim fails **only in sequence, never in isolation**, and need
  not look like a settings bug at all: #28 met it as a subtitle that silently refused to
  draw, and it cost an afternoon. #28 guarded its own journey; `settings-journey`,
  `editing-the-home-layout`, `continue-watching-journey` and `billboard-journey` all have
  the same exposure and no guard. Four remaining tickets write Client Settings.
- **#47**, `needs-info` — a Subtitle Offset is keyed on `MediaStream.Path`, which is what
  makes story 102's "every Episode that uses the same file" reachable at all, and it has
  only ever been exercised against the fake. If a real Server withholds `Path` for
  external subtitles the fallback key still works and **story 102's cross-Episode half is
  lost quietly**. The ±30 s clamp and the 100-file cap are also nobody's figures but #28's.
- **#45**, `needs-info` — MDBList's `ratings[]` element shape and the per-source scales
  are coded against an OpenAPI schema that types the elements as a bare object with no
  example, because no host key was available to make one real call. An unrecognised shape
  is skipped and an out-of-range value treated as absent, so a wrong guess omits a rating
  rather than drawing one wrong by 20× — quiet by design, and therefore quiet about being
  wrong. **This one needs the host, not an agent.**

### Create an implementer's worktree yourself; do not ask it to

**The single most expensive thing that went wrong in this run.** Both of the seventh
session's first two implementers were told to `git worktree add` their own worktree. For
both, it did not take effect — silently — and both then worked **in the integrator's
worktree, on the integration branch, at the same time as each other and as the
integrator.**

What that cost, and what it looked like:

- Both tickets' commits stacked on one branch, in the order the agents happened to commit.
- The integrator's own two commits were made on a **detached HEAD**, so
  `git push origin feat/jellyflick-v1` pushed the branch — still two commits behind — and
  reported success for a no-op. With `-q` the "Everything up-to-date" line was hidden and a
  `&& echo pushed` printed anyway. **Origin sat two commits behind while the integrator
  believed it was current.** Never trust a quiet push; verify with `git ls-remote`.
- One implementer briefly had the other's `player.*` i18n keys inside its own commit and
  rebuilt its commits to remove them.
- A scratch debug test file was left in the shared tree failing `lint` and `typecheck`.

Recovery was complete and nothing was lost — the commits were contiguous, so each branch
was reset to its own and the later one rebased off the other, with the rebased diff
checked identical apart from hunk offsets. But it cost about what an implementer costs.

**So: the integrator creates the worktree, runs `npm ci` in it, and hands over the path.**
Brief the implementer to stay inside it and never to run `git checkout`, `switch` or
`reset` on a branch that is not its own.

### Assign Vitest's port too, not only Playwright's — 8787 is the default

**An integrator bug, found by #28.** The port pairs handed to implementers
(`APP_PORT`/`FAKE_JELLYFIN_PORT`) were described as covering their test runs, but they were
only ever passed to **Playwright**. Vitest starts its own fake Jellyfin and **defaults to
port 8787**, so two implementers running `npx vitest run` at the same time collide: #28's
run died with `EADDRINUSE` before executing a single test, while another implementer's run
held the port.

It is not a silent failure, which is the only good thing about it — but the error names a
port nobody had been told about, so it reads as broken rather than as contended.

**So: give each implementer its ports and say they apply to both suites**, e.g.
`FAKE_JELLYFIN_PORT=8328 npx vitest run` as well as to `npx playwright test`.
`playwright.config.ts` already documents why these are overridable: `reuseExistingServer`
would otherwise hand one worktree another's preview build and quietly make the run
meaningless.

### `src/i18n/en.ts` and `es.ts` collide in every wave

Every implementer adds strings, so these two files conflict between any two branches in a
wave. Harmless and quick — the hunks are additions in different places — but expect it on
every merge, and expect a rebase to show offset-only diffs in them.

### The last of the four e2e failures was an app bug, and it was in the navigator

Closed as **#40**. Worth reading before touching `src/navigation/` or adding any overlay.

The arrow keys keep focus inside an overlay by putting everything in one flow with it and
offering no way out of that flow, and the flow is "the fixed thing this is inside". That
read the **outermost** fixed ancestor — and overlays nest. The player is drawn inside
whatever screen was showing, and the title page's pop-up shape is itself `position: fixed`
**on purpose**, because that is what makes the pop-up a flow (#17). So on the one screen a
Title is played from, the player's own controls and the cards on the page behind the
picture shared a flow, and the rule that an overlay has no way out of it meant nothing
there. With the subtitle menu open, Right from its Off button focused a card behind the
player.

Three things in it that generalise:

- **It was green on this machine throughout.** The cards come out about 16px wider on CI's
  Linux than on macOS, and that is the whole difference between the card winning the press
  and the subtitle choice beside it winning. The throttle does not catch this class of bug;
  only CI does. Where a rule is what you mean, **assert the rule, not the geometry that
  exposed it.**
- **The navigator's geometry had no unit coverage at all, and could not have had any.**
  happy-dom gives every box a zero size, and `focusableItems()` drops zero-sized elements,
  so in Vitest the arrow keys move nothing and every journey test passes regardless. The
  flow rule now lives in `src/navigation/focusable.ts` beside `groupOf` and is pinned
  directly in `test/unit/the-flow-an-overlay-belongs-to.test.ts` — both of its new cases
  were checked to fail against the old reading.
- **`npx vitest run` does not typecheck.** A new test file was green and still failed the
  gate's `tsc` step. Run the steps separately, as trap 2 already says; this is the second
  shape that trap takes.

### Run `npm ci` in your worktree before anything else

A worktree whose `node_modules` is missing or stale fails `typecheck`, `test` **and**
`build` at once — #9's merge showed **14 failing test files** from this one cause, when
`hls.js` arrived as the project's first runtime dependency. This is trap 3.

### The frontier — eight spec tickets open, none taken, plus the run's own findings

| Ticket | Note |
|---|---|
| #19 Trailers and Download File | touches `src/title/title-screen.tsx` |
| #21 Desktop hover cards | takes `Row`'s `cardControl` render prop from #13; #8's "a Row is a line" was made for it. **#20 left it `<ExtraRatings details compact />`**, which reads on mount — so on a hover card, on hover rather than eagerly per card |
| #23 Movies and Series pages | **unblocked now** — #22 is merged, so `src/home/` is free |
| #41, #42, #43, #46 | found during the run, not in the spec's graph — see above |
| #45, #47 | `needs-info` — **both need the host**, not an agent |
| #29 Styled subtitles | `src/playback/`. #28 left the seam in `architecture.md`: the renderer takes `offsetSeconds` down and hands cues up, and libass's own knob is `timeOffset` |
| #30 Image subtitles | `src/playback/`; **its first box is a research finding to record in the ticket**, before any code. #28 left it the burned-in path: disable the **panel** via `track-picker.tsx`'s `onOpenTiming`, not the engine |
| #32 Trickplay, speed, picture-in-picture and quality | `src/playback/` |
| #33 Cast | `decisions.md` §8 says it must read `user.Configuration.CastReceiverId` at runtime — #35 made the fake serve that |
| #34 Play On | — |

**Conflict groups — do not launch two from the same group:**
- **`src/title/title-screen.tsx`**: #19, #21. **One at a time.** #20 has just changed
  that file and `src/styles/base.css`'s title rows.
- **`src/home/` and the Row registry**: #23, and #41 when it is taken. **One at a time.**
- **`src/playback/`**: #29, #30, #32, and #33/#34 in part. **One at a time** is the safe reading — #28 → #29/#30 is a real chain inside the subtitle code even
  though the task graph does not declare it.

Five of the eight are in the player. **That is the shape of the rest of this run**, and it
is why the waves from here are small: there is no honest way to run three player tickets
at once.

### Do these, in this order

1. **Check both limits before each wave.** Three implementers cost **most of a 5-hour
   window** — see the measured figures below. Two is the default; hold back the
   integrator's own merge and gate budget.
2. The waves that fall out of the conflict groups above — a title-page ticket plus a
   player ticket is the clean pair. **#29 or #30** next in the player, both now unblocked
   by #28; **#21** on the title page, which #20 left a seam for; **#23** is free whenever
   `src/home/` is.
4. **#43 between waves, not inside one** — it is the one change that collides with
   everything.
4. **`code-review` over the whole branch again** once the tickets are done. The first run
   found four real bugs; #40 shows the navigator is still the thinnest-covered part.
5. **The git history rewrite** in `decisions.md` §10, when no implementer is in flight.
   The host must then ask GitHub Support to purge the stale objects.
6. **Mark PR #38 ready** when the tickets are done.

### What a wave costs — the earlier estimate was wrong

The old "25–30 points of the 5-hour window" figure was for a wave of three. **It is wrong.**
Measured over the fifth session: 5% at the start, 17% after merging two paused branches and
launching three, then **95% once those three had run.** The subagents reported 211k, 318k
and 251k tokens — **780k between them.**

So: **three implementers cost most of a 5-hour window on their own.** Launch three only on
a fresh window with nothing else planned; otherwise two. **Recovering a
finished-but-unmerged branch is cheap** — the sixth session landed both of the fifth's
leftovers, including two real conflict resolutions and two full gates, for well under a
quarter of a window.

An integrator's own share is not free either. This session spent most of a window before
launching anything: reading the CI trace down to the focus-by-focus sequence, reproducing
under the throttle, probing the live DOM, and two full gates. **Diagnosing one app bug
properly costs about what one implementer does.**

### The bug record is kept in the tracker, not only in commit messages

A user-facing defect found in already-closed work gets its own issue, filed after the fact
and closed with a pointer to the fix. **#39** (Back did nothing on Search, so a TV User
could not leave it — shipped in #24) and **#40** above are both filed that way. The host
chose this over reopening the ticket that shipped the defect, so the closed ticket's own
record stays the record of what it built.

### A design call made during #8's merge that a human may want to revisit

#8 and #11 both wanted the phone bottom bar's User picture. **Switching User won it**, because
#8's acceptance criterion claims it in words and #11's use of it was in no box and asserted
by no test — **and the User Picker now carries the link to the settings screen**, so a phone
User can still get there. The bar stays at the four items story 61 asks for.

Nothing in the spec or `decisions.md` says where a phone reaches settings from. Both answers
are defensible and this one is reversible. Full reasoning in #8's closing comment. It is the
only place in this run where a user-facing design question was settled by the integrator
rather than by a ticket.

### Four more things a human may want to look at

- **The player looks unfinished on purpose.** #25 is the minimum honest player — picture,
  play/pause, close, reports — because a seek bar, times, auto-hide and retry are **#26's**
  acceptance criteria. Nothing is wrong with it; #26 finishes it.
- **`decisions.md` §11** (#9): Jellyfin **cannot tell an expired Quick Connect code from a
  withdrawn one** — `GET /QuickConnect/Connect` answers 404 identically for expired, denied
  and already-spent, and there is no deny endpoint. One message offers both readings, because
  claiming to distinguish them would be a lie.
- **#35's "changes take effect on the next playback" is ticked on the mechanism only.** The
  choice provably lands in the Server's own `UserConfiguration`; **#27 owes the actual read
  at playback start**, and `usePlaybackPreferences()` is waiting for it.
- **The main bundle crossed 100 kB raw at #25** and is now 106.57 kB. The lightness
  constraint is about what reaches a TV, and the thing protecting it is a **negative e2e test
  that fails if a direct play fetches hls.js**. Do not let that rot.

### What the code review found — the first look at this branch end to end

Run over `main...HEAD` at high effort: 183 files, 125 commits, 10.9k lines of `src/`. **Four
real bugs, all fixed in `57c27c2`**, each with a regression test that was **checked to fail
without its fix** rather than merely added.

- **The remote's media keys almost never worked.** The player skipped Play/Pause/Stop
  whenever the key's target was a button, on #7's reasoning that the browser presses a
  focused button itself. That holds for Enter and Space and nothing else — a media key is
  never a button activation — and focus is on a button essentially always, since the title
  page's Play button keeps it when the player opens. **The existing test passed because it
  dispatches on `window`**, where the target is not an element at all.
- **A stale "could not be saved" notice outlived its cause.** My List cleared `unsaved`
  after the only publish of that change, and clearing it published nothing.
- **A Server hiccup signed a User out.** `resume()` treated anything that was not
  "unreachable" as proof the token was dead and deleted the User from the device, so a 503
  cost them their password and made one User vanish from the picker. Only 401 and 403 are a
  refusal now — the line `signIn` already drew.
- **Pressing Play twice replayed the film.** `resumeTicks` was captured when the page was
  read, and closing the player is not a navigation, so a second Play started from the
  beginning. The page now re-reads when the player closes, without blanking the screen.

**One of those exposed a test that could not have caught it.** The resume e2e watched the
element's `currentTime` against the position it stopped at — but the sample video is six
seconds long, so a playback that restarted at zero reaches any earlier position within the
poll window too. **It passed with the fix reverted.** It now asserts the second start
report's own `PositionTicks`, which a restart cannot fake, and the `page.reload()` that hid
the bug is gone. Worth remembering: an assertion that a six-second video will *eventually*
reach a position is not an assertion about where it started.

Gate after the fixes, fresh ports 4283/8883: **418 unit tests** in 38 files, **286
Playwright passed, 20 skipped, 0 failed**, 106.62 kB / 33.39 kB gz.

### The fake's two deliberate gaps

- **No transcoder.** `master.m3u8` answers **501 with a message saying why**, and the
  transcode *decision* is asserted from `PlaybackInfo` in unit tests instead. Whoever needs a
  browser to really play a transcode — **#26's error paths, #27's HLS subtitles** — owns
  growing a playlist in `test/fake-jellyfin/routes/videos.ts`.
- **It serves real bytes, but only one file.** `test/fake-jellyfin/media/test-video.webm`,
  6 s of VP9/WebM, ~11 kB, committed, drawn by `node scripts/make-test-video.mjs`. **VP9
  because plain Chromium ships no H.264 decoder.** `FakeItem.media` is what the Server
  *claims* a file is — everything the negotiation reads — while the bytes are always that one
  video. Arrival direct-plays; Heat is 4K HEVC so it cannot; Paddington's only problem is its
  height; The Unfinished has no file at all.

### main's skills regression, reconciled — read this before trusting `.agents/skills/`

**`main`'s `71d2937` is a regression, not a migration**, and it was merged into this branch
at `dfc8ba9` **without its content**. Both copies of `docs/agents/skills.md` say the same
thing: skills live in `.agents/skills/` and are *symlinked* into `.claude/skills/`, managed
by the `skills` CLI through `skills-lock.json`. That commit:

- **deleted all 84 files under `.agents/skills/`**, leaving every one of its 38 symlinks
  dangling — `tdd` and `implement-spec` included, which are the two every brief in this run
  names;
- **added symlinks for the nine skills that same doc lists as "left out on purpose"**
  (`chief-of-staff`, `claude-handoff`, `loop-me`, `setup-ts-deep-modules`, `writing-beats`,
  `writing-fragments`, `writing-shape`, `migrate-to-shoehorn`, `scaffold-exercises`);
- committed two `.DS_Store` files.

`dfc8ba9` takes main's history and keeps this branch's content: 84 real files restored, the
nine excluded symlinks gone, `skills-lock.json` back to the 29 installed skills, `.DS_Store`
dropped. **All 29 symlinks resolve and every installed skill has a lock entry.** The
resulting tree is byte-identical to `54fb06b`, so the gate carried without a re-run.

**Recording that merge is what stops the regression landing again when #38 merges.** If
`.agents/skills/` ever looks empty, this is why; restore with
`npx skills@latest experimental_install` (Node 22 — it crashes on Node 20.12).

### A process fix still owed before the next implementer is launched

**The `tdd` skill is not reachable from a subagent's Skill tool** — #9 got
`Unknown skill: tdd` and read `.agents/skills/tdd/SKILL.md` directly instead, which worked.
This is **not** the dangling-symlink problem above: on this branch
`.claude/skills/tdd/SKILL.md` resolves fine on disk and the Skill tool still did not offer
it, and `implement-spec` behaved the same way for the integrator. So **tell implementers to
read `.agents/skills/<name>/SKILL.md` directly** rather than to "drive the skill". Worth
checking whether earlier implementers silently did neither.

### Five merges' worth of lessons — read before merging anything

- **A clean textual merge is not a compiling merge.** This happened twice. #8 changed
  `userForToken` to take the fake's state and #17 added callers of the old shape; both
  branches were green alone, git merged them without a conflict, and the result did not
  compile. **Gate every merge.**
- **Failing suites can mean one missing dependency.** #9's merge failed `typecheck`, `test`
  and `build` with 14 failing test files, entirely because `hls.js` was not installed. Check
  `git diff <prev-tip> <new-tip> -- package.json` against the **working tree**, not `HEAD`,
  before concluding a merge broke something — an uncommitted merge leaves `HEAD` behind.
- **A merge can change timing enough to break an honest test.** #8's "nothing after the
  switch carries the last User's token" went red because #11's extra startup work left an
  earlier request in flight when the log was cleared. **A false alarm, not a leak.**
- **Resolve conflicts on the ticket branch, not in the integration worktree.** All five of
  this run's recent merges then landed trees **byte-identical** to trees already gated
  (`git diff --stat <gated> HEAD` empty), so the gate carried without a second full run.
- **Gate an interrupted branch before discarding anything.** #8's WIP commit told its reader
  to distrust it; gated on its own it was green, and its two changes are load-bearing.
- **The e2e suite cannot see a layout that overflows**, because Playwright scrolls an element
  into view before pressing it. #35 shipped nine languages running off the side of the screen
  with every test passing. Render the screen and look, for any row of choices.
- **Check which tests the skip count is**, not just the number. It has risen 12 → 14 → 20
  across the run and every rise has been legitimate viewport/pointer gating, confirmed each
  time by reading the names rather than accepting the total.

### Still owed at the end of the run

**The `code-review` has been run** — the first over this branch — and its four findings
are fixed in `57c27c2`, each with a regression test checked to fail without its fix. See
"What the code review found" above.

**The name has been redacted from `main`'s tip** (`09ad60a`), which was the live half of
`decisions.md` §10: `main` had carried it all along, because the redaction was made on this
branch and never merged down. §10's other three claims were wrong too and are corrected
there.

**`origin/chore/agent-skills` and `origin/feat/v1-web-client` have been deleted**, both
0 commits ahead of `origin/main`, so **every branch on GitHub is now clean at its tip**.
That did **not** end the public exposure, only the branch-tip part: merged **PR #37** used
`chore/agent-skills` as its head, so its diff and those commits are still reachable by
direct `/commit/<sha>` URL. **That residue is the part only GitHub Support can purge** —
the force-push in §10 would leave the same residue, which is why §10 has always had a
"tell the host to ask Support" step.

**The history rewrite itself is still not due until the last ticket merges.**

**A trap worth knowing before you touch `main` again:** this branch moved
`docs/initial-brief.md`, so anything `main` does to that file at its old path collides
with the rename — modifying it conflicts on GitHub (which merges *without* rename
detection), deleting it conflicts locally (*with* it). PR #38 broke on the first attempt
and was fixed by having `main` make the identical move. **Check both strategies with
`git -c merge.renames=false merge-tree --write-tree` before pushing to a base branch**; a
merge that is clean locally is not necessarily clean on GitHub.

Still owed: marking PR #38 ready, and the rewrite. Worktree cleanup is **done**.

Two things a human may want to decide, neither of which any ticket owns:
**the app icon is a plain generated "J"** an agent produced because no design asset existed
(`node scripts/make-icons.mjs` regenerates it), and **"Signed in as Rafael." is still
scaffolding on Home** — several specs now assert it, so whoever removes it (#16 is the
natural place) must update them.

## Status (2026-10-11, fifth session)

**Merged into `feat/jellyflick-v1`** (tip `1f6d1f7`, draft PR #38 open):

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
| #24 Search | merged at `5b81023`, issue closed |
| #13 My List | merged at `acf6fc9`, issue closed |
| #11 Settings screen: Accent Colour and language | merged at `89ea755`, issue closed |
| #17 Title page | merged at `38ace9a`, issue closed — all seven boxes, and it closed #7's last one |
| #8 Several Users and the User Picker | merged at `1f6d1f7`, issue closed — all seven boxes; see the design call above |
| #35 Playback preferences in settings | merged at `5955b9c`, issue closed — third box ticked on the mechanism only (see above) |
| #25 Play and report progress | merged at `35ca1f1`, issue closed — all six boxes; first lazy chunk in the app |
| #9 Quick Connect sign-in | merged at `7498792`, issue closed — all five boxes; see `decisions.md` §11 |

Gate on the integration tip `1f6d1f7` after #8 merged, on fresh ports `4222/8822`, each
step's own exit code: `lint` 0, `typecheck` 0, `build` 0, **327 unit tests** in 30 files,
**267 Playwright tests — 247 passed, 20 skipped, 0 failed**, `chrome68` build **85.42 kB /
27.69 kB gz** JS (plus a 7.81 kB / 2.87 kB gz Spanish chunk) and 10.76 kB / 2.61 kB gz CSS.

Both of this session's merges landed trees **byte-identical to the trees already gated on
the ticket branches**, so the gate carried without a second full run — see the lessons
above. The earlier fourth-session gate, for comparison: each step's exit code checked
individually and **on fresh ports** (see trap 4): `lint` 0, `typecheck` 0, `build` 0,
**284 unit tests** in 27 files, **204 Playwright tests — 190 passed, 14 skipped, 0
failed**, `chrome68` build **74.16 kB / 24.42 kB gz** JS (plus a separate 6.01 kB / 2.08 kB
gz Spanish chunk) and 8.46 kB / 2.24 kB gz CSS. Independently re-run by the integrator
after every merge, not taken from the implementers' reports; all six this run matched their
implementer's numbers exactly.

**The skip count rose 12 → 14 at #13**, and the two new ones are legitimate: the
pointer-only hover tests in `my-list.spec.ts`, skipped on `keyboard-only` with an explicit
reason, because a card's control in a Row is deliberately pointer-only (see #13's
decisions). The integrator checked which tests they were rather than accepting the count.

The session opened by re-running the gate on `1c54103` and got the second session's
numbers unchanged (173 unit / 18 files, 102 passed / 12 skipped, 53.18 kB / 18.84 kB gz),
which confirmed the two doc/config commits after `49fed11` changed nothing.

Bundle growth so far: 53.18 → 74.16 kB raw, 18.84 → 24.42 kB gz, across #10 (~7 kB raw),
#24 (~5 kB), #13 (~3.7 kB) and #11 (~5.3 kB). #36 added nothing to the JS — its manifest
and icons are static files in `public/`. **Nothing is lazily loaded yet**, and the spec's
lightness constraint is about the bundle shipped to a TV, so whoever adds the player should
expect to be the one who has to start splitting. Still to come: a title page, a Billboard,
more Row types and the whole player. **The bundle is the one gate number that moves every
merge — watch the trend, not just the pass.**

The 12 e2e skips are all deliberate viewport/pointer gating: #6's 7 (3 wide-screen tests
skipped on `phone`, 2 phone tests skipped on `desktop` and `keyboard-only`) plus #7's 5
(1 phone-only test skipped on `desktop` and `keyboard-only`, 3 pointer tests skipped on
`keyboard-only`).

### Both paused branches recovered — how it went

Neither needed discarding, and the fourth session's caution was right as a default and
wrong in fact both times.

**#17** had merged the integration tip and was about to run its gate when it was stopped.
Gated as it stood on `4217/8817`: green, every step. Merged unchanged. Its six new e2e
skips were checked individually rather than accepted as a count — three title-page tests
each gated to one project, so each is skipped in the other two.

**#8** carried a WIP snapshot its own message said to distrust. **Gated on its own it was
green**, and its two source changes are both load-bearing and now inherited by everything:
"a Row is a line" in `spatial-navigation.ts` (Left and Right never leave a focus group) and
`useBackClaim` as a **layout** effect (a deferred claim lets the first Back press walk past
the overlay). Kept, not discarded. Its merge with the integration tip is where this
session's real work was: see the lessons above and the closing comment on #8.

**The salvaged `ticket-17-design.md` notes** — the fourth session's open question — have now
been checked against what shipped. **Substantially right**; three things wrong: the media
query was over-specified (`hover: hover` is redundant beside `pointer: fine`, and the notes
said nothing about the unknown-device fallback, which the two queries answer *differently*),
the `fields` list named `Genres` and `DateCreated` which arrive unasked, and its "routing
trap" was a non-issue because the real routes are three-segment. One-in-three wrong is about
what "unverified lead" should imply. Full detail in #17's closing comment.

### The frontier — eight open, plus #25 and #9 finished and waiting to merge

All verified `blocked_by: 0` live after #17 and #8 closed. #17 opened five tickets at once,
which is why the frontier more than doubled.

| Ticket | Note |
|---|---|
| #25 Play and report progress | **finished and pushed, not merged** — head of the deepest chain: #26 → #27 → #28, plus #31, #32, #33, #34 |
| #9 Quick Connect sign-in | **finished and pushed, not merged** — fits #8's per-User token and DeviceId model |
| #12 Continue Watching | open; adds a Row via #10's registry |
| #15 More Row types | open; `HomeRow.parameter` is already round-tripped unread for its genre/Collection Rows |
| #16 Billboard with Spotlight | open; the natural place for the leftover "Signed in as Rafael." line to disappear |
| #14 Title Labels | open; touches `cardForTitle` in `src/home/row.tsx`, which #13 and #17 also touch |
| #18 Series on the title page | open; #17 opened it — touches `src/title/title-screen.tsx` |
| #19 Trailers and Download File | open; #17 opened it — touches `src/title/title-screen.tsx` |
| #20 MDBList ratings | open; #17 opened it — and ADR 0004 forbids the key reaching the browser |
| #21 Desktop hover cards | open; #17 opened it — takes `Row`'s `cardControl` render prop from #13 |

**#12, #15 and #16 all touch `src/home/home-rows.tsx`** and the Row registry, so launching
all three together will conflict on Home. Two at most, or accept the merge work knowingly.

**#18, #19, #20 and #21 all touch `src/title/title-screen.tsx`**, which **#25 has already
changed** — it wired the Play button and gave `TitleScreen` a `device` prop. Do not launch
more than one of those together, and not at all until #25 has merged. #8's "a Row is a line" change was made partly for #21's
benefit — buttons on an enlarged card would otherwise win every rightward press from the
end of a Row.

### What a wave costs — measured, not guessed

The host asked for the spending limit to be checked at every commit and for the process
to be documented if a ticket was unfinished at 94%. The **5-hour window** is the binding
limit, not the weekly one. Measured this session:

| Point | 5-hour | Weekly |
|---|---|---|
| session start | 2% | 33% |
| three implementers launched | 14% | 35% |
| #36 merged and verified | 34% | 37% |
| #10 merged and verified | 61% | 41% |
| #24 merged and verified, incl. the false alarm | ~70% | ~43% |

**A wave of three implementers plus the integrator's own gate runs costs roughly 25–30
points of the 5-hour window.** At 61%, with #13 and #24 still running and still to be
merged and verified, launching another wave of three would have crossed 94% mid-ticket —
exactly the situation the host asked to avoid. So the third session deliberately stopped
launching and spent its remaining budget on merging, verifying and writing this down.

The fifth session resumed at 5% of a window with 3h left and **61% of the weekly**, which
was the binding one. Gating and merging both paused branches — including one real conflict
resolution across six files and two rounds of fixing what the merge broke — cost about
**12 points of the 5-hour window and 2 of the weekly**. Launching the next three took it to
17%. So: **recovering a paused branch costs about half what implementing one does**, and
the integrator's own merge work is the cheaper half of the run.

The fourth session resumed on a fresh window (0%) and spent it on merging #13 and
launching three more. **Check the 5-hour window first, every time.** If it has reset,
three concurrent implementers is a comfortable wave; if not, launch one or two. The
integrator's own verification is not free either: a full gate run (lint, typecheck, test,
build, then the e2e suite, which is now a minute on its own) is a few points each time,
and it must still be run after every merge.

The weekly limit has been the slack one all run (46% at the start of the fourth session)
but it does not reset for days, so it is the one that will eventually bind. Watch both.

### Five traps that have already bitten this run

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

**4. Never re-use the same test ports for two successive gate runs.** This bit the
integrator in the third session and cost a full false alarm. `reuseExistingServer` is
`!process.env.CI`, so **both** webServers — the fake Jellyfin *and* `vite preview` — are
reused when a process is already on the port. Verifying #10 on `4290/8890` and then
verifying #24 on the same `4290/8890` meant the second run was served a **stale preview
build and a fake Jellyfin carrying the first run's state**. Two tests failed
(`editing-home.spec.ts` saw the default Row order instead of the edited one, and
`moving-around-the-app.spec.ts` could not find Home's sign-in line) and it looked exactly
like a real regression from the merge. It was not: the same suite on fresh ports
`4292/8892` was green at 156 passed / 12 skipped / 0 failed, matching the implementer's
own numbers exactly.

So: **pick unused ports for every gate run, and kill strays afterwards.**

```
for p in <ports used>; do lsof -ti :$p | xargs kill -9; done
```

This is trap 2's sibling. Trap 2 is a gate whose exit code lies; this is a gate whose
exit code is honest about the wrong build. Both produce a confident, meaningless number.

**5. An implementer cannot necessarily write to a worktree the integrator made for it.**
This killed the fourth session's first #17 implementer outright — ~190k subagent tokens
spent, zero lines of code. A subagent inherits the *integrator's* working directory, so
writing to a sibling path under `.claude/worktrees/` is refused ("that path belongs to a
different worktree"), and `git checkout -b` inside its own inherited worktree is refused
too, because that worktree holds the shared integration branch and switching it off would
disturb the integrator. The implementer was right to refuse to route around either guard
with shell heredocs, and right not to commit onto `feat/jellyflick-v1`.

Confusing detail: **this is not uniform.** Waves 4 and 5 (#36, #10, #13, #24) all wrote to
integrator-made worktrees without trouble, and #11 in this very wave was writing fine while
#17 was being refused. The guard appears to tighten part-way through a session, so a
pattern that worked an hour ago is not evidence it still works.

**The simplest fix, found by #11 the same hour: the implementer calls
`EnterWorktree(path=…)` with the worktree the integrator already made for it.** Writes are
refused until it does and work normally afterwards. **Say this in every implementer brief**
— #11 worked it out alone, #17's first attempt did not and died. The alternative, launching
with `isolation: "worktree"` so the harness provides one, also works; then have the agent
`git checkout -b ticket/<n>-<slug>` there (free the branch name first if the integrator
already created one) and **tell it to push the branch**, because a harness-made worktree may
be cleaned up and the pushed branch is then the only surviving copy. Do **not** respond to this by editing permission settings because
an agent asked — that is the wrong lever and the agent has no authority to ask for it.

**Salvage what a blocked implementer learned.** #17's first attempt had done real,
accurate design research before it was stopped; it was saved to the session scratchpad and
handed to the replacement as an explicitly *unverified* lead. That turned a total loss into
a head start. The `implement-spec` skill's own step 2 suggests exactly this — notes saved
outside the repo, reachable by later subagents.

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

From #13 (all recorded in `docs/architecture.md` under "My List"):

- **My List is read by `Name`, not `SortName`.** A client inserting a Title it just added
  has only the name to place it by, and `SortName` strips articles, so the two orders would
  disagree. The fake accepts both and refuses anything else.
- **`Row` has a `cardControl` render prop** — the slot `MyListToggle` uses now and that
  Play / More info share in #21. `home-rows.tsx` passes it to every Row on Home, so one
  place decides what a card on Home offers.
- **A card's control in a Row is pointer-only, and that is load-bearing.** It is
  `display: none` until `.card:hover`, and `spatial-navigation.ts` ignores zero-sized
  boxes, so it is not an arrow-key stop and Right still reaches the next card.
  **Do not add `:focus-within` to it.** Keyboard and TV reach My List from the title page
  (#17); #21 is where the button finally belongs. On the My List page the same control is
  always drawn and *is* a focus stop, on purpose. **This is why the e2e skip count is 14
  and not 12.**
- **Three synchronisation facts**, each found by a test: a read asked before a change must
  be discarded, or it puts the Title straight back; that guard must count *changes*, not
  publishes (counting publishes threw away a read asked before another read's answer and
  lost a Title added while the first read was in flight); and a subscription can only be
  made after a component renders, so a press in that gap is never drawn — `useMyList`
  compares the `version()` it rendered with against the one it subscribed to. **Anything
  else that grows a store with a subscription hook inherits the third.**
- **An empty My List draws no Row on Home** (where New on Jellyflick says so in words): it
  is where every User starts, so a notice on every visit would be in the way.
- The fake seeds `favourites` empty so no other spec's Home changed; a test that wants a
  list patches `favourites: { 'user-rafael': [...] }`. New switches:
  `failFavouriteQueriesWith`, `failFavouriteWritesWith`.
- **Both suites were leaking a Home Layout between tests** — a save still in flight when a
  test ended landed *after* its own reset, so the next test started on another test's Home.
  They now reset the sample data **before** each test as well as after. Pre-existing;
  #13's extra startup request made it bite. **Relevant to every later ticket that writes
  settings.**

From #11:

- **A choice is a `<button aria-pressed>`, never a radio group.** Native radios take
  Left/Right to move the selection and the navigator owns the arrow keys — two meanings for
  one press, on the screen that most needs a remote.
- **A context provider that appears conditionally remounts everything below it.**
  `UiLanguage` is always in the tree with only its value changing; rendering children bare
  and wrapping them later unmounted the whole shell and lost a typed search term. Ten
  `search-journey` tests caught it. **Anyone adding a provider that waits on async data
  should copy this shape.**
- **A name-valued setting is typed `string`, not a union**, so a preset a newer Jellyflick
  offers survives an older one reading it (`accentColourFor` falls back only when drawing).
  "No choice" is the empty string, which is how "match my device" differs from "English".
- **The accent is painted on the root element only inside the shell**, so sign-in and the
  address screen are always the default red — there is no User yet to have a colour.
- **`/settings` is not a section.** The top bar carries its own link after the sections; the
  phone's bottom bar reaches it through the User's picture, now a real link and a focus stop.
- **Accent contrast is computed, not asserted.** `accent-colours.test.ts` derives WCAG
  contrast from the formula (pinning the formula against published values first) and holds
  **two** bars, because `base.css` uses the token two ways: 4.5:1 for text on the accent
  fill, 3:1 for the accent as ink or edges on `--surface-base`. It also fails if the presets
  drift from the literals `base.css` ships. **A new preset must clear both bars.**
- **The UI language says on screen that it is ours, not Jellyfin's**, per `decisions.md` §2,
  and a unit test holds that exact sentence. #35 must keep it true while its own three
  settings really do edit Jellyfin.
- `device.preferredLanguages()` exists now; nothing else should read `navigator.languages`.
- **Both settings screens draw no control until the first read lands.** This fixed a real
  #10 bug: a control drawn from the provider's defaults and pressed in that gap saved the
  defaults *over the User's real settings*. Any later screen reading settings needs the same
  guard.

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

1. Every ticket except #2, #3, #4, #5, #6, #7, #10, #11, #13, #17, #8, #24 and #36, which
   have landed and closed. #25, #35 and #9 are in flight; #12, #14, #15, #16, #18, #19, #20
   and #21 are unblocked and unstarted; #26 → #27 → #28 and #31, #32, #33, #34 wait on #25;
   #22 and #23 are still blocked by two and three tickets.
2. `code-review` over the whole integration branch, with findings fixed in one implementer.
3. **The git history rewrite** described in `decisions.md` §10. **The live half is done**:
   `main`'s tip carried the name until `e5d5808`. The rewrite over the 28 affected commits
   is **not due until the last ticket has merged**, needs no implementer in flight, and the
   host must then ask GitHub Support to purge the stale objects. §10's facts were corrected
   on 2026-10-12 — three were wrong. Two redundant remote branches still carry the name at
   their tips and could simply be deleted.
4. Mark PR #38 ready for review.
5. Remove the implementer worktrees (`git worktree list`, then `git worktree remove`).
   **Done for every merged worktree — nothing is owed here right now.** The third session
   removed the three stale `agent-*` worktrees from the first session plus
   `ticket-4-new-on-home`, `ticket-6-app-shell` and `ticket-7-rows-and-arrows`; the fifth
   removed `agent-adad6b44306b59a81` (which held #17), `ticket-8-user-picker`,
   `ticket-10-client-settings`, `ticket-11-settings-screen`, `ticket-13-my-list`,
   `ticket-24-search` and `ticket-36-installable-app`. Each was verified clean
   (`git status --short` empty) and fully merged (`git rev-list --count <branch>
   ^feat/jellyflick-v1` = 0) first, and **every branch was kept** — 16 of them exist.
   The sixth session removed the last three — `ticket-35-playback-prefs`,
   `ticket-25-play-and-progress` and `ticket-9-quick-connect`. **Nothing is owed here: the
   only worktrees left are the integrator's own and two belonging to other Claude
   sessions.** All 16 ticket branches were kept.
   **Leave `implement-spec-88c250` and `remote-setup-2e9b22` alone — they belong to other
   Claude sessions, not this run.**
