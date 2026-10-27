# Jellyflick player, subtitle and casting research

Scope: hls.js, ASS/PGS/VTT subtitle rendering, Chromecast + AirPlay, picture-in-picture, playback speed, PWA installability.
Companion files: `toolchain.md` (build, CSS, testing, i18n, fonts), `delivery.md` (container, CI, GHCR).

All versions read from the registry or package tarballs on **2026-10-10**. Support floors come from a locally installed `@mdn/browser-compat-data`, so they are exact BCD `version_added` values rather than caniuse approximations. Claims marked **[verified]** were reproduced by reading package source or running code.

**Baseline for everything below: Chromium 68** (LG webOS 5, per ADR 0002).

---

## Recommendations

1. **hls.js 1.7.3, the FULL build — not `hls.js/light`.** The light build "does not include alternate-audio, subtitles, ... EME (DRM)", which are core Jellyflick features. Cost: ~184 KB gzipped, lazy-loaded.
2. **Try `Hls.isSupported()` BEFORE `canPlayType()`.** Per hls.js's own README, `canPlayType('application/vnd.apple.mpegurl')` returns a truthy `"maybe"` in Chrome too, so native-first detection picks the wrong path.
3. **ASS/SSA: `libass-wasm` (JavaScriptSubtitlesOctopus) 4.1.0, NOT JASSUB.** JASSUB's own README states "JASSUB supports Chrome/Safari/Firefox 80/17/105" — it requires OffscreenCanvas (Chrome 69) and `requestVideoFrameCallback` (Chrome 83). **It cannot run on Chromium 68.** This is the single biggest finding in this file. See §6 for the maintenance trade-off this forces.
4. **PGS/VobSub image subtitles: `libpgs` 0.9.0 exists and is a good fit.** MIT, 68 KB, has a built-in `timeOffset`, and auto-degrades to a `workerWithoutOffscreenCanvas` mode that works on Chromium 68. **[verified]** by reading its `.d.ts` files.
5. **SRT/VTT: parse with a native `<track>` in `mode = 'hidden'`, then draw the cues yourself.** This gets the browser's VTT parser for free while suppressing native rendering, which is exactly what a live time offset needs. All APIs involved are Chrome 23–33.
6. **Picture-in-picture is Chrome 69 — NOT available on Chromium 68.** Feature-detect and hide the control. The brief assumed it was available.
7. **Cast: load `https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1` on demand**, guarded by `window.__onGCastApiAvailable`. Do **not** hardcode a receiver id — read it from the Jellyfin server. Jellyfin's published ids are **`F007D354` (Stable)** and **`6F511C87` (Unstable)**, read from the server's source. **[verified]**
8. **AirPlay: prefer the standard Remote Playback API** (`video.remote.watchAvailability()`, Safari 13.1+), with the `WebKitPlaybackTargetAvailabilityEvent` + `webkitShowPlaybackTargetPicker()` pair as the fallback for older Safari.
9. **PWA: a service worker is NOT required for installability.** Ship a manifest and icons only. A minimal hand-written `sw.js` is needed **only** if ticket #36 wants a custom in-app install button driven by `beforeinstallprompt`. **No Vite plugin needed** — `vite-plugin-pwa` is for precaching, which this app explicitly does not want.
10. **Playback speed needs nothing.** `HTMLMediaElement.playbackRate` is Chrome 3.

---

## 5. hls.js

### Version, licence, sizes

`hls.js@1.7.3`, **Apache-2.0**, published 2026-10-08 (actively maintained — 16,970 stars, `video-dev/hls.js` pushed the same day). **[verified]** from the registry and GitHub API.

Measured from the tarball with `gzip -c`: **[verified]**

| File | Raw | **Gzipped** |
| --- | --- | --- |
| `dist/hls.min.js` (full, UMD) | 605.2 KB | **184.3 KB** |
| `dist/hls.light.min.js` (light, UMD) | 376.7 KB | **116.6 KB** |
| `dist/hls.mjs` (full, ESM, unminified) | 1450.2 KB | 339.5 KB |
| `dist/hls.light.mjs` (light, ESM, unminified) | 926.5 KB | 220.4 KB |

The `.mjs` files are unminified — they are what Vite resolves via the `exports` map (`"." → { import: "./dist/hls.mjs" }`) and Vite will minify them, so budget around the `min.js` figures. **[verified]** `exports` map confirms `.` and `./light` entries.

### Browser support floor: works on Chromium 68

From the README's Compatibility section verbatim:

> HLS.js is only compatible with browsers supporting MediaSource extensions (MSE) API with 'video/MP4' mime-type inputs.

and it lists **"Chrome 47+ for Desktop"** among supported browsers. BCD puts `api.MediaSource` at Chrome 31. So **Chromium 68 is comfortably supported** — ~21 versions above the stated floor. **[verified]**

