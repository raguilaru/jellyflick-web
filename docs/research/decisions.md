# Decisions and spec corrections made during implementation

Read this alongside the research notes. Where this file and spec #1 disagree,
**this file wins** — the spec was written before these facts were established.

## 1. MDBList is proxied by the container, not called from the browser

Decided with the host. Recorded as `docs/adr/0004-mdblist-proxied-by-the-container.md`.

- The container serves the static app **and** proxies MDBList, holding
  `MDBLIST_API_KEY` server-side with a per-Title response cache.
- The browser-visible runtime config exposes **only** the preset Server address.
  It must not contain the MDBList key.
- The spec's "Known limitation" that any signed-in User can see the MDBList key
  **no longer applies** — do not surface it in the UI or the setup guide.
- Affects #2 (runtime config), #5 (the container is a small service with one proxy
  route, not a plain static file server) and #20 (the client calls our own
  `/api/ratings`-style route, never `api.mdblist.com`).
- Reason: MDBList takes the key as a `?apikey=` query parameter and the free tier
  allows 1,000 requests/day **per account**, shared across the whole household.

## 2. Jellyfin 12.x has no per-user UI language

Established negatively from the 12.2.0 OpenAPI spec (`UserConfiguration`, `UserDto`,
and a full `*Language*` grep). The only UI language is server-wide
`ServerConfiguration.UICulture`.

- Story 113's language preference lives in `DisplayPreferences.CustomPrefs`
  (the Client Settings store), with the browser language as the default.
- Story 114 says the settings screen "edits my Jellyfin settings". That holds for
  audio language, subtitle language and next-episode autoplay, which really are
  `UserConfiguration` fields. It **cannot** hold for the UI language — that one is
  ours alone. Affects #11 and #35; the settings screen must not imply otherwise.

## 3. DisplayPreferences reserves more keys than the spec says

The spec warns only about `homesection`. On POST the server also consumes every
`landing-*` key and six literals: `chromecastVersion`, `skipForwardLength`,
`skipBackLength`, `enableNextVideoInfoOverlay`, `tvhome`, `dashboardTheme`.
A non-numeric suffix after `homesection` makes the server throw.

**Prefix every Client Settings key `jf.`** and always read-modify-write the whole
`CustomPrefs` set. `client` is a required query parameter on both GET and POST.
Affects #10 and everything that stores a setting.

## 4. `@jellyfin/sdk` version for 12.x types

No published SDK targets 12.x. Use **`@jellyfin/sdk@1.0.0`** types: its `API_VERSION`
says 13.0.0, but the 12.2.0 and 13.0.0 specs have identical path sets and differ in
only three schemas (two admin-only renames, plus `SeriesInfo`), none of which this
project touches. Do **not** use the SDK's `MINIMUM_VERSION` (10.10.0) for the >=12
gate — check `/System/Info/Public` yourself.

ADR 0001 claims 12.0 "is the version the official SDK 1.0 targets", which is not
quite right. Leave the ADR alone unless a ticket gives a reason to touch it; the
constraint it records (12.0+, no legacy endpoints) is unaffected.

## 5. Credits markers are `MediaSegmentType.Outro`

There is no `Credits` value. The full enum is
`Unknown, Commercial, Preview, Recap, Outro, Intro`. Affects #31: the "Skip Credits"
button is driven by `Outro`.

## 6. Build and platform decisions (binding on every ticket)

From `toolchain.md` / `player-subtitles.md`, which verified these by building and
running code rather than reading docs. Treat them as settled:

- **Pin TypeScript 5.x explicitly.** TS 7 is the current major but the surrounding
  tooling is young; lightness here means predictability. Do not let the version float.
  Revisit as a deliberate migration later.
- **Ban top-level `await`.** Oxc leaves it in the output and the build only *warns*.
  It ships broken code on the target.
- **Never build production with `minify: false`.** CSS downleveling is done by the CSS
  minifier; with it off, modern CSS ships raw to Chromium 68.
