# Resuming the spec #1 build

State of the `/implement-spec` run on the integration branch `feat/jellyflick-v1`
(draft PR #38). Update this whenever a wave lands, so a fresh session can pick the work
up without re-deriving anything.

## START HERE — seventh session, two implementers in flight

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

**In flight — do not touch these areas:** `ticket/31-skip-intro-and-next-episode`
(`src/playback/`, ports 4331/8331) and `ticket/22-remaining-billboard-sources`
(`src/home/` and the Row registry, ports 4322/8322).

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

### The frontier — twelve open, ten untaken

| Ticket | Note |
|---|---|
| #19 Trailers and Download File | touches `src/title/title-screen.tsx` |
| #20 MDBList ratings | touches `src/title/title-screen.tsx`; **ADR 0004 forbids the key reaching the browser**. Its compact-for-cards half is what #21 wants |
| #21 Desktop hover cards | takes `Row`'s `cardControl` render prop from #13; #8's "a Row is a line" was made for it. **Wants #20's compact ratings** — not a declared blocker, but real |
| #22 Remaining Billboard Sources | **in flight.** Every source it adds must route Play through `resolvePlayTarget` |
| #23 Movies and Series pages | **wants #22 merged first**: both compose Home, and #22 is in that file now |
| #28 Subtitle Offset | `src/playback/`, and the one the spec's problem statement names by hand |
| #29 Styled subtitles | `src/playback/`; #28's offset has to keep working through it |
| #30 Image subtitles | `src/playback/`; **its first box is a research finding to record in the ticket**, before any code |
| #31 Skip Intro/Credits and next Episode | **in flight** |
| #32 Trickplay, speed, picture-in-picture and quality | `src/playback/` |
| #33 Cast | `decisions.md` §8 says it must read `user.Configuration.CastReceiverId` at runtime — #35 made the fake serve that |
| #34 Play On | — |

**Conflict groups — do not launch two from the same group:**
- **`src/title/title-screen.tsx`**: #19, #20, #21. **One at a time.**
- **`src/home/` and the Row registry**: #22, #23. **One at a time**, and #22 is in it now.
- **`src/playback/`**: #28, #29, #30, #31, #32, and #33/#34 in part. **One at a time** is
  the safe reading — #28 → #29/#30 is a real chain inside the subtitle code even though
  the task graph does not declare it.

Six of the twelve are in the player. **That is the shape of the rest of this run**, and it
is why the waves from here are small: there is no honest way to run three player tickets
at once.

### Do these, in this order

1. **Check both limits before each wave.** Three implementers cost **most of a 5-hour
   window** — see the measured figures below. Two is the default; hold back the
   integrator's own merge and gate budget.
2. Merge **#31** and **#22** as they report, gating each merge.
3. Then, in order, the waves that fall out of the conflict groups above — a title-page
   ticket plus a player ticket is the clean pair. **#20 before #21**, and **#23 after
   #22**.
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
