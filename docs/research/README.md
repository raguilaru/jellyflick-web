# Research notes

Primary-sourced notes gathered before and during the build of spec #1. The spec records
"Prior art: none", so these are the project's first body of established fact; later work
should extend them rather than re-establish them.

Every claim cites the source that owns it. Where a fact could not be established from a
primary source it is marked **to verify in implementation** rather than guessed.

| File | What it covers |
|------|----------------|
| `decisions.md` | **Binding decisions and spec corrections. Read this first — it overrides the spec where they disagree.** |
| `task-graph.md` | The ticket dependency graph and the waves it implies |
| `jellyfin-api.md` | Jellyfin 12.x auth, users, items, user data, display preferences, images, SDK types |
| `jellyfin-playback.md` | `PlaybackInfo`, progress reporting, sessions and remote control, media segments, trickplay, subtitle delivery, download |
| `ratings-mdblist.md` | The MDBList API and its rate limits |
| `toolchain.md` | Vite/Preact/TypeScript at `chrome68`, the test stack, i18n, polyfills, the display font |
| `player-subtitles.md` | hls.js, ASS and PGS renderers, Cast and AirPlay, picture-in-picture, PWA installability |
| `delivery.md` | The container image, runtime config and the GHCR multi-arch workflow |

## Verified by building, not by reading

Claims in `toolchain.md`, `player-subtitles.md` and `delivery.md` marked **[verified]**
were reproduced by building or running code, or by measuring images — not taken from
documentation. Several documented claims turned out to be wrong at the Chromium 68
target, so prefer the verified note over an upstream doc when they disagree.
