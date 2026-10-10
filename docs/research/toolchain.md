# Jellyflick toolchain research

Scope: Vite/Preact/TypeScript build targeting Chromium 68, CSS, testing, i18n, fonts.
Companion files: `player-subtitles.md` (hls.js, subtitles, Cast/AirPlay, PiP, PWA), `delivery.md` (container, CI, GHCR).

Binding constraints assumed, not restated: `docs/adr/0002-webos-5-minimum-modern-css-with-fallbacks.md`, `docs/adr/0003-preact-with-compat.md`.

Every version number below was read from the registry or from the package tarball on **2026-10-10**. Claims marked **[verified]** were reproduced by building or running code in a scratch project; everything else cites a URL.

---

## Recommendations

1. **`build.target: 'chrome68'`** in `vite.config.ts`. It is accepted and it works. **Do not add `@vitejs/plugin-legacy`** — Chromium 68 clears Vite's floor (native ESM, dynamic `import()`, `import.meta`).
2. **Never set `build.minify: false` for a production build.** CSS downleveling is done by the CSS minifier; with minify off, modern CSS ships raw. **[verified]**
3. **Ban top-level `await` in app code.** Oxc cannot downlevel it and the build only *warns* (`[TOLERATED_TRANSFORM]`) while emitting broken output. Add an ESLint rule. **[verified]**
4. **Hand-roll the polyfills** in `src/polyfills.ts` (~0.8 KB gzipped) rather than importing `core-js` modules (~7.8 KB gzipped for the same six shims). Both measured. **[verified]** A ready-to-use file is in §1.
5. **Use `@preact/preset-vite`** — it installs the `react`/`react-dom` → `preact/compat` aliases itself. Add the `paths` block to `tsconfig.json` for types.
6. **Router: `preact-iso`**, imported as `preact-iso/router` (never the barrel). ~3.3 KB of unminified source, Preact-team-maintained, MIT, and its `lazy()` integrates route-level code splitting with Suspense.
7. **Safe modern CSS** (auto-downleveled by the minifier at this target): `clamp()`, `min()`/`max()`, logical properties, `:is()`/`:where()`, CSS nesting, space/slash color syntax. **[verified]**
8. **Unsafe CSS needing hand-written fallbacks:** flexbox `gap`, `aspect-ratio`, `:focus-visible`, `scroll-snap-*`, `:has()`, `backdrop-filter`, `inset` shorthand — plus container queries and `dvh` already banned by ADR 0002. Grid `gap` **is** safe (Chrome 66).
9. **Testing: Vitest 5 + happy-dom + `@testing-library/preact`.** Confirmed working against Preact 11. **[verified]**
10. **The shared HTTP fake is a plain Node `http` server**, not MSW and not Playwright route interception. It is started by Vitest `globalSetup` and by a second `webServer` entry in Playwright, and it exposes a `GET /__fake/writes` control endpoint so the out-of-process Playwright runner can assert on recorded writes.
11. **i18n: hand-rolled typed dictionary.** `preact-i18n` is disqualified outright (its peer range is `preact: <10`). Use native `Intl.NumberFormat`/`DateTimeFormat`/`PluralRules`, all present on Chromium 68.
12. **Font: Bebas Neue, SIL OFL 1.1**, self-hosted `.woff2` from `google/fonts`, `font-display: swap`. It ships **one weight only** — if more weights are needed, use **Oswald** (also OFL, variable).

---

## 1. Vite + Preact + TypeScript targeting Chromium 68

### Vite 8 does not use esbuild

This is the single most important correction to the brief. **Vite 8.3.4 bundles `rolldown` and transforms JS with the Oxc transformer; CSS goes through `lightningcss`.** Its `dependencies` are exactly `lightningcss`, `picomatch`, `postcss`, `rolldown`, `tinyglobby` — esbuild is not installed at all. **[verified]**

Consequences: questions phrased as "what esbuild can downlevel" must be answered against Oxc, the downlevel helpers injected into output come from `@oxc-project/runtime` (Babel-derived helpers such as `_defineProperty`, `_classPrivateFieldInitSpec`), and `build.cssMinify` defaults to `'lightningcss'`.

Source: <https://vite.dev/config/build-options>

### `build.target`

`build.target` accepts `string | string[]`; a value may be an ES version (`es2015`), **a browser with a version (`chrome68`)**, or an array. Default for this major is `'baseline-widely-available'` → `['chrome111','edge111','firefox114','safari16.4','ios16.4']`.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: { target: 'chrome68' },
});
```

Source: <https://vite.dev/config/build-options>

### What Oxc downlevels at `chrome68`, measured

Built a scratch project containing every risky construct and read the output. **[verified]**

| Feature | Result at `chrome68` | Why it is fine / not |
| --- | --- | --- |
| Optional chaining `?.` | **Downleveled** to `=== null \|\| === void 0 ? void 0 :` chains | native is Chrome 80 |
| Nullish coalescing `??` | **Downleveled** to a temp + ternary | native is Chrome 80 |
| `??=`, `\|\|=`, `&&=` | **Downleveled** | native is Chrome 85 |
| Class fields (incl. `static`) | **Downleveled** to `_defineProperty` in the constructor | native is Chrome 72/74 |
| Private fields `#x` | **Downleveled** to a `WeakMap` + brand checks | native is Chrome 74 |
| Optional catch binding | left as-is — **fine**, Chrome 66 | |
| Object rest/spread | left as-is — **fine**, Chrome 60 | |
| `async function*` / `for await` | left as-is — **fine**, Chrome 63 | |
| `BigInt` literals, `**` on them | left as-is — **fine**, Chrome 67 | |
| Dynamic `import()` | **emitted as a real separate chunk, `import(` kept native** | **fine**, Chrome 63 |
| **Top-level `await`** | **LEFT IN THE OUTPUT.** Build prints `[TOLERATED_TRANSFORM] Top-level await is not available in the configured target environment.` and then **succeeds**. | native is Chrome 89 — **this ships broken code** |

