# Architecture

A map of the code, for whoever picks up the next ticket. Vocabulary is
`GLOSSARY.md`; constraints are `docs/adr/`.

## Directory layout

```
index.html              Loads /config.js (classic, blocking) then src/main.tsx,
                        and preloads the wordmark's font.
public/config.js        Runtime config placeholder. The container overwrites it.
public/fonts/           Bebas Neue, self-hosted, with its OFL licence beside it.
public/manifest.webmanifest
                        What makes the app installable. No service worker.
public/icons/           The app icons, written by scripts/make-icons.mjs.
scripts/build.mjs       vite build, plus the TOLERATED_TRANSFORM guard.
scripts/make-icons.mjs  Draws public/icons/. Run by hand, output committed.
Dockerfile              The multi-stage image. See "The container" below.
deploy/                 entrypoint.sh and the example OMV8 compose file.
server/                 The server inside the container. Not browser code:
                        `jellyflick-server.ts` is all the behaviour,
                        `main.ts` is the process. No dependencies.
src/
  main.tsx              Polyfills, locale, device layer, config, render. No logic.
  app.tsx               Which screen shows: address → sign-in → Home, and the
                        connection and who-is-signed-in state machines.
  polyfills.ts          The Chromium 68 shims, and a list of what is NOT shimmed.
  runtime-config.ts     Reads the host's settings once at startup.
  styles/base.css       Design tokens and primitives. Dark only.
  catalogue/            Jellyfin's items as this app's vocabulary: Title
                        (Movie or Series), Season and Episode. The one place a
                        `BaseItemDto` is read.
  connect/              Finding a Server and checking its version.
  device/               The device layer: `types.ts` is the interface,
                        `browser.ts` the implementation that ships now.
  home/                 Where a signed-in User lands: `row.tsx` is the Row and
                        its card, one module per Row beside it. The Billboard
                        is still to come.
  i18n/                 `en.ts` is the key set, `es.ts` is typed against it.
  jellyfin/             The gateway: the only module that talks HTTP to the Server.
  navigation/           Arrow keys and focus: `nearest.ts` the geometry,
                        `reveal.ts` how far a scroller must move, `focusable.ts`
                        what the arrows reach, `spatial-navigation.ts` the
                        wiring, `input-modality.ts` the focus highlight.
  session/              Session & Users: the Server address and the signed-in
                        Users in device storage, plus the sign-in screen.
  shell/                The app once a User is signed in: `sections.ts` is the
                        one list of sections and their addresses, `app-shell.tsx`
                        the routes and which bar is shown, `back.ts` the single
                        Back handler, `layout.ts` the one breakpoint.
test/
  setup.ts              Vitest: unmounts components after each test.
  unit/                 Vitest specs. One file per behaviour, not per source file.
  e2e/                  Playwright specs and fixtures.
  device/profiles.ts    Fixed device layers: fixed clock, fixed randomness,
                        one capability profile per device class.
  fake-jellyfin/        The fake Jellyfin. See below.
```

Where new code belongs:

- **A new Jellyfin endpoint** → one method on the gateway in `src/jellyfin/gateway.ts`,
  and nowhere else. Nothing outside `src/jellyfin/` calls `fetch`.
- **Anything device-specific** — a key code, a codec probe, the clock, randomness,
  a renderer capability, storage → `src/device/`. Nothing else reads `navigator`,
  `window.chrome`, `Date.now()`, `Math.random()` or `localStorage`.
