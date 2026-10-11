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
  home/                 Where a signed-in User lands: `home-layout.ts` is which
                        Rows and in what order, `home-rows.tsx` which kind is
                        drawn by what, `row.tsx` the Row, its card and
                        `cardForTitle`, one module per Row beside it. The
                        Billboard is still to come.
  i18n/                 `en.ts` is the key set, `es.ts` is typed against it.
  jellyfin/             The gateway: the only module that talks HTTP to the Server.
  my-list/              My List, which is Jellyfin's Favorites: `my-list.ts` is
                        the store every screen reads, `use-my-list.ts` the
                        context and hook, `my-list-toggle.tsx` the control on a
                        card, `my-list-screen.tsx` the My List page.
  navigation/           Arrow keys and focus: `nearest.ts` the geometry,
                        `reveal.ts` how far a scroller must move, `focusable.ts`
                        what the arrows reach, `spatial-navigation.ts` the
                        wiring, `input-modality.ts` the focus highlight.
  search/               Search: `search-screen.tsx` the field and the live
                        results, `genres.tsx` browsing by genre, `search.ts`
                        what the Server is asked.
  session/              Session & Users: the Server address and the signed-in
                        Users in device storage, plus the sign-in screen.
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
  a renderer capability, storage, the languages the device prefers → `src/device/`.
  Nothing else reads `navigator`, `window.chrome`, `Date.now()`, `Math.random()`
  or `localStorage`.
- **Anything that must survive a reload** → through `device.storage()`, and under
  one key owned by one module (`session/` owns `jellyflick.session`). Per-User
  settings that follow a User between devices are not this: they belong on the
  Server, in the Client Settings store — `src/settings/client-settings.ts`, and
  see "Client Settings and the Home Layout" below.
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

Every Movie and Series also carries `Genres`, and the music album carries
`Classical` — a genre nothing this app shows is in, so a client that forgets to
narrow `includeItemTypes` is caught rather than merely untested. The genres of
the Titles, in the order `/Genres` serves them, are exactly:

    Comedy, Crime, Drama, Family, Science Fiction, Thriller

Arrival and Severance also carry everything a title page shows — a year, an age
rating, a running time, an overview, a cast, streams in several languages,
ratings, a logo and a backdrop — and **The Unfinished deliberately carries none
of it**, with an empty `OfficialRating` and a null `CriticRating`, because those
are the unguarded fields a client has to cope with itself. `state.played` is
`UserData.Played` per User, `state.collections` is the one Collection (Crime
Classics, holding Heat and Arrival) and `state.similar` is the fixed More like
this relation.

`/Items` honours `ids`, `fields`, `enableImageTypes` and `enableUserData`, so a
query that forgot to ask for `Overview` fails against the fake rather than only
against a real Server. `Genres` is deliberately not gated: every query this app
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
`Intl.PluralRules`, which are native on the target. `Intl.RelativeTimeFormat`
(71), `Intl.ListFormat` (72) and `Intl.Locale` (74) are **not** — write the three
lines by hand instead of adding a polyfill.

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
  three keys today: `jf.homeLayout`, `jf.uiLanguage` and `jf.accentColour`. A
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
each with a kind and an optional `hidden`, and the rules are pure functions of
it (`addRow`, `hideRow`, `showRow`, `moveRow`, `visibleRows`,
`addableRowKinds`). Hiding keeps a Row's place, so showing it again puts it
back; adding appends; moving is clamped at the ends. A stored layout that cannot
be read falls back to `DEFAULT_HOME_LAYOUT` rather than emptying Home, and an
unknown kind is dropped on its own, so a layout written by a newer Jellyflick
keeps the Rows this version understands. `parameter` is carried but unread —
genre and Collection Rows (#15) need it and will not have to change the format.

**Which Rows exist is `src/home/home-rows.tsx`**, not the layout: `ROW_NAME_KEYS`
is a Row's name wherever it is shown, and `BUILT_ROW_KINDS` is the kinds whose
feature exists. Home draws the visible rows whose kind is built and leaves the
rest out — an empty Row would look like something that failed, and the editor
says "Not on Home yet" in words instead. **Adding a Row's feature** (#12 Continue
Watching, #15 the suggestion Rows) is: a loader beside `new-on-jellyflick.ts`, a
case in `HomeRowFor`, and the kind in `BUILT_ROW_KINDS`. The layout already
carries it — My List (#13) was added exactly that way.

The editor, `src/settings/home-layout-screen.tsx`:

- **Its address is not a section.** `/settings/home-layout` has its own `<Route>`
  in the shell and no place in either bar; `SECTIONS` is still the one list of
  sections. It is reached from Home and from the settings screen.
- **Reordering is two buttons, not a drag.** A drag cannot be done with a remote
  (story 64), and the navigator owns Up/Down/Left/Right — taking the arrow keys
  here would leave no way to leave the screen. Buttons serve touch, mouse and
  arrow keys at once, and they are reachable because `src/navigation/` reaches
  anything focusable.
- **There is no Save button**, so there is none to leave unpressed.

## The settings screen, Accent Colour and language

`src/settings/settings-screen.tsx` is the screen a User changes their own things
on: their Accent Colour, the language the app is in, and the way to their Home
Layout (#11), and under a "What plays" subheading the four their Jellyfin
account carries (#35). Its address `/settings` is **not a section** — `src/shell/sections.ts`
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
| What lives there | Home Layout, Accent Colour, UI language | audio language, subtitle language, when to show subtitles, next-Episode autoplay |
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
- **Play is present and does nothing**, for #25 → #28 to wire up.
- **A language's name is the locale's own.** `title.language` is one message
  whose function holds a small dictionary per locale, falling back to the code
  itself. `Intl.DisplayNames` is Chrome 81 and the floor is 68.

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
  every Row on Home passes — `useOpenTitle` in `src/home/home-rows.tsx`, where
  Home already decided what a card offers.

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