**Action:** top-level `await` is the one real syntax trap. The build will not stop you. Add `no-restricted-syntax` for `AwaitExpression` at module scope, or treat `TOLERATED_TRANSFORM` as fatal in CI by grepping the build log.

Control: the same CSS/JS built at `target: 'esnext'` keeps `padding-inline`, `:is()` and nesting raw, which proves the transforms above are genuinely target-driven rather than unconditional. **[verified]**

### Dynamic `import()` for lazy loading: confirmed working

Several tickets depend on this. `javascript.operators.import` is **Chrome 63** (MDN BCD), and the scratch build emitted a genuine separate chunk (`dist/assets/lazy-*.js`) with a native `import()` call kept in the main chunk. Vite also wraps each `import()` in its own preload helper, which — usefully — implements its *own* inline `allSettled` shim rather than depending on `Promise.allSettled`. **[verified]**

Also confirmed safe: `import`/`export` statements Chrome 61, `<script type=module>` Chrome 61, `import.meta` Chrome 64 (all MDN BCD).

### `@vitejs/plugin-legacy` is NOT needed

From the plugin's own README (read from the tarball):

> Vite's minimum browser support target is native ESM dynamic import, and `import.meta`. This plugin provides support for legacy browsers that do not support those features.

Chromium 68 has both. Adding the plugin would pull in `@babel/preset-env`, `systemjs`, `core-js` and `regenerator-runtime`, and emit a duplicate SystemJS bundle for nobody.

There is one legitimate *optional* use: `legacy({ renderLegacyChunks: false, modernPolyfills: [...] })` turns it into a polyfill injector only. **Not recommended here** — the plugin's own README warns that `modernPolyfills: true` auto-detection "injects 15kb of polyfills" because core-js is aggressive. The hand-rolled file below is 0.8 KB.

Source: `@vitejs/plugin-legacy@8.2.3` README; <https://vite.dev/plugins/>

### Polyfills required for Chromium 68

Queried `@mdn/browser-compat-data` (installed locally, so these are exact BCD `version_added` values, not caniuse approximations). **[verified]**

**Needed (not on Chrome 68):**

| API | First Chrome |
| --- | --- |
| `Array.prototype.flat` / `flatMap` | 69 |
| `Object.fromEntries` | 73 |
| `String.prototype.replaceAll` | 85 |
| `String.prototype.matchAll` | 73 |
| `Promise.allSettled` | 76 |
| `Promise.any` | 85 |
| `globalThis` | 71 |
| `Object.hasOwn` | 93 |
| `Array.prototype.at` / `String.prototype.at` | 92 |
| `Array.prototype.findLast` | 97 |
| `structuredClone` | 98 |
| `WeakRef` | 84 |
| `Element.toggleAttribute` | 69 |

**Already present — do not polyfill:** `AbortController` (66), `ResizeObserver` (64), `IntersectionObserver` (51), `requestIdleCallback` (47), `TextDecoder` (38), `CSS.supports` (28), `Array.prototype.includes` (47), `Object.entries` (54), `String.padStart` (57), `String.trimStart` (66), `MediaSource` (31), `Worker` (2), `ServiceWorker` (40), `BigInt` (67).

Note the brief's assumption about `ResizeObserver`/`IntersectionObserver`/`AbortController` needing polyfills is wrong — all three predate Chrome 68. `resize-observer-polyfill` and `intersection-observer` should **not** be installed.

### Lightest way to ship them: hand-rolled, 0.8 KB gzipped

Measured both routes in real `chrome68` builds of the same six shims. **[verified]**

| Route | Bundle (raw) | Bundle (gzip) |
| --- | --- | --- |
| Six explicit `core-js/modules/*` imports | 20.5 KB | **7.8 KB** |
| Hand-rolled guarded shims | 1.9 KB | **0.8 KB** |

(The core-js module paths all exist and are importable individually: `es.array.flat`, `es.array.flat-map`, `es.object.from-entries`, `es.string.replace-all`, `es.promise.all-settled`, `es.global-this`, `es.object.has-own`, `es.array.at`, `es.string.match-all`, `web.structured-clone`. **[verified]** They are simply 10× the size.)

Given lightness is a stated hard constraint and the missing list is short and well-understood, hand-roll. This file compiles under `strict` and builds clean at `chrome68`; copy it as `src/polyfills.ts` and import it first in `main.tsx`:

