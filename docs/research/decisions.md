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
- **`requestVideoFrameCallback` is a real gate, not a formality (#57).** JASSUB used to
  bring `rvfc-polyfill`, so the gate could skip the check; that package is GPL-3.0 and is
  aliased out of the build now, so the browser has to have it. rVFC is **Chrome 83 /
  Firefox 132 / Safari 15.4**, against `transferControlToOffscreen` at Chrome 69 /
  Firefox 105 / Safari 16.4 — so **Firefox 105-131 and Chrome 80-82 clear everything else
  and lack rVFC**, and flatten to plain text. Firefox 132 is the surprising one; check the
  BCD rather than assuming an API this old is everywhere.
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

## 15. MDBList's `ratings[]` really looks like this, and the audience score is `popcorn`

Guessed in #20, which is the client side of ADR 0004, because MDBList documents
none of it. **Settled in #45 with the host's own key**, against two live calls
to `GET https://api.mdblist.com/imdb/{movie|show}/{id}/` — The Matrix
(`tt0133093`) and Game of Thrones (`tt0944947`). Both answers are kept verbatim
in `test/fixtures/`, behind `test/fixtures/mdblist.ts`, so nobody has to guess
or call again.

### The element shape, as it really is

```json
{ "source": "popcorn", "value": 85, "score": 85, "votes": 1307885, "url": "/m/matrix" }
```

- **`{ source, value }` was right**, and is still all the adapter reads.
- **`value` is nullable.** Real nulls on real Titles: `letterboxd` and
  `rogerebert` on the Series, `myanimelist` on both. Letterboxd does not rate
  television, so this is the ordinary case and not a failure — the adapter's
  `typeof value !== 'number'` guard already handled it, and story 81's "leave a
  missing rating out" is what a User sees.
- **`score` is undocumented and present for every source**: `value` normalised
  to 0–100, so Letterboxd's `value: 4.2` comes with `score: 84`.
- **`votes` is there too**, and is sometimes `null` (`popcorn` on the Series).
- **`url` is not usefully typed**: a path string (`"/the-matrix"`), a bare
  **number** (`imdb`'s is `181`), or `null`. The adapter ignores it. Do not
  start reading it without narrowing all three.
- **`tomatoes` alone carries a `"fresh": 1`.** Nothing reads it.

The ten sources MDBList actually sends: `imdb`, `metacritic`, `metacriticuser`,
`trakt`, `tomatoes`, `popcorn`, `tmdb`, `letterboxd`, `rogerebert`,
`myanimelist`.

### The defect this found: there is no `audience` source

`EXTRA_RATING_SOURCES` contained `'audience'`, and **a real `ratings[]` has no
such element**. Rotten Tomatoes' two scores are `tomatoes`, the critics'
tomatometer, and **`popcorn`, the audience popcornmeter — the one story 80 asks
for**. So `extraRatingOf` rejected it on every real response and the audience
badge was never drawn: #45's quiet failure mode exactly, and invisible because
"no key", "lookup failed" and "guessed wrong" all look like nothing on the page.
The wrong name came from `ratings-mdblist.md` §19's `return_rating` table, which
is a query parameter of the **list** endpoints and not this element's
vocabulary; §19 now says so.

**Fixed at the adapter boundary, not by renaming the app's vocabulary.**
`SOURCE_BY_WIRE_NAME` in `src/ratings/extra-ratings.ts` maps MDBList's `popcorn`
onto this app's `audience`, at the one place the payload is read, and nothing
downstream knows MDBList has another word for it. `audience` stays the app's own
name because it is what a User is told — `ratings.audience` in both
dictionaries, "Audience" and "Público" — and `popcorn` is a brand name that says
nothing in a badge. `tomatoes` is deliberately still not shown: it is a
different score, the Server already sends it as `CriticRating`, and nobody asked
for it.

The test that holds this: the captured responses go through `extraRatingsFrom`
in `test/unit/extra-ratings.test.ts`, and every faked payload in the unit and
e2e suites now sends `popcorn` **on the wire** while asserting `audience` as the
adapter's **output**. Drop the mapping and both ends fail.

### The scales were all four correct, and `value` stays what is read

`metacritic` 73/86, `trakt` 87/89, `popcorn` 85 — percentages. `letterboxd` 4.2
— stars out of five, which its own `score: 84` confirms is not a percentage.
`SOURCE_SCALES` needed no correction, and the out-of-range check still turns a
future wrong guess into an omitted rating rather than one wrong by a factor of
twenty.

**Why not switch to the uniform `score` now that it exists.** It would collapse
four scales to one and remove the range check's reason to exist — and the app
would then show Letterboxd as 84%, which is not how Letterboxd publishes it.
Showing each source the way its own site does is the point of story 80's badges,
so `value` + `SOURCE_SCALES` stay.

### Left as it is: a genuine 0 is treated as absent

`extraRatingOf` rejects `value <= 0`, so a real score of zero — a film every
Trakt voter hated — is omitted rather than shown. **Not changed in #45**, for
three reasons: nothing in either captured response has a zero, MDBList's own
convention for "no value" is `null` rather than `0` and the guard predates
knowing that, and Jellyfin already does the same thing one field over
(`CommunityRating` is **absent when 0**, `jellyfin-api.md` §17), so the app is
at least consistent about it. The cost is one unlikely Title losing one badge,
which is story 81's own behaviour; the fix, if a real 0 ever shows up, is to
reject only `value < 0` and leave the upper bound alone.

### Still true from #20, and unchanged

- **"Nothing is requested when no key is configured" is one request, not
  none.** ADR 0004 deliberately leaves the browser no capability flag to check,
  so the route's 503 is the only way to learn there is no key. It is remembered
  per origin, so a host without a key pays one request for a whole visit instead
  of one per Title. A flag in the runtime config would cost a round trip less
  and is not worth reopening ADR 0004 for.
- **The title page's facts and actions lines wrap.** They were one grid row of
  `max-content` columns, which made the sheet 635px wide on a 375px screen and
  pushed the Mark watched button and the new ratings off the side. Found by
  looking at the page, not by a test: Playwright scrolls an element into view
  before touching it, so every assertion passed throughout. #17's CSS, changed
  in #20 because its own feature was among what ran off the screen, and now
  guarded by a scroll-width assertion at 375px.

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

**Measured against a real Server** (#47, 2026-10-20), which replaces the
assumption this section used to carry. The host's own Jellyfin reports
**12.2.0**, and two reads were made with a server API key — `GET /Items` with
`fields=MediaSources`, and `POST /Items/{itemId}/PlaybackInfo`, which is the
endpoint this app actually calls and therefore the one that settles it. Both
200; in 40 sampled Episodes, 20 external subtitle streams and 369 embedded.

| | `IsExternal` | `MediaStream.Path` |
| --- | --- | --- |
| A sidecar `.srt` | `true` | **a real absolute server-side path** |
| A stream inside the container | `false` | **`null`** |

So the design above is correct and story 102's cross-Episode half is reachable:
the key for an external subtitle really is the file, and two Episodes sharing
one `.srt` really do share one offset. `Codec` was `subrip` throughout.

Two things the measurement added that the assumption had not predicted:

- **Paths carry language suffixes** — `.eng.srt`, `.spa.sdh.srt` — so one
  Episode commonly has *several* external subtitle files, and each correctly
  gets its own key. The per-file key was right for a reason beyond the one it
  was chosen for.
- **It was taken with an admin credential**, and 7 of the 10 users on that
  Server are not administrators. Jellyfin redacts some path fields for
  non-elevated users, so a non-admin token may receive `Path: null` for
  external subtitles too, which would lose story 102's cross-Episode half for
  most of a household — quietly. It cannot be settled with an API key, because
  Jellyfin's keys are server-wide rather than user-scoped. **Open as #66.**

A Server that leaves `Path` null for external streams — a non-admin caller, or
one behind a path-hiding proxy — falls back to the per-stream key and loses
only story 102's cross-Episode half; the offset still follows the User to every
device. That degradation is by design and needs no code of its own.

The fake serves this split rather than approximating it
(`test/fake-jellyfin/data.ts`): external streams carry a path, embedded ones
carry an explicit `null`. Giving every subtitle a path, or none, would leave
half of `subtitleFileOf` unexercised against a Server — which is how this half
of story 102 went unproven for as long as it did. The paths there are
illustrative; the host's real library paths are deliberately not in this repo.

### The two figures that are Jellyflick's own

Neither Jellyfin nor the spec has either, so #47 asked for a second opinion on
both. **Both stand, and here is the reason rather than the assertion.**

- **±30 seconds.** The clamp exists for a held button on a remote, not for
  typical mistiming, and the two have very different scales. Real desync is
  sub-second to a few seconds; the large *constant* offset that does occur is a
  file timed against a different release — one carrying a distributor's intro
  card — and that is tens of seconds, inside this bound. Past about half a
  minute the honest diagnosis is **the wrong subtitle file**, not a mistimed
  one, and no offset is the fix. So 30 s covers every case worth covering and
  still leaves a User able to walk back by hand from the far end.
- **100 files.** The binding constraint is the length of one `CustomPrefs`
  value, and `jellyfin-api.md` §7 records no documented limit, so this is
  bounded by judgement rather than by a measured ceiling — stated plainly
  because that is the honest status. With the real path shape above, an entry
  runs about 90–120 bytes, so 100 of them is roughly 9–12 KB in one string.
  The language-suffix finding looked at first like a reason to raise it, since
  one Episode can hold several sidecars — but only a file a User **adjusted**
  is ever stored (`withSubtitleOffset` drops a zero), and adjusting is rare and
  deliberate. What a household *could* key is not what it stores. 100 stays.

**One thing the second opinion did turn up, recorded rather than changed.**
Eviction is by **write** recency, not use: the newest write goes last and the
oldest falls off. So a file a household relies on nightly, adjusted once a year
ago, is evicted before a file adjusted once and never watched again. Refreshing
recency on *read* would fix the ordering and cost a Client Settings write on
every playback, which is plainly the worse trade on a Server that is somebody's
Raspberry Pi. Story 102 asks for neither, the limit is high enough that no
household is expected to reach it, and so this is left as it is — written down
so the next person meets a decision and not a surprise.

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

## 18. The glossary said no trailer ever comes from the web, and story 75 says one does

#19. `GLOSSARY.md`'s **Trailer** entry, added by #43, read: "Only the trailers
stored on the Server itself are used, never one fetched from the web." That is
true of the Billboard (#16, story 24), which is where the vocabulary came from,
and it is **false of the title page**: story 75 asks in so many words for a
Watch trailer button that "loads a YouTube trailer only when I press it".

The entry has been corrected rather than worked around, and a **Watch trailer**
entry added beside it that says which half is which — the Billboard autoplays a
local trailer and only a local one, the title page prefers the local one and
falls back to the embed. Writing code that contradicted the stated vocabulary
would have been the worse of the two, and the Billboard's own rule is unchanged.

Worth knowing for #43's successors: the entry was wrong because it was written
from one feature's behaviour, before the feature that needed the other half
existed.

## 19. Download File needs two yeses, and only one of them is in the ticket

#19, stories 76 and 77. The acceptance box says the button is shown "only when
the User's policy allows content downloading", and that is implemented:
`Policy.EnableContentDownloading`, which is exactly the permission
`Policies.Download` maps to on the Server (`jellyfin-playback.md` §15), rides on
the signed-in User and is refreshed from `GET /Users/Me` at every resume.

**`BaseItemDto.CanDownload` is checked as well**, which the ticket does not ask
for. `jellyfin-api.md` §4 and `jellyfin-playback.md` §15 both recommend both,
and the reason is visible in the sample library: The Unfinished has no file
behind it, so the download endpoint answers 404 however generous the policy is.
A button that could only fail is worse than no button, so a Title the Server
says cannot be downloaded is not offered one. This narrows what is shown and
never widens it, so the box is still ticked on its own terms.

The permission is a courtesy and not the security of the thing: the Server
refuses a download either way, with a **403**, which the end-to-end spec
asserts for the User whose policy forbids it.

## 20. Play On: the five minutes are ours, and the SDK types understate the Server

#34. Two things the API does not settle and one ticket had to.

**`activeWithinSeconds` is 300, and it is this app's figure.** `GET /Sessions`
documents no default for the parameter (`jellyfin-playback.md` §11), and leaving
it off entirely is a real choice rather than a neutral one: the Server then
answers with sessions it has not heard from in hours, so Play On would offer a
television that was switched off after lunch. Five minutes is short enough that
what is listed is a device somebody is near, and long enough to survive an app
sitting on a paused Title. It is the same footing as §11's Quick Connect
interval — pinned in `SESSIONS_ACTIVE_WITHIN_SECONDS` with a test, so that
changing it is a decision somebody makes on purpose rather than a constant
somebody edits.

**`SessionInfoDto.NowPlayingItem` and `.PlayState` are nullable on the wire and
not in the generated types**, which is §3's lesson in a place that bites. The
Server sets both to an explicit `null` once an app has been told to stop, where
an app that has never played anything simply omits them; `@jellyfin/sdk`
generates `NowPlayingItem?: BaseItemDto` and `PlayState?: PlayerStateInfo`, so
the compiler says the first of those cannot happen. Read as present it throws on
the way to `Name`, and the symptom was two renders away from the cause: a Stop
command that the Server accepted, followed by a panel that reported the Server
as unreachable. `typecheck` was green throughout, and `npx vitest run` does not
typecheck anyway — the only thing that caught it was the journey test watching
what a User ends up with after a Stop.

**So: treat `@jellyfin/sdk`'s optionality as a floor and never as the Server's
word.** Where a field means "nothing", read `?? undefined` rather than checking
`=== undefined`, and prefer a test that exercises the Server's own answer over
one that constructs the shape the types allow.
