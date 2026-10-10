# Architecture

A map of the code, for whoever picks up the next ticket. Vocabulary is
`GLOSSARY.md`; constraints are `docs/adr/`.

## Directory layout

```
index.html              Loads /config.js (classic, blocking) then src/main.tsx.
public/config.js        Runtime config placeholder. The container overwrites it.
scripts/build.mjs       vite build, plus the TOLERATED_TRANSFORM guard.
src/
  main.tsx              Polyfills, locale, device layer, config, render. No logic.
  app.tsx               Which screen shows, and the connection state machine.
  polyfills.ts          The Chromium 68 shims, and a list of what is NOT shimmed.
  runtime-config.ts     Reads the host's settings once at startup.
  styles/base.css       Design tokens and primitives. Dark only.
  connect/              Finding a Server and checking its version.
  device/               The device layer: `types.ts` is the interface,
                        `browser.ts` the implementation that ships now.
  i18n/                 `en.ts` is the key set, `es.ts` is typed against it.
  jellyfin/             The gateway: the only module that talks HTTP to the Server.
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
  a renderer capability → `src/device/`. Nothing else reads `navigator`,
  `window.chrome`, `Date.now()` or `Math.random()`.
- **A screen or a feature** → its own folder under `src/`, holding its logic and
  its components together (`connect/` is the pattern).

## Running the tests

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest: logic and component behaviour, in happy-dom. |
| `npm run test:watch` | The same, watching. |
| `npm run test:e2e` | Playwright: desktop, phone and keyboard-only, against a production build. |
| `npm run lint` / `npm run typecheck` | ESLint and `tsc --noEmit`. |
| `npm run build` | The production build, which CI also uses as a check. |

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
  (86 — style `:focus` and remove it inside `@supports selector(:focus-visible)`,
  as `base.css` does), `scroll-snap-*` (69 — scroll rows from JS instead),
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
  `device.newDeviceId()` mints them.
- The version gate reads `PublicSystemInfo.Version` from `/System/Info/Public`
  and compares the leading integer. Never compare versions as text, and do not
  use `@jellyfin/sdk`'s `MINIMUM_VERSION`, which is 10.10.0.
- Types come from `@jellyfin/sdk` as `import type` only, never its runtime, its
  axios-backed API clients or its generated enums.

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