### Is a lighter build suitable? No.

A direct quote from the README is decisive:

> `hls.light.*.js` dist files do not include alternate-audio, subtitles, CMCD, EME (DRM), Variable Substitution, Interstitials, I-frame trick-play, Media Capabilities, or MPEG-2 TS advanced codec (HEVC and AC-3) support.

The excluded classes include `AudioStreamController`, `AudioTrackController`, `SubtitleStreamController`, `SubtitleTrackController`, `TimelineController` and `EMEController`. **[verified]** read from the tarball README.

Jellyflick needs multi-audio-track selection and subtitle tracks, so **the light build is disqualified** — it would save 68 KB gzipped at the cost of two headline features. Use the full build and pay for it with lazy loading.

(Also note HEVC/AC-3 in MPEG-2 TS are excluded from light, which matters for a media server that will encounter those codecs.)

### Native HLS detection — get the order right

The README carries an explicit warning that contradicts the naive approach:

> **Note:** `video.canPlayType('application/vnd.apple.mpegurl')` returns a non-empty string ("maybe") in Safari, Chrome, and potentially other browsers. However, not all browsers support HLS content equally — for example, Chrome 147 reports support but may fail to play certain streams natively. Using `Hls.isSupported()` first (the default setup above) is recommended unless you specifically need native playback.

So the correct policy, and the one the player ticket should implement:

```ts
export type HlsStrategy = 'hlsjs' | 'native' | 'none';

export function chooseHlsStrategy(video: HTMLVideoElement, HlsCtor: typeof import('hls.js').default): HlsStrategy {
  // MSE first: it is the predictable path and is what hls.js recommends.
  if (HlsCtor.isSupported()) return 'hlsjs';
  // Only then fall back to native, which is the real path on iOS Safari,
  // where MSE is unavailable but native HLS is excellent.
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native';
  return 'none';
}
```

Caveat to encode in the ticket: `canPlayType` returns `""` | `"maybe"` | `"probably"`. Treat any non-empty string as support, and never treat `"maybe"` as better than MSE.

### Lazy-loading hls.js only when needed

The import must not be in the initial graph. Dynamic `import()` is confirmed working at `build.target: 'chrome68'` and produces a genuine separate chunk (see `toolchain.md` §1). **[verified]**

```ts
// src/player/load-hls.ts
let cached: Promise<typeof import('hls.js')> | undefined;

/** Loads hls.js at most once, and only when an HLS source actually needs MSE. */
export function loadHls() {
  // Cache the promise, not the module: concurrent callers share one fetch.
  cached ??= import('hls.js');
  return cached;
}
```

```ts
// at the call site
const needsMse = source.container === 'hls' && !canPlayNativeHls(video);
if (needsMse) {
  const { default: Hls } = await loadHls();
  const hls = new Hls({ enableWorker: true });
  hls.loadSource(url);
  hls.attachMedia(video);
}
```

Three notes:
- `??=` is downleveled correctly at `chrome68`. **[verified]**
- `enableWorker: true` moves demuxing off the main thread. `Worker` is Chrome 2, so this is safe and valuable on a weak TV SoC. hls.js ships `dist/hls.worker.js` (115.5 KB) but the modern builds inline the worker, so no extra URL plumbing is normally needed. **To verify in implementation** — confirm the worker is inlined under Vite 8/rolldown rather than requiring a `?worker&url` import.
- Do not `await loadHls()` at module scope; top-level `await` is unavailable on Chromium 68 and the build only warns (see `toolchain.md` §1).

---

## 6. Subtitle rendering

### 6a. ASS/SSA — the maintained library does not work on our target

This is the most consequential finding in this file, and it needs a deliberate decision in the player tickets.

#### JASSUB 2.5.18 — actively maintained, but Chrome 80+

`jassub@2.5.18`, published 2026-10-03, repo `ThaUnknown/jassub` pushed the same day. Licence is a compound: `LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0` (it is libass + freetype + fontconfig + harfbuzz + fribidi compiled to WASM; the repo itself is MIT). **[verified]** from the tarball's `package.json` and the GitHub API.

