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

The inspiration product's name was redacted from `docs/initial-brief.md` at the branch
tip (commit `d03dd2e`), so every branch tip is already clean. It survives only in the
repository's **root commit** `29d1bf0`, in that one file. Nothing else — no commit
message, issue, PR or comment — has ever contained it (verified across all 21 commits
and every issue, PR and comment).

When the last ticket has merged and before PR #38 is marked ready:

1. Install `git-filter-repo` (not `filter-branch`, which is deprecated).
2. Replace the word across history with the wording now used in the brief
   ("the best-known streaming service" / "that service").
3. Force-push `main`, `feat/jellyflick-v1`, `chore/agent-skills` and `feat/v1-web-client`.
4. Tell the host to ask GitHub Support to purge the stale objects: after a force-push
   the old SHAs stay reachable by direct `/commit/<sha>` URL, and merged PR #37 still
   references them. Only the repo owner can make that request.
5. Warn that every clone and worktree must be re-cloned or reset, including the other
   Claude session branches `claude/implement-spec-88c250` and `claude/remote-setup-2e9b22`.
