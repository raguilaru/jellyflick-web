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
scripts/make-test-video.mjs
                        Draws test/fake-jellyfin/media/test-video.webm the same
                        way: run by hand, output committed. See "The fake
                        Jellyfin serves real video" below.
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
  home/                 Where a signed-in User lands: `home-layout.ts` is which
                        Rows and in what order, `home-rows.tsx` which kind is
                        drawn by what, `row.tsx` the Row, its card and
                        `cardForTitle`, `open-title.ts` what pressing a card
                        opens, one module per Row beside it —
                        `new-on-jellyflick.ts`, `continue-watching.ts`
                        with the `-row.tsx` that draws it, and
                        `suggestion-rows.ts` for the four of #15. Above the Rows
                        is the Billboard (#16): `spotlight.ts` is the default
                        rule that picks its Title, `billboard-sources.ts` what
                        it reads from the Server and the seam all four
                        Billboard Sources sit behind (#22 added Resume, Newest
                        Addition and Because You Watched, each one its Row's
                        own loader), `billboard.tsx` what a User sees, and
                        `use-billboard.ts` the pick the shell holds so a title
                        page cannot disturb it.
  i18n/                 `en.ts` is the key set, `es.ts` is typed against it,
                        and `format.ts` holds the formatting both of them use,
                        so two dictionaries cannot disagree about how a number
                        is written.
  jellyfin/             The gateway: the only module that talks HTTP to the Server.
  my-list/              My List, which is Jellyfin's Favorites: `my-list.ts` is
                        the store every screen reads, `use-my-list.ts` the
                        context and hook, `my-list-toggle.tsx` the control on a
                        card, `my-list-screen.tsx` the My List page.
  playback/             Playing a Title (#25, #26, #27): `device-profile.ts` is
                        what the Server negotiates against, `planning.ts` asks it
                        how to play and reads its answer, `video-source.ts` gets
                        that into a `<video>` (and is the one `import()` in the
                        app), `reporting.ts` tells the Server what is happening,
                        and `player.tsx` is the overlay itself — the one place
                        the media element is touched. Over it:
                        `player-controls.tsx` is the seek bar, the times and the
                        buttons, `scrubbing.ts` the arithmetic they draw with,
                        and `controls-visibility.ts` when they get out of the
                        way. The tracks (#27): `media-tracks.ts` reads a source's
                        `MediaStreams` as the two lists a User chooses from,
                        `track-picker.tsx` is the menu, `subtitle-cues.ts` is the
                        subtitle engine — parsing and timing, with no DOM — and
                        `subtitles.tsx` draws its cues over the picture. The
                        Subtitle Offset (#28): `subtitle-offset.ts` is the
                        arithmetic and which subtitle file an offset belongs to,
                        also with no DOM, and `subtitle-timing.tsx` is the panel
                        the subtitle menu opens. Skip
                        Intro/Credits and the next Episode (#31):
                        `media-segments.ts` reads the Server's markers and says
                        which skip a moment is inside, `skip-button.tsx` is the
                        offer over the picture, and `next-episode.tsx` is what
                        the end of an Episode shows and the second between each
                        tick — which Episode that is lives in
                        `src/title/play-target.ts`.
  navigation/           Arrow keys and focus: `nearest.ts` the geometry,
                        `reveal.ts` how far a scroller must move, `focusable.ts`
                        what the arrows reach, `spatial-navigation.ts` the
                        wiring, `input-modality.ts` the focus highlight.
  ratings/              The extra ratings an MDBList key buys (#20):
                        `extra-ratings.ts` is the reading and the model — which
                        Title is looked up, what comes out of MDBList's answer,
                        and the cache per Title — and
                        `extra-ratings-badges.tsx` what a User sees, in a full
                        and a compact form. The one module outside
                        `src/jellyfin/` that calls `fetch`, because the
                        container is not the Server. See "The extra ratings"
                        below.
  search/               Search: `search-screen.tsx` the field and the live
                        results, `genres.tsx` browsing by genre, `search.ts`
                        what the Server is asked.
  session/              Session & Users: the Server address and the signed-in
                        Users in device storage, plus the sign-in screen,
                        `user-picker.tsx`, and Quick Connect —
                        `quick-connect.ts` is the flow and its polling,
                        `quick-connect-panel.tsx` the screen over it.
  settings/             A User's settings, in **two** stores on the Server.
                        Client Settings, Jellyflick's own: `client-settings.ts`
                        is the store, `settings-provider.tsx` the one copy the
                        screens read, `accent-colours.ts` the Accent Colour
                        presets, `use-accent-colour.ts` what paints them,
                        `ui-language.tsx` the language the app is drawn in.
                        The User's Jellyfin account, which every Jellyfin app
                        shares: `playback-preferences.ts` is the store,
                        `playback-preferences-provider.tsx` the one copy,
                        `spoken-languages.ts` the languages and the subtitle
                        modes it offers. `settings-screen.tsx` is the one screen
                        over both and `home-layout-screen.tsx` the Home Layout
                        editor.
  shell/                The app once a User is signed in: `sections.ts` is the
                        one list of sections and their addresses, `app-shell.tsx`
                        the routes and which bar is shown, `back.ts` the single
                        Back handler, `layout.ts` the breakpoints.
  title/                The title page: `title-page.ts` is its address and what
                        it reads from the Server, `title-screen.tsx` the screen
                        — a pop-up on a wide pointer, a full page elsewhere.
                        Its Play button opens `playback/`'s player. A Series
                        (#18): `series.ts` is the Seasons, the Episodes and
                        which one Play means, and `series-episodes.tsx` the
                        picker and the list.
  title-labels/         What is new about a Title, on its card art (#14):
                        `title-labels.ts` is the rules and the one read,
                        `use-title-labels.ts` the context the shell holds and
                        `card-label.tsx` the label itself.
test/
  setup.ts              Vitest: unmounts components after each test.
  unit/                 Vitest specs. One file per behaviour, not per source file.
  e2e/                  Playwright specs and fixtures. `arrow-keys.ts` is not
                        a spec: it is the shared "reach this control by
                        direction alone" search two of them lean on.
  device/profiles.ts    Fixed device layers: fixed clock, fixed randomness,
                        one capability profile per device class.
  fake-jellyfin/        The fake Jellyfin. See below.
```

Where new code belongs:

- **A new Jellyfin endpoint** → one method on the gateway in `src/jellyfin/gateway.ts`,
  and nowhere else. Nothing outside `src/jellyfin/` calls `fetch` **for the
  Server**. `src/ratings/` is the one other module that calls `fetch` at all,
  and it calls the *container's* own route on the app's own origin — a different
  host, with no Jellyfin authorization header and nothing the gateway knows how
  to build. See "The extra ratings" below.
- **Anything device-specific** — a key code, a codec probe, the clock, randomness,
  a renderer capability, storage, the languages the device prefers, *what shape
  of device this is* → `src/device/`. Nothing else reads `navigator`,
  `window.chrome`, `Date.now()`, `Math.random()` or `localStorage`. A screen
  that wants to behave differently on a TV asks `device.deviceForm()` rather
  than sniffing anything: see "Signing in" below.
- **Anything that must survive a reload** → through `device.storage()`, and under
  one key owned by one module (`session/` owns `jellyflick.session`). Per-User
  settings that follow a User between devices are not this: they belong on the
  Server, in the Client Settings store — `src/settings/client-settings.ts`, and
  see "Client Settings and the Home Layout" below.
- **A screen or a feature** → its own folder under `src/`, holding its logic and
  its components together (`connect/` is the pattern).
- **Something loaded only when it is needed** → an `import()` at the point of
  use, as `src/playback/video-source.ts` does for hls.js, and a line in this
  file saying why. The spec's lightness constraint is about the bundle a TV
  downloads, so a dependency only some devices need does not belong in it.
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

**A green e2e run on your own machine is not evidence that it is green.** CI's
hardware is about half the speed, and every timing bug this suite has had was
green here and red there. `E2E_CPU_THROTTLE=4 npm run test:e2e` throttles the
browser's main thread through CDP (`test/e2e/fixtures.ts`) and is the standing
way to ask the question before CI does; `--repeat-each` is the other half, for
anything intermittent. Both are off by default.

Two traps that throttle has already caught, worth knowing before writing a test
that waits for something:

- **A readout drawn from a moving number is a window, not a state.** The seek
  bar and the clock beside it are two readings of the `<video>`'s position, and
  the test video is six seconds long: a string like `-0:01` is on the screen for
  one frame of real playback. Pause before reading two things that have to agree.
- **A layout that is still settling moves what a test is pointing at.** Hover
  reveals a card's My List control, and adding a Title puts a new Row above the
  card, so a pointer that has not moved is no longer on it. The Billboard's
  artwork can shift the page again later. Re-establish the state, and retry.

## Adding an endpoint to the fake Jellyfin

1. Add the sample data it serves to `FakeJellyfinState` in
   `test/fake-jellyfin/data.ts`, and seed it in `createSampleData()`.
2. Add a route module under `test/fake-jellyfin/routes/` — one file per Jellyfin
   controller — exporting a `readonly FakeRoute[]`. Path parameters are `:name`,
   e.g. `/Items/:itemId/Similar`.
3. Spread it into `jellyfinRoutes` in `test/fake-jellyfin/routes/index.ts`.

A route normally answers with JSON. Two answer with bytes — the video in
`routes/videos.ts` and the subtitle files in `routes/subtitles.ts` — through
`bytes` and `contentType` on `FakeResponse`, with `headers` for `Content-Range`
and friends. See "The fake Jellyfin serves real video" below before adding a
third.

Note that `routing.ts` matches **whole segments**, so a pattern like
`Stream.:format` is compared literally and the extension has to be read off a
`:streamFile` parameter in the handler. Both `/Videos` route families do that.

An unknown path returns 404 with a message naming what to add, so a missing route
never looks like a product bug.

Control endpoints, outside Jellyfin's own namespace and shared by both runners:

| Endpoint | Use |
| --- | --- |
| `GET /__fake/health` | Readiness. |
| `GET` / `DELETE /__fake/writes` | Every non-GET request: what tests assert was saved. |
| `GET` / `DELETE /__fake/requests` | Every request, with headers. |
| `GET` / `POST` / `DELETE /__fake/state` | Read, patch or reseed the sample data. |

`state.quickConnect` is Quick Connect: `enabled` (what
`GET /QuickConnect/Enabled` answers), the `requests` in flight, `codesIssued`
so codes are counted rather than random and a test can read one off the screen
and approve exactly it, and `failInitiateWith` for a Server that will not hand
out a code. Note that `POST /__fake/state` merges only one level deep, so a
test changing any of it hands over the whole object.

`POST /QuickConnect/Authorize?code=&userId=` is in the fake as the **approving**
side — what the other Jellyfin app calls. Jellyflick is only ever the device
being approved, so the gateway deliberately has no method for it and the tests
that approve a code call it through `fetch`, with a token minted the way the
fake derives them.

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

Every Movie and Series also carries `Genres`, and the music album carries
`Classical` — a genre nothing this app shows is in, so a client that forgets to
narrow `includeItemTypes` is caught rather than merely untested. The genres of
the Titles, in the order `/Genres` serves them, are exactly:

    Comedy, Crime, Drama, Family, Science Fiction, Thriller

Three of the Titles carry a **backdrop**, which is what the Billboard needs
(#16): Arrival and Severance with a logo and a community rating above
Spotlight's threshold, and **Paddington with a backdrop and neither** — so "the
Billboard falls back to the Title's own name in the logo font" is a state a test
can reach rather than one it has to patch in. Their local trailers are
`state.localTrailers`, keyed by the Title's item id, with the trailer files
themselves ordinary items of Type `Trailer` carrying a `media` file: Arrival and
Severance have one and Paddington deliberately has none. `/Items/Latest` leaves
a `Trailer` out, as the real endpoint leaves out an extra, and no query for
`Movie,Series` reaches one. `/Items/{id}/LocalTrailers` answers a **bare array**
and gives a Title with no trailer an **empty** one rather than a 404; it goes
quiet with `failRelatedQueriesWith`, beside `/Similar` and `/Collections`.

**Arrival is the Title the track picker (#27) is tested against**: English audio
at stream 1, French at 2, English subtitles at 3 and Spanish at 4, with the
streams' own `Index` values, so a client that read a position in `MediaStreams`
instead fails here. **Heat carries a `pgssub` track** — a Blu-ray bitmap, which
is the one kind this app cannot draw — so "says what it cannot draw" is a thing a
test can see rather than a case to patch in.

Arrival and Severance also carry everything a title page shows — a year, an age
rating, a running time, an overview, a cast, streams in several languages,
ratings, a logo and a backdrop — and **The Unfinished deliberately carries none
of it**, with an empty `OfficialRating` and a null `CriticRating`, because those
are the unguarded fields a client has to cope with itself. `state.played` is
`UserData.Played` per User, `state.collections` is the one Collection (Crime
Classics, holding Heat and Arrival) and `state.similar` is the fixed More like
this relation.

`/Items` honours `ids`, `fields`, `enableImageTypes`, `enableImages` and
`enableUserData`, so a query that forgot to ask for `Overview` — or for
`DateCreated`, which every Title Label is derived from — fails against the fake
rather than only against a real Server. It sorts by `Name` or `SortName`
ascending and by `DateCreated` **descending**, which is "the newest additions"
(#14), and refuses any other order rather than quietly ignoring it. `Genres` is deliberately not gated: every query this app
makes asks for it.

`failLibraryQueriesWith` makes `/UserViews`, `/Items/Latest`, `/Items` and
`/Genres` answer with a status, for a Server that will not say what it holds.
`failPlayedWritesWith` and `failRelatedQueriesWith` do the same for the
`/UserPlayedItems` writes and for `/Items/{id}/Similar` and `/Collections`.
All four want a token, as the real Server does.
`failDisplayPreferencesWith` does the same for `/DisplayPreferences`, and
`failUserConfigurationWith` for the User's Jellyfin configuration — which means
**`/Users/Me` as well as `POST /Users/Configuration`**, because 12.x has no
`GET /Users/Configuration` and that is where a client reads it. Set it after
signing in: it is also the endpoint the session reads.
`failSubtitleFetchWith` does it for the subtitle stream route, which is
deliberately its own flag: a Title that will not play at all and one that plays
with nothing to read are different things to a User (#27).
`failPlaybackInfoWith` and `failPlaybackReportsWith` do it for
`POST /Items/{id}/PlaybackInfo` and for the three `/Sessions/Playing` reports,
and `playbackErrorCode` makes `PlaybackInfo` answer with a `PlaybackErrorCode`
and no playable source — which is a healthy Server refusing, not a failure.
`state.playbackPositions` is `UserData.PlaybackPositionTicks` per User, written
by the progress and stop reports, so a test can watch a resume point arrive and
then be honoured. `state.playCounts` is `UserData.PlayCount`,
incremented by the **start** report alone and never derived from the position —
a count worked out from the resume point would fall to zero the moment a client
cleared it, which is the opposite of story 37 and would make the promise
untestable. `state.lastPlayedDates` is `UserData.LastPlayedDate` beside
it, written by the same reports and seeded empty — it is what Continue Watching
is ordered by (#12), so a test that wants a household with a viewing history
seeds both. `failUserItemDataWritesWith` makes
`POST /UserItems/{itemId}/UserData` answer with a status, which is how a refused
"take this off Continue Watching" is reached.

`/Items` also answers two questions the suggestion Rows ask (#15). A query whose
`includeItemTypes` is exactly `BoxSet` is answered from `state.collections`
rather than from the items, because a Collection's membership is not a field on
an item and so a Collection is not one either; and `parentId` means "inside this
folder", which on this Server is either a library or a Collection. A `parentId`
the Server does not have holds **nothing**, which is a real answer rather than
an error: a Collection deleted on the Server leaves a Row with nothing in it.

`/Movies/Recommendations` is `routes/movies.ts`, and it is the odd one out twice
over — a **bare array** of `RecommendationDto`, each entry a *category* carrying
`BaselineItemName`, the Title the Server suggested from. The fake serves one
category per played Movie that `state.movieRecommendations` has an entry for,
most recently played first, so which Title Because You Watched is about follows
`state.played` and `state.lastPlayedDates` as it would on a real Server, and the
Row's two branches can be told apart. It is seeded **empty**: a Server has no
recommendations until a household has watched something, and seeding a relation
would make "nothing to go on yet" unreachable. It goes quiet with
`failRelatedQueriesWith`, alongside `/Items/{id}/Similar`.

**Bluey is the Series the Seasons and Episodes on a title page (#18) are tested
against**: two Seasons the Server holds as items, two Episodes in each, and
`episode-bluey-s1e2` ("Hotel") deliberately carrying no still, no description
and no runtime — The Unfinished's part played by an Episode. Its Season 1 is
dated older than anything else in the library on purpose: the newest addition
in Bluey's library is still `episode-bluey-s2e3`, so the merged newest-first
order is untouched, and nothing of it is recent enough to earn a Title Label.
`/Shows/{seriesId}/Seasons` and `/Shows/{seriesId}/Episodes` are in
`routes/shows.ts` beside NextUp, both in **aired order** — the Season number
then the Episode number, with anything the Server did not number last — because
that order is the endpoint's own answer. The Episodes route refuses `seasonId`
and `season` outright: nothing in this app asks for one Season at a time, and a
parameter the fake ignored would look honoured.

`/UserItems/Resume` and `/Shows/NextUp` are the Row's own two endpoints
(`routes/user-items.ts` and `routes/shows.ts`). The fake models the two
properties a client leans on: NextUp answers **one Episode per Series**, and
only for a Series the User has actually started, ordered by when they last
watched it. `POST /UserItems/{itemId}/UserData` changes **only** the fields it
is sent, as the real controller does, which is what makes "clearing a resume
point leaves the watched state alone" a thing a test can prove.

Each User's `UserConfiguration` lives in `state.userConfiguration`, keyed by
user id, per User and seeded empty as `favourites` and `played` are — so a User
with nothing stored is served `DEFAULT_USER_CONFIGURATION`, the Server's own
defaults. Seeding one is how a test gets a User who has already chosen:
`{ 'user-rafael': { AudioLanguagePreference: 'spa' } }`. It is a top-level field
rather than a member of `FakeUser` because `POST /__fake/state` merges only one
level deep, so patching one user's field would otherwise mean restating all
four. The POST **replaces** the stored configuration, as the real controller
does, which is what makes a client's read-modify-write load-bearing.

Stored `CustomPrefs` live in `state.displayPreferences`, keyed
`<displayPreferencesId>|<client>|<userId>` — the three things the real Server
partitions them by. Seeding one is how a test gets a User who already has
settings: `{ 'jellyflick|jellyflick|user-rafael': { 'jf.homeLayout': '…' } }`.
The route copies the real controller's three awkward behaviours — `client`
required, the Server's own keys injected on the way out and consumed on the way
in, and a **500** for a `homesection…` key whose suffix is not a number, which
is what the real Server does when a client sends one.

`state.mediaSegments` is the intro and credits markers `GET /MediaSegments/{itemId}`
answers, by item id (#31), and it is **seeded empty** the way
`movieRecommendations` is: segment data is plugin-fed, so a Server with no
intro-detection plugin holds none, and that is the state most households are
in. A test that wants markers seeds them, in ticks — and one that wants a
browser to really reach a marker seeds it inside the **six seconds** the fake
serves, not inside the seven minutes the library claims an Episode is. The
route models two habits #31 hangs off: `includeSegmentTypes` really narrows,
and an item the fake holds nothing for answers **404** rather than an empty
result, which is the harder of the two answers `jellyfin-playback.md` §12
allows. `HasSegments` on the media source follows from the same field.

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

**Which language the app is drawn in** is a User's own setting, not a build-time
choice: `src/main.tsx` loads the dictionary for the device's languages
(`device.preferredLanguages()`) and `src/app.tsx` provides it, and
`src/settings/ui-language.tsx` provides a second one under it once the User's
settings have been read. See "The settings screen" below for why the language is
ours rather than Jellyfin's, and why that provider is always in the tree.

Formatting goes through `Intl.NumberFormat`, `Intl.DateTimeFormat` and
`Intl.PluralRules`, which are native on the target. **Formatting two locales
have to agree on lives in `src/i18n/format.ts`** and is imported by both
dictionaries, so "0.8 s" and "0,8 s" cannot drift apart: `formatSeconds` (#28)
is the one there now, and anything a second locale would have to reimplement
belongs beside it rather than inline in `en.ts`. `Intl.RelativeTimeFormat`
(71), `Intl.ListFormat` (72) and `Intl.Locale` (74) are **not** — write the three
lines by hand instead of adding a polyfill.

## Signing in

`src/session/` owns who is signed in. Each User has their own token and their
own DeviceId, because the Server allows one token per DeviceId, and that is
what lets several of a household be signed in at once (#8). There are two ways
in, and both end in exactly the same place: an `AuthenticationResult` turned
into a stored User by `toSignedInUser`, which is the one owner of that job.

- **A password** — `AuthenticateByName`, `src/session/sign-in-screen.tsx`.
- **A code** — Quick Connect, below.

**Which one is offered first is the device layer's answer.** The screen asks
`device.deviceForm()`, which is `tv`, `handheld` or `computer`; on a `tv` the
code comes first, because typing a password with a remote is the thing being
avoided. The browser implementation works the form out from the pointer media
query and `navigator.maxTouchPoints` — a TV is the device with no fine pointer
and nothing to touch — and the webOS port will answer `tv` outright rather than
detect anything. It is deliberately a *fact about the device* and not a policy,
so a later ticket can read it without inheriting #9's answer, and nothing
outside `src/device/` ever reads `navigator`.

### Quick Connect

The flow is the Server's, at the paths 12.2.0 actually has
(`docs/research/jellyfin-api.md` §2, and ADR 0001 bans the forms that are gone):

    POST /QuickConnect/Initiate        → a Secret and a six-digit Code
    GET  /QuickConnect/Connect?secret= → until Authenticated is true
    POST /Users/AuthenticateWithQuickConnect { Secret } → a token

- **One DeviceId for the whole attempt, minted before the first request.** The
  Server remembers the DeviceId that *initiated* and issues the token against
  it, so every request in the attempt carries that one and the User keeps it.
  This is why Quick Connect fits the several-Users model rather than sitting
  beside it: a User who arrives this way is a User like any other, signed out
  the same way, with the same token revocation.
- **`GET /QuickConnect/Enabled` is read once, beside the public Users.** A
  Server with Quick Connect off is never offered it at all — not even on a TV,
  where a code nobody could approve would be the only thing that User saw — and
  a Server that will not answer is read as "off". Nothing is drawn until both
  answers are in, so a TV never flashes the list of Users first.
- **Polling stops, and that is the point of the module.** Every ending goes
  through one `finish` in `quick-connect.ts`, which clears both timers before
  reporting anything: signed in, the Server no longer holding the request, the
  app's own deadline, Quick Connect switched off, an unreachable Server,
  anything else, and `stop()`. The panel starts the attempt in an effect and
  stops it in that effect's cleanup, so there is no way off the screen that
  leaves a loop talking to a household's Server. The polls are a **chain**
  rather than an interval, so a slow answer delays the next question instead of
  stacking a second one on top of it.
- **Five seconds between polls, and a five-minute life.** The interval is what
  `jellyfin-api.md` §2 settles on; the Server states no interval and **no
  expiry at all**, so the deadline is Jellyflick's own — a code nobody has
  approved in five minutes is a screen nobody is looking at, and a new one is
  one press.
- **The Server cannot tell an expiry from a refusal, so neither does the
  screen.** `GET /QuickConnect/Connect` answers **404** for a request that ran
  out of time there, one that was withdrawn and one already spent alike. One
  `refused` state carries all three and its message offers both readings
  ("it may have run out of time, or been turned down in the other app"). The
  separate `expired` state is only for *our own* deadline, where the app knows
  it was time. Both offer a new code, and a new code is a new attempt — nothing
  retries an old secret, which is spent or gone by then.
- **A new way in, not a second way to do something.** The password is always one
  press away, even on a TV; and the code is reachable from the list of Users and
  from the typed-username form both, so a User can change their mind either way.
- **The code's type is the feature.** "Readable from across a room" is a type
  question, and Bebas Neue has one weight, so `.quick-connect__code` carries it
  with size (`clamp(56px, 16vw, 140px)`) and letter spacing, with the weight
  pinned to **400**: a synthesised bold smears the digits. `tabular-nums` keeps
  them from shifting. A Playwright test measures the computed values, because
  only a real layout can.

Where each thing is tested: the four endpoints in `test/unit/gateway.test.ts`,
so "no removed endpoints" cannot quietly rot; the whole flow and every stopping
rule in `test/unit/quick-connect.test.ts`, at five-millisecond polls; what the
screen offers and in what order — including a TV being offered the code first —
in `test/unit/quick-connect-journey.test.tsx`, where the device layer can be a
TV; and a real sign-in, in a browser, on a production build, in
`test/e2e/quick-connect-sign-in.spec.ts`. The full approve-and-land-on-Home
journey is deliberately **not** in the journey test: the app polls every five
seconds, and making a unit spec sit through that buys nothing the other three
do not already have.

## The shell: sections, routing and Back

`src/shell/` owns everything around a screen, and nothing inside one.

- **A section's address** lives once, in `SECTIONS` in `src/shell/sections.ts`,
  with the key of its translated name. Both navigation bars and the router read
  that list, so adding a section is one entry plus one route.
- **Taking a section over** (Movies and Series are #23, My List #13) means
  pointing its `<Route>` in `src/shell/app-shell.tsx` at your own folder under
  `src/` instead of `SectionPlaceholder`, and nothing else. Name the section
  with `sectionFor('<id>')` rather than writing its address again; Search is
  the worked example.
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

## Client Settings and the Home Layout

`src/settings/` is where a User's own settings live. They are kept on the
**Server**, in `DisplayPreferences.CustomPrefs` under the client `jellyflick`,
so they follow the User to every device (story 49). Device storage is for what
belongs to a screen rather than a person.

- **Every key is prefixed `jf.`**, and `src/settings/client-settings.ts` is the
  only module that knows the key names. The prefix is not tidiness: the Server
  *owns* some keys in that map. It injects one `homesection<n>` per stored Home
  Section and six literals (`chromecastVersion`, `skipForwardLength`,
  `skipBackLength`, `enableNextVideoInfoOverlay`, `tvhome`, `dashboardTheme`)
  when it answers, consumes them again on the way in, reserves `landing-*`, and
  **throws** on a key beginning `homesection` whose suffix is not a number. See
  `decisions.md` §3.
- **`client` is a required query parameter** on both the GET and the POST, and
  it partitions the storage. `CLIENT_SETTINGS_CLIENT` is `jellyflick`,
  deliberately not `CLIENT_NAME` ("Jellyflick"), which is the application name
  the Server records for a session. The two must not be conflated.
- **Every write is a read-modify-write**, because a POST replaces the whole
  custom set. The store reads, keeps only the `jf.` keys (so nothing the Server
  injected is handed back), merges the change and POSTs the result — which also
  means a key a *newer* Jellyflick wrote survives an older one saving over it.
  The POST answers **204**, which is why the gateway has a request shape that
  reads no body.
- **A new setting is three lines**: a `jf.` key, a field on `ClientSettings`
  with a default, and a line each in `settingsFrom` and `prefsFor`. There are
  seven keys today: `jf.homeLayout`, `jf.uiLanguage`, `jf.accentColour`,
  `jf.hiddenSeries` (#12), `jf.billboardTrailerAutoplay` (#16),
  `jf.billboardSource` (#22) and `jf.subtitleOffsets` (#28). A
  **boolean** setting is stored as `'true'` or `'false'` and read back as "off
  only when it says `false`", so a half-written value leaves the User with the
  behaviour everybody else has rather than with the feature silently gone. A
  setting whose value is a name rather than a structure is typed as a plain
  `string`, not a union, so a preset a *newer* Jellyflick offers survives being
  read by an older one — the reader falls back when it draws it
  (`accentColourFor`) and never rewrites what it did not understand. "No choice
  at all" is stored as the empty string, because `CustomPrefs` holds strings:
  that is how "match my device" differs from "English".
- **One copy in front of the User.** `settings-provider.tsx` holds it, above the
  router, so Home and the editor are two views of one thing and an edit shows
  without a reload. A change is applied at once and saved behind it — pressing
  "move up" four times on a remote must not wait for four round trips. Saves run
  one at a time (each is a read-modify-write), and a first read that lands
  *after* the User has already changed something is dropped rather than allowed
  to undo their work.
- **A save that does not land says so** and keeps the User's change on screen.
  A read that does not land hands back the defaults, so Home always draws.
- **A screen that *edits* settings offers nothing to press until `loaded`.**
  Home drawing the default layout for a moment is harmless; a *control* drawn
  from the defaults is not, because pressing it saves the defaults plus that one
  change over what the User really has. Both the settings screen and the Home
  Layout editor show `settings.loading` until the read lands. This is the bug #13
  flagged in #10's editor, fixed in #11 rather than waited out in the tests.

The Home Layout itself is `src/home/home-layout.ts`: an ordered list of Rows,
each with a kind, an optional `hidden` and an optional `parameter`, and the
rules are pure functions of it (`addRow`, `hideRow`, `showRow`, `moveRow`,
`visibleRows`, `addableRowKinds`, `parametersFor`). Hiding keeps a Row's place,
so showing it again puts it back; adding appends; moving is clamped at the ends.
A stored layout that cannot be read falls back to `DEFAULT_HOME_LAYOUT` rather
than emptying Home, and an unknown kind is dropped on its own, so a layout
written by a newer Jellyflick keeps the Rows this version understands.

**A Row is identified by its kind *and* its parameter**, which is `rowKeyOf`
(`'my-list'`, `'genre:Comedy'`), because a User can have several genre and
Collection Rows — one per genre they like (#15, stories 44 and 45). Every rule
above takes that key, and an unparameterised Row's key is simply its kind, so
"one Continue Watching" and "one Comedy Row beside one Thriller Row" are one
rule rather than two. The kinds that need a choice are `PARAMETERISED_ROW_KINDS`;
they are **always** among `addableRowKinds`, because whether any choice is left
is the Server's answer and not a layout's — the editor subtracts
`parametersFor` from what the Server offers and is the one place that knows
there is nothing left. A stored genre Row with no genre is dropped the way an
unknown kind is: there is nothing to draw and nothing to guess.

**Which Rows exist is `src/home/home-rows.tsx`**, not the layout: `ROW_NAME_KEYS`
is a Row's name wherever the *app* names it, and `BUILT_ROW_KINDS` is the kinds
whose feature exists. Home draws the visible rows whose kind is built and leaves
the rest out — an empty Row would look like something that failed, and the editor
says "Not on Home yet" in words instead. Every kind the layout names is built as
of #15, and the list stays because the next kind will reach the layout before
its loader does. **Adding a Row's feature** is: a loader beside
`new-on-jellyflick.ts`, a case in `HomeRowFor`, and the kind in
`BUILT_ROW_KINDS`. The layout already carries it — My List (#13) was added
exactly that way.

## The Billboard and Spotlight

`src/home/` holds the Billboard (#16, stories 22 to 33): the one Title at the
top of Home, with its backdrop, logo, short description, age rating, Play and
More info, and its local trailer.

- **The Source is a seam, and `billboard-sources.ts` is it.** A Billboard Source
  is an entry in `BILLBOARD_SOURCES` plus a loader beside
  `loadSpotlightBillboard`, and every Source answers with the same
  `BillboardResult` — so #22's Resume, Newest Addition and Because You Watched
  arrived without anything that *draws* the Billboard changing. All four are
  built as of #22. Spotlight is the default (story 29), and the User's choice
  is `jf.billboardSource` in Client Settings.
- **The other three Sources are their Rows, read through `billboardFromRow`**
  (#22). Each one calls **the Row's own loader** — `loadNewOnJellyflick`,
  `loadContinueWatching` + `continueWatchingRow`, `loadBecauseYouWatched` — and
  takes the ids it answers, in its order. That is what makes "the same rules as
  the Row" true by construction rather than by a second copy of each rule:
  Resume inherits the three-read merge, one entry per Title, and a hidden
  Series staying hidden until its activity moves on, without restating any of
  it. A Row answers **ids** because a Row and the Billboard want different
  fields of the same Title — a Row's query asks for a poster, the Billboard
  needs a backdrop, a logo and an overview — so `getBillboardCandidates` is
  read once and supplies both the chosen Title's fields *and* the pool
  Spotlight falls back over, in one round trip rather than two.
- **A Source features the first Title of its Row that has a backdrop**, not
  simply the first. The Billboard *is* a backdrop with words over it
  (`canBeABillboard`, which `spotlight.ts` exports because it is a fact about
  the Billboard and not about Spotlight), so the newest addition to a library
  and the Billboard's Newest Addition can honestly differ — in the sample
  library the newest addition is Bluey, which has no backdrop, so the Billboard
  features Severance.
- **Every Source falls back to Spotlight**, and three different things reach
  that fallback: an empty Row, a Row whose Titles have no backdrop, and a Row
  the Server refused. Only a Server that will not answer the Billboard's **own**
  query is `unavailable`, because then there is nothing to draw by any rule. An
  empty Billboard is the single answer worth avoiding (story 33).
- **Play is `resolvePlayTarget`'s, for every Source.** Resume, Newest Addition
  and Because You Watched can all feature a Series as readily as Spotlight can,
  and a Series holds no file — see "Playing a Title" below. Nothing in a Source
  touches this: `billboard.tsx` is one component for all four, so a new Source
  inherits the right Play rather than having to remember it.
- **Spotlight is a weighted pick, not a filter** (`spotlight.ts`). Eligible is a
  Title the User has not finished that the Server has a backdrop for — the
  backdrop is not a preference, because the Billboard *is* a backdrop with
  words over it. A logo and a community rating of `SPOTLIGHT_GOOD_RATING` (6.5)
  or higher each **double** a candidate's weight on their own, so the four
  combinations weigh 1, 2, 2 and 4: a household whose highly rated Titles are
  all watched still sees its other Titles featured, which a filter would not
  allow. The fallback is any Title with a backdrop, finished or not (story 33),
  and it is a *second pool* rather than a weaker weight, because "I have not
  seen this" is the Billboard's promise and not merely a preference.
- **The randomness is the device layer's, and it is read once at the edge.**
  `use-billboard.ts` takes one `device.random()` and hands it to
  `loadBillboard` as a number, so every rule below it is a pure function of the
  library plus that number. That is what makes a pick reproducible: a Vitest
  test fixes `randomSequence`, and `test/e2e/the-billboard.spec.ts` — where the
  draw really is `Math.random()` — makes the pick deterministic through the
  *library* instead, marking the other candidates watched so the pool holds one.
- **The pick waits for Client Settings, and reads them through a ref** (#22).
  `useLoadedBillboard` picks nothing until `settings.loaded`: picking with
  Spotlight and then replacing it with the Source the User really chose is two
  reads and a visible flinch on the first thing on Home. The Source and the
  hidden Series are then read from a ref rather than taken as dependencies,
  because *arriving at Home* is what takes a fresh pick (story 30) — as
  dependencies, dismissing a Continue Watching card on Home would re-pick the
  Billboard under the User's hands. A Source chosen on the settings screen is
  picked with on the next visit to Home, which changes `path` anyway.
- **The pick is held in the shell, above the router** (`use-billboard.ts`),
  because `preact-iso` draws only the matching route and opening a title page
  therefore **unmounts Home**. Stories 30 and 31 pull against each other and the
  rule that settles them is: arriving at Home asks Spotlight again, *unless* the
  address the User came from was a title page. The player is an overlay over the
  title page rather than an address, so that one test covers returning from the
  player too. Anywhere else — Search, My List, the settings screen — is a fresh
  visit and a fresh pick.
- **The Billboard's query is its own** (`getBillboardCandidates`), neither a
  Row's nor a title page's: it asks for the backdrop, the logo and the overview
  that no Row wants, and none of the cast, streams or provider ids a title page
  does. It asks in a **fixed order and without a limit** — `sortBy=Random` would
  take the choice away from the device layer and make a pick unreproducible, and
  a limit on a name-ordered query would quietly confine the Billboard to the
  beginning of the alphabet.
- **Local trailers only, and the backdrop always stays underneath.** The trailer
  comes from `Items/{id}/LocalTrailers`; there is deliberately **no** gateway
  method for `RemoteTrailers`, so nothing can hand the Billboard a YouTube
  embed — that is story 75's Watch trailer button, behind a press. The trailer
  starts muted after `BILLBOARD_TRAILER_DELAY_MS`, and a Title with no trailer,
  a Server that will not answer, a plan that cannot play and a browser that
  refuses to autoplay all come to the same harmless place: the backdrop, which
  was never removed (story 25).
- **Nothing about the trailer is reported to the Server.** It is decoration the
  User did not ask for, so no `/Sessions/Playing` report is sent for it. It does
  reuse `playback/`'s `planPlayback` and `attachPlaybackSource`, because how to
  play something on this device is one correct answer and not this screen's to
  re-derive.
- **Its controls say what they will do, and an effect applies them.** The mute
  and pause buttons change what the User *wants* and a single effect applies
  that to the element, so "Pause" can never start a trailer whose source has not
  arrived yet — which is exactly what reading the element's live `paused` gave.
- **It is the one thing on Home that is not inset.** `.billboard`'s negative
  margin is exactly `.screen`'s padding, so the backdrop bleeds to the window's
  edges while everything inside stays lined up with the Rows. The stack is
  `position: absolute` with explicit `top`/`right`/`bottom`/`left` rather than
  the `inset` shorthand (Chrome 87), its height is a `clamp()` rather than
  `aspect-ratio` (88), and the scrim is a gradient rather than
  `backdrop-filter` (76).

Two tests elsewhere had to change because Home now has a Billboard, and both
were assertions about Home's *shape* rather than about their own subject: the
title page's "Back closes it" tests proved closure by there being no level-1
heading named Arrival, which Home itself now legitimately has, and now assert
that the page's own `.title__sheet` is gone; and the wheel-over-a-Row test
compared the page's scroll against zero, which only held while Home fitted the
viewport, and now compares it against where hovering the Row left it.

## The suggestion Rows

`src/home/suggestion-rows.ts` is #15 and stories 43 to 46: Watch Again, Because
You Watched, genre Rows and Collection Rows. One module, because they differ
only in the question they ask the Server, and one `SuggestionRow` component in
`home-rows.tsx` draws all four.

- **Because You Watched is two endpoints, and which one answers is the ticket.**
  Jellyfin has `/Movies/Recommendations` for films — its own "because you
  watched", already grouped by the Title it came from — and nothing of the kind
  for a Series, so a Series is asked `/Items/{id}/Similar` instead. The most
  recently finished Title is the one suggested from, and the Row is named after
  it either way, because "Because You Watched" with nothing after it tells a
  User nothing. The Title watched is filtered out of its own suggestions:
  `/Movies/Recommendations` can include it.
- **`getPlayedTitles` serves two Rows**, so Watch Again and Because You Watched
  cannot disagree about what was watched last. It is deliberately not
  `getPlayedEpisodes` with other `includeItemTypes`: that one asks for no
  artwork, because nothing it answers is drawn, and these cards are.
- **A Collection Row stores an id and reads the name.** The layout holds the
  Collection's item id, which is what survives it being renamed on the Server,
  so the Row reads the Collections as well as the members and heads itself with
  the name it finds. A Collection that is gone is an empty Row, not a failure.
- **An empty Row draws nothing** and a Server that will not answer says so —
  Continue Watching's bargain, for the same reasons.
- **The heading is the Server's where the Server names it**: the genre, the
  Collection, the Title a suggestion came from. `ROW_NAME_KEYS` is only what
  the *editor* calls them, plus the Rows the app names itself.

The editor, `src/settings/home-layout-screen.tsx`:

- **What Play *means* is in `src/title/play-target.ts`, not in a screen.** A
  Movie is its own file; a **Series holds no file at all**, so its Play means
  the Episode the User is up to, and asking the Server to play a Series id
  answers no `MediaSources` and fails. Two screens press Play on a Title the
  User never opened a page for — the title page (#18) and the Billboard (#16) —
  and when the rule lived only in `title-screen.tsx` the Billboard featured a
  Series and could not play it. `playTargetFor` is for a caller that already
  read the Episodes; `resolvePlayTarget` reads them itself, and only for a
  Series, so featuring one costs nothing until its Play is pressed.
- **Its address is not a section.** `/settings/home-layout` has its own `<Route>`
  in the shell and no place in either bar; `SECTIONS` is still the one list of
  sections. It is reached from Home and from the settings screen.
- **Reordering is two buttons, not a drag.** A drag cannot be done with a remote
  (story 64), and the navigator owns Up/Down/Left/Right — taking the arrow keys
  here would leave no way to leave the screen. Buttons serve touch, mouse and
  arrow keys at once, and they are reachable because `src/navigation/` reaches
  anything focusable.
- **There is no Save button**, so there is none to leave unpressed.
- **Adding a genre or Collection Row is two presses**, because the Row means
  nothing without the choice: the first opens the choices, and picking one is
  what adds it. The choices are the Server's — `/Genres` and the BoxSets — read
  once when the screen opens, which makes this the one settings screen that
  reads the library. They are also how a Collection Row already in the layout
  gets its name, since what is stored for one is an **id**: a Collection
  renamed on the Server is renamed here. A choice list still in flight, or one
  the Server refused, leaves the control offered and says what happened when it
  is pressed, rather than appearing and vanishing under the User's hands. They
  are buttons in a list, not a `<select>`, for the reason everything else here
  is: a remote can reach a button.

## The settings screen, Accent Colour and language

`src/settings/settings-screen.tsx` is the screen a User changes their own things
on: their Accent Colour, the language the app is in, what the Billboard features
(#22) and the way to their Home Layout (#11), and under a "What plays"
subheading the four their Jellyfin account carries (#35). Its address `/settings` is **not a section** — `src/shell/sections.ts`
is still the one list of sections and this is not in it — but both navigation bars
reach it: the top bar with a link of its own after the sections, and the phone's
bottom bar through the User's picture, which is where a phone User looks for
their own settings. The picture used to be inert; it is now a real link named
"Settings", because that is what pressing it does.

- **Every choice is a `<button>` with `aria-pressed`, never a radio group.**
  Native radios take Left and Right for themselves to move the selection, and
  the navigator owns the arrow keys for moving focus — two meanings for one key
  press, on the screen that most has to work with a remote. Buttons say which
  one is chosen, leave the arrows alone, and serve touch, mouse and remote at
  once. #10's Move up / Move down buttons are the same decision.
- **There is no Save button.** A press applies at once and saves behind the
  screen, and nothing is offered until the first read has landed (see above) —
  **both** reads now, since a control drawn from either store's defaults is the
  same bug. One `settings.loading` notice covers both; they are in flight
  together, so it costs nothing.
- **The two stores are said apart in words, and a test holds both sentences.**
  This is the subtle part. #11's language copy says Jellyfin has no language
  setting of its own, which is true of the language the app is *drawn* in;
  #35's four really are `UserConfiguration` fields, so "What plays" says
  Jellyfin keeps them and every Jellyfin app follows. Both sentences are on the
  screen at once, so each names what it is about — the audio section says in so
  many words that it is the sound and not the language Jellyflick is in.
  **Anyone editing either string has to keep the pair honest.**
- **Layout**: `.settings-choices--wrap` is a choice row with too many options to
  sit on a line (the nine languages), wrapping into columns like the Accent
  Colour swatches so the arrow keys reach every one by direction;
  `.settings-choices--stacked` is one whose labels are sentences (when to show
  subtitles), one per line at every width. Both sit *after* the 640px rule they
  override. `.screen__subheading` is a heading over a run of groups.
  The four Billboard Sources are `--wrap` too: "Because You Watched" is long
  enough that four of them do not share a line on a phone, and a choice that
  runs off the side of the screen is one the arrow keys reach and a User never
  sees. Rendered and looked at on a 375px viewport in both languages — the e2e
  suite cannot catch this, because Playwright scrolls an element into view
  before pressing it.
- **An unknown stored choice presses nothing** (#22). The Billboard Source
  buttons are compared against the *stored* name: nothing stored presses
  Spotlight, because that is what Home really does, but a Source a newer
  Jellyflick wrote presses none of them rather than claiming the User chose
  Spotlight — and their real choice is carried back to the Server untouched,
  which is the treatment an unknown Accent Colour preset already gets.

**Accent Colour** (story 112) is `accent-colours.ts`: seven presets, each
carrying both the `--accent` colour *and* the `--accent-text` that reads on it,
because readability picks that, not taste. A fixed set rather than a colour
picker is what makes "text stays readable" a promise the app can keep — and a
picker is no way to choose anything with a remote.
`test/unit/accent-colours.test.ts` measures every preset from the WCAG formula
against two bars, because `base.css` uses the token two ways: **4.5:1** for
`--accent-text` on `--accent` (body text on a filled button) and **3:1** for
`--accent` on `--surface-base` (the wordmark, which is large text, and the focus
ring and section underline, which are non-text parts of the interface). It also
holds the default preset against the literal `base.css` ships.

`use-accent-colour.ts` writes the two tokens on the root element in the shell,
so every rule that already reads `--accent` follows at once and no component
has to know a colour was chosen. **It does not touch the manifest.** The
manifest's `theme_color`/`background_color` are `--surface-base`, because the
manifest is one file for the whole household while the Accent Colour is one
User's; a unit test from #36 fails if those two drift.

**The language** (story 113) is `ui-language.tsx`, and it is **Jellyflick's own
setting, not Jellyfin's**. Jellyfin 12.x has no per-user UI language at all —
the only one it has is the server-wide `ServerConfiguration.UICulture`
(`decisions.md` §2). Story 114 says the settings screen "edits my Jellyfin
settings"; that holds for audio language, subtitle language, when to show
subtitles and next-episode autoplay, which really are `UserConfiguration`
fields and are now on the screen under "What plays" (#35), and it cannot hold
for the UI language. So the screen states the difference in words
(`settings.languageExplanation`) rather than letting a User assume their other
Jellyfin apps will follow — and the section above it has to keep saying the
opposite about its own four, because both claims are on one screen.

- The choice is the User's chosen tag, or **absent**, which means "match my
  device" and is where `device.preferredLanguages()` comes in. Absent is stored
  as the empty string, so going back to the device's language is a real choice
  and not the same as choosing English.
- `UiLanguage` is **always in the tree**, with only its *value* changing while a
  dictionary is being fetched. Rendering the children bare and wrapping them in
  a provider later changes the shape of the tree, which unmounts and remounts
  the whole shell — losing a typed search term and every Row's state. The
  dictionary already on the screen stands in meanwhile, so there is no blank
  screen and no flash of message keys.

## Playback Preferences: the User's Jellyfin account, not Client Settings

`src/settings/playback-preferences.ts` is the **second** settings store, and the
difference between it and Client Settings is the whole of #35. Be deliberate
about which one a new setting belongs in:

| | Client Settings (`client-settings.ts`) | Playback Preferences (`playback-preferences.ts`) |
| --- | --- | --- |
| Where on the Server | `DisplayPreferences.CustomPrefs` | `UserConfiguration`, on the User's account |
| Partitioned by | `client=jellyflick` — Jellyflick's alone | nothing: it is the Jellyfin account |
| Who else can see it | no other app | **every** Jellyfin app, and they can change it |
| What lives there | Home Layout, Accent Colour, UI language, hidden Series | audio language, subtitle language, when to show subtitles, next-Episode autoplay |
| Keys | prefixed `jf.`, ours to name | the Server's own field names |

- **Pick the store by who the setting belongs to.** Something Jellyfin itself
  acts on — what it picks to play, what it transcodes, what it remembers about
  an account — is `UserConfiguration`. Something only Jellyflick acts on is
  Client Settings under `jf.`, and `CLIENT_SETTINGS_CLIENT = 'jellyflick'` is
  what keeps it ours. Something that belongs to a screen rather than a person is
  `device.storage()` and neither of these.
- **There is no read endpoint.** 12.x has no `GET /Users/Configuration`; a
  User's configuration rides on `UserDto.Configuration`, so `read` goes through
  `gateway.getCurrentUser()`. The gateway therefore has `saveUserConfiguration`
  and no matching getter, which is deliberate rather than an omission.
- **Every write is a read-modify-write**, as in the other store and for a worse
  reason: `POST /Users/Configuration` assigns the *whole* `UserConfiguration`,
  and the fields this app never shows belong to other Jellyfin apps. Sending
  only the four it knows would reset a User's `CastReceiverId`, their
  `GroupedFolders` and their `DisplayMissingEpisodes` to defaults. A unit test
  holds exactly that.
- **The defaults are the Server's, not ours**: no language preference,
  `SubtitleMode: 'Default'`, autoplay **on**. A new Jellyfin account has those,
  so drawing anything else would tell a User their account says something it
  does not.
- **A language is a plain `string`**, not a union of the codes the screen
  offers, and a code it does not recognise presses no button and is written back
  untouched — a preference set in another Jellyfin app is the User's. Same
  treatment as `accentColour`. The codes `spoken-languages.ts` offers are ISO
  639-2/T (`fra`, not the 639-2/B `fre`), which is what the sample library's
  `MediaStream.Language` carries; `jellyfin-api.md` had left that open.
  `SubtitleMode` is the exception and *is* typed as the SDK's union, because it
  is a closed Server enum rather than a name.
- **`PlaybackPreferencesProvider` is in the shell, above the router**, beside
  `SettingsProvider` and shaped identically: `loaded`, `saveFailed`, applied at
  once and saved behind, stale first read dropped, saves one at a time. Two
  providers rather than more fields on one, because one save must not drag the
  other store along.
- **"A change takes effect on the next playback"** is true because the Server
  holds it: a Jellyfin client reads `UserConfiguration` when it decides which
  audio and subtitle track to start with, so the player (#28 onwards) reads
  `usePlaybackPreferences()` — already in its tree — or the Server, and either
  way nothing changes mid-playback. **The player did not exist on #35's branch**,
  so what is tested is that the choice reaches the account: `settings.spec.ts`
  reads the Server's own copy back rather than the screen's.

The settings screen section above says how the copy keeps both stores honest.

## Continue Watching

`src/home/continue-watching.ts` is #12 and stories 35 to 39: what the household
started and has not finished, merged with the next unwatched Episode of each
Series it is watching. `continue-watching-row.tsx` draws it; every rule is in
the first file, as a pure function of what the Server said.

- **It is three reads, because the Server asks three different questions.**
  `GET /UserItems/Resume` is what is part-watched, with where the User got to;
  `GET /Shows/NextUp` is which Episode comes next in each Series, one per
  Series, so "a Series appears once" is the Server's own doing; and
  `GET /Items?isPlayed=true&sortBy=DatePlayed` is **when each Series was last
  watched**. That third one is the subtle one: the next unwatched Episode has
  never been played, so it carries no `LastPlayedDate` at all, and ordering a
  Series by it would put a show finished an hour ago below a film abandoned
  last month. The Episode before it has a date, and one query answers that for
  every Series at once.
- **An entry is two things, and keeping them apart is the whole ticket.** The
  `itemId` is the Movie or Episode — what is resumed, and what a resume point
  belongs to — and the `title` is the Movie or the *Series*, which is whose
  card is drawn and whose page a press opens. A part-watched Episode beats a
  next-up one for the same Series, whatever their dates: the User is in the
  middle of it.
- **A failure is the whole Row's**, unlike New on Jellyflick, where a library
  that will not answer is simply a shorter Row. Half of this one silently
  missing would look like the app having forgotten what a household was
  watching.
- **The order's tie-break is the Server's own order**, carried as a rank beside
  each entry rather than left to a stable sort: `Array.prototype.sort` is only
  stable from Chromium 70, one above the floor ADR 0002 sets.
- **Taking an entry out is two different writes, and which ones happen is the
  kind of entry:**
  - a resume point is cleared with `POST /UserItems/{itemId}/UserData` carrying
    **only** `PlaybackPositionTicks: 0`. That endpoint changes only the fields
    it is sent, which is why it is not `markPlayed`: story 37 is "my watch
    history stays as it is", so `Played` and the play count must not move.
  - a **Series** goes on the User's own hidden list, `jf.hiddenSeries` in
    Client Settings (story 38). Jellyfin has nowhere of its own for "stop
    offering me this show", and it is a statement about a person rather than a
    screen, so it follows them to every device.
  - a part-watched **Episode** does **both**, and that is not belt and braces:
    clearing the point alone leaves the Server offering that very Episode as
    the one to watch next, so the Row would not change at all.
- **Hiding undoes itself, with no second write and no clock.** A record stores
  the Series' activity at the moment it was hidden, and the Series comes back
  when its activity moves past that — which is exactly "another of its
  Episodes has been played" (story 39). A Series whose activity nothing says is
  hidden at zero, so the next thing the User plays brings it back. The record
  is **spent** once the Series is shown again, and the Row writes it off the
  list: leaving it would hide the Series a second time the next time its next
  Episode came round.
- **An entry's activity is its *Series'*, not its own**, and the first code
  review found out why the hard way. Hiding stores that number and the next
  load compares the Series' activity against it, so the two have to be the same
  measure: with an Episode's own date stored, hiding a part-watched Episode of
  a show with newer activity elsewhere — Episode 5 abandoned on the 10th,
  Episode 1 rewatched on the 14th — lasted exactly one load, and took its own
  record with it when it went.
- **Both halves of a removal are taken back together.** A part-watched Episode
  hides its Series *and* clears its resume point; when the Server refuses the
  second, the first is undone as well. Otherwise the card could not come back —
  the Series would still be hidden — and the Row would be reporting a failure
  the screen showed as done.
- **Every write to the hidden list is computed from a ref, not from the
  render's `settings.hiddenSeries`.** `change` applies behind the screen, so two
  writes in one tick (the prune and a press, or two presses) would both start
  from the array that render saw and the second would drop the first's record.
- **`saveFailed` is the settings store's, so the Row has to mean its own.** The
  provider is shared with every screen that writes a setting: without a local
  "the User pressed something here" flag, a failed save in the Home Layout
  editor would have Continue Watching claiming the User's own change had not
  been saved on the way back to Home.
- **The Row holds the Server's answer, not the merged entries.** Hiding has to
  show at once, and the merge is cheap and pure, so it is run on every render
  against the User's current list — with what they have just removed kept
  beside it, because a change shows before the Server has agreed to it, the
  bargain My List makes. A refusal puts the card back and says so.
- **An empty Row draws nothing**, as My List's does and for the same reason: a
  User who has watched nothing yet is every new User, and a notice on Home on
  every visit would be in the way.
- **The card's progress bar is `RowCard.progress`**, drawn by `CardProgress` in
  `row.tsx` and absent on every other Row's cards. It is a `role="progressbar"`
  rather than a styled `<div>`: how much is left is the point of it, and a
  screen reader has nothing else to read it from. A next-up Episode carries a
  bar at **zero** rather than no bar, because none of that Episode has been
  watched and that is worth seeing.
- **The remove control is pointer-only**, like the My List toggle beside it and
  for the reason in `src/navigation/`: a second focus stop inside a card would
  stop the arrow keys reading a Row as a line of cards. So a remote cannot take
  something off this Row today — the enlarged hover card (#21) is where a card's
  controls finally become reachable, and this one belongs there with Play, My
  List and More info. The Playwright spec skips those two journeys in the
  keyboard-only project for exactly that reason.

## My List

My List **is** Jellyfin's Favorites, so it is the same list every other Jellyfin
app shows: `/Items?isFavorite=true` reads it and `/UserFavoriteItems/{itemId}`
adds and removes (the legacy `/Users/{userId}/FavoriteItems/{id}` is gone in
12.x). Three gateway methods, `getFavouriteItems`, `addToFavourites` and
`removeFromFavourites`.

It is read **ordered by `Name`, not `SortName`**. A client that has just added a
Title has only its name to place it by, and `SortName` strips articles, so the
two orders would disagree about where "The Unfinished" goes.

`src/my-list/my-list.ts` is one store, made once per (Server, User) in the shell
and reaching every screen through `MyListProvider`. One store rather than a load
per screen, because a Title added from a card on Home has to appear in the Row
beside it, on the My List page and on every other card for the same Title at
once. Its whole interface is `state`, `has`, `add`, `remove`, `load`, `unsaved`,
`version` and `subscribe`.

Three things about it are load-bearing, and all three were found by tests:

- **A change shows before the Server has agreed to it**, and is taken back if
  the Server refuses, with `unsaved()` to say so — a change that reverted itself
  silently would look like the app losing track. An added Title is inserted
  where its name puts it, which is where the Server's own order will have it, so
  the list does not reshuffle a moment later.
- **A read asked before a change is thrown away.** Otherwise the read comes back
  with the list as it was and puts the Title straight back. The guard counts
  *changes*, deliberately not publishes: a read asked before another read's
  answer is still perfectly good, and discarding it loses an add made while the
  first read was in flight.
- **A subscription can only be made once a component has rendered.** A press in
  that gap — a card pressed the moment it appeared — changes the store and would
  never be drawn, so `useMyList` compares the `version()` it rendered with
  against the one it subscribed to and catches up. Anything else that grows a
  store with a subscription hook inherits this.

**The control on a card** is `MyListToggle`: a real button with its own name
("Add Arrival to My List") and `aria-pressed`, passed to `Row` through
`cardControl`, which is the slot Play and More info will share once the enlarged
hover card (#21) arrives. `home-rows.tsx` passes it to every Row on Home, so
there is one place that decides what a card on Home offers.

On a card in a Row that control is drawn **only while the pointer is over the
card**, and that is not only a look: `spatial-navigation.ts` ignores anything
with a zero-sized box, so a hidden control is not a stop the arrow keys step
through and Right still takes the next card along the Row. The keyboard and the
remote reach My List from the title page instead (story 70, #17). On the My List
page the same control is always drawn and **is** a focus stop, on purpose: that
page exists for managing the list, so taking something out of it has to work
with a remote.

**The My List page** is a grid (`.grid`, `auto-fill` columns) rather than a
strip, so a long list wraps down the page instead of scrolling sideways, and it
has no focus memory to keep — the page *is* the grid. An empty My List draws no
Row on Home at all, where New on Jellyflick says so in words: an empty My List is
where every User starts and is theirs to fill, so a notice on Home on every
visit would be in the way. The page explains it instead, and also carries the
"the Server would not say" message.

## Title Labels

`src/title-labels/` is #14 and story 42: the one word across the bottom of a
card's art saying what is new about that Title — Recently Added, New Season or
New Episodes.

- **A label is about what was *added*, which is not the Title it lands on.** A
  Series is not re-added when an Episode of it arrives, so "New Episodes" on
  Severance's card comes from an *Episode's* `DateCreated`, and "New Season"
  from a *Season's*. That is why the feature has a query of its own —
  `gateway.getRecentAdditions`, the only one in the gateway that asks for
  `Movie,Series,Season,Episode` rather than the two kinds the app shows — and
  why `/Items/Latest` is the wrong endpoint however close it sounds: it answers
  per library and leaves Seasons out altogether, which is exactly the
  distinction between the two labels.
- **One read for the whole app, held in the shell** beside My List, as a map
  from a Title's id to its label. A Title's label is the same wherever its card
  is drawn, and Home alone can draw one Title in several Rows. The context's
  default is *no labels*, so a card rendered outside the shell — a unit test of
  a `Row`, every screen before the read lands — is a card without one, which is
  what a Title with nothing new about it looks like anyway.
- **At most one label per card, strongest claim first**: `recently-added`,
  then `new-season`, then `new-episodes`. A Series added this week is new
  however much of it arrived, and a whole Season beats a handful of Episodes.
  A Season and its Episodes always arrive together, so this is the common case
  rather than an edge one.
- **The window is a count of additions, not a date**, because `/Items` has no
  "added since" filter: the newest `RECENT_ADDITIONS_LIMIT` items are read and
  `RECENTLY_ADDED_DAYS` is applied here. An addition the Server gave no date
  says nothing — a label is a claim about a date. One dated in the *future* is
  kept, because a Server whose clock runs ahead of the device's has still just
  added it.
- **The clock is `device.now()`**, never `Date.now()`, which is what lets
  `test/unit/title-labels.test.ts` hold every rule still against `FIXED_NOW`.
  A Playwright test cannot: a browser's clock is the real one, so
  `title-labels-on-cards.spec.ts` re-dates the sample library instead, and what
  it is there for is what only a laid-out page can say — that the label is on
  the art, at the bottom of it, in the Accent Colour.
- **It is drawn inside `CardArtwork`**, so it reaches a card in a Row, a card
  in the My List grid and a card in More like this without any of them knowing
  about it. The label is positioned from the artwork's *top* plus a translate,
  because the card is a grid of artwork and then the name and `bottom` would
  put it under the name; `--card-artwork-height` is what the two share.
- **It is not `aria-hidden`.** A card's accessible name is its Title's, and
  folding the label into it would rename every card (and every test that finds
  one by name), so the label is left in the document as text beside that name
  rather than hidden from a screen reader altogether.

## The title page

`src/title/` is #17: everything the app knows about one Title, and everything a
User can do to it short of playing it. It is what a card press opens, so it is
also what closed #7's and #24's last open box.

- **Its address is not a section.** `/title/:itemId` has its own `<Route>` in
  the shell and no place in either bar, the same call #10 made for
  `/settings/home-layout`: a title page is reached from a card, never from a
  navigation bar, and an entry in `SECTIONS` would put it in both. `SECTIONS`
  is still the one list of sections. The address is written once, in
  `titlePathFor` in `src/title/title-page.ts`.
- **A pop-up where there is a wide precise pointer, a full page everywhere
  else** — `useWidePointer()` beside `useWideScreen()` in `src/shell/layout.ts`,
  so one module still owns every breakpoint. It asks the pointer as well as the
  width because a 1080p TV is the widest screen in the house and is driven with
  a remote; `pointer` is a media feature (Chrome 41), not a container query, so
  ADR 0002 leaves it alone. A device with no `matchMedia` gets the full page,
  which is the layout that works everywhere.
- **The pop-up is `position: fixed`, and that is not only a look.**
  `spatial-navigation.ts` tries the page's own flow before anything fixed, and
  *from* inside something fixed the fixed thing is the flow — so the arrow keys
  stay inside the pop-up with no focus trapping of ours. #7 wrote that rule for
  this screen.
- **It is one route, not an overlay over a live Home.** `preact-iso`'s `Router`
  renders only the matching route, so opening a title page unmounts the screen
  behind it: the pop-up is a dialog shape over the app's own background rather
  than over the Home that was there a moment ago. Hoisting an overlay outside
  the `Router` and freezing the previous route was the alternative, and it would
  make the title page the one screen in the app that is not an address and give
  Back a second meaning. Back is the browser's back button here as everywhere,
  and Home comes back from the Server, which every section already does.
- **One gateway query, grown rather than added.** `getTitles({ ids, detail })`
  reads it: `/Items` rather than `/Items/{itemId}`, deliberately, so the
  gateway's `includeItemTypes=Movie,Series` goes on protecting it and a
  hand-typed `/title/album-…` answers with nothing and the page says so. `detail`
  is the fields no Row needs — `Overview,People,MediaStreams,ProviderIds`, the
  backdrop and logo image types, and `enableUserData` for the watched state. The
  ratings, `RunTimeTicks`, `ProductionYear` and `OfficialRating` are **not**
  `fields` values: the Server always sends them.
- **`titleDetailsFrom` is in `src/catalogue/catalogue.ts`**, so that module is
  still the only place a `BaseItemDto` is read. Every field the Server may leave
  out is left out rather than defaulted, which is story 81 past the ratings as
  well as in them: the Server omits `CommunityRating` when it is not above zero,
  and `CriticRating` and `OfficialRating` are unguarded, so a null and an empty
  string are handled here. A label with nothing after it is left out of the
  document entirely — "no cast" and "the Server did not say" look the same, and
  neither is worth a line.
- **Nothing on it is a second way to do something.** My List is `MyListToggle`
  over the shell's one store (#13), and it is always drawn here and always a
  focus stop — on a card in a Row it is hover-only, so **this page is the only
  way a remote reaches My List** (story 70). The card mapping is `cardForTitle`
  (#24) and More like this is the `Row` (#7).
- **Mark watched is local to the screen**, not a store: it shows before the
  Server has agreed and is taken back with a line that says so, the bargain My
  List makes. Nothing else shows a watched state yet — Continue Watching (#12)
  and the enlarged card (#21) are what would make it a store.
- **The Collection is named, not browsed.** `/Items/{id}/Collections` answers
  with the BoxSets a Title is in, and the page says their names. Showing the
  *other Titles* in one means a query per Collection and a BoxSet that can be
  opened, which is #15's Collection Rows and their `parameter`, not this.
- **Play opens the player** (#25), which is an overlay over this page rather
  than an address of its own — see "Playing a Title" below. The page passes it
  the resume point it already read, so Play resumes without asking again.
- **A language's name is the locale's own.** `title.language` is one message
  whose function holds a small dictionary per locale, falling back to the code
  itself. `Intl.DisplayNames` is Chrome 81 and the floor is 68.

### A Series on it (#18)

`src/title/series.ts` is story 71 and the Series half of story 69: the Seasons
there are to pick from, the Episodes under each, and which one Episode a single
press of Play means. `series-episodes.tsx` draws it; every rule is in the first
file, as a pure function of what the Server said.

- **Two reads, and the whole Series at once.**
  `GET /Shows/{seriesId}/Seasons` is read for the Seasons' names and numbers,
  and `GET /Shows/{seriesId}/Episodes` for **every** Episode across them.
  Deliberately not one Season at a time: the one question that spans Seasons is
  which Episode Play starts, and asking per Season would make that a merge of
  answers each ordered only within itself. Switching Season in the picker is
  then not a question for the Server at all, which is also what makes the
  picker instant on a remote.
- **They are read after the Title, not beside it**, unlike More like this and
  the Collection. Only the Title says whether this is a Series: asking a Server
  for the Seasons of a Movie is a question about a shape it is not, and it
  would answer every Movie's page with a 404 to swallow. One extra round trip
  on a Series' page is the price, and a Movie's page makes no request it has no
  use for.
- **The Server's own order is kept, and nothing sorts the Episodes.**
  `/Shows/{id}/Episodes` answers in aired order, which is the order a Series is
  watched in, and re-deriving it would also be exactly the kind of thing that
  behaves differently on the target: `Array.prototype.sort` is only stable from
  Chromium 70, one above the floor. The Seasons are grouped out of that one
  list, so the list and the picker cannot disagree about what comes next.
- **A Season the Server does not hold as an item still gets a tab.** Jellyfin
  serves Episodes whose Season is not an item of its own, so the number on the
  Episodes is the fallback and the name is `title.seasonNumber`. A Season the
  Server lists but holds **no** Episodes of is left out — a tab showing nothing
  is worse than one Season fewer — and Episodes the Server placed nowhere at
  all are gathered into one last group rather than hidden.
- **Which Episode Play means is one answer, computed once.** `episodeToPlay` is
  it, and `loadSeries` puts it on the page as `upTo`: the Play button and the
  Season the list opens on both read that one value, so the page can never
  offer Season 1 of a show somebody is half way through. The rule is an
  in-progress Episode first — the most recently played of them, because an
  Episode abandoned last night is where the User is and one given up on last
  month is not — then the first unwatched, then the first of all, so Play never
  does nothing on a Series somebody has finished.
- **A finished Episode is never resumed.** The Server keeps the position
  playback ended at, so `played` beats a stored position both in the choice and
  in what the player is handed.
- **The player is told what is playing, not what page it is over.** The title
  page's `PlayTarget` carries the item, the name and the resume point, so for a
  Series it is an *Episode* that plays and `title.episodePlaying` heads the
  player with the Series and the Episode — a player headed only "Sleepytime"
  says nothing about which show it is.
- **Marking an Episode watched is local to the list**, the bargain the Title's
  own mark makes (#17): the press shows before the Server has agreed and is
  **forgotten** rather than inverted when the Server refuses, so the Episode
  falls back to what the Server said. The list holds only the Episodes a User
  has pressed, which means a page re-read picks the Server's answer up by
  itself.
- **The arrow keys need nothing of their own.** The picker is a group of
  buttons with `aria-pressed`, reached geometrically the way Search's genre
  chips are and deliberately not a `data-focus-group`: a Season is picked once
  and there is nothing to come back to. The Episodes are a *vertical* list,
  which is what lets each one carry two focus stops where a card in a
  horizontal Row cannot — Down steps through the Episode and then its watched
  toggle instead of reading a line of cards.
- **#31 reads `SeriesPage.episodes`.** Skip Intro/Credits and the next Episode
  needs to know what follows the Episode now playing, and that is a position in
  this one aired-order list. It is kept beside the Seasons for exactly that,
  and nothing of #31 is built here — `nextEpisodeIn` is in `play-target.ts`,
  beside what pressing Play means, and reads this list.

## The extra ratings

`src/ratings/` is #20, stories 80–82: Rotten Tomatoes' audience score,
Metacritic, Letterboxd and Trakt, beside the Rotten Tomatoes critic score and
the community score the Server already sends. It is the whole of the client
side; the container's route under it is "The ratings route" below.

- **It never talks to MDBList, and it never asks whether there is a key.**
  ADR 0004 keeps the host's key inside the container, so this reads
  `GET /api/ratings/:provider/:type/:id` on the app's own origin. There is no
  capability flag in the runtime config to check first, by design — the config
  carries the Server address and the app version and nothing else. The route's
  **503 is how the app learns there is no key**, and that answer is remembered
  per origin, so a host with no key costs one request for the whole visit
  rather than one per Title. Everything else the route can answer means "no
  extra ratings": story 80 makes them an optional extra and story 81 leaves a
  missing one out, so there is nothing to tell a User about.
- **The join key is `TitleDetails.providerIds`**, which `catalogue.ts` reads
  from `ProviderIds` and narrows to the two MDBList is asked by. It is on
  `TitleDetails` and not on `Title` because the Server only sends `ProviderIds`
  with the title page's detail fields, so a Row's Titles never carry one. IMDb
  is preferred and TMDb is the fallback; `Movie` is MDBList's `movie` and
  `Series` its `show`. A Title with neither id is never asked about at all.
- **The shape of MDBList's `ratings[]` is undocumented** — its own OpenAPI
  schema types the elements as a bare object (`docs/research/ratings-mdblist.md`
  §19) — so `extraRatingsFrom` reads `{ source, value }` defensively and
  **skips** anything it does not recognise: an unknown source, a missing or
  non-numeric value, and a number off its source's own scale. Three sources
  publish a percentage and Letterboxd publishes stars out of five, which is why
  the scale is part of the model and not part of the message. `decisions.md`
  §13 records what this cost and what would confirm it.
- **The cache is per Title and holds promises**, so a Row of cards appearing at
  once shares one request rather than starting one each. A *failure* is
  forgotten rather than remembered, so a blip does not switch a Title's ratings
  off for the rest of a visit — the container draws the same line, for the same
  reason.
- **#21's enlarged hover card should use `<ExtraRatings details compact />`**,
  and nothing else. It takes the Title's `TitleDetails` and needs no wiring:
  the read happens when it mounts, which on a card means on hover rather than
  eagerly for every card in a Row — `ratings-mdblist.md` is explicit that eager
  reads would burn the free tier's 1,000 requests a day. `<ExtraRatingBadges
  ratings compact />` is the drawing alone, for a screen that already holds its
  ratings, and `useExtraRatings(details)` the reading alone.
- **The badges wrap, and so does the facts line above them now.** A row of four
  source names and four scores is exactly the shape that runs off the side of a
  375px screen, and the title page's facts and actions lines were already doing
  it: they were one grid row of `max-content` columns, which made the whole
  sheet 635px wide on a phone. No end-to-end test could see it, because
  Playwright scrolls an element into view before touching it, so everything was
  "visible" throughout. All three are wrapped flex with margins on the children
  now (flex `gap` is Chrome 84 and silently does nothing on the floor), and
  `test/e2e/extra-ratings-on-the-title-page.spec.ts` asserts the document's own
  scroll width at 375px, which is the check that would have caught it.

Where it is tested:

| Where | What it covers |
| --- | --- |
| `test/unit/extra-ratings.test.ts` | The reading, over HTTP, through the container's **real** ratings route with MDBList faked at the `fetch` seam: which Title is asked about, what comes out of the answer, the cache, no key, a Title MDBList does not know, and every way of failing. `@vitest-environment node`, because happy-dom applies the Same Origin Policy and the container sends no CORS headers — in the image it is the app's own origin. |
| `test/unit/extra-ratings-on-a-screen.test.tsx` | What the badges say, and that a Title with none adds nothing to the page. |
| `test/unit/title-page-journey.test.tsx` | That a title page with no container behind it at all still comes up, with the Server's own ratings and nothing extra. |
| `test/e2e/extra-ratings-on-the-title-page.spec.ts` | The whole chain in a browser — real container, real build — plus the layout at 375px and the key being nowhere the browser can read it. |

## Playing a Title

`src/playback/` is #25: Play on a title page, through Jellyfin's negotiation,
to a `<video>` that reports what it is doing. #26 grows the controls, #27 the
tracks, #28 the Subtitle Offset, #33 Cast and #34 Play On.

- **The DeviceProfile is the whole negotiation**, and it is built from the
  device layer and nothing else (`device-profile.ts`). The Server reads it and
  decides between the file untouched, a remux and a transcode, so a profile that
  claims the wrong container is the one bug that looks like a broken player.
  The shapes are **written out rather than imported from `@jellyfin/sdk`**: its
  `DeviceProfile` is typed against generated *enums*, and only its types may be
  used (`decisions.md` §4). HLS is asked for wherever there is something to play
  a playlist with, and a progressive mp4 is always offered too, so no device is
  left with no fallback at all. A transcode is asked for in h264/aac — the
  narrowest pair every target decodes — rather than the device's best, because
  spending the Server's CPU on HEVC to reach a device that would have
  direct-played is the wrong trade.
- **`POST /Items/{id}/PlaybackInfo`, body only.** The `GET` form cannot carry a
  profile at all and the `POST` form's query parameters are the older way of
  saying the same things. **The fake refuses a query parameter outright**, so a
  client that sends one is caught here rather than on a real Server.
- **`TranscodingUrl`, `SupportsDirectPlay` and `SupportsDirectStream` are per
  media source, never on the response.** That is the single most common mistake
  with this endpoint. The transcoding URL is server-relative, already fully
  parameterised and already carrying its own `ApiKey`: it is used verbatim, and
  `gateway.absoluteUrl` is the only thing done to it.
- **Three outcomes, and two of them are failures that are not the same thing.**
  `planning.ts` answers `play`, `cannot-play` or `unavailable`: a Server that
  would not answer is a problem with the Server, and a Server that answered
  "there is no way to play this" is a healthy Server saying no. #26 shows a
  different message for each.
- **The resume point goes into the request, not only into the player.** A
  transcode is cut from `StartTimeTicks` by the Server, so a client cannot seek
  into segments that do not exist; a direct-played file is seeked by the player
  and a transcode deliberately is not. The point itself is
  `UserData.PlaybackPositionTicks`, read in `src/catalogue/catalogue.ts` with
  everything else, and **left out when it is zero** — "start from the
  beginning" is the absence of a resume point, not a resume point of zero.
- **hls.js is the app's first lazily loaded thing**, and the pattern for the
  next one. `video-source.ts` holds the one `import()` in the app, so hls.js is
  a chunk of its own (584 kB raw, 182 kB gz) that is fetched only when a
  playlist has to be played on a device with no HLS player of its own. An e2e
  test fails if a direct play fetches it. `vite.config.ts` raises the chunk-size
  warning just past it rather than switching the warning off.
- **`Hls.isSupported()` before `canPlayType()`** (`decisions.md` §8) is kept one
  level down: `src/device/browser.ts` only claims `playsHlsNatively` where there
  is no Media Source to prefer, because `canPlayType` answers a truthy `"maybe"`
  for HLS in Chrome. The full build, not `hls.light`, which drops the alternate
  audio and subtitles #27 needs.
- **Four reports are the whole of what Jellyfin knows about a session**:
  `Playing`, `Playing/Progress`, `Playing/Stopped` and `Playing/Ping`. They
  drive the resume point, Continue Watching, the Server's own session list and
  keeping a transcode alive. `PlaybackStopInfo` is a **different, smaller**
  shape — no `IsPaused`, no `PlayMethod`, and a `Failed` flag the others lack —
  and the ping's argument is the only one that goes in the **query**.
- **The reporter has no timers.** The player already has the video's own events
  and one interval, and a second schedule would be a second thing to keep in
  step with the picture; it would also make every test of the throttle a test of
  fake timers. The clock is injected instead. A pause or a seek is reported at
  once; the position creeping along four times a second is not, and goes every
  ten seconds. **Stopping is idempotent**: a Title running to its end both
  reports the stop and closes the player, and closing reports the stop.
- **A Server that will not record progress never stops a User's film.** Every
  report failure is swallowed, and `unreported()` is how the player says so
  beside the picture rather than instead of it.
- **The player is an overlay, not an address** — the same call the User Picker
  made (#8), and for the same reason: a player is something over the Title a
  User was looking at, not a place they navigated to, and an address would put a
  history entry between the two and make Back mean something different inside
  the player. It claims Back with `useBackClaim`, which is the one Back
  handler's own extension point.
- **`position: fixed` is load-bearing.** From inside something fixed the fixed
  thing is the arrow keys' flow (#7), so the player's controls keep focus with
  **no focus-trapping code at all**, exactly as #17's pop-up does.
- **The media keys are a listener of their own**, not something taken off the
  navigator: Play, Pause, PlayPause and Stop are not keys it owns. A key press
  on one of the player's own buttons is left alone, for the reason #7 wrote
  down — the browser presses a focused button itself, and acting on the key as
  well would toggle twice for one press. **#26's arrow keys are the ones that
  have to be taken *before* the navigator**, not beside it.
- **Every control carries the Title's name** ("Pause Arrival", "Seek through
  Arrival"), as a card's My List toggle does: a screen reader hears what is
  being paused, and the player's Play is never confused with the title page's
  underneath it.

### The controls over it (#26)

- **The seek bar is a `role="slider"`, not an `<input type="range">`.** A range
  input comes with its keys, its drag and its semantics for nothing, and it
  cannot be used: it is an `<input>`, and both `src/shell/back.ts` and
  `src/navigation/focusable.ts` deliberately leave a *field's* keys alone — so a
  focused range input would quietly take Back and the arrow keys away from the
  player. A slider is not a field.
- **The player owns every key it answers, and the arrow keys are decided
  against the state *before* the press.** With the controls hidden the first
  press of anything is "show me the controls" and nothing else; with them up the
  arrows are the navigator's and move between the controls, except on the seek
  bar, where Left and Right are a step along it. A remote's own Rewind and Fast
  Forward are always a seek. This is why keys are **not** among the inputs
  `controls-visibility.ts` listens for: a listener there would reveal the
  controls before the player could tell which case it was in.
- **The controls are not rendered while they are idle**, rather than faded or
  `visibility: hidden`. A control a User cannot see must not be reachable by the
  arrow keys and must not be read out, and both of those are true of nothing at
  all and false of something transparent.
- **Controls that appear take focus**, unless focus is already inside the
  player. Two moments need it and they are the same moment: the player opening
  (focus is still on the title page's Play button *behind* the picture, and the
  flow rule above means an arrow key there would walk the page nobody can see)
  and the controls coming back after hiding (the control focus was on has gone,
  so the browser has handed focus to the document). It waits for the
  negotiation, because until then there is nothing to pause, the button is
  disabled, and `focus()` on a disabled button does nothing at all.
- **Controls stay up whenever there is nothing to watch behind them**: paused,
  still negotiating, or showing a problem. A paused player that hid its controls
  would be a still frame with nothing to press and no sign there was anything.
- **Retry is for the failures that could answer differently.** A Server that
  would not answer, and a `<video>` that failed, are worth asking again, and
  Retry is one piece of state: the planning effect depends on an attempt number.
  A Server that answered "there is no way to play this" is a healthy Server
  saying no, and asking twice gets the same answer, so Back is the only honest
  offer.
- **The length is the element's own as soon as it has one, and the Server's
  until then.** `PlaybackInfo` says how long a source is before a browser has
  read a byte, which is what the bar draws with while the file loads; the file
  in front of the User is the one that is right. The e2e suite leans on exactly
  this gap — the fake's library says Arrival is 116 minutes and the file it
  really serves is six seconds.
- **A seek never lands on the end.** Seeking to exactly the end fires `ended`,
  which reports the stop and closes the player, and a User pressing Right has
  not asked to leave. `scrubbing.ts` stops a second short, and holds everything
  else a media element can report badly: `NaN` before the metadata, a length of
  `Infinity` for a live source, a position past the end.

### The sound and the subtitles (#27)

The tracks a Title is watched with. #28 has since grown the Subtitle Offset on
the seams noted below — see "The Subtitle Offset" after this section — and #29
(styled ASS/SSA subtitles) has grown on them too, in "Styled subtitles" below.
#30 (image ones) is still to come, with the seams it needs noted rather than
built.

- **The Server chooses the default tracks, and this app never matches a
  language.** `UserConfiguration` holds a User's `AudioLanguagePreference`,
  `SubtitleLanguagePreference` and `SubtitleMode`, and a Jellyfin server applies
  all three when it answers `PlaybackInfo` — so `DefaultAudioStreamIndex` and
  `DefaultSubtitleStreamIndex` are read and used as they come. A second copy of
  that rule in the client would disagree with every other Jellyfin app the first
  time a `SubtitleMode` was involved. This is also why the **fake** models the
  rule (`routes/media-info.ts`): against a fake that always answered "the first
  track", a client that matched languages itself would pass.
- **An index is `MediaStream.Index`, never a position in `MediaStreams`.** They
  differ for exactly the files that have external subtitle files, which are
  appended with indexes of their own. `media-tracks.ts` is the one place the
  streams are read, and the fake's sample data carries real indexes so a client
  that used the array position is caught.
- **Switching the subtitles never touches the media element; switching the sound
  must.** A subtitle track is a separate file this app fetches and draws, so
  choosing one is pure app state. A sound track is the Server's: a
  direct-played file arrives with every track in it and a browser gives no way
  to pick one, and a transcode carries only the track the Server was told to
  use. So the sound re-negotiates, and what is owed the User is their **place** —
  the next `PlaybackInfo` starts from where they were (`restartTicks` in
  `player.tsx`), and the subtitles they chose survive it.
- **The app parses SRT and VTT itself, which is a deliberate departure from the
  research.** `player-subtitles.md` §6c recommends a native `<track>` in
  `mode = 'hidden'` to borrow the platform's WebVTT parser. `subtitle-cues.ts`
  does not, and the long reason is in that file's own header: §6c's design
  already hands the *timing* half to the app (there is no offset hook on
  `activeCues`), happy-dom has no WebVTT parser so the ticket's "Vitest covers
  parsing" would have nothing to assert, a cross-origin `<track src>` fails
  silently and the Server is always another origin, and `<track>` cannot read
  SubRip at all. The cost is the rest of the WebVTT grammar — positioning,
  regions, inline markup — and §6c says to choose that subset rather than
  discover it: **the text of a cue and its line breaks, and nothing else.**
- **A cue is plain text before it reaches the DOM.** `cue.text` is raw markup
  out of a media library, which §6c names as a genuine XSS vector. Every tag is
  stripped in `subtitle-cues.ts`, so no caller can turn one back into markup by
  reaching for the wrong property, and the overlay sets text rather than HTML on
  top of that. **#29 did not change that**: a styled file's markup is drawn by
  libass on a canvas of its own, never turned back into DOM, and the ASS tags
  `flattenAss` understands it *removes*. No tag has earned its way back in.
- **The cue cursor is the seam #28 took over.** `createCueCursor(cues).at(t)` is
  asked for a moment, keeps a moving index rather than filtering two thousand
  cues on every frame, and is correct for **any** position rather than only an
  increasing one — which is what a User dragging an offset back and forth needs.
  An offset is one subtraction at the call site in `subtitles.tsx` and changed
  nothing else, which is exactly what #28 did.
- **A frame loop, not `timeupdate`.** `timeupdate` fires about four times a
  second, which is a visible quarter-second of lag on a cue, and #28 has to take
  effect while a button is held. So the overlay reads the element's position from
  `requestAnimationFrame` — and only while there are cues, so subtitles off cost
  nothing.
- **The overlay is a DOM element inside the player, not inside the `<video>` and
  not a canvas.** §6c pitfall 3: the browser draws native cues inside the video,
  so an app-drawn overlay has to be a sibling within whatever goes full-screen or
  it vanishes the moment it does — the player is that element. A `div` rather
  than a canvas gives text layout, wrapping, font fallback and a screen reader
  for free; canvas is for #30's bitmaps and #29's libass, which need one — see
  "Styled subtitles" below for the one this app now draws. It
  shares the picture's grid cell rather than being positioned over it, so it can
  never sit on top of the controls.
- **`kind` is `text` or `image`, and that is #30's seam.** The classification
  mirrors the Server's own predicates (`jellyfin-playback.md` §14) with **one
  deliberate widening**, written out in `media-tracks.ts`: §14 quotes
  `Contains("dvdsub")`/`Contains("dvbsub")` and then lists `dvd_subtitle` and
  `dvb_subtitle` among the codecs really seen, which match neither — so the
  Server's own test reads those as text. They are ffprobe's names for DVD and
  DVB bitmaps, and the error is asymmetric: calling a bitmap text means fetching
  it as `Stream.vtt`, which the Server answers with the **raw file** for
  graphical formats, so the engine would be handed binary and draw nothing with
  nothing to say. Calling text an image only means the picker says it cannot
  draw that track. **Worth checking against a real Server's output.**
- **An undrawable track is offered and labelled, not hidden.** A missing track
  looks like a Title with no subtitles; a track that draws nothing when pressed
  is worse. It carries `aria-disabled` rather than `disabled`, so a remote can
  still reach it and read why — a `disabled` button is not a focus stop at all.
- **Every choice is a `<button>` with `aria-pressed`, never a radio group**, and
  "off" is a choice like any other. Same call as the settings screen (#11, #35)
  and the Home Layout editor (#10), for the same reason: native radios take Left
  and Right to move the selection, and `src/navigation/` owns the arrow keys for
  moving focus.
- **The menu claims Back on top of the player's claim.** `src/shell/back.ts`
  keeps claims innermost-last, so Back closes the menu and leaves the Title
  playing, with neither the player nor the picker knowing about the other. It is
  `position: fixed` inside the player, which is also fixed, so focus stays inside
  it with no focus-trapping code — the rule #7 wrote and #17's pop-up relies on.
- **A failure is said beside the picture, not instead of it.** A Server that will
  not hand over a subtitle track has not cost the User their film, so the notice
  sits over the picture like #25's unreported-progress one — and it is on the
  **player** rather than only inside the picker, because the press that failed
  also closes the picker. A track that arrives holding no cues is the same thing
  to a User as one that was refused, and says the same.
- **The track's name is the Server's `DisplayTitle`**, falling back to the
  language's translated name (`title.language`) and then to its index. A Server's
  label is data, like a Title's name, and it is what every other Jellyfin app
  shows for that track.

Where each thing is tested: parsing and timing in
`test/unit/subtitle-cues.test.ts`, with the WebVTT and SubRip grammars as
written-out literals; the stream list and the text/image classification in
`test/unit/the-tracks-of-a-title.test.ts`; the Server's own choice of default
tracks, and the plan carrying it, in `test/unit/planning-playback.test.ts`; the
subtitle URL's canonical path form in `test/unit/gateway.test.ts`; and the whole
journey — the picker, the defaults coming from the account, a cue drawn, and
which switches restart playback — in `test/unit/choosing-tracks.test.tsx`. What
only a browser can say is in `test/e2e/playing-a-title.spec.ts`: **where an
arrow key really sends focus**, since happy-dom gives every element a zero-sized
box, and a cue really painted inside the picture's own box.

The fake serves real subtitle files (`routes/subtitles.ts`), which is the second
place a fake owes a client real data rather than a shape — and **the text names
the track's language**, so "the User switched to Spanish" is read off the screen
rather than inferred from a URL. `failSubtitleFetchWith` is a Server that holds a
track it will not hand over.

### The Subtitle Offset (#28)

Story 96 to 102, and the thing the spec's problem statement names by hand:
"fixing badly timed subtitles while watching". `src/playback/subtitle-offset.ts`
is the arithmetic and `subtitle-timing.tsx` the panel; the player holds the
offset in force and is the only thing that saves it.

- **A positive offset means the subtitles are later**, which is what the readout
  says out loud, and applying one is **one subtraction**:
  `cursor.at(element.currentTime - offset)` in `subtitles.tsx`. That is the seam
  #27 left for this, and nothing in `subtitle-cues.ts` knows an offset exists.
  The cursor is correct for any position rather than only an increasing one, so
  a User dragging the offset back and forth needs nothing of it.
- **The offset is read through a ref, not a dependency of the frame loop.** A
  held button steps it eight times a second, and a dependency would tear the
  loop down and build it again on each one. It is in force on the next frame,
  which is the whole of "see the result live".
- **Everything is on the tenth-of-a-second grid.** `0.1` is not a tenth in
  binary floating point and three of them added one at a time is
  `0.30000000000000004`, which a readout built from that number says out loud —
  so every function in `subtitle-offset.ts` rounds, including the one that reads
  a stored value back. The offset is therefore always a number the readout can
  print as it is.
- **"Sync to this line" reads the element, not the position state.** A User
  presses it on hearing a line, and `position` is the four-times-a-second
  reading the seek bar draws with: a quarter of a second of staleness would be a
  quarter of a second of error in the one number being measured. It answers
  `undefined` when no line is on the screen, and the panel then offers the
  button with `aria-disabled` and says why **when it is pressed** — a notice
  that came and went with every pause in the dialogue would blink beside the
  number being read.
- **An offset belongs to a subtitle file**, which is `subtitleFileOf`:
  `MediaStream.Path` where the Server gave one, and the media source plus the
  stream index otherwise. `decisions.md` §16 is why, and what to check against a
  real Server.
- **It is saved when an adjustment finishes**, not when it changes
  (`decisions.md` §17). The panel reports a button or key let go, or one press
  of Reset or Sync; the player counts those and an **effect** does the save. The
  effect rather than the callback is load-bearing: a press that both shifts the
  offset and finishes the adjustment sets two pieces of state in one tick, so a
  callback reading the offset would read the value from before its own press.
  No timer is involved, so the player still has exactly the two #31 left it.
- **The stored offset is adopted once per subtitle file**, not whenever the
  settings change — the second would undo a User's adjustment with the value
  they had just replaced, which is the hazard `settings-provider.tsx` guards its
  own first read against. It waits for `loaded`, or a slow Server would hand
  every file an offset of nothing and then adopt it.
- **The panel is anchored to the top of the player**, and that is story 101
  rather than a look: the cues sit at the bottom of the picture and the controls
  are the row below that, so the top is the one place that covers neither. It is
  `position: fixed` inside the player, which is also fixed, so focus stays in it
  with no focus-trapping code — the rule the track picker and #17's pop-up lean
  on — and it takes focus when it opens for the same reason the picker does.
  Without that, Left and Right are still the navigator's and walk the controls
  *behind* it.
- **Left and Right are taken on the panel's own element**, not from `window`, so
  they are the panel's only while focus is inside it; `preventDefault` is what
  takes them off `src/navigation/`. Up and Down stay the navigator's, which is
  how a remote reaches Reset, Sync and Done. The player's own `window` listener
  runs first, in the capture phase, and declines Left and Right unless they
  arrived on the seek bar.
- **Nothing in the panel touches the media element**, so "it does not pause the
  video" is true by construction. The player's keep-the-controls-up rule
  deliberately does **not** list this panel: a paused player is the one thing it
  must not look like.

**Where #29 and #30 meet this.** The offset is deliberately not a feature of the
text renderer. `Subtitles` hands its parsed cues **up** (`onCues`) and takes the
offset **down** (`offsetSeconds`), and the player holds both — so a styled
(#29) or image (#30) renderer drawn in the same place takes the same
`offsetSeconds` and gives it to its own library: libass has `timeOffset` and
`setCurrentTime`, and `libpgs` has `timeOffset`
(`player-subtitles.md` §6a and §6b). Neither has to know how an offset is stored
or adjusted, and nothing above has to know how a cue is drawn. The one case that
has to say the offset cannot apply is **#30's burned-in** subtitles, where the
Server has rendered the text into the picture: what it disables is the *panel*,
and the honest shape for that is `track-picker.tsx`'s `onOpenTiming` — absent
today when there is nothing to time, and for #30 the control offered with
`aria-disabled` and the group saying why in words, which is the treatment an
undrawable track already gets.

Where each thing is tested: the arithmetic, "Sync to this line", the file key
and the stored list in `test/unit/the-subtitle-offset.test.ts`, with literal
expected values; the panel's readout, hold-to-repeat, arrow keys and when it
says an adjustment has finished in `test/unit/the-subtitle-timing-panel.test.tsx`;
the `jf.subtitleOffsets` key in `test/unit/client-settings.test.ts`; and the
journey — opening it from the menu, a different line drawn as the offset moves,
the Title never re-negotiated, and the offset reaching and coming back from the
Server — in `test/unit/shifting-the-subtitles.test.tsx`. What only a browser can
say is `test/e2e/the-subtitle-offset.spec.ts`: the panel's box measured against
the cue's and the seek bar's at both widths, a remote reaching and adjusting it,
and a button really held down.

One hazard that journey had to learn: **a Client Settings save is written behind
the User**, so one a test started can land *after* the next test has reseeded
the Server and hand it an offset nobody in it ever made. It is the same shape as
the stop report that outlives a browser context, two sections down. That file's
`afterEach` waits for the writes to stop arriving before reseeding.

### Styled subtitles (#29)

Story 104: an ASS/SSA track drawn with its own fonts, colours and positions
where the device can, and as plain text with the same timing everywhere else.
`src/playback/subtitle-presentation.ts` is the decision,
`src/playback/ass.ts` the flattener, `src/playback/styled-subtitles.tsx` the
drawing, and `src/device/styled-subtitle-renderer.ts` the engine.

- **One decision, asked once.** `subtitlePresentationFor(track, capabilities)`
  answers `styled`, `cues` or `none` and which file to fetch. The overlay and
  the renderer loader would otherwise be free to disagree about a track, and
  the player has to know the answer too, since it is what picks the component.
- **The styled file is fetched even when it will be flattened.** The Server
  would convert ASS to WebVTT if asked (§14), so the flattening could have been
  left to it. Two reasons it is not: one flattener gives one answer, and a
  **Subtitle Offset is remembered per subtitle file** (#28, story 102) — so the
  same file flattened by the Server on a TV and by this app on a desktop whose
  renderer failed would be remembered against two different sets of cue times.
  And `subtitle-cues.ts` strips `<markup>`, not `{\overrides}`: anything
  ASS-shaped the Server carried into its WebVTT would be drawn at a User
  verbatim. `flattenAss` is the only thing here that speaks that language.
- **`flattenAss` reads the `[Events]` `Format:` line rather than assuming it.**
  SSA v4.00 opens a row with `Marked` where v4.00+ opens it with `Layer`, and a
  flattener with the positions baked in reads every later field one place out.
  A row that enters drawing mode with `{\p1}` is **given up whole**: what
  follows is a path of coordinates, not speech, and a sign typeset that way —
  common in exactly the material this ticket's styling exists for — would
  otherwise draw a line of numbers over the picture.
- **The engine is the device layer's, and the laziness lives inside it.**
  `loadStyledSubtitleRenderer()` is a `DeviceLayer` method whose browser
  implementation is an `import()`, so JASSUB, its worker and two WASM builds
  are in a chunk nobody fetches until a User chooses a styled track. The choice
  of engine differs per device (`decisions.md` §8): JASSUB needs
  `OffscreenCanvas` and `transferControlToOffscreen`, both **Chrome 69**, so it
  cannot run on the Chromium 68 floor webOS 5 sits on, and the TV's answer will
  be its own module. Nothing may import `styled-subtitle-renderer.ts`
  statically, and keeping the question there is what keeps
  `typeof OffscreenCanvas` out of `src/playback/` — the rule that keeps
  `navigator` out of it.
- **The renderer seam is two methods wide**: `setTimeOffset` and `destroy`.
  Everything else such a library offers is settled when it is created, leaving
  the one thing that changes while a User watches and the one thing owed on
  unmount. That is what lets the webOS port answer it with a different library
  without anything above noticing.
- **It rejects rather than returning something that draws nothing.** The
  capability can only say whether asking is worth it; a dropped chunk or a WASM
  binary the browser refused is known only after asking. The player then falls
  back to `cues` — the same overlay, the same flattened file, the same offset —
  because a User who asked for subtitles is owed the words far more than the
  styling. The fallback **resets per subtitle file**: switching away and back is
  the one thing a User does that most looks like asking again.
- **This canvas is §6c's stated exception.** `player-subtitles.md` §6c argues
  for a DOM overlay and `subtitles.tsx` takes that advice; libass rasterises its
  own glyphs and needs somewhere to put the pixels. It is pinned to the
  picture's own grid cell for the same reasons the text overlay is — never over
  the controls, inside the element that goes full-screen — except that it
  **fills** the cell rather than sitting at the bottom of it, because an ASS
  file positions its own lines, signs at the top of the frame included.
  `pointer-events: none`, and the width and height attributes are the
  renderer's.
- **Exactly one of the two draws.** Both at once is every line on the screen
  twice, so the player renders `StyledSubtitles` or `Subtitles`, never both.
- **The offset goes down and the cues come up**, which is the seam #28 left.
  `offsetSeconds` becomes libass's `timeOffset`, as a **dependency rather than
  a frame loop**: one cheap call into a worker, and the renderer keeps its own
  time against the video element. It is read from a **ref** when the renderer is
  created, so a file already shifted opens shifted and a held button does not
  tear a WebAssembly engine down eight times a second. The same file is
  flattened anyway and handed up through `onCues`, purely so **"Sync to this
  line"** can say which line is on the screen — one pass over a file already in
  hand, and the alternative is telling a User that the one feature this app adds
  stops working on the subtitles it works hardest to draw.
- **Embedded fonts are handled by handing over their URLs.** An ASS file names
  its typefaces and the file carries them muxed in beside the video; without
  them libass falls back to whatever the device has, which on a TV is
  approximately nothing. `embeddedFontsOf` reads them off `MediaAttachments`
  onto the plan — the one place a `MediaSourceInfo` becomes this app's
  vocabulary — and the renderer fetches them itself, in its worker.
  **What counts as a font is asked three ways** (`Codec`, `MimeType`, then the
  file extension), because a real Server answers inconsistently and a TrueType
  collection has no codec name at all. Being generous is the cheap direction: a
  non-font handed to libass is ignored, while a font left out is a sign drawn
  wrong.
- **Local fonts are deliberately not queried.** `queryFonts: 'local'` is the
  Local Font Access API: a permission prompt asking to enumerate a User's fonts,
  in the middle of a film, is not a trade this app makes for a closer match to a
  typesetter's intent.
- **LGPL.** JASSUB bundles libass, and shipping the WASM binary is distribution.
  The repo and image owe the licence texts; tracked as its own issue rather than
  done here, since there is no licences screen yet to put them on.

Where each thing is tested: the ASS grammar — the `Format:` line, override
tags, `\N`, `\h`, `Comment:` rows and drawing mode — in
`test/unit/flattening-styled-subtitles.test.ts` with the grammar as written-out
literals; the presentation decision per capability profile and the font
attachments in `test/unit/choosing-how-to-draw-subtitles.test.ts`; and the
journey — the file and its fonts reaching the renderer, the canvas drawn
instead of the overlay, the offset and "Sync to this line" crossing the seam,
the renderer destroyed when the track is turned off, the fallback to the words
when it will not load, and the renderer never loaded for a plain track or on a
device that cannot draw the styling — in `test/unit/styled-subtitles.test.tsx`.
The renderer itself is faked in `test/device/profiles.ts`, which is the device
boundary like the rest of that file: no test runs a 2 MB WASM binary in
happy-dom, and nothing in this project reads what libass draws.

The fake serves a real styled track (`routes/subtitles.ts`): sections, a
`Format:` line, a style naming an embedded font, override blocks and a
`Comment:` row, at the same two cue times every other format it serves uses, so
a test can switch tracks and compare like with like. `MediaAttachments` reaches
the client and `GET …/Attachments/{index}` answers the font bytes.

### Skipping, and the next Episode (#31)

The intro and credits markers, and what the end of an Episode offers. The rules
are `src/playback/media-segments.ts` and — for *which* Episode comes next —
`src/title/play-target.ts`; the player draws their answers and decides nothing.

- **The markers come from the Server, and only where it says there are any.**
  `GET /MediaSegments/{itemId}?includeSegmentTypes=Intro,Outro` is the read, and
  `MediaSourceInfo.HasSegments` on the plan is what decides whether to make it at
  all — `jellyfin-playback.md` §12 says that flag "exists precisely to avoid a
  pointless request", and segment data is plugin-fed, so most households run a
  Server that holds none. The read hangs off the **plan** rather than the Title,
  because a change of sound track is a new plan and the markers belong to the
  source it names.
- **There is no `Credits` segment type.** The whole enum is `Unknown, Commercial,
  Preview, Recap, Outro, Intro` and the credits marker is **`Outro`**
  (`decisions.md` §5). `Recap` and `Preview` are real and deliberately not
  offered yet (`decisions.md` §14); `Commercial` is Live TV and never will be.
- **A 404 and an empty answer are the same thing, in one place.** §12 leaves
  which a Server with no provider gives open, so `readMediaSegments` makes both
  — and an unreachable Server — an empty list. Nothing downstream has to know
  there were ever two spellings of "nothing to skip", and no User is shown an
  error for the ordinary case.
- **The Skip button is not in the controls**, and that is the whole of why it is
  its own component. The controls get out of the way after a few seconds, and an
  offer good only for the length of an intro cannot be one a household has to
  summon them to find. It shares the picture's grid cell the way the subtitles do
  (`grid-row: 1`), so it can never sit over the controls, and being a `<button>`
  inside the player is all the arrow keys need — from inside something fixed, the
  fixed thing is the flow (#7, and #40's innermost-ancestor fix is what keeps
  that true on a title page). The press goes through the player's **one seek
  path**, so it reports to the Server and is clamped: a credits marker that runs
  to the last frame lands at the end rather than firing `ended` under the finger.
- **Which Episode comes next is `play-target.ts`'s**, beside what pressing Play
  means, because a Series holds no file and both are the same class of rule. It
  is a position in `SeriesPage.episodes`, which spans Seasons, so a Season finale
  offers the next Season's first Episode. A `PlayTarget` carries `seriesId` for
  an Episode and only for one: that is both how the question is asked and how a
  Movie says there is nothing after it.
- **The next Episode is not the next *unwatched* one.** The Server's order is the
  order a Series is watched in. That is deliberately different from `episodeToPlay`
  (#18), which does resume where somebody left off: Play is "take me where I am",
  and this is "what comes after this one".
- **The countdown follows the User's Jellyfin account, and nothing else.**
  `EnableNextEpisodeAutoPlay` is already in the tree through
  `usePlaybackPreferences()` — #35's provider sits above the router and says the
  player is the reader it was waiting for — so there is no second path to the
  Server. Autoplay **off still offers** the next Episode, with nothing counting:
  #35's settings screen draws the two readings as "Start the next one" and "Ask
  me each time", and closing the player would make its own wording untrue
  (`decisions.md` §13). Ten seconds is Jellyflick's own figure; Jellyfin stores
  no duration.
- **Cancelling stays at the end**, which is the ticket's fourth box read the way
  `decisions.md` §13 sets out. The controls stay up — an Episode that has run out
  is "nothing to watch behind them", the same rule a paused player follows.
- **The player asks the screen to re-target rather than swapping the Episode
  under itself.** "What is playing" already lives on the screen: the title page's
  Play set it and the Billboard's did, so both pass `onPlayNext`. Both also
  **key the player on the item**, which is load-bearing rather than tidy — the
  player holds the state of one playback, and carrying `restartTicks` or a chosen
  sound track into a different Episode would start the next one at the moment the
  last one ended.
- **The countdown is the player's second timer**, and the only other one. The
  reporter deliberately has none because it has the video's own events to go on;
  a countdown has nothing else to read a clock off.

Where each thing is tested: the marker arithmetic and the 404/empty equivalence
in `test/unit/skipping-intros-and-credits.test.ts`, which Episode follows in
`test/unit/the-next-episode.test.ts`, the endpoint and its narrowing in
`test/unit/gateway.test.ts`, `HasSegments` reaching the plan in
`test/unit/planning-playback.test.ts`, and what a User sees — the offers, the
account's two readings, cancelling, and the Server hearing one session per
Episode — in `test/unit/skipping-and-the-next-episode.test.tsx`. What only a
browser can say is `test/e2e/skipping-and-the-next-episode.spec.ts`: the picture
really moving, an Episode really running out, a remote reaching every new button
by direction, and the two offers measured against the viewport.

## The fake Jellyfin serves real video

`test/fake-jellyfin/routes/videos.ts` is the one place a fake owes a client
**real data** rather than a shape to assert on — a browser has to decode what it
is given. `test/fake-jellyfin/media/test-video.webm` is six seconds of VP9 in
WebM, about 11 kB, drawn by `node scripts/make-test-video.mjs` and committed the
way the icons are.

- **VP9, not H.264.** Plain Chromium ships no H.264 or AAC decoder, so an MP4
  would not play in the browser Playwright runs.
- **It is made from two things already installed**: Playwright's Chromium
  records a canvas with `MediaRecorder`, and Playwright's own bundled ffmpeg
  remuxes that recording — a live recording's header carries no duration and no
  cues, so without that step a browser can neither report its length nor seek.
  Nothing was added to the project to make it.
- **Every source serves that one file**, whatever `PlaybackInfo` *claims* the
  file is. `FakeItem.media` is the claim, and the claim is all the negotiation
  reads: Arrival is WebM/VP9 so it direct-plays in a browser, Heat is 4K HEVC in
  Matroska so it cannot, Paddington's only problem is its height, and The
  Unfinished has no file at all.
- **Range requests are answered**, because a browser seeks with them, and
  seeking is how a resume point is honoured on a direct-played file.
- **There is no transcoder, so there is no real HLS.** A `master.m3u8` answers
  **501** with a message saying so. The transcode *decision* is asserted from
  `PlaybackInfo` in `test/unit/planning-playback.test.ts` instead; whoever needs
  a browser to really play a transcode has to grow a playlist here.

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
  **that overlay** is the flow, and the distinction is load-bearing: the phone's
  bottom bar and the player are both fixed, so grouping everything fixed
  together put a bar the player is drawn over, and that a User cannot see,
  between the seek bar and the buttons under it, where Up found it. `inert`
  would say this in one word and is Chrome 102, well past the floor, so the flow
  a thing belongs to is which fixed thing it is **inside** (`fixedRootOf`).
- **An overlay has no way out of it, and the page does** (#27). From the page's
  own flow, fixed chrome is a fallback once the page has run out that way, so
  the phone's bottom bar stays reachable. From **inside** an overlay there is no
  fallback at all: "nothing further that way" is the answer. #26 let the
  fallback apply both ways round, and on a phone that meant Right from the
  player's last button focused a card on the title page *behind* the picture —
  the player's buttons sit in a column at that width, so there was nothing to
  the right inside it. An overlay covers the screen, so anything outside it is
  something the User cannot see. This is what makes "the arrow keys stay inside
  the pop-up with no focus trapping of ours" true rather than nearly true, and
  it holds for the player, the title-page pop-up and the User Picker alike.
  `test/e2e/playing-a-title.spec.ts` presses all four directions inside the
  player and fails if any of them leaves it.
- **A key a screen has already answered is not the navigator's.** It leaves a
  `keydown` whose `defaultPrevented` is set alone, and that is the whole of how
  a screen takes an arrow key: the player (#26) listens on `window` in the
  **capture** phase and calls `preventDefault` on the keys it means to have.
  `stopPropagation` is not the mechanism and cannot be — a capture listener on
  `window` does not stop `window`'s own listener on the way back up.
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
- **A card is a focus stop, not a button.** `Row` takes an `onCardPress` and
  Enter clicks the focused card; a Row given no handler is browsable and not
  pressable. Every Row in the app now passes one, and it opens the Title's page
  (#17). Enter deliberately leaves a real link, button or field alone — the
  browser presses those itself, and a second click here would press them twice.
- **A field owns Enter as it owns the arrow keys.** `pressFocusedItem` reads
  `document.activeElement`, and Search's field moves focus itself on Enter
  (#24), so one press used to both leave the field *and* press the card it
  landed on. That was invisible until #17 gave a card somewhere to go, and it is
  the second half of the rule a screen taking a key back relies on: take the key
  *before* this handler, and this handler stays out of a field entirely.
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


## Search

`src/search/` is story 59 (live results) and story 60 (browse by genre).

- **"Only Movies and Series" lives in the gateway, not on a screen.** Every
  Title query carries `includeItemTypes=Movie,Series`, so the Server never
  sends an Episode, a Season, an album or a stray video file at all. Two
  gateway methods serve the whole feature: `getTitles({ searchTerm, genre,
  limit })` is `GET /Items` with `recursive=true` and `sortBy=SortName`, and
  `getTitleGenres()` is `GET /Genres`. Whoever builds Movies, Series or My List
  should grow `getTitles` rather than add a second `/Items` method.
- **The debounce is on the value, not the request.** `useDebounced` in
  `search-screen.tsx` answers with the term as it was once it stopped changing,
  so one place decides when a term has settled and everything downstream simply
  reads a term. A word typed at speed is one question to the Server.
- **No flicker means nothing is cleared.** The results on the screen stay there
  while the next answer is in flight — the strip is never emptied and never
  replaced by "Searching…" between keystrokes. A reply that arrives after a
  newer question was asked is dropped, so the slowest answer cannot overwrite
  the newest.
- **The field owns its arrow keys, and hands two of them back.**
  `spatial-navigation.ts` returns early inside anything editable, so Left and
  Right move the caret and Backspace is an edit (`back.ts` leaves a field alone
  too). The field's own `onKeyDown` takes **Down and Enter** — before that
  handler, not beside it — and moves focus to the first focus stop after it in
  the `<main>`: the strip of results, entered at the card it remembers, or the
  genres when nothing has been typed. Document order rather than geometry,
  because happy-dom gives every element a zero-sized rectangle and geometry
  could not be pinned down in a unit test at all. This is the pattern for any
  screen that needs a key the navigator owns.
- **The field is deliberately narrow** (`.search__field`, 420px). `nearest.ts`
  scores a candidate partly by how far its centre is across the direction
  pressed, so a field spanning a 1920px screen loses Up from a result to
  whichever link in the bar above happens to sit over that card. Anything
  full-width and focusable has this problem; keep it narrow or expect the bar
  to win.
- **A genre is screen state, not an address.** Back is the browser's back
  button everywhere in this app, and a genre that pushed a history entry would
  make Back mean "the genre before this one" on a screen whose other half is a
  text field. "All genres" is the way out, and it is a focus stop like
  everything else. If a later ticket wants a genre to be bookmarkable, that is
  a deliberate change to Back's story as well.
- **The genre chips are not a focus group.** A genre is picked once and there is
  nothing to come back to, so the arrows reach each one geometrically, the way
  they reach the links in a navigation bar. Only strips that should be re-entered
  where focus left them mark themselves `data-focus-group`.
- **The card mapping is `cardForTitle` in `src/home/row.tsx`**, where the card
  itself already lives, so every Row asks the Server for artwork at the same
  width. Search and New on Jellyflick both use it; a new Row should too rather
  than build an image URL of its own.
- **Opening a result opens its title page** (#17), which is the same handler
  every Row on Home passes — `useOpenTitle`, in `src/home/open-title.ts` since
  #12: it used to live in `home-rows.tsx`, which each Row's own module then had
  to import back from the file that imports *them*, and a cycle like that works
  only until one of the two grows something evaluated at import time.

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
- Quick Connect ties the token to the DeviceId that called **`Initiate`**, not
  the one that called `AuthenticateWithQuickConnect` and not the device that
  approved. `GET /QuickConnect/Connect` answers **404** for an expired, a
  withdrawn and an already-spent request alike, so no client can tell those
  apart. See "Signing in" above.
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

**The client side of this is `src/ratings/`** — see "The extra ratings" above.
Nothing else calls this route, and nothing anywhere calls `api.mdblist.com`.

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