- **Anything that must survive a reload** → through `device.storage()`, and under
  one key owned by one module (`session/` owns `jellyflick.session`). Per-User
  settings that follow a User between devices are not this: they belong on the
  Server, in the Client Settings store (#10).
- **A screen or a feature** → its own folder under `src/`, holding its logic and
  its components together (`connect/` is the pattern).
- **A new focusable thing** → nothing. The arrow keys find anything focusable by
  themselves. A new *strip* that should be entered where focus left it marks
  itself with `FOCUS_GROUP_ATTRIBUTE` and keeps one tab stop, as `Row` does.

## Running the tests

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest: logic and component behaviour, in happy-dom. |
| `npm run test:watch` | The same, watching. |
| `npm run test:e2e` | Playwright: desktop, phone and keyboard-only, against a production build. |
| `npm run lint` / `npm run typecheck` | ESLint and `tsc --noEmit`. |
| `npm run build` | The production build, which CI also uses as a check. |
| `npm run build:server` | Compiles `server/` into `server-dist/`. Only the image needs it. |

Both runners start the fake Jellyfin themselves, on a fixed port (8787, or
`FAKE_JELLYFIN_PORT`): Vitest from `test/fake-jellyfin/global-setup.ts`,
Playwright as a `webServer` running `test/fake-jellyfin/bin.ts`.

Two boundaries are faked, and only these two: **the Jellyfin HTTP API** and
**the device layer**. Never replace one of our own modules with a fake.

Vitest runs test files one at a time (`fileParallelism: false`), because one fake
Jellyfin holds mutable sample data for the whole run.

## Adding an endpoint to the fake Jellyfin

1. Add the sample data it serves to `FakeJellyfinState` in
   `test/fake-jellyfin/data.ts`, and seed it in `createSampleData()`.
2. Add a route module under `test/fake-jellyfin/routes/` — one file per Jellyfin
   controller — exporting a `readonly FakeRoute[]`. Path parameters are `:name`,
   e.g. `/Items/:itemId/Similar`.
3. Spread it into `jellyfinRoutes` in `test/fake-jellyfin/routes/index.ts`.

An unknown path returns 404 with a message naming what to add, so a missing route
never looks like a product bug.

Control endpoints, outside Jellyfin's own namespace and shared by both runners:

| Endpoint | Use |
| --- | --- |
| `GET /__fake/health` | Readiness. |
| `GET` / `DELETE /__fake/writes` | Every non-GET request: what tests assert was saved. |
| `GET` / `DELETE /__fake/requests` | Every request, with headers. |
| `GET` / `POST` / `DELETE /__fake/state` | Read, patch or reseed the sample data. |

Sample data a test can lean on: four Users — `Rafael` and `Marina` with pictures,
`Nico` without, and `Ghost`, who is hidden from `/Users/Public`. They share one
password, exported as `SAMPLE_PASSWORD`. `failAuthenticationWith` makes
`AuthenticateByName` answer with a status whatever the credentials are.

And a sample library: four libraries — `Movies` and `Kids` of Movies, `Series` of
Series, and `Music`, which holds no Title — with Movies, two Series with a Season
and Episodes, a stray `Video`, an item with no images at all, and an album that is
the newest addition on the Server and must never reach a Row. Merged newest-first
with each Series once, the whole sample library is exactly:

    Bluey, Severance, Paddington, Arrival, Heat, The Unfinished

`failLibraryQueriesWith` makes `/UserViews` and `/Items/Latest` answer with a
status, for a Server that will not say what it holds. Both of those endpoints
want a token, as the real Server does.

Vitest uses the helpers in `test/fake-jellyfin/control.ts`; Playwright calls the
same endpoints through its `request` fixture.

`test/fake-jellyfin/` writes `.ts` in its own relative imports. Playwright starts
it with Node's type stripping, which does not resolve extensionless specifiers.
Nowhere else does this.

## Adding a translated string

1. Add the key to `src/i18n/en.ts`. A message is a string, or a function of a
   parameters object when it interpolates. `en` is the source of truth.
2. Add the same key to `src/i18n/es.ts`. It is typed as `Messages`, so a missing
   or stale key fails `npm run typecheck`.
3. Read it in a component with `const t = useTranslate()` and `t('the.key')`.
   Parameters are typed per key.

Keys are dot-namespaced by screen or feature (`connect.addressLabel`). No string
a User can see is ever written inline. Locales load as separate chunks, so a User
downloads one dictionary.

Formatting goes through `Intl.NumberFormat`, `Intl.DateTimeFormat` and
`Intl.PluralRules`, which are native on the target. `Intl.RelativeTimeFormat`
(71), `Intl.ListFormat` (72) and `Intl.Locale` (74) are **not** — write the three
lines by hand instead of adding a polyfill.

## The shell: sections, routing and Back

`src/shell/` owns everything around a screen, and nothing inside one.

- **A section's address** lives once, in `SECTIONS` in `src/shell/sections.ts`,
  with the key of its translated name. Both navigation bars and the router read
  that list, so adding a section is one entry plus one route.
- **Taking a section over** (Movies and Series are #23, My List #13, Search #24)
  means pointing its `<Route>` in `src/shell/app-shell.tsx` at your own folder
  under `src/` instead of `SectionPlaceholder`, and nothing else.
- **The router is `preact-iso`**, imported as `preact-iso/router`, never the
  barrel, which pulls in `preact-render-to-string`. It pushes real history
  entries, so a section can be bookmarked, shared and reloaded — which is why
  the container answers an unknown path with `index.html` and a 200. Note that
  it calls `scrollTo(0, 0)` on a push: a Row that restores its scroll position
  will have to work around that. Nothing does yet — a Row remembers where focus
  was for as long as it is on the screen, and leaving a section unmounts it, so
  Home comes back from the Server rather than from memory. Whoever makes a
  section's state outlive a navigation inherits this.
- **One navigation bar is in the document at a time** — the top bar above 768px,
  the bottom bar below it — chosen in JavaScript in `src/shell/layout.ts`, so
  there is never a second copy of every link for a screen reader or a test to
  find. ADR 0002 bans container queries; this is a page-level breakpoint anyway.
- **Back is one handler**, `src/shell/back.ts`. The Back key — a remote's, or
  `Escape` — does nothing of its own: it calls `history.back()`, which is the
  browser's back button, so the two cannot drift apart. The entry the app was
  opened on is marked in `history.state`, which is how Back knows not to leave
  Jellyflick from Home, and to go to Home from a section that was opened
  directly. A screen that needs Back to mean something else (the player, an
  overlay) should extend that module rather than add a second listener.
- **The wordmark** is flat on purpose: upright condensed capitals, no curve.
  Bebas Neue has one weight only, so distinguish type by size and letter
  spacing, never by weight — browsers synthesise a bold that looks wrong on it.
  The licence has to travel with the file, so `public/fonts/bebas-neue-OFL.txt`
  ships with the app and the family still wants crediting on an about screen.

## Arrow keys, focus and Rows

`src/navigation/` is spatial navigation: every screen driveable with the arrow
keys, Enter and Back (stories 64 and 65). It is installed once, in `src/app.tsx`,
so signing in works on a remote as well as Home does. Back is *not* part of it —
that is `src/shell/back.ts`, because it is the browser's back button as much as
it is a key.

- **Keys arrive as the device layer's logical keys**, through `device.keyFor`, so
  the webOS port maps a remote once in `src/device/` and nothing here changes.
- **The geometry is `nearest.ts`**, one pure function of boxes: the candidate
  furthest in the pressed direction loses to the nearest one, and a step across
  that direction's axis costs eight pixels for every one along it. That weighting
  is what makes a Row read as a line — Right takes the next card along however
  close the Row underneath sits, and Down takes the card lined up below rather
  than the one nearest as the crow flies.
- **A Row's memory is its tab stop.** The card focus was last on holds
  `tabindex="0"` and the rest hold `-1`, so Tab steps from Row to Row instead of
  through twenty cards, and the arrows arriving from another Row land where they
  left off. One fact read two ways, and no store to keep in sync. A strip opts in
  by marking itself `data-focus-group` (`FOCUS_GROUP_ATTRIBUTE`).
- **Moving *inside* a group is plain geometry**, or Left and Right could never
  leave the card the Row remembers.
- **The page's own flow is tried before anything fixed.** The phone's bottom bar
  is fixed to the bottom of the screen, which makes it the nearest thing
  downwards from anywhere on the page; without this rule Down would never reach
  the next Row. From inside a fixed overlay — the player, a title-page pop-up —
  the overlay is the flow, so the rule keeps working as the app grows.
- **A Row scrolls because focus moves**, not because it snaps: ADR 0002 puts
  `scroll-snap-*` at Chrome 69, one above the floor. `reveal.ts` is the
  arithmetic, on one axis, and it serves both — the Row scrolls itself sideways
  to its focused card, and `spatial-navigation.ts` scrolls the page to the
  focused Row with a margin that clears both bars. `scrollTo({ behavior })` is
  Chrome 61, and a device without it falls back to a jump.
- **A Row also scrolls by touch and by wheel.** Touch and a sideways wheel are
  `overflow-x: auto` doing its job. A plain downward wheel is turned sideways in
  `row.tsx`, because a mouse has no sideways wheel — but only while the Row has
  somewhere to go, so a Row at either end hands the page back its scroll and can
  never trap it. That listener cannot be passive.
- **A card is a focus stop, not a button.** What pressing one opens is #17's, so
  `Row` takes an `onCardPress` and Enter clicks the focused card; a Row given no
  handler is browsable and not pressable. Enter deliberately leaves a real link,
  button or field alone — the browser presses those itself, and a second click
  here would press them twice.
- **The focus highlight is hand-rolled `:focus-visible`.** That selector is
  Chrome 86, so `input-modality.ts` writes the latest kind of input on the root
  element as `data-input` and `base.css` takes the ring away under
  `html[data-input='pointer']`. Nothing written means a keyboard, which is what a
  TV always is, so the ring is there from the first press rather than after it. A
  field keeps its ring whatever the User is driving with, because something has
  to say where the typing goes.
- **What a test can see.** happy-dom gives every element a zero-sized rectangle,
  so no unit test can check where focus goes: the arithmetic is pinned down in
  `test/unit/nearest-in-direction.test.ts` and
  `test/unit/revealing-the-focused-item.test.ts`, the Row's memory in
  `test/unit/rows-remember-where-focus-was.test.tsx`, and everything about a laid
  out screen in `test/e2e/arrow-key-navigation.spec.ts`, which runs in the
  keyboard-only project too.


## Chromium 68 constraints that will bite

ADR 0002 sets the floor. These are the traps inside it.

- **No top-level `await`.** The bundler cannot downlevel it: it prints
  `[TOLERATED_TRANSFORM]`, emits the `await` anyway and exits 0. ESLint bans it
  in our code; `npm run build` fails on the marker so it cannot arrive from a
  dependency either. Use `.then()`, as `src/main.tsx` does.
- **Never build with `minify: false`.** CSS downleveling is done by the CSS
  minifier, so with minification off modern CSS ships raw to the target.
- **CSS needing hand-written fallbacks**, because the minifier leaves them raw:
  flex `gap` (84 — silently does nothing; use grid, where `gap` is 66, or
  `* + *` margins), `aspect-ratio` (88 — padding-ratio box), `:focus-visible`
  (86 — style `:focus` and take the ring away again under
  `html[data-input='pointer']`, which `src/navigation/input-modality.ts` writes),
  `scroll-snap-*` (69 — rows are scrolled from JS instead, by
  `src/navigation/reveal.ts`),
  `:has()` (105), the `inset` shorthand (87), `backdrop-filter` (76).
  **`:where()` and `:is()` ship raw too** (88 and 88), and a rule using one is
  dropped whole on the target — write selector lists out.
  Container queries and `dvh` are banned outright by ADR 0002.
- **CSS that is downleveled for you, so use it freely:** `clamp()`, `min()`,
  `max()`, logical properties, nesting, space/slash colour syntax. Native and
  safe: custom properties, grid, flex, grid `gap`, `position: sticky`,
  `object-fit`, `:focus-within`, `font-display`, `overscroll-behavior`.
- **JS APIs that are absent and must not be used:** `Object.hasOwn` (93),
  `Promise.any` (85), `structuredClone` (98), `WeakRef` (84), `.at()` (92),
  `findLast` (97), `crypto.randomUUID` (92), `Error.cause` (93). The first three
  are banned by ESLint. `lib` stays at ES2020 so the compiler refuses the rest.
- **Already native, so do not polyfill:** `AbortController` (66),
  `ResizeObserver` (64), `IntersectionObserver` (51), `requestIdleCallback` (47).
- **Picture-in-picture is Chrome 69** — one version above the floor. Feature-detect
  through the device layer and hide the control.

## Jellyfin facts that shape the code

- The gateway builds `Authorization: MediaBrowser Client=…, Device=…, DeviceId=…,
  Version=…, Token=…`. The five key names are case-sensitive, values are always
  quoted and URL-encoded. See `src/jellyfin/authorization.ts`.
- One DeviceId per signed-in User: the Server allows a single token per DeviceId.
  `device.newDeviceId()` mints them, once, when that User signs in —
  `src/session/session.ts` then keeps it alongside their token, so re-minting one
  never knocks a token out.
- `AuthenticateByName` takes `{ Username, Pw }` — `Pw`, not `Password` — and the
  attempt carries a DeviceId and **no** `Token=`: that is how the Server records
  which device the token it issues belongs to. A wrong password and an unknown
  username are both 401, deliberately indistinguishable.
- `/Users/Public` omits accounts whose `Policy.IsHidden` is true, which is why
  sign-in also offers a typed username. A null `PrimaryImageTag` means the User
  has no picture: show their initial.
- `/UserImage` and the item image endpoints are anonymous, so an `<img src>`
  needs no token. `/UserImage` takes no sizing parameters — size it with CSS.
- The version gate reads `PublicSystemInfo.Version` from `/System/Info/Public`
  and compares the leading integer. Never compare versions as text, and do not
  use `@jellyfin/sdk`'s `MINIMUM_VERSION`, which is 10.10.0.
- Types come from `@jellyfin/sdk` as `import type` only, never its runtime, its
  axios-backed API clients or its generated enums.

## Installing the app

Story 110. `public/manifest.webmanifest` and `public/icons/` are the whole
feature: Vite copies `public/` verbatim, `index.html` links the manifest and the
Apple touch icon, and the browser's own Install item does the rest.

- **There is no service worker, deliberately.** `decisions.md` §8 and
  `player-subtitles.md` §8c: Chromium dropped the service-worker requirement for
  installing from its own menu (108 mobile, 112 desktop), and the spec forbids
  caching media or API data anyway. A registered worker also outlives the page
  that registered it, so a stale one is exactly the "clear something before the
  update appears" failure the ticket rules out. The only thing a worker would
  buy is `beforeinstallprompt` for a *custom in-app Install button* — which is
  Chromium-only (iOS installs through the Share menu) and nothing asks for. **If
  a later ticket wants that button, it is adding a service worker, with the
  update story that comes with it.** `test/unit/installable-app.test.ts` and
  `test/e2e/installing-the-app.spec.ts` both fail if one appears by accident.
- **Updates need nothing cleared** because nothing unhashed is cached:
  `/assets/` is hashed and immutable, and the shell, the manifest and the icons
  are all `no-cache`, so the browser revalidates them on every load. That rule
  lives in `cacheControlFor` in `server/jellyflick-server.ts`.
- **The colours are the app's own tokens.** `background_color` and `theme_color`
  are both `--surface-base` from `src/styles/base.css`, repeated in a
  `<meta name="theme-color">` because browsers read that before the manifest.
  A unit test fails if the token and the manifest drift apart. An Accent Colour
  is a per-User preference (#11) and is deliberately *not* the theme colour —
  the manifest is one file for the whole household.
- **The icons are generated, not drawn by hand.** `node scripts/make-icons.mjs`
  writes the three PNGs; its output is committed, and it is **not** part of
  `npm run build`, so the shipped artwork shows up in a diff and the production
  build depends on no rasteriser of ours. It has no dependencies — the mark is a
  stem and a hook, flat, in the accent on the page's own background, so it owes
  nothing to Bebas Neue at build time. Re-run it when the accent or the mark
  changes.
- **Three icons, and why each exists:** 192px and 512px are what Chromium
  requires; the 512px `maskable` one is what stops Android cropping the square
  into a circle with visible letterboxing. iOS reads none of them, which is what
  `rel="apple-touch-icon"` is for.

## Runtime config

`index.html` loads `/config.js` with a blocking classic script, so
`window.__JELLYFLICK_CONFIG__` exists before the module script runs. The
container writes that file at start-up from its environment (ticket #5).

It carries `serverAddress` and `appVersion`, **and nothing else**: ADR 0004 keeps
the MDBList key inside the container, which proxies MDBList itself. Never put a
secret in a browser-visible file.

An empty `serverAddress` means "ask the User", not "fail".

There is no container in `vite dev`, so `VITE_SERVER_ADDRESS` in `.env.local`
stands in for a preset address while developing.

The entrypoint builds the file with `jq -n`, never by interpolating into a
string: one quote in the address would otherwise emit JavaScript that does not
parse, and the app would fail to start with no clue why.

## The container

ADR 0004 makes the container a small service rather than a file server: it holds
`MDBLIST_API_KEY` and caches ratings per Title, which no static file server can
do. So `server/` is **one dependency-free Node server on `node:22-alpine`**,
using `node:` built-ins only, doing three things:

1. serve the built assets, with hashed assets under `/assets/` cached hard and
   the shell and `/config.js` not cached at all
2. answer an unknown path with `index.html` and a **200**, so a client-side route
   survives a reload. A path *with* an extension 404s instead — answering a
   missing `/assets/…js` with the shell would turn a broken deploy into a blank
   page with no explanation
3. proxy MDBList on the browser's behalf (below)

`server/` is the only compiled-and-shipped code in the repository:
`npm run build:server` emits `server-dist/` through `tsconfig.server.json`, and
the image runs that plain JavaScript — no experimental flags, no dependencies.
`npm run typecheck` still covers the sources.

Shape of the image:

| Path | What |
| --- | --- |
| `/srv/app` | The build output. Read-only. |
| `/srv/config` | Where the entrypoint writes `config.js`. A **tmpfs**, because the compose file sets `read_only: true`; the container stops with an explanation if it cannot be written. |
| `/srv/server` | The compiled server. |

Settings come from the environment, and `optionsFromEnvironment` is the only
place that reads it: `MDBLIST_API_KEY`, `PORT` (8080, so no privileges are
needed to bind), `HOST`, `JELLYFLICK_ROOT`, `JELLYFLICK_CONFIG_DIR`,
`RATINGS_CACHE_TTL_SECONDS`. **`JELLYFIN_URL` is deliberately not among them**:
the preset address reaches the browser through `config.js` and the server has no
use for it.

`.github/workflows/release.yml` builds `linux/amd64` and `linux/arm64` and
pushes to GHCR on every push to `main`. It is separate from `ci.yml`, which is
left alone. `docs/setup.md` is the host's guide.

### The ratings route

```
GET /api/ratings/:provider/:type/:id
```

- `:provider` — `imdb`, `mal`, `mdblist`, `tmdb`, `trakt` or `tvdb`
- `:type` — `any`, `movie` or `show`
- `:id` — the provider's id, `[A-Za-z0-9]{1,32}`

The three segments are MDBList's own enums, from its OpenAPI schema
(`docs/research/ratings-mdblist.md` §19), so they pass straight through and this
route stays **transport, not translation**. The key is added here and nowhere
else, so it never reaches a browser.

| Status | Body | Means |
| --- | --- | --- |
| 200 | MDBList's own JSON, unchanged | Cached for a day (`RATINGS_CACHE_TTL_SECONDS`). |
| 400 | `{ "error": "bad-request" }` | Unrecognised provider, type or id. Nothing is sent upstream. |
| 404 | `{ "error": "not-found" }` | MDBList has never heard of the Title. Cached, which also spares the quota. |
| 502 | `{ "error": "mdblist-unavailable" }` | MDBList failed or could not be reached. **Not** cached, so a blip does not switch ratings off for a day. |
| 503 | `{ "error": "mdblist-not-configured" }` | The host left `MDBLIST_API_KEY` empty, so extra ratings are off. |

**For whoever builds the client-side ratings feature (#20):** call this route,
never `api.mdblist.com`. Treat anything but a 200 as "no extra ratings" and omit
them — story 81 says a missing rating is left out, not shown as zero. There is no
capability flag in the runtime config to check first, by design: the config
carries `serverAddress` and `appVersion` and nothing else, so no secret can leak
into it.

Prefer `imdb` with `ProviderIds.Imdb` and fall back to `tmdb` with
`ProviderIds.Tmdb`; map `BaseItemKind` to the type, `Movie` → `movie` and
`Series` → `show`.

Two properties the route already gives you, so do not rebuild them client-side:

- **One entry per Title**, shared by every browser in the household. MDBList's
  free tier allows 1,000 requests a day *per account*, not per device.
- **Simultaneous requests for one Title collapse into a single upstream call**,
  so a Row of cards appearing at once costs one request, not twelve.

`GET /api/health` answers `{ "ok": true }` for the compose healthcheck. Any other
`/api/` path is a 404, so a future route cannot be shadowed by the SPA fallback.

### Testing it

| Where | What it covers |
| --- | --- |
| `test/unit/container-server.test.ts` | The server over a real socket: static serving, the 200 fallback, path traversal, cache headers, and the ratings route's key injection, caching, coalescing and failure mapping. MDBList is the one thing faked, through the `fetch` option. |
| `test/unit/container-entrypoint.test.ts` | `deploy/entrypoint.sh` as a process: the exact keys written, an empty address not being an error, `jq` escaping a hostile address, and the key never being written or echoed. |
| `test/e2e/the-container-serves-the-app.spec.ts` | The real entrypoint and the real server serving the real production build, in a browser. |

Both server test files are `@vitest-environment node`: happy-dom's `fetch`
applies the Same Origin Policy and would block every request to a server on an
ephemeral port.

What none of them cover is the image itself — the layering, `apk add jq`, the
`node` user and the tmpfs. Only `docker build` and `docker run` exercise those.
