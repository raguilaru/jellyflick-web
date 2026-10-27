# Jellyflick v1 — task graph (GitHub issues)

Spec: #1. Integration branch: `feat/jellyflick-v1`.
Edges are `blocked_by` (GitHub native issue dependencies).

| # | Title | Blocked by |
|---|-------|-----------|
| 2 | Connect to a Server | — |
| 3 | Sign in with a password | 2 |
| 4 | New on Jellyflick on Home | 3 |
| 5 | Deployable container | 2 |
| 6 | App shell | 3 |
| 7 | Rows and arrow-key navigation | 6, 4 |
| 8 | Several Users and the User Picker | 6 |
| 9 | Quick Connect sign-in | 8 |
| 10 | Client Settings and Home Layout | 7 |
| 11 | Settings screen: Accent Colour and language | 10 |
| 12 | Continue Watching | 10 |
| 13 | My List | 7 |
| 14 | Title Labels | 7 |
| 15 | More Row types | 10 |
| 16 | Billboard with Spotlight | 10 |
| 17 | Title page | 13 |
| 18 | Series on the title page | 17 |
| 19 | Trailers and Download File | 17 |
| 20 | MDBList ratings | 17 |
| 21 | Desktop hover cards | 17 |
| 22 | Remaining Billboard Sources | 15, 16 |
| 23 | Movies and Series pages | 12, 15, 16 |
| 24 | Search | 7 |
| 25 | Play and report progress | 17 |
| 26 | Player controls | 25 |
| 27 | Audio and text subtitles | 26 |
| 28 | Subtitle Offset | 27, 10 |
| 29 | Styled subtitles | 27 |
| 30 | Image subtitles | 27 |
| 31 | Skip Intro/Credits and next Episode | 26, 18 |
| 32 | Trickplay, speed, picture-in-picture and quality | 26 |
| 33 | Cast | 25 |
| 34 | Play On | 25 |
| 35 | Playback preferences in settings | 11 |
| 36 | Installable app | 6 |

## Waves (frontier after each merge)

1. **2**
2. **3**, **5**
3. **4**, **6**
4. **7** (needs 4+6), **8**, **36**
5. **10**, **13**, **14**, **24**, **9** (needs 8)
6. **11**, **12**, **15**, **16**, **17**
7. **18**, **19**, **20**, **21**, **25**, **22** (15+16), **23** (12+15+16), **35** (11)
8. **26**, **33**, **34**
9. **27**, **31** (26+18), **32**
10. **28** (27+10), **29**, **30**

Critical path: 2 → 3 → 6 → 7 → 10 → … and 2 → 3 → 6 → 7 → 13 → 17 → 25 → 26 → 27 → 28 (10 deep).

## Research notes for implementers
- `jellyfin-api.md` (+ `jellyfin-playback.md`, `ratings-mdblist.md`) — Jellyfin 12.x endpoints, SDK types, MDBList
- `toolchain.md` — Vite/Preact/TS at chrome68, testing stack, i18n, font
- `player-subtitles.md` — hls.js, ASS/PGS renderers, Cast/AirPlay, PiP, PWA
- `delivery.md` — container image, runtime config, GHCR multi-arch CI