```ts
// Chromium 68 shims. Each is guarded, so newer engines pay nothing but the check.
if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', {
    configurable: true, writable: true,
    value: function flat(this: unknown[], depth = 1): unknown[] {
      return depth < 1 ? this.slice()
        : this.reduce<unknown[]>((acc, v) =>
            acc.concat(Array.isArray(v) ? (v as unknown[]).flat(depth - 1) : v), []);
    },
  });
}
if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', {
    configurable: true, writable: true,
    value: function flatMap(this: unknown[], fn: (v: unknown, i: number, a: unknown[]) => unknown, thisArg?: unknown) {
      return this.map(fn, thisArg).flat();
    },
  });
}
if (!Object.fromEntries) {
  Object.defineProperty(Object, 'fromEntries', {
    configurable: true, writable: true,
    value: function fromEntries(entries: Iterable<[PropertyKey, unknown]>) {
      const out: Record<PropertyKey, unknown> = {};
      for (const [k, v] of entries) out[k] = v;
      return out;
    },
  });
}
if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    configurable: true, writable: true,
    value: function replaceAll(this: string, find: string | RegExp, rep: never) {
      if (find instanceof RegExp) return this.replace(find, rep);
      return this.split(String(find)).join(String(rep));
    },
  });
}
if (!Promise.allSettled) {
  Object.defineProperty(Promise, 'allSettled', {
    configurable: true, writable: true,
    value: function allSettled(ps: Iterable<unknown>) {
      return Promise.all(Array.from(ps, (p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason) => ({ status: 'rejected' as const, reason }))));
    },
  });
}
export {};
```

Add `globalThis`, `Object.hasOwn`, `.at()` and `findLast` shims **only if** something actually uses them — prefer just not using them. `structuredClone` and `WeakRef` should be avoided rather than shimmed (a correct `structuredClone` is large).

**Simplest alternative to shimming at all:** add an ESLint rule banning the unavailable methods and write `[].concat(...xs)` instead of `.flat()`, `Promise.all(xs.map(settle))` instead of `allSettled`. That is the genuinely lightest option and worth considering per-ticket.

### Versions read from the registry (2026-10-10)

`vite` 8.3.4 · `preact` 11.0.1 · `@preact/preset-vite` 2.10.6 · `typescript` 7.0.2 · `vitest` 5.0.3 · `@playwright/test` 1.64.0 · `msw` 3.0.2 · `happy-dom` 20.14.6 · `jsdom` 30.1.2 · `preact-iso` 2.12.2 · `wouter-preact` 3.13.0 · `@testing-library/preact` 3.2.4.

**To verify in implementation:** TypeScript **7.0.2** is a major the project has not pinned yet. The `.nvmrc` pins Node 22 but nothing pins TS. Decide deliberately between TS 7 and the 5.x line in ticket #2 — do not let it float.

---

## 2. Preact with `preact/compat`

### Vite alias configuration

**Use `@preact/preset-vite` and write no aliases.** Per the Preact docs: with Vite via `@preact/preset-vite`, "these aliases are automatically handled for you by default."

If you ever need them explicitly (e.g. in a bare `vitest.config.ts` that does not load the preset):

```ts
resolve: {
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
    'react-dom/test-utils': 'preact/test-utils',
    'react/jsx-runtime': 'preact/jsx-runtime',
  },
}
```

### TypeScript configuration

From the Preact docs verbatim (also recommends `skipLibCheck: true` and `baseUrl: "./"`):

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "skipLibCheck": true,
    "paths": {
      "react": ["./node_modules/preact/compat/"],
      "react/jsx-runtime": ["./node_modules/preact/jsx-runtime"],
      "react-dom": ["./node_modules/preact/compat/"],
      "react-dom/*": ["./node_modules/preact/compat/*"]
    }
  }
}
```

For first-party Preact code, prefer the automatic runtime so no `h` import is needed:

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "preact" } }
```

**[verified]** — this exact pair compiled and ran `.tsx` under Vitest.

Source: <https://preactjs.com/guide/v10/switching-to-preact>

### Which React APIs exist in Preact 11's compat — read from the shipped `.d.ts`

Rather than trusting docs, I unpacked `preact@11.0.1` and read `compat/src/index.d.ts` and `compat/src/*.js`. **[verified]**

**Present in `preact/compat`** — safe for tickets to use:
`useState` `useEffect` `useLayoutEffect` `useMemo` `useCallback` `useRef` `useReducer` `useContext` `useImperativeHandle` `useDebugValue` `useId` · `useSyncExternalStore` · `use(resource)` · `startTransition` `useTransition` `useDeferredValue` · `useInsertionEffect` (aliased to `useLayoutEffect`) · `useEffectEvent` · `memo` `forwardRef` `PureComponent` `Children` `cloneElement` `isValidElement` `createPortal` `createContext` · `Suspense` `lazy` · `flushSync` `unstable_batchedUpdates`.

`createRoot` / `hydrateRoot` are **not** in `preact/compat` — they live in **`preact/compat/client`** (a thin shim over `render`/`hydrate`).

**Absent — tickets must not use:**
`useActionState` · `useOptimistic` · `useFormStatus` · `cache` · `SuspenseList` · React Server Components / `'use server'` / `'use client'` directives · the React 19 `ref` cleanup-callback contract · Actions / form `action` props.