- `build.target: 'chrome68'` is enough — **no `@vitejs/plugin-legacy`**.
- **No `resize-observer-polyfill`, no `intersection-observer`, no `AbortController`
  polyfill.** All three are native on the target. Hand-roll the six polyfills that are
  genuinely needed (0.8 KB gz, versus 7.8 KB for the core-js equivalent).
- Flex `gap` needs a fallback; **grid `gap` does not**. Also needing manual fallbacks:
  `aspect-ratio`, `:focus-visible`, `scroll-snap-*`, `:has()`, `inset`, `backdrop-filter`.
- Router: **`preact-iso`**, imported as `preact-iso/router`, not the barrel.
- i18n: **hand-rolled typed dictionary**. `preact-i18n` is disqualified (peer `preact: <10`).
- Font: **Bebas Neue**, SIL OFL 1.1, self-hosted — one weight only. Oswald if more are needed.

## 7. The fake Jellyfin is a plain Node `http` server, not MSW

A `GET /__fake/writes` control endpoint gives Vitest and Playwright one shared
mechanism for asserting on writes, and MSW's browser mode would register a service
worker that clashes with the PWA service worker from #36. Established in #2 and grown
by every later ticket.

## 8. Player and subtitle capability facts

- **Picture-in-picture is Chrome 69 — not available on the Chromium 68 floor.**
  Feature-detect and hide the control (#32). Story 92 already says "where my browser
  supports it".
- **JASSUB cannot run on Chromium 68** (needs OffscreenCanvas 69 +
  `requestVideoFrameCallback` 83). The only ASS renderer that works on the TV target is
  `libass-wasm`, last published 2022. Put both behind the device layer's renderer seam:
  JASSUB on web, libass-wasm on TV, plain-text flattening where neither works (#29).
- **PGS: use `libpgs` (MIT, 68 KB, built-in `timeOffset`)**, pinned exactly.
  **VobSub has no usable client-side renderer — the Server burns it in** and the offset
  is disabled with an explanation (#30).
- SRT/VTT: attach a native `<track>` in `mode='hidden'` to borrow the platform's VTT
  parser, then pick active cues yourself in a `requestAnimationFrame` loop against a
  shifted clock. `cuechange` cannot carry a live offset. **`cue.text` is an XSS vector
  — never assign it as HTML.**
- hls.js 1.7.3 **full build, not `light`** (light drops alternate audio and subtitles).
  Call **`Hls.isSupported()` before `canPlayType()`** — `canPlayType` returns a truthy
  `"maybe"` in Chrome.
- Cast: read **`user.Configuration.CastReceiverId`** at runtime rather than hardcoding
  (`F007D354` Stable / `6F511C87` Unstable are the Jellyfin ids). Cast availability
  cannot be detected without loading the SDK.
- AirPlay: prefer the standard Remote Playback API (`video.remote.watchAvailability()`),
  with `webkitShowPlaybackTargetPicker()` as the fallback.
- **A service worker is not required for installability** (#36) — the manifest alone is
  enough. Hand-write `public/sw.js` only if a custom install button needs
  `beforeinstallprompt`. No Vite PWA plugin.

## 9. The container is a small Node server, not a static file server

Follows from ADR 0004: the container must proxy MDBList and cache per Title, which a
plain file server cannot do. Caddy was the best pure-static option but has no built-in
HTTP cache, and a cache plugin means a custom Caddy build.

**Decision: one dependency-free Node server on `node:22-alpine`** that does three
things — serve the built assets, fall back to `index.html` with a **200** for SPA
routes, and expose one ratings route that injects `MDBLIST_API_KEY` server-side and
caches responses per Title in memory with a long TTL. The lightness constraint in the
spec is about the client bundle shipped to a TV, not the server image. Owned by #5.

- Runtime config: the entrypoint writes `/srv/config.js` assigning
  `window.__JELLYFLICK_CONFIG__`, loaded by a blocking classic `<script>` before the
  module script. **Build it with `jq -n`** — shell interpolation is an injection bug.
  It carries the preset Server address **only** (ADR 0004).
- `read_only: true` in the compose file conflicts with the entrypoint writing
  `config.js`; resolve with a tmpfs when the Dockerfile is written.
- CI: add a **separate `release.yml`**. The existing `ci.yml` handles lint/typecheck/test
  and must be left alone. `permissions: {contents: read, packages: write}` and
  `LABEL org.opencontainers.image.source` are both required for GHCR push.
- **The image stays private.** Making the repository or image public is explicitly Out
  of Scope in the spec, so the host signs in with a classic PAT carrying `read:packages`
  (fine-grained PATs do not work with GHCR).
- **OMV8's Compose plugin has a registry login UI** (Repos tab → Login/Logout). This
  resolves the uncertainty the spec flagged; keep the CLI `docker login` as a fallback
  and document the UI path as primary.

## 10. PENDING, to do at the end of the spec work: scrub the name from git history

Decided with the host. **Do not do this while implementers are in flight.**

**This section's facts were re-verified on 2026-10-12 and three of them were wrong.**
What follows is the corrected version; the live half of the job has since been done.

### What has been done

**`main`'s own tip carried the name until `09ad60a`.** The earlier claim that "every
branch tip is already clean" was false: the redaction was made on `feat/jellyflick-v1`
and never reached `main`, so the name sat in `initial brief.md` on the default branch —
which is what anyone browsing the repository saw.

**The shape of that fix matters, and two attempts got it wrong.** This branch *moved* the
file to `docs/initial-brief.md` in `9e059f1`, so anything `main` does to it at the old
path collides with that rename:

- Modifying it there (`e5d5808`) is a **modify/delete** conflict *without* rename
  detection — which is what GitHub computes. **PR #38 went from mergeable to conflicting
  the moment that was pushed**, even though the same merge was clean locally.
- Deleting it instead is a **rename/delete** conflict *with* rename detection on.
- What works (`09ad60a`): `main` makes the **same move, to the same path, with
  byte-identical content**. Both sides then delete one path and add an identical other
  one, and the merge has nothing to resolve under either strategy.

So **verify a base-branch push with `git -c merge.renames=false merge-tree --write-tree
<branch> <main>` as well as the default**. A merge that is clean locally can still
conflict on GitHub, and the first attempt here proved it.

### What is still owed

**The name remains in the 28 commits between the root commit and the redaction**, in that
one file. The earlier claim that it survived "only in the repository's root commit" was
loose: it is every commit from the root until `d03dd2e` redacted it on the feature branch.
The root commit is `29d1bf0`, and there the file is `initial brief.md` at the repository
root — **not** `docs/initial-brief.md`, which only exists from `9e059f1`, where the file
was moved. A rewrite has to match both paths.

Confirmed still true: the name is in **no commit message, issue, PR or comment** — only
ever in that one file's contents.

**The branch list is much longer than this section used to say.** It named four branches;
35 refs contain the affected commits, including the 16 `ticket/*` branches that did not
exist when it was written.

**Every branch on GitHub is now clean at its tip.** `origin/chore/agent-skills`
(`7c45e73`) and `origin/feat/v1-web-client` (`453667c`) were deleted on 2026-10-12; both
were 0 commits ahead of `origin/main`, so nothing was lost. **This did not end the public
exposure, only the branch-tip part of it:** merged PR #37 used `chore/agent-skills` as its
head, so its diff and those commits are still reachable by direct `/commit/<sha>` URL.
**That residue is exactly what only GitHub Support can purge**, and it is why step 4 below
exists.

What still carries the name at a tip, all of it local to this machine:

| Ref | Where |
|---|---|
| `ticket/2-connect-to-a-server` | local only |
| `worktree-agent-a68c2e12a4fad9974`, `…a8735c0112317d3f1`, `…a879f2826d937352e`, `…adad6b44306b59a81` | local only, all stale |
| `claude/implement-spec-88c250`, `claude/implement-spec-c273ce`, `claude/remote-setup-2e9b22` | local only; two belong to other Claude sessions |

`main` itself is clean from `09ad60a`; a local clone that has not pulled since will still
show it until it does.

### When the last ticket has merged, and before PR #38 is marked ready

Eleven tickets were still open on 2026-10-12, so this is **not** due yet. Doing it early
would orphan all 16 `ticket/*` branches and force both other Claude sessions to re-clone;
doing it at the end means those branches can simply be deleted instead.

1. Install `git-filter-repo` (not `filter-branch`, which is deprecated). It was not
   installed as of 2026-10-12; Homebrew is available.
2. Replace the word across history with the wording the brief now uses
   ("the best-known streaming service" / "that service"), covering **both** paths the file
   has had.
3. Force-push every ref that still contains an affected commit — not the four this section
   used to list. Check with `git for-each-ref` rather than from a list in a document, which
   is how this one went stale.
4. Tell the host to ask GitHub Support to purge the stale objects: after a force-push the
   old SHAs stay reachable by direct `/commit/<sha>` URL, and merged PR #37 still
   references them. Only the repository owner can make that request.
5. Warn that every clone and worktree must be re-cloned or reset, including the other
   Claude session branches `claude/implement-spec-88c250` and `claude/remote-setup-2e9b22`.

**Verify by re-auditing, not by trusting this section.** Three of its claims were wrong
within weeks of being written, because the repository moved and the document did not.

## 11. Quick Connect: the interval and the expiry are ours, and 404 is ambiguous

`jellyfin-api.md` §2 left two things "to verify in implementation". Verified in
#9, against the 12.2.0 shape:

- **The Server states no poll interval.** Jellyflick polls
  `GET /QuickConnect/Connect` every **5 s**, which is the conservative figure the
  research note suggested and which costs a household's Server nothing.
- **The Server states no expiry for a request.** So the deadline is **Jellyflick's
  own: 5 minutes**, after which it stops polling and offers a new code. It is not
  a claim about what the Server would still accept — a code may well outlive it —
  it is the app refusing to poll on behalf of a User who has gone.
- **A 404 from `GET /QuickConnect/Connect` cannot be read as "expired".** The
  Server answers the same way for a request that ran out of time, one that was
  withdrawn, and one already exchanged, and says no more. So the message must
  offer both readings rather than pick one; only the app's *own* deadline above
  justifies saying "it ran out of time" outright. Anything later that wants to
  distinguish a denial is asking the Server for something it does not have.
- **`POST /QuickConnect/Authorize` is the approving side and Jellyflick never
  calls it**, so the gateway has no method for it. The fake Jellyfin has the
  route, for tests that play the other app.

Affects #9 and anything that later shows Quick Connect's state anywhere else.

## 12. A Billboard Source needs a backdrop, and falls back to Spotlight widely

Decided in #22, which added Resume, Newest Addition and Because You Watched
beside Spotlight. Three things the spec and the ticket do not settle:

- **A Source features the first Title of its Row that the Server has a backdrop
  for**, not simply the Row's first. The Billboard is a backdrop with words over
  it, so a Title without one cannot be drawn at all. This means the Billboard's
  "Newest Addition" and the first card of New on Jellyflick **can legitimately
  differ** — in the sample library the newest addition is Bluey, which has no
  backdrop, so the Billboard features Severance. Anything later that compares
  the two should expect that rather than treat it as a bug.
- **"Nothing to show" includes a Row the Server refused**, not only an empty
  one. The ticket says each Source falls back to Spotlight when it has nothing
  to show; a refused Row read is a third case, and it falls back too. Only a
  Server that will not answer the Billboard's *own* query leaves it
  `unavailable`, because then no rule has anything to draw. The reasoning is
  #16's: an empty Billboard is the one answer worth avoiding (story 33).
- **The stored Source is a plain string, and an unknown one presses no button.**
  As with `jf.accentColour`, a Source a newer Jellyflick offers is carried back
  to the Server untouched and fallen back on only where it is *used*. On the
  settings screen that means nothing stored presses Spotlight — which is what
  Home really does — while an unknown Source presses none of the four, rather
  than telling a User they chose Spotlight when they did not.

The Billboard's first pick also **waits for Client Settings to land**, which is
a departure from "Home drawing the default layout for a moment is harmless"
(§ "Client Settings and the Home Layout" in `architecture.md`): picking with
Spotlight and then replacing it with the User's real Source is two reads of the
library and a visible flinch on the first thing on Home, where a Row quietly
re-rendering is not.

Affects #23, which builds on this, and anything later that adds a Source.

## 13. The next Episode: "ask me each time" really asks, and cancelling stays

Decided in #31. The ticket says a countdown starts the next Episode "following
the User's Jellyfin autoplay setting" and that the User can cancel it, and
leaves two things open that the code had to answer.

- **`EnableNextEpisodeAutoPlay` off does not mean "do nothing".** #35's settings
  screen already draws the two readings as **"Start the next one"** against
  **"Ask me each time"** (`settings.nextEpisode.autoPlay` / `.ask`), so a
  household that turned autoplay off was promised a question, not silence. The
  player therefore offers the next Episode either way and only the **countdown**
  follows the flag: on, it counts down from ten and starts; off, the same offer
  stands with nothing counting until somebody presses. Reading the flag as "close
  the player" would have made the settings screen's own wording untrue.
- **Cancelling stays at the end of the Episode**, which is one of the two
  readings the ticket's fourth box allows ("returns to the title page **or**
  stays at the end"). They said "not the next one", which is not "take me out of
  here": the Episode is over, the player's controls stay up because there is
  nothing playing behind them, and the title page is one press of Close or Back
  away. Closing outright would take a decision the User did not make, and it is
  not reversible without finding the Title again.
- **Ten seconds is Jellyflick's own**, like Quick Connect's deadline in §11
  above. Jellyfin stores *whether* to autoplay and says nothing about how long to
  wait, so there is no Server fact to follow here.
- **An Episode the User has already watched is still the next Episode.** The
  Server's aired order is the order a Series is watched in, and skipping ahead to
  the first unwatched one would be this app deciding what a household has
  finished with. That is deliberately *different* from what a press of Play means
  (#18, `episodeToPlay`), which does resume where somebody left off — Play is
  "take me where I am" and this is "what comes after this one".

Affects #31 and anything later that shows the end of an Episode.

## 14. Skip offers `Intro` and `Outro`, and nothing else yet

Also #31, and a narrowing rather than a decision against the research.
`jellyfin-playback.md` §12 notes that `Recap` and `Preview` — "previously on"
and "next time on" — are "also worth offering skips for on episodes". The ticket
asks for Skip Intro and Skip Credits and nothing more, so
`SKIPPABLE_SEGMENT_TYPES` in `src/playback/media-segments.ts` holds exactly
those two and they are what `includeSegmentTypes` asks the Server for.

Growing the offer is one entry in that list and one translated label each; it is
written down here so the next person reads it as a line that was drawn rather
than as a case that was missed. `Commercial` stays out regardless: it is a Live
TV concern and this app shows no Live TV.

## 15. MDBList's `ratings[]` shape is a guess, and so is every scale in it

Decided in #20, which is the client side of ADR 0004. Three things nobody could
settle from the research, because MDBList documents none of them.

- **The shape of a `ratings[]` item is not published.** MDBList's own OpenAPI
  schema types the array elements as a bare `{"type": "object"}` and no example
  anywhere in its docs shows one (`ratings-mdblist.md` §19, which says in as
  many words: do not code against a guessed shape). There was no host key to
  make a real call with, so the adapter reads `{ source, value }` — the shape
  the container's own fixture already assumed in #5 — and **skips anything it
  does not recognise** rather than trusting it. That is also what story 81
  wants: a rating that cannot be read is a rating left out, not a zero.
- **The scales are a guess too, and are checked rather than trusted.** The app
  shows `audience`, `metacritic` and `trakt` as percentages and `letterboxd` as
  stars out of five. A value outside its source's range is treated as absent, so
  a scale that turns out to be wrong **omits** a rating instead of showing one
  that is wrong by a factor of twenty. `SOURCE_SCALES` in
  `src/ratings/extra-ratings.ts` is the one place to correct.
- **What would settle both**: one real `GET /{imdb}/{movie}/{id}/` with the
  host's key, and the item shape written into `ratings-mdblist.md` §19 where it
  says "to verify in implementation". Until then this is the project's one
  piece of coded-against-unverified-shape, and it is deliberately the piece
  that degrades to nothing.

Two smaller calls, both of which extend the spec rather than contradict it:

- **"Nothing is requested when no key is configured" is one request, not
  none.** ADR 0004 deliberately leaves the browser no capability flag to check,
  so the route's 503 is the only way to learn there is no key. It is remembered
  per origin, so a host without a key pays one request for a whole visit instead
  of one per Title. A flag in the runtime config would cost a round trip less
  and is not worth reopening ADR 0004 for.
- **The title page's facts and actions lines now wrap.** They were one grid row
  of `max-content` columns, which made the sheet 635px wide on a 375px screen
  and pushed the Mark watched button and the new ratings off the side. Found by
  looking at the page, not by a test: Playwright scrolls an element into view
  before touching it, so every assertion passed throughout. #17's CSS, changed
  here because #20's own feature was among what ran off the screen, and now
  guarded by a scroll-width assertion at 375px.

## 16. A Subtitle Offset is remembered per subtitle *file*, and `MediaStream.Path` is what says which

#28, and an extension of the spec rather than a correction of it. The spec says
the Client Settings store holds "Subtitle Offsets keyed by subtitle file", and
story 102 reads that literally: the offset applies "to every Episode that uses
the same file".

Nothing else in `MediaStreams` can say that two items point at one file.
`jellyfin-playback.md` §14 lists **`Path`** among the fields a client may read,
and the Server sets it for an **external** subtitle — a `.srt` beside the video,
or one subtitle pack dropped beside a season. So `subtitleFileOf`
(`src/playback/subtitle-offset.ts`) prefers `path:<Path>` where the Server gave
one, and falls back to `stream:<mediaSourceId>:<MediaStream.Index>` for a track
muxed into the video, which has no file of its own: there the file **is** the
video, and the media source names it. `Path` is read through
`src/jellyfin/gateway.ts` and `media-tracks.ts` for this and nothing else.

**To check against a real Server**: `Path` for an external subtitle is a path on
the Server's own disk, which is what makes it stable and shared. A Server that
leaves it null for external streams — or one behind a path-hiding proxy — falls
back to the per-stream key and loses only story 102's second half; the offset
still follows the User to every device.

Two figures are Jellyflick's own, because neither Jellyfin nor the spec has one:
the offset is clamped to **±30 seconds**, so a held button on a remote cannot
leave a User with subtitles they will never see, and at most **100** files'
offsets are kept, newest write last. They share one `CustomPrefs` string on a
Server that is somebody's Raspberry Pi, and a household cannot be allowed to
collect a line per subtitle file it has ever watched.

## 17. The offset is saved when an adjustment finishes, not when it changes

Also #28. A Client Settings write is a read-modify-write against the Server
(`client-settings.ts`), and holding `+` for two seconds is around forty steps.
Saving each one would be forty round trips, serialised behind each other, for a
number the User is still moving.

So `subtitle-timing.tsx` reports an adjustment **finishing** — a button or an
arrow key let go, one press of Reset or of "Sync to this line" — and the player
saves that. No timer and no debounce is involved, which is deliberate: #31's
note that the player has exactly two timers, the ping and the next-Episode
countdown, still holds.

The consequence worth knowing: a player closed *mid-hold* — which needs a Back
press while a thumb is down — saves nothing, and the file keeps the offset it
had. That is the right way round. The alternative is a timer whose window is
either too short to help or long enough to save a number the User was still
dragging through.