> **Corrected by #48, which read the shipped binaries rather than the manifest.** The
> compound identifier above is accurate, but the parenthesised list of what is inside is
> not: **`fontconfig` is not in the build.** No fontconfig symbol appears in either
> `jassub-worker.wasm` or `jassub-worker-modern.wasm` — JASSUB does its own font
> selection. What is there is libass, FreeType, HarfBuzz 8.5.0 and FriBidi 1.0.16.
> #48 also found three components this line does not mention whose bytes reach a browser:
> `abslink` (Apache-2.0), `lfa-ponyfill` (MIT) and `rvfc-polyfill` (**GPL-3.0**, see #57),
> plus the Liberation Sans 2.00.5 fallback font. The authoritative inventory is
> `public/licences/NOTICE.txt`.
>
> **#57 then removed `rvfc-polyfill` from the build** — `vite.config.ts` aliases it to an
> empty module, because GPL-3.0 on the combined work would have constrained Jellyflick's
> own licence. One consequence lands on the table below: the
> `requestVideoFrameCallback` row is now a hard requirement the browser must meet itself,
> and it rules out more than Chromium 68. **Firefox shipped rVFC only in 132**, so
> Firefox 105-131 — which has `transferControlToOffscreen` — flattens to plain text, as
> does Chrome 80-82. See `architecture.md`, "No strong copyleft in the bundle".

From its README, verbatim:

> At minimum WASM + TextDecoder + OffscreenCanvas + Web Workers + Proxy + Fetch + Promise + getVideoPlaybackQuality/requestVideoFrameCallback are required for JASSUB to work.
>
> JASSUB supports Chrome/Safari/Firefox 80/17/105, you bring the support down to 67/16.2/68 if you enable some flags/settings in your browser for these features.

Cross-checking those requirements against BCD: **[verified]**

| Requirement | First Chrome | On 68? |
| --- | --- | --- |
| `OffscreenCanvas` | **69** | **No** |
| `HTMLCanvasElement.transferControlToOffscreen` | **69** | **No** |
| `HTMLVideoElement.getVideoPlaybackQuality` | **80** | **No** |
| `HTMLVideoElement.requestVideoFrameCallback` | **83** | **No** |
| WASM, `TextDecoder`, Workers, Proxy, Fetch, Promise | ≤ 57 | Yes |

**Conclusion: JASSUB cannot run on Chromium 68.** The floor of 67 the README mentions is explicitly "if you enable some flags/settings in your browser", which is not available on a sealed TV. Do not plan around it.

(JASSUB does ship two WASM builds — `jassub-worker.wasm` 2.0 MB non-SIMD and `jassub-worker-modern.wasm` 2.1 MB SIMD — and picks between them, so the *WASM* side would have degraded fine. It is the canvas and video-frame APIs that rule it out. **[verified]** by reading `dist/jassub.js`.)

#### libass-wasm 4.1.0 (JavaScriptSubtitlesOctopus) — works on 68, but stale on npm

`libass-wasm@4.1.0`, repo `libass/JavascriptSubtitlesOctopus` — i.e. it lives under the **official libass GitHub organisation**. Same compound licence as JASSUB. **[verified]**

Why it works where JASSUB does not: it renders to **a single ordinary `<canvas>`** — "Doesn't use DOM manipulations and render subtitles on single canvas" — and I confirmed by grepping the whole `dist/` that it contains **zero references to `OffscreenCanvas`, `transferControlToOffscreen`, `requestVideoFrameCallback` or `SharedArrayBuffer`**. **[verified]** It also ships an asm.js fallback worker (`subtitles-octopus-worker-legacy.js`, 4.7 MB) for engines without WASM, which is not needed here but indicates how conservative the build is.

It has exactly the API the offset requirement needs: a `timeOffset` option and a `setCurrentTime(t)` method. **[verified]** by grepping `dist/js/*.js`.

Dist sizes: `subtitles-octopus.js` 74.9 KB + `subtitles-octopus-worker.js` 390.3 KB + `subtitles-octopus-worker.wasm` **2251.8 KB**. **[verified]**

**The honest maintenance picture**, which the tickets must accept:
- Last **npm publish: 2022-12-04** — nearly four years stale. **[verified]** from `npm view libass-wasm time.modified`.
- The **repo is not archived** and was **pushed 2024-09-11**, with 28 open issues and 6 open PRs, but the GitHub **Releases section is empty** — so the repo has moved on from what npm has. **[verified]** via the GitHub API and a fetch of the repo page.
- It carries no deprecation notice and does **not** point users at JASSUB. **[verified]**

So: the only ASS renderer that runs on the project's minimum target is one whose npm release is four years old. That is a genuine risk and should be recorded as such rather than smoothed over.

#### Recommended approach: a renderer seam with a capability gate

Do not pick one. Define a small interface and choose at runtime, because the web build (modern Chrome/Safari) and the future TV build have genuinely different best answers:

```ts
export interface AssRenderer {
  setTimeOffset(seconds: number): void;   // live offset, no reload
  setTrack(content: string): void;
  destroy(): void;
}

function canUseJassub(): boolean {
  return typeof OffscreenCanvas !== 'undefined'
    && 'transferControlToOffscreen' in HTMLCanvasElement.prototype
    && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}
```

- Modern browsers → **JASSUB**, lazy-loaded. Maintained, faster (WebGL), and the long-term path.
- Chromium 68 / webOS 5 → **libass-wasm**, lazy-loaded. The only option.
- Neither → fall back to the app-drawn text renderer from §6c, accepting loss of ASS positioning and styling. For many library items this is acceptable; for hard-subbed anime it is not. Surface it in the UI rather than failing silently.

Both are lazy-loaded the same way, and both need their worker + WASM as separate asset URLs:

```ts
// JASSUB
const { default: JASSUB } = await import('jassub');
const workerUrl = (await import('jassub/dist/jassub-worker.js?worker&url')).default;
const wasmUrl = (await import('jassub/dist/jassub-worker.wasm?url')).default;
new JASSUB({ video, subContent, workerUrl, wasmUrl, timeOffset });
```
(The `?worker&url` / `?url` pattern is JASSUB's own documented bundler escape hatch, quoted from its README.)

**Licence obligation for either:** both bundle LGPL-2.1 libass. Shipping the WASM binary is distribution, so the container image and the repo must carry the licence texts (`libass-wasm` ships a 46 KB `dist/js/COPYRIGHT` for exactly this). Add them to the about/licences screen. **[verified]** that file exists.

**To verify in implementation:** the ~2.3 MB WASM binary on a 2020 TV over LAN — measure decode + instantiate time before committing the ASS feature to the TV build. There is no primary source for webOS 5 WASM compile throughput.

### 6b. Image subtitles (PGS / VobSub) — `libpgs` exists and fits

The brief asked me to report honestly if nothing suitable exists. Something does, and it is a good fit.

`libpgs@0.9.0`, **MIT**, repo `Arcus92/libpgs-js`, published **2026-08-27** (actively maintained). `dist/libpgs.js` 68.6 KB + `dist/libpgs.worker.js` 64.4 KB — small, because PGS decoding is RLE bitmap work, not a font engine. **[verified]** from the tarball.

I read its TypeScript declarations rather than its docs, and the API maps onto the requirements almost exactly: **[verified]**

```ts
interface PgsRendererOptions {
  video?: HTMLVideoElement;        // syncs to the video automatically
  canvas?: HTMLCanvasElement;      // or creates one next to the video
  timeOffset?: number;             // "The video-to-subtitle time offset in seconds"
  aspectRatio?: 'contain' | 'cover' | 'fill';  // match the video's object-fit
  subUrl?: string;
  workerUrl?: string;
  mode?: PgsRendererMode;
}
```

Critically, it has a three-way renderer mode with **automatic platform detection**:

```ts
enum PgsRendererMode {
  worker = 'worker',                               // needs OffscreenCanvas
  workerWithoutOffscreenCanvas = 'workerWithoutOffscreenCanvas',
  mainThread = 'mainThread',
}
class BrowserSupport {
  static isWorkerSupported(): boolean;
  static isOffscreenCanvasSupported(): boolean;    // checks transferControlToOffscreen
  static getRendererModeByPlatform(): PgsRendererMode;  // "the optimal mode for the current platform"
}
```

Since `OffscreenCanvas` and `transferControlToOffscreen` are Chrome 69, `getRendererModeByPlatform()` will select **`workerWithoutOffscreenCanvas`** on Chromium 68 — decode in a worker, draw on the main thread. `Worker` is Chrome 2, so that path is fully available. **This library degrades correctly onto our target without any work from us.** Let it auto-detect; do not force `mode`.

It also exposes `renderAtTimestamp` for driving the canvas manually without a video element, which is useful for tests.

**VobSub (DVD `.sub`/`.idx`) is a different format and `libpgs` does not cover it.** I found no maintained client-side VobSub renderer. Honest answer: **do not render VobSub client-side.** Ask the server to burn it in or convert it (the Jellyfin API agent's territory), and in the UI treat VobSub tracks as "server-side only". Writing a VobSub decoder in app code is a multi-week project for a format that is rare in modern libraries — do not take it on.

**To verify in implementation:** `libpgs` is at `0.9.0`, i.e. pre-1.0, with a single maintainer. Pin it exactly and test against real Jellyfin PGS extraction output before relying on it for a shipped feature.

### 6c. Plain SRT/VTT drawn by the app, with a live offset

The project must draw these itself so an offset can be applied live. The key technique, which avoids writing a VTT parser:

#### Use a native `<track>` in `mode = 'hidden'` to parse, and render yourself

Setting `textTrack.mode = 'hidden'` makes the browser **parse the file and maintain `cues`/`activeCues` and fire `cuechange`, while rendering nothing**. You get the platform's battle-tested WebVTT parser and draw the output yourself.

Every API involved is ancient and safe on Chromium 68 (BCD): `TextTrack.mode` **23**, `TextTrack.cuechange` event **23**, `TextTrack.cues` / `activeCues` **23**, `TextTrackCue.startTime` **23**, `HTMLMediaElement.textTracks` **23**, `HTMLMediaElement.addTextTrack` **23**, `VTTCue` constructor **33**, `HTMLTrackElement.track` **23**. **[verified]**

```ts
// Parse via the platform, render via the app.
const trackEl = document.createElement('track');
trackEl.kind = 'subtitles';
trackEl.src = vttUrl;        // Jellyfin can serve VTT; see note below
video.append(trackEl);
trackEl.track.mode = 'hidden';   // parsed, NOT rendered by the browser
```

#### But `cuechange` cannot carry a live offset — drive from `requestAnimationFrame`

This is the crucial design point. `activeCues` is computed by the browser against `video.currentTime` with **no offset hook**. If you render on `cuechange`, changing the offset does nothing until the next natural cue boundary.

So read the *parsed* cue list once, and do active-cue selection yourself against a shifted clock:

```ts
type Cue = { start: number; end: number; text: string };

function toCueList(track: TextTrack): Cue[] {
  // track.cues is a TextTrackCueList, not an array — Array.from it.
  return Array.from(track.cues ?? [], (c) => {
    const v = c as VTTCue;
    return { start: v.startTime, end: v.endTime, text: v.text };
  }).sort((a, b) => a.start - b.start);
}

function startRenderLoop(video: HTMLVideoElement, cues: Cue[], getOffset: () => number, draw: (text: string) => void) {
  let last = '';
  let raf = 0;
  const tick = () => {
    const t = video.currentTime - getOffset();   // offset applies on the NEXT frame
    // cues are sorted; a binary search or a moving index beats a filter on long tracks
    const text = cues.filter((c) => t >= c.start && t < c.end).map((c) => c.text).join('\n');
    if (text !== last) { draw(text); last = text; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
```

Changing the offset now takes effect within one frame, which is what the feature requires. Keep a moving index rather than `filter()` over the whole list for long tracks — a 2-hour film can have 2,000+ cues and this runs 60×/second on a weak TV SoC.

#### Pitfalls of app-drawn versus native `<track>`

Worth writing into the ticket, because these are the costs being accepted in exchange for the live offset:

1. **You reimplement WebVTT *rendering*, not parsing.** VTT positioning (`line`, `position`, `align`, `vertical`, `size`, region support) and inline markup (`<b>`, `<i>`, `<u>`, `<c.classname>`, `<v Speaker>`, ruby) are all yours. Most library subtitles use none of it, so a pragmatic subset — centred, bottom-anchored, `<b>`/`<i>` only — covers nearly everything. Decide the subset explicitly rather than discovering it.
2. **`cue.text` is raw VTT markup, not plain text.** Do **not** inject it with `innerHTML`: subtitle files are untrusted input from a media library. Either strip tags to plain text and use `textContent`, or parse the small allowed tag set into elements yourself. This is a genuine XSS vector.
3. **Fullscreen.** Native cues are rendered by the browser *inside* the fullscreen video. An app-drawn overlay must be a DOM sibling inside the element that goes fullscreen, or it vanishes on fullscreen. Make the player container the fullscreen element, never the `<video>` itself.
4. **Cross-origin `<track>` needs CORS.** A `<track src>` on another origin requires `crossorigin` on the `<video>` and correct CORS headers, or the track fails to load silently. Since Jellyfin is a different origin from the app in this deployment, this *will* bite. Alternative that sidesteps it: `fetch()` the VTT yourself (with credentials as needed), then `URL.createObjectURL(new Blob([text], { type: 'text/vtt' }))` and point the `<track>` at the blob — same-origin, no CORS on the track element.
5. **You lose native OS/TV subtitle styling preferences**, which some users rely on for accessibility. Compensate with in-app size/colour/background settings.
6. **Sizing.** Draw into a DOM overlay (absolutely positioned div) rather than a canvas: text layout, wrapping and font fallback come free, it scales with CSS, and it is screen-reader-visible. Reserve canvas for PGS (images) and libass (which needs it).
7. **SRT is not natively parseable.** `<track>` accepts WebVTT only. Jellyfin can convert subtitles to VTT server-side, which is the right answer; a fallback SRT→VTT converter is ~20 lines (replace `,` with `.` in timestamps, prepend `WEBVTT\n\n`, drop cue numbers) if a raw SRT ever has to be handled. The Jellyfin-side conversion endpoint is the other agent's scope.

---

## 7. Chromecast + AirPlay

### 7a. Chromecast sender

#### Script URL and the on-demand loading pattern

The CAF Web Sender script, quoted from Google's docs:

```html
<script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>
```

`loadCastFramework=1` is what loads the Cast Application Framework (`cast.framework.*`) on top of the base `chrome.cast.*` API. (The brief's `loadWithCastFramework` is not the real parameter name — it is `loadCastFramework`.) Sources: <https://developers.google.com/cast/docs/web_sender>, <https://developers.google.com/cast/docs/web_sender/integrate>

The SDK signals readiness through a global that must be installed **before** the script, which makes on-demand loading straightforward:

```ts
let castLoad: Promise<boolean> | undefined;

/** Loads the Cast sender SDK at most once. Resolves false if Cast is unavailable. */
export function loadCastSdk(): Promise<boolean> {
  castLoad ??= new Promise<boolean>((resolve) => {
    // The SDK calls this with isAvailable once it has initialised.
    (window as any).__onGCastApiAvailable = (isAvailable: boolean) => resolve(isAvailable);
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.onerror = () => resolve(false);   // offline / blocked: never reject, just no Cast
    document.head.append(s);
  });
  return castLoad;
}
```

Google's documented handler shape, verbatim:

```javascript
window['__onGCastApiAvailable'] = function(isAvailable) {
  if (isAvailable) {
    initializeCastApi();
  }
};
```

and initialisation:

```javascript
cast.framework.CastContext.getInstance().setOptions({
  receiverApplicationId: applicationId,
  autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
});
```

#### Detecting Cast availability *without* loading the SDK

There is **no API that answers this without the SDK** — device discovery is what the SDK does. Google's docs offer no pre-check. So the honest pattern is a cheap *gate* followed by the real check:

1. **Cheap gate (no network):** Cast only works in Chromium-family browsers with the Cast implementation built in. `typeof window.chrome === 'object'` plus a Chromium UA check is the available signal. Jellyfin itself does exactly this — its plugin bails with `if (!chrome) { console.warn('Not initializing chromecast: chrome object is missing'); return; }`. **[verified]** by reading `jellyfin-web/src/plugins/chromecastPlayer/plugin.js`.
2. **Real check:** load the SDK and use `__onGCastApiAvailable(isAvailable)`. If `false`, never show the Cast button.
3. **Device presence:** after init, `CastContext.getInstance().getCastState()` returns `NO_DEVICES_AVAILABLE` / `NOT_CONNECTED` / `CONNECTING` / `CONNECTED`, and `CastContextEventType.CAST_STATE_CHANGED` fires on change — use it to show the button only when a device exists.

**To verify in implementation:** Google's *integrate* page documents `SESSION_STATE_CHANGED` but not `CAST_STATE_CHANGED`/`getCastState()`; I could not confirm those two names from a primary Google page in this pass, only that the integrate page does not cover device discovery. They are in the CAF API reference — confirm the exact enum names (`cast.framework.CastState`, `CastContextEventType.CAST_STATE_CHANGED`) against <https://developers.google.com/cast/docs/reference/web_sender> before coding the button's visibility logic.

Practical consequence worth stating in the ticket: **loading the SDK requires internet access** (`gstatic.com`), while the rest of Jellyflick works on a LAN with no internet. Load it only when the user opens the "Play On" menu, and make a load failure a silent no-Cast rather than an error.

#### Jellyfin's receiver application id — do not hardcode it

I traced this through the actual source rather than trusting search results.

`jellyfin-web` does **not** hardcode an id. It reads it from the server, per user: **[verified]**

```js
const applicationID = user.Configuration.CastReceiverId;
if (!applicationID) {
  console.warn(`Not initializing chromecast: CastReceiverId is ${applicationID}`);
  return;
}
const sessionRequest = new chrome.cast.SessionRequest(applicationID);
```

And the server seeds the available receivers in a migration, `Jellyfin.Server/Migrations/Routines/20250420160000_AddDefaultCastReceivers.cs`: **[verified]**

```csharp
_serverConfigurationManager.Configuration.CastReceiverApplications =
[
    new() { Id = "F007D354", Name = "Stable" },
    new() { Id = "6F511C87", Name = "Unstable" },
];
```

So the published ids are:

| Receiver | Application id |
| --- | --- |
| **Jellyfin Stable** | **`F007D354`** |
| **Jellyfin Unstable** | **`6F511C87`** |

**Correct behaviour for Jellyflick:** read the user's `Configuration.CastReceiverId` (and the server's `CastReceiverApplications` list, exposed on `SystemInfo`) and use that, falling back to `F007D354` only if absent. A server admin can change the list, and hardcoding would break those installs. Also note `ServerConfiguration.CastReceiverApplications` defaults to an **empty array** — the ids only exist after that migration has run — so the fallback is genuinely needed for older servers. **[verified]**

One more note: Jellyfin's own loader fetches `cast_sender.js` **without** `?loadCastFramework=1` and uses the legacy `chrome.cast.*` API with a 1-second polling retry on `chrome.cast?.isAvailable`. **[verified]** For a new app, prefer CAF (`loadCastFramework=1` + `__onGCastApiAvailable`) — it is the supported path and avoids the polling loop. But be aware the two APIs coexist, and Jellyfin's receiver works with either.

### 7b. AirPlay

Two generations of API. Prefer the standard one and keep the WebKit one as fallback.

#### Preferred: Remote Playback API (standard)

BCD: `api.RemotePlayback` and `api.HTMLMediaElement.remote` are **Safari 13.1 / iOS Safari 13.4 / Chrome 121 / Firefox never**. **[verified]** Not on Chromium 68, but irrelevant there — webOS has its own mechanisms and AirPlay is a Safari concern.

MDN's documented pattern — show the picker button only when a target exists:

```js
videoElem.remote.watchAvailability(availabilityCallback).catch(() => {
  // Continuous watching isn't supported; show the button so the user can
  // trigger a connection prompt.
  deviceBtn.style.display = 'inline';
});
```
and `videoElem.remote.prompt()` opens the picker. Source: <https://developer.mozilla.org/en-US/docs/Web/API/Remote_Playback_API>

#### Fallback: WebKit-prefixed APIs

Confirmed against **WebKit's own IDL**, `Source/WebCore/html/HTMLMediaElement.idl`: **[verified]**

```
[Conditional=WIRELESS_PLAYBACK_TARGET, EnabledBySetting=WirelessPlaybackTargetAPIEnabled] undefined webkitShowPlaybackTargetPicker();
[Conditional=WIRELESS_PLAYBACK_TARGET, EnabledBySetting=WirelessPlaybackTargetAPIEnabled] readonly attribute boolean webkitCurrentPlaybackTargetIsWireless;
```

And `x-webkit-airplay` is a real attribute name, present in `Source/WebCore/html/HTMLAttributeNames.in`. **[verified]** (`x-webkit-airplay="allow"` / `"deny"` controls whether the element may be AirPlayed; neither this nor the two methods above appear in MDN BCD at all, because they are non-standard.)

The availability event, quoted from Apple's Safari 9.0 release notes:

```javascript
if (window.WebKitPlaybackTargetAvailabilityEvent) {
    video.addEventListener('webkitplaybacktargetavailabilitychanged',
        function(event) {
           switch (event.availability) {
                case "available": /* turn stuff on */
                break;
                case "not-available": /* turn AirPlay button off */
                break;
           }
        })
}
```
Source: <https://developer.apple.com/library/archive/releasenotes/General/WhatsNewInSafari/Articles/Safari_9_0.html>

Note `event.availability` is the string `"available"` / `"not-available"`, **not** a boolean — unlike the Remote Playback API's boolean callback.

#### Combined detection

```ts
export function getAirPlaySupport(video: HTMLVideoElement) {
  if ('remote' in video && typeof video.remote?.watchAvailability === 'function') return 'remote-playback';
  if (typeof (video as any).webkitShowPlaybackTargetPicker === 'function'
      && 'WebKitPlaybackTargetAvailabilityEvent' in window) return 'webkit';
  return 'none';
}
```

Also relevant: `HTMLMediaElement.disableRemotePlayback` (Chrome 121 / Safari 13.1) suppresses the built-in remote-playback UI — useful if the app draws its own "Play On" control and does not want Safari's native AirPlay button competing with it.

---

## 8. Picture-in-picture, playback speed, PWA

### 8a. Picture-in-picture — NOT available on Chromium 68

The brief assumed PiP was available. It is not, by one version. From BCD: **[verified]**

| API | Chrome | Safari | iOS Safari | Firefox |
| --- | --- | --- | --- | --- |
| `HTMLVideoElement.requestPictureInPicture` | **69** | 13.1 | 13.4 | 153 |
| `Document.pictureInPictureEnabled` | **69** | 13.1 | 13.4 | 153 |
| `Document.exitPictureInPicture` | **69** | 13.1 | 13.4 | 153 |
| `enterpictureinpicture` event | **69** | 13.1 | 13.4 | 153 |
| `PictureInPictureWindow` | **69** | — | — | — |

So PiP is a web-only feature for this project and the control must be **feature-detected and hidden**, not merely wrapped in a try/catch (a disabled-looking button that does nothing is worse than no button on a TV remote's focus path).

```ts
export function canUsePip(video: HTMLVideoElement): boolean {
  return (
    document.pictureInPictureEnabled === true &&     // false when disabled by policy
    typeof video.requestPictureInPicture === 'function' &&
    !video.disablePictureInPicture                   // per-element opt-out
  );
}

export async function togglePip(video: HTMLVideoElement) {
  if (document.pictureInPictureElement) await document.exitPictureInPicture();
  else await video.requestPictureInPicture();        // must be user-gesture-initiated
}
```

Three behavioural notes for the ticket: `requestPictureInPicture()` requires a user gesture and rejects otherwise; `document.pictureInPictureEnabled` can be `false` even on Chrome 69+ (Permissions-Policy, or the user disabling it), which is why it is checked separately from method presence; and iOS Safari exposes PiP for video but through its own native control, so on iOS prefer not to draw a custom button.

### 8b. Playback speed — nothing needed

`HTMLMediaElement.playbackRate` is **Chrome 3**. **[verified]** No feature detection, no polyfill.

Two implementation notes worth recording: set `video.defaultPlaybackRate` as well as `playbackRate` if the rate should survive a `load()`; and Chromium mutes audio above roughly 4× and below 0.5× (pitch preservation limits), so cap the UI's range at 0.5×–2× (or 0.25×–4× with a note) rather than offering extremes that silently kill audio. **To verify in implementation** — the exact mute thresholds are a Chromium implementation detail with no stable spec guarantee; test the chosen range.

### 8c. PWA — is a service worker required? No.

MDN's "Making PWAs installable" is explicit:

> a service worker is **not a requirement for a PWA to be installable**

The stated requirements are a linked manifest and HTTPS (or `localhost`/`127.0.0.1`). The manifest members Chromium-based browsers require:

- `name` **or** `short_name` — at least one
- `icons` — must contain a **192px and a 512px** icon
- `start_url`
- `display` and/or `display_override` — at least one
- `prefer_related_applications` — `false` or absent

Source: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable>

Chrome's own announcement corroborates and dates the change: the requirement for a service worker with a `fetch()` handler was removed for **install from the browser menu**, starting **Chrome 108 on mobile and Chrome 112 on desktop**, explicitly because "sites added service workers with empty fetch handlers to satisfy the criteria". Source: <https://developer.chrome.com/blog/update-install-criteria>

**The one remaining catch**, from that same Chrome post: *"The install prompt still requires a `fetch()` handler for now."* So:

- **Installable via the browser's own menu / address-bar icon → manifest only, no service worker.**
- **A custom in-app "Install" button driven by `beforeinstallprompt` → a service worker with a `fetch` handler is still needed.**

Ticket #36 should decide which of those it wants. Also note `beforeinstallprompt` **is not supported on iOS at all** — iOS installs only via the Share menu — so a custom install button is a Chromium-only affordance either way. Safari on macOS Sonoma (17+) supports *File ▸ Add to Dock* "for any web app, with or without a manifest".

#### Minimal manifest

```json
{
  "name": "Jellyflick",
  "short_name": "Jellyflick",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b0b0f",
  "theme_color": "#0b0b0f",
  "orientation": "any",
  "icons": [
    { "src": "/icons/icon-192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/icons/icon-512.png", "type": "image/png", "sizes": "512x512" },
    { "src": "/icons/icon-maskable-512.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" }
  ]
}
```

Serve it from `public/manifest.webmanifest` (Vite copies `public/` verbatim) and link it from `index.html`:

```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0b0b0f">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

Include a `maskable` icon — without one, Android crops the icon into a circle with visible letterboxing.

#### Smallest service worker that satisfies the prompt criterion, with no caching

Only add this if ticket #36 wants the `beforeinstallprompt` button. It deliberately caches **nothing** — no media, no API responses — per the spec's requirement:

```js
// public/sw.js — registers a fetch handler and nothing else.
// Deliberately no caching: media and API responses must always hit the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Intentionally empty: not calling respondWith() lets the browser handle
  // the request normally. Satisfies the install-prompt criterion with no
  // behaviour change and no cache storage.
});
```

```ts
// register it well after first paint; never block startup on it
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
  });
}
```

`ServiceWorker` is Chrome 40, so this is also safe on Chromium 68 — though a TV build has no use for installability and should skip registration entirely.

#### Does Vite need a plugin? No.

**A hand-written `sw.js` is simpler and is the right choice here.** `vite-plugin-pwa` (2.0.0) exists to generate a Workbox precache manifest with content-hashed asset revisions — valuable when you want offline support, which this project explicitly does not. Using it for a no-op service worker means adding `workbox-build` and a generated precache list that then has to be fought down to nothing.

Since `public/sw.js` and `public/manifest.webmanifest` are copied verbatim by Vite with no processing, the plugin's only real advantage (hashed precache) is unwanted. Keep both files hand-written and in `public/`.

One caveat to record: a hand-written service worker is **not versioned by content hash**, so browsers cache `sw.js` itself. Because this one has no logic, that is harmless — but if it ever gains behaviour, add a `?v=` query or rely on the browser's 24-hour `sw.js` revalidation. Note also that registering any service worker here would conflict with MSW's browser-mode worker, which is one of the reasons `toolchain.md` §4 recommends a plain HTTP fake instead of MSW.