Notable semantic trap: **`StrictMode` is exported but aliased to `Fragment`** — it is a no-op. Do not rely on it to surface double-render bugs.

So, directly answering the brief: **`useSyncExternalStore` IS available** (good — `wouter-preact` depends on it), and **`use` IS available** in both `preact/compat` and `preact/hooks`.

### `preact/hooks` vs `preact/compat`

`preact/hooks` exports only: `useState` `useEffect` `useLayoutEffect` `useMemo` `useCallback` `useRef` `useReducer` `useContext` `useImperativeHandle` `useDebugValue` `useId` `useErrorBoundary`.

Guidance for this project: **import hooks from `preact/hooks` in first-party code** (smaller, 1.6 KB gzipped vs compat's 3.9 KB) and let `preact/compat` exist purely to satisfy third-party React libraries via the alias. That matches ADR 0003's goal of keeping a React migration cheap.

One exception to flag: **`useErrorBoundary` is Preact-specific and has no React equivalent.** ADR 0003 says to avoid Preact-only features outside the compat surface, so error boundaries should be written as a class component with `componentDidCatch` / `getDerivedStateFromError`, which works identically in both.

Measured gzipped sizes from the `preact@11.0.1` tarball: core `preact.mjs` **4.9 KB**, `preact/hooks` **1.6 KB**, `preact/compat` **3.9 KB**. **[verified]**

### Routing recommendation: `preact-iso`

| | `preact-iso` 2.12.2 | `wouter-preact` 3.13.0 |
| --- | --- | --- |
| Licence | MIT | Unlicense |
| Maintainer | Preact core team (`preactjs/preact-iso`) | `molefrog/wouter` |
| Source size (gzipped, pre-minify) | `router.js` **3.3 KB** | `index.js` 4.1 KB + `use-browser-location` 1.4 KB + `paths` 0.5 KB + `react-deps` 1.0 KB |
| Runtime deps | **none** (`router.js` imports only `preact` + `preact/hooks`) **[verified]** | `regexparam` |
| Route-level code splitting | **built in** — `lazy()` + `ErrorBoundary`, Suspense-integrated | bring your own |
| Preact 11 peer | `>=10 \|\| >=11.0.0-0` | `^10 \|\| ^11.0.0-0` |

**Recommend `preact-iso`.** Reasons: smallest, zero runtime deps, same maintainers as the framework, MIT, and its built-in `lazy()` is exactly the primitive several tickets need for per-route chunks — which I confirmed produces real separate chunks at `chrome68`.

Two concrete implementation notes:

- **Import `preact-iso/router`, not `preact-iso`.** The barrel (`.`) re-exports `prerender`, which imports `preact-render-to-string`. The `router` entry imports only `preact` and `preact/hooks`. **[verified]** by reading every `import` line in the tarball's `src/`.
- `preact-iso` lists `preact-render-to-string` in `peerDependencies` with **no `peerDependenciesMeta`**, so npm will install it into the tree. It tree-shakes out of the bundle if you only import `preact-iso/router`, but it will appear in `package-lock.json`. Harmless; worth knowing so nobody "fixes" it.

**On the arrow-key / URL requirements specifically:** neither library helps with arrow-key focus management — that is entirely the app's job (a focus-ring/spatial-navigation module, which no router provides). What the router must provide is real `history.pushState` URLs, and `preact-iso` does: it calls `history.pushState`/`replaceState` and listens for `popstate`. **[verified]** by reading `router.js`.

One behaviour to know about: `preact-iso`'s router calls `scrollTo(0, 0)` on a push navigation. For a TV UI with horizontally-scrolling rows and restored scroll position, that may need overriding. **To verify in implementation** — check whether it is configurable or needs patching around.

---

## 3. CSS for Chromium 68

### How CSS downleveling actually happens — read this before anything else

`build.cssMinify` defaults to **`'lightningcss'`**, and is forced to `false` when `build.minify` is disabled for the client build (<https://vite.dev/config/build-options>). `build.cssTarget` defaults to `build.target`.

**This means the downleveling below only happens when minification is on.** I confirmed the failure mode: with `build: { target: 'chrome68', minify: false }`, the emitted CSS was **byte-for-byte my source** — nesting unflattened, `:is()` raw, logical properties raw. **[verified]**

**Action for ticket #2:** never ship a production build with `minify: false`, and if a debug build is wanted, use `build.cssMinify: 'lightningcss'` explicitly alongside it.

Setting `css.transformer: 'lightningcss'` made **no difference** to the output versus the default at this target — the minifier already does the work. **[verified]** Don't bother.

### Safe — and auto-downleveled for you

Verified by building each one at `chrome68` and reading the emitted CSS. **[verified]**

| Feature | What ships at `chrome68` |
| --- | --- |
`clamp(a, b, c)` | → `max(a, min(b, c))` |
`min()` / `max()` | kept (Chrome 79 natively, but the fallback form above is generated where needed) |
Logical properties (`padding-inline`, `inset-inline-start`) | → physical `left`/`right`/`padding-left`/`padding-right`, **plus** `:lang()`-guarded RTL variants |
`:is()` / `:where()` | → duplicated rules with `:-webkit-any()` alongside `:is()` |
CSS nesting (`& .child`) | → flattened to `.parent .child` |
Space/slash color syntax `rgb(0 0 0 / 50%)` | → `#00000080` (8-digit hex, Chrome 62) |

### Safe natively — no fallback needed

Custom properties (49) · `display: grid` (57) · `display: flex` (29) · **`gap` in grid (66)** · `position: sticky` (56) · `scroll-behavior` (61) · `calc()` (26) · `@supports` (28) · `object-fit` (32) · `:focus-within` (60) · `will-change` (36) · `transform` (36) · `transition` (26) · `filter` (53) · `writing-mode` (48) · `overflow-anchor` (56) · `touch-action` (36) · `user-select` (54) · `grid-template-areas` (57) · `place-items` (59) · `@font-face { font-display }` (60) · `overscroll-behavior: contain|none` (63).

All from `@mdn/browser-compat-data`. **[verified]**

### NOT safe — hand-written fallback required

ADR 0002 already bans container queries and `dvh`. These are the **additional traps** it does not name:

#### `gap` in flexbox — Chrome 84 (the biggest trap)

ADR 0002 lists "flexbox `gap`" but it is worth stressing how asymmetric this is: **grid `gap` is Chrome 66 and safe; flex `gap` is Chrome 84 and silently does nothing.** `row-gap` in flex context is also 84. No fallback is generated. A row of cards with `display:flex; gap:16px` collapses to zero spacing on a 2020 TV.

```css
/* Prefer grid, where gap is native at 68 */
.row { display: grid; grid-auto-flow: column; gap: 16px; }

/* If flex is required, use margins and null the edge */
.row { display: flex; }
.row > * + * { margin-left: 16px; }
@supports (gap: 1px) and (display: flex) {
  /* not a reliable discriminator on its own — see note below */
}
```

Note: `@supports (gap: 1px)` is **true on Chrome 66+** because grid gap exists, so it does **not** discriminate flex gap. Use the margin pattern unconditionally, or gate on grid.

#### `aspect-ratio` — Chrome 88

Not polyfillable, kept raw. Use the padding-top ratio box:

```css
.poster { position: relative; }
.poster::before { content: ''; display: block; padding-top: 150%; } /* 2:3 */
.poster > img { position: absolute; inset-block: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
```
(Write `top:0; bottom:0; left:0` rather than `inset: 0` — see below.)

#### `:focus-visible` — Chrome 86

Kept raw, no `:-webkit-` fallback generated. On a TV every focus is effectively keyboard focus, so the pragmatic pattern is: style `:focus` as the visible ring, then *remove* it for mouse users where `:focus-visible` is understood.

```css
.card:focus { outline: 3px solid var(--accent); }
@supports selector(:focus-visible) {
  .card:focus { outline: none; }
  .card:focus-visible { outline: 3px solid var(--accent); }
}
```
`@supports selector()` is itself Chrome 83, so on 68 the `@supports` block is skipped and the plain `:focus` ring remains — which is the desired TV behaviour. This degrades in exactly the right direction.

#### `scroll-snap-*` — Chrome 69

Directly relevant since rows scroll horizontally, and **this is one version above the floor**, which makes it easy to get wrong. `scroll-snap-type`, `scroll-snap-align` and `scroll-padding` are all Chrome 69 and all ship raw.

ADR 0002 already names scroll snap as unavailable. The fallback: do row scrolling in JS. Since `scroll-behavior: smooth` **is** available (61), and `Element.scrollTo({ left, behavior: 'smooth' })` works, compute the target offset for the focused card yourself and scroll to it. This is better than snap for a TV anyway, because focus movement, not inertia, drives the scroll. Treat `scroll-snap` as "do not use at all" rather than "use with fallback" — a half-snapping row is worse than a consistently JS-driven one.

#### Others

| Feature | Chrome | Fallback |
| --- | --- | --- |
| `:has()` | 105 | restructure; add a class from JS |
| `inset` shorthand | 87 | write `top/right/bottom/left` longhands |
| `backdrop-filter` | 76 | solid or `rgba()` background |
| `content-visibility` | 85 | omit; it is an optimisation only |
| `text-wrap: balance/pretty` | 114 | omit |
| `subgrid` | 117 | nested explicit grid |
| `lh` / `rlh` units | 109 | `em` with a known line-height |

### Confirmed non-traps

- `woff2` fonts: Chrome 36. Safe.
- `overscroll-behavior: contain` / `none`: Chrome 63. Safe. (BCD lists the *property* as 144 because of a 2026 restructure; the individual values `auto`/`contain`/`none` are all 63, and the pre-144 entry is recorded as a partial implementation that "has no effect on scroll containers that have no scrollable overflow." Safe for the horizontal rows, which do overflow.) **[verified]**

---

## 4. Testing

### Vitest configuration for a Preact app

**jsdom vs happy-dom:** use **happy-dom**. It was ~2× faster in the scratch run and covers everything a Preact component test needs. Reach for jsdom only if a specific API is missing — it is a one-word change. Measured: `happy-dom` 20.14.6, `jsdom` 30.1.2.

`@testing-library/preact@3.2.4` declares `peerDependencies: { preact: ">=10 || ..." }` and depends on the older `@testing-library/dom@^8`. Preact 11 satisfies that range, but since the package has not been updated *for* Preact 11, I verified it end-to-end rather than assuming: render, `getByRole`, `fireEvent.click`, `findByText` and `cleanup` all behaved correctly under Vitest 5 + Preact 11 + happy-dom. **1 test passed.** **[verified]**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/fake-backend/global-setup.ts'],
  },
});
```

```ts
// test/setup.ts
import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';
afterEach(cleanup);
```

If you keep `@preact/preset-vite` out of the test config, the alternative that I verified works is `resolve.alias` for react→preact/compat plus `tsconfig`'s `jsx: "react-jsx"` / `jsxImportSource: "preact"`. **[verified]**

Source: <https://vitest.dev/config/>

### Playwright: desktop, phone and keyboard-only as projects

Viewport projects are straightforward. The interesting part is expressing "keyboard-only" *cleanly*, because Playwright has no built-in notion of it.

The clean mechanism is a **custom option** — `[defaultValue, { option: true }]` — which makes a value settable from a project's `use` block, combined with an auto-fixture that enforces it:

```ts
// test/fixtures.ts
import { test as base, expect } from '@playwright/test';

export type JellyflickOptions = { keyboardOnly: boolean };

export const test = base.extend<JellyflickOptions & { enforceKeyboardOnly: void }>({
  keyboardOnly: [false, { option: true }],

  // Auto-fixture: when the project is keyboard-only, make every pointer
  // interaction impossible, so an accidental .click() fails loudly instead
  // of quietly passing and hiding a focus-management bug.
  enforceKeyboardOnly: [
    async ({ page, keyboardOnly }, use) => {
      if (keyboardOnly) {
        await page.addInitScript(() => {
          const style = document.createElement('style');
          style.textContent = '*, *::before, *::after { pointer-events: none !important; }';
          document.addEventListener('DOMContentLoaded', () => document.head.append(style));
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import type { JellyflickOptions } from './test/fixtures';

export default defineConfig<JellyflickOptions>({
  testDir: './test/e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] }, // sets viewport, isMobile, hasTouch, UA together
    },
    {
      name: 'keyboard-only',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }, // TV-ish
        keyboardOnly: true,
      },
    },
  ],
  webServer: [ /* see below */ ],
});
```

Tests then import `test` from `./fixtures` and can read `keyboardOnly` as a fixture argument when a spec needs to branch. The same spec files run in all three projects; `--project=keyboard-only` runs just that one.

Why the pointer-events trick rather than trusting discipline: the whole point of a keyboard-only project is to catch controls reachable only by mouse. If `.click()` still works, the project proves nothing. Disabling pointer events makes Playwright's actionability check time out on any click, which is the failure you want.

Sources: <https://playwright.dev/docs/test-parameterize>, <https://playwright.dev/docs/test-webserver>

**To verify in implementation:** `devices['Pixel 7']` sets `isMobile: true`, which Chromium supports but which also forces touch emulation; if the phone-size tests only care about layout and not touch, prefer a plain `viewport: { width: 390, height: 844 }` and leave `isMobile` alone. Check which one the spec's phone-size tickets actually mean.

### The shared HTTP fake — recommendation: plain Node `http` server

The spec imposes three requirements. Scoring the options against them:

| | HTTP-level? | Records writes where **both** runners can assert? | Shared by Vitest **and** Playwright? |
| --- | --- | --- | --- |
| **Plain Node `http` server** | **Yes** — a real socket, real status codes, real headers | **Yes**, via a control endpoint | **Yes** — `globalSetup` + `webServer` |
| MSW (`setupServer` + `setupWorker`) | Node: yes. Browser: a service worker intercept — close, but not a real server | Awkward: in Playwright the recorder lives *inside the page*, so assertions must be bridged out via `page.evaluate` | Handlers shared, but two different adapters and two lifecycles |
| Playwright `page.route` | No — intercepted in-browser before the network | Recorder is in the test process, so Vitest cannot reach it | **No — Playwright only.** Fails outright |

Playwright route interception is disqualified by requirement 3. So the real choice is MSW vs a plain server.

MSW 3.0.2 is genuinely more attractive than it used to be — it now ships a **`msw/vite` plugin** exposing a `virtual:msw` module that "works both in the browser and in your server-side (SSR) code," serves the worker script itself so you never vendor `mockServiceWorker.js`, and excludes mocking from production builds (<https://mswjs.io/docs/integrations/vite>). Its `exports` map confirms separate `./node` and `./browser` entries with `browser: null` / `node: null` guards. **[verified]** from the registry.

**I still recommend the plain Node server, for three reasons specific to this project:**

1. **Write assertions cross the process boundary for free.** The fake holds recorded writes in memory and exposes them over HTTP:
   ```
   GET    /__fake/writes          → JSON array of { method, path, body, at }
   DELETE /__fake/writes          → reset between tests
   POST   /__fake/state           → seed fixtures for a test
   ```
   Vitest asserts by importing a helper; Playwright asserts with `request.get('/__fake/writes')` from the *test* process. One mechanism, both runners, no `page.evaluate` bridging. With MSW's browser adapter the recorder lives in the page and you must marshal it out.

2. **It will not fight the PWA service worker.** Ticket #36 makes the app installable, which means registering a service worker. MSW's browser mode registers *its own* service worker on the same scope. Two service workers contending for one scope is a real, hard-to-debug clash, and it would mean the E2E suite exercises a different service-worker configuration than production. The plain server avoids the question entirely.

3. **It composes with the delivery design.** `delivery.md` establishes that the app reads its Jellyfin base URL from a runtime config file written at container start. The E2E suite points that same indirection at `http://127.0.0.1:<fakePort>`. The fake is wired in by exactly the mechanism production uses, so the tests exercise the real configuration path rather than a test-only interception layer. This is a meaningful correctness win.

Wiring, both runners, one server module:

```ts
// test/fake-backend/global-setup.ts  (Vitest)
import type { TestProject } from 'vitest/node';
import { startFakeBackend } from './server';

export default async function setup(project: TestProject) {
  const fake = await startFakeBackend({ port: 0 });
  project.provide('fakeBaseUrl', fake.url);   // tests read it with inject('fakeBaseUrl')
  return async () => { await fake.close(); };
}
```
`globalSetup` may export `setup`/`teardown`, or a default function returning a teardown; the first argument is the test project, which carries `provide()`, read back in tests via `inject` (<https://vitest.dev/config/globalsetup>). **[verified]** against the docs.

```ts
// playwright.config.ts — webServer accepts an array
webServer: [
  {
    name: 'fake-backend',
    command: 'node --import tsx test/fake-backend/bin.ts --port 8787',
    url: 'http://127.0.0.1:8787/__fake/health',
    reuseExistingServer: !process.env.CI,
  },
  {
    name: 'app',
    command: 'npm run preview -- --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
],
```
The array form and the `name` / `url` / `reuseExistingServer` / `gracefulShutdown` options are documented at <https://playwright.dev/docs/test-webserver>.

Cost of this choice: you hand-write the route table instead of using MSW's `http.get()` DSL. For a fake of one server's endpoints that is a small, readable file, and it is the thing the spec wants faked at the HTTP level anyway.

---

## 10. Internationalisation

### `Intl` on Chromium 68

From `@mdn/browser-compat-data`. **[verified]**

**Available:** `Intl.NumberFormat` (24) · `Intl.DateTimeFormat` (24) · `Intl.PluralRules` (**63**) · `Intl.getCanonicalLocales` (54) · `Intl.Collator`.

**Not available:** `Intl.RelativeTimeFormat` (71) · `Intl.ListFormat` (72) · `Intl.Locale` (74) · `Intl.Segmenter` · `Intl.DurationFormat`.

So plurals, numbers and dates — the overwhelming majority of a media UI's formatting needs — are **native**. Only "3 days ago"-style relative times and "A, B and C" lists are missing.

**`@formatjs` polyfills are therefore mostly unnecessary.** If relative times are wanted, the honest options are (a) `@formatjs/intl-relativetimeformat` — 12 MB unpacked, nearly all locale data, you import only the locales you need but it is still the heaviest single dependency in the app, or (b) write the six-line `Math.round(diff / 86400)` + `t('daysAgo', { n })` function and skip the dependency. **Recommend (b).** Same for lists: `arr.join(', ')` with a final "and" is a three-line function.

### Library comparison

| | Verdict |
| --- | --- |
| **`preact-i18n` 1.5.0** | **Disqualified.** `peerDependencies: { preact: "<10" }` — it does not support Preact 10, let alone 11. Last published 2022-06-24. **[verified]** from the registry. Do not consider it. |
| **`@lingui/core` 6.9.1** | 30 KB unpacked, well maintained. But it needs `@lingui/babel-plugin-lingui-macro` in the build, a `.po`/catalogue compile step, and a CLI in CI. That is real build complexity for a project whose stated top priority is staying lightweight. |
| **Hand-rolled typed dictionary** | **Recommended.** |

### Recommended shape

```ts
// src/i18n/en.ts — the source of truth for the key set
export const en = {
  'nav.home': 'Home',
  'player.subtitles': 'Subtitles',
  'library.itemCount': (n: number) =>
    `${new Intl.NumberFormat().format(n)} ${new Intl.PluralRules().select(n) === 'one' ? 'item' : 'items'}`,
} as const;

export type Messages = typeof en;
export type MessageKey = keyof Messages;
```

```ts
// src/i18n/es.ts — TypeScript enforces exhaustiveness against the English keys
import type { Messages } from './en';
export const es: Messages = { /* every key, or it fails typecheck */ };
```

```ts
// src/i18n/index.ts — locales load as separate chunks via dynamic import
const loaders: Record<string, () => Promise<{ default: Messages }>> = {
  en: () => import('./en').then((m) => ({ default: m.en })),
  es: () => import('./es').then((m) => ({ default: m.es })),
};
```

Why this wins here: **zero runtime bytes** beyond the strings themselves; the compiler guarantees no locale is missing a key or has a stale one (a thing no runtime library gives you); `Intl.PluralRules` does the genuinely hard part natively on Chromium 68; and each locale is a lazy chunk via the dynamic `import()` already confirmed working at `chrome68`. Use a Preact context + a `useT()` hook over the loaded dictionary.

**To verify in implementation:** webOS builds are sometimes compiled against a reduced ICU dataset, which would make `Intl.PluralRules`/`NumberFormat` correct only for a subset of locales even though the constructors exist. BCD records what desktop Chrome 68 shipped, not what LG shipped. Verify on real hardware during the TV port, and keep a hard-coded English plural fallback behind a try/catch in the meantime.

---

## 11. Self-hosted condensed display font

### Bebas Neue: licence confirmed, self-hosting permitted

- Upstream: <https://github.com/dharmatype/Bebas-Neue> — version 2.000 "is licensed under the SIL Open Font License v1.1", with `OFL.txt` in the repo. Fonts in `fonts/` (`.eot`, `.otf`, `.ttf`, `.woff`, `.woff2`), sources in `sources/`.
- Google Fonts: the family lives at **`ofl/bebasneue/`** in the `google/fonts` repo — the `ofl/` directory is itself the licence classification — and its `METADATA.pb` reads `license: "OFL"`, `designer: "Ryoichi Tsunekawa"`, `copyright: "Copyright 2019 The Bebas Neue Project Authors"`, `date_added: "2019-10-16"`, `subsets: latin, latin-ext, menu`. **[verified]** by reading `METADATA.pb` and the directory listing through the GitHub API.

OFL 1.1 permits bundling and self-hosting: use, study, modify and redistribute, including embedding in and shipping with a product. The practical obligations are that the font must not be sold on its own, and the licence must travel with any redistributed copy of the font file — so **ship `OFL.txt` alongside the `.woff2`** in the repo and in the container image, and credit the family in an about/licences screen.

**Important limitation:** `METADATA.pb` lists a single face — weight 400, style normal, `BebasNeue-Regular.ttf`. There is **no bold, no italic, no variable axis**. Browsers will synthesise a fake bold, which looks poor on a condensed display face. Plan the type scale around one weight, differentiating by size and letter-spacing rather than weight. (The Bebas Neue *Pro*/*Exp* families have more weights but are a separate commercial product and are **not** covered by this OFL release.)

### Where to get the files

Take the `.woff2` from the upstream `fonts/` directory of `dharmatype/Bebas-Neue` (it ships `.woff2` directly, so no conversion step), or the `.ttf` from `google/fonts` `ofl/bebasneue/` and subset it with `fonttools`/`glyphhanger` to latin + latin-ext. Vendor it into the repo at `public/fonts/` or `src/assets/fonts/` and commit it — do **not** link `fonts.googleapis.com`: the app must work on a LAN with no internet, and a third-party font request is also a privacy leak.

Only ship `.woff2`. It is Chrome 36+, so the whole target range including Chromium 68 is covered, and a `.woff` fallback would only add weight for no reachable browser.

### `@font-face` pattern

```css
@font-face {
  font-family: 'Bebas Neue';
  src: url('/fonts/bebas-neue-v2-latin-ext-400.woff2') format('woff2');
  font-weight: 400;          /* the only weight that exists */
  font-style: normal;
  font-display: swap;        /* Chrome 60 — safe at 68 */
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2074,
                 U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215;
}

:root {
  /* Always name a real fallback stack: the TV may fail to load the file,
     and a condensed fallback keeps the layout from reflowing wildly. */
  --font-display: 'Bebas Neue', 'Haettenschweiler', 'Arial Narrow', 'Impact', sans-serif;
  --font-ui: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
}

h1, h2, .hero-title { font-family: var(--font-display); letter-spacing: 0.02em; }
```

`font-display: swap` is the right choice over `optional`/`fallback`: the font is served from the same origin as the app (no third-party latency), and on a TV a brief fallback flash is much better than silently never applying the display face. Preload it if the hero title is above the fold:

```html
<link rel="preload" href="/fonts/bebas-neue-v2-latin-ext-400.woff2" as="font" type="font/woff2" crossorigin>
```

Keep `crossorigin` even for a same-origin font — fonts are fetched in CORS mode, and omitting it causes a double download.

### Alternatives with the same look and a permissive licence

All verified as `license: "OFL"` in `google/fonts` by reading each `METADATA.pb`. **[verified]**

| Family | Notes |
| --- | --- |
| **Oswald** | **Best alternative.** Condensed gothic, very close in feel, and `METADATA.pb` declares `axes {` — it is a **variable font with a real weight axis**, which solves Bebas Neue's single-weight problem. Recommend this if the design needs more than one weight. |
| **Anton** | Single weight, heavier and tighter than Bebas Neue. Good for a poster/hero face only. |
| **Archivo Narrow** | Variable (`axes {`). More neutral and more legible at small sizes; less "display". |
| **Fjalla One** | Single weight, condensed, slightly more humanist. |
| **Barlow Condensed** | Many static weights, lower contrast, reads as UI rather than display. |
| **Saira Condensed** | Many static weights, more geometric. |
| **Roboto Condensed** | Variable. The safe, characterless choice. |

Note that Bebas Neue is uppercase-focused (its lowercase is a small-caps-like design), which is part of the look but makes it unsuitable for body or metadata text. Pair it with a UI face — the system stack above costs nothing to ship.
