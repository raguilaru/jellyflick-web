# Jellyfin 12.x server API surface — research notes

Companion files:

- [`jellyfin-playback.md`](./jellyfin-playback.md) — topics 9–15 (playback, progress, sessions, segments, trickplay, subtitles, download)
- [`ratings-mdblist.md`](./ratings-mdblist.md) — topic 19 (MDBList)

## Primary sources used

| Source | What it is | URL |
| --- | --- | --- |
| **Jellyfin OpenAPI "stable"** | `info.version` / `x-jellyfin-version` = **`12.2.0`**. 294 paths. This is *the* authority for paths, methods, parameter names and DTO field names below. | <https://api.jellyfin.org/openapi/jellyfin-openapi-stable.json> |
| **Jellyfin OpenAPI "unstable"** | `13.0.0`. Used only to check drift (see below). | <https://api.jellyfin.org/openapi/jellyfin-openapi-unstable.json> |
| **jellyfin server source at tag `v12.2`** | For behaviour the spec cannot express (header parsing, which `ItemFields` gates which DTO property, policy→permission mapping). | <https://github.com/jellyfin/jellyfin/tree/v12.2> |
| **`@jellyfin/sdk` 1.0.0 tarball** | `npm pack @jellyfin/sdk@1.0.0`, read `lib/**/*.d.ts` directly. | <https://www.npmjs.com/package/@jellyfin/sdk> |

Tags `v12.0`, `v12.1`, `v12.2` and branch `release-12.z` all exist (`gh api repos/jellyfin/jellyfin/tags`). The newest 10.x tag is `v10.11.11`.

**12.2 vs 13.0 drift is nil for our purposes.** A set-diff of `paths` between the two specs is **empty in both directions**. A diff of `components.schemas` shows only: `AuthenticationInfo`/`AuthenticationInfoQueryResult` renamed to `AuthenticationInfoDto`/`AuthenticationInfoDtoQueryResult` (admin-only API-key listing, unused here), and one changed schema, `SeriesInfo`. Everything this project touches is byte-identical between 12.2.0 and 13.0.0.

**Conventions.** Jellyfin serves both PascalCase and camelCase JSON (`BaseJellyfinApiController` declares `[Produces(application/json, JsonDefaults.CamelCaseMediaType, JsonDefaults.PascalCaseMediaType)]`). Response **field** names below are the PascalCase spelling from the spec; **query parameter** names are the exact camelCase spelling from the spec and are what must go on the wire. Array query parameters are comma-separated (OpenAPI default `style: form, explode: false`).

---

## 1. Auth header format

**Source: `Jellyfin.Server.Implementations/Security/AuthorizationContext.cs` @ v12.2** — <https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Server.Implementations/Security/AuthorizationContext.cs>

The only documented security scheme in the 12.2 spec is:

```json
"CustomAuthentication": { "type": "apiKey", "name": "Authorization", "in": "header" }
```

### Exact format

```
Authorization: MediaBrowser Client="Jellyflick", Device="Chrome", DeviceId="<stable-id>", Version="1.0.0", Token="<access-token>"
```

Precisely what the parser does (`GetAuthorization` → `GetParts`):

1. Splits at the **first space**. The part before it must equal `MediaBrowser`, compared `OrdinalIgnoreCase`. No header → no auth; no space → no auth.
2. `GetParts` walks the remainder. `=` (outside quotes) ends a key; `,` (outside quotes) ends a value. Keys are `.Trim()`ed. Values are `.Trim('"')`ed and then **`WebUtility.UrlDecode`**'d.
3. Keys are read out of a `Dictionary<string,string>` created with **no comparer**, i.e. the default **ordinal, case-sensitive** comparer, and looked up as `"DeviceId"`, `"Device"`, `"Client"`, `"Version"`, `"Token"`.

Consequences for us:

- **The five key names are case-sensitive and must be spelled exactly `Client`, `Device`, `DeviceId`, `Version`, `Token`.** The scheme word `MediaBrowser` is the only case-insensitive part.
- **Quoting is optional but should always be used**, because an unquoted value containing a comma would terminate the pair early. The quote/comma state machine XORs on `"`, so quoted commas are safe.
- **Values must be URL-encoded**, because the server URL-decodes them. A device name with a space works either way, but a literal `%` or `+` must be encoded. Encode before quoting.
- Separator between pairs: `,` — a following space is harmless (keys are trimmed).
- Order does not matter.

### Legacy forms — confirmed deprecated/off by default

Every legacy path is gated behind one server setting, `ServerConfiguration.EnableLegacyAuthorization`, which is declared **with no initializer** (`public bool EnableLegacyAuthorization { get; set; }`) in <https://github.com/jellyfin/jellyfin/blob/v12.2/MediaBrowser.Model/Configuration/ServerConfiguration.cs> — so it defaults to `false`:

| Legacy form | Gated by `EnableLegacyAuthorization`? |
| --- | --- |
| `X-Emby-Authorization` header | yes |
| `Emby ...` scheme name in `Authorization` | yes |
| `X-Emby-Token` header | yes |
| `X-MediaBrowser-Token` header | yes |
| `api_key` query parameter | **yes** |
| `ApiKey` query parameter | **no — still supported, not legacy** |

**`api_key` (snake) is legacy and off by default. `ApiKey` (PascalCase) is the current query-parameter spelling and is not gated.** Independent confirmations:

- `@jellyfin/sdk` 1.0.0 `lib/constants.d.ts`: `export declare const AUTHORIZATION_PARAMETER = "ApiKey";`
- The server itself writes `ApiKey=` into the URLs it generates — e.g. the subtitle HLS playlist builder in `SubtitleController.cs` emits `stream.vtt?CopyTimestamps=true&AddVttTimeMap=true&StartPositionTicks={0}&EndPositionTicks={1}&ApiKey={2}`, and `StreamInfo.cs` appends `?ApiKey=` to external subtitle URLs.

Use the `Authorization` header for every XHR. Use `?ApiKey=<token>` only where a header is impossible — a `<video src>`, an `<img src>`, or a download link.

---

## 2. Authentication + Quick Connect

All four confirmed present at exactly these paths in 12.2.0.

### `POST /Users/AuthenticateByName`

Body `AuthenticateUserByName` — **two fields only**:

```json
{ "Username": "rafael", "Pw": "secret" }
```

Note `Pw`, not `Password`. Response `AuthenticationResult`:

| Field | Type |
| --- | --- |
| `User` | `UserDto` |
| `SessionInfo` | `SessionInfoDto` |
| `AccessToken` | string |
| `ServerId` | string |

The request must already carry the `Authorization: MediaBrowser Client=…, Device=…, DeviceId=…, Version=…` header **without** `Token=` — that is how the server records the device for the new token.

### Quick Connect

| Step | Method + path | Params | Response |
| --- | --- | --- | --- |
| Is it on? | `GET /QuickConnect/Enabled` | — | `boolean` |
| Initiate | `POST /QuickConnect/Initiate` | — (identifies the client from the `Authorization` header) | `QuickConnectResult` |
| Poll state | `GET /QuickConnect/Connect` | `secret` (query, **required**) | `QuickConnectResult` → 404 once consumed/expired |
| Exchange for a token | `POST /Users/AuthenticateWithQuickConnect` | body `QuickConnectDto` = `{ "Secret": "…" }` (`Secret` is **required**) | `AuthenticationResult` |

`QuickConnectResult`: `Authenticated` (bool), `Secret`, `Code`, `DeviceId`, `DeviceName`, `AppName`, `AppVersion`, `DateAdded`.

Flow: `Initiate` → show `Code` to the user → poll `Connect?secret=<Secret>` until `Authenticated === true` → `POST /Users/AuthenticateWithQuickConnect` with `{Secret}`.

`POST /QuickConnect/Authorize?code=<code>&userId=<id>` is the *approving* side (what the already-signed-in app calls); Jellyflick only needs it if it ever approves another device's code.

**To verify in implementation:** the spec does not state a poll interval or an expiry for a Quick Connect request. Pick a conservative interval (~5 s) and treat `404` from `GET /QuickConnect/Connect` as "expired, start over".

---

## 3. Public endpoints and the `>= 12.0` check

### `GET /Users/Public`

No parameters, no auth. Returns `UserDto[]`.

`UserDto`: `Name`, `ServerId`, `ServerName`, `Id`, **`PrimaryImageTag`**, `HasPassword`, `HasConfiguredPassword`, `HasConfiguredEasyPassword`, `EnableAutoLogin`, `LastLoginDate`, `LastActivityDate`, `Configuration` (`UserConfiguration`), `Policy` (`UserPolicy`), `PrimaryImageAspectRatio`.

Users whose `UserPolicy.IsHidden` is true are omitted — that is the case behind user story 11 (type the username manually).

### `GET /System/Info/Public`

No parameters, no auth. Returns `PublicSystemInfo`:

| Field | Type |
| --- | --- |
| `LocalAddress` | string |
| `ServerName` | string |
| **`Version`** | string |
| `ProductName` | string |
| `Id` | string |
| `StartupWizardCompleted` | bool |

**`Version` is the field for the `>= 12.0` gate** (user story 8). It is the server's assembly version string, e.g. `12.2.0`. Parse the leading `major` and reject `< 12`. Do not string-compare — `"9.x" > "12.x"` lexically.

Also useful: `GET /Users/Me` → `UserDto` ("gets the user based on auth token"). This is the 12.x way to read the signed-in user, including `Policy.EnableContentDownloading` and `Configuration`.

---

## 4. `GET /Items`

94 query parameters. The ones this project needs, with exact spellings:

| Parameter | Type | Note |
| --- | --- | --- |
| `userId` | GUID string | Optional; defaults to the token's user. Pass it explicitly when several users are signed in on one device. |
| `includeItemTypes` | `BaseItemKind[]` | CSV. |
| `excludeItemTypes` | `BaseItemKind[]` | CSV. |
| `recursive` | bool | Needed whenever `parentId` is a library root. |
| `sortBy` | `ItemSortBy[]` | **Array**, CSV. |
| `sortOrder` | `SortOrder[]` | **Array**, CSV — positionally paired with `sortBy`. |
| `fields` | `ItemFields[]` | CSV. See table below. |
| `limit`, `startIndex` | int | Paging. |
| `genres` | string[] | CSV of genre *names*. `genreIds` takes GUIDs. |
| `parentId` | GUID string | |
| `filters` | `ItemFilter[]` | CSV. |
| `searchTerm` | string | |
| `enableImageTypes` | `ImageType[]` | CSV. |
| `imageTypeLimit` | int | Per image type. |
| `enableUserData` | bool | |
| `enableImages` | bool | |
| `enableTotalRecordCount` | bool | Set `false` on rows to save a COUNT. |
| `isPlayed` | bool | For Watch Again / Spotlight. |
| `isFavorite` | bool | For My List. |
| `ids`, `excludeItemIds` | string[] | |
| `audioLanguages`, `subtitleLanguages` | string[] | New-ish; useful for story 74. |
| `minCommunityRating`, `minCriticRating` | number | For Spotlight's "preferring highly rated". |
| `collapseBoxSetItems` | bool | |

Response is `BaseItemDtoQueryResult` = `{ Items: BaseItemDto[], TotalRecordCount: int, StartIndex: int }`.

### Enum values (exact, from `components.schemas`)

**`ItemFields`** — `AirTime, CanDelete, CanDownload, ChannelInfo, Chapters, Trickplay, ChildCount, CumulativeRunTimeTicks, CustomRating, DateCreated, DateLastMediaAdded, DisplayPreferencesId, Etag, ExternalUrls, Genres, ItemCounts, MediaSourceCount, MediaSources, OriginalTitle, Overview, ParentId, Path, People, PlayAccess, ProductionLocations, ProviderIds, PrimaryImageAspectRatio, RecursiveItemCount, Settings, SeriesStudio, SortName, SpecialEpisodeNumbers, Studios, Taglines, Tags, RemoteTrailers, MediaStreams, SeasonUserData, DateLastRefreshed, DateLastSaved, RefreshState, ChannelImage, EnableMediaSourceDisplay, Width, Height, ExtraIds, LocalTrailerCount, IsHD, SpecialFeatureCount`

**`ItemSortBy`** — `Default, AiredEpisodeOrder, Album, AlbumArtist, Artist, DateCreated, OfficialRating, DatePlayed, PremiereDate, StartDate, SortName, Name, Random, Runtime, CommunityRating, ProductionYear, PlayCount, CriticRating, IsFolder, IsUnplayed, IsPlayed, SeriesSortName, VideoBitRate, AirTime, Studio, IsFavoriteOrLiked, DateLastContentAdded, SeriesDatePlayed, ParentIndexNumber, IndexNumber`

**`ItemFilter`** — `IsFolder, IsNotFolder, IsUnplayed, IsPlayed, IsFavorite, IsResumable, Likes, Dislikes, IsFavoriteOrLikes`

**`SortOrder`** — `Ascending, Descending`

**`ImageType`** — `Primary, Art, Backdrop, Banner, Logo, Thumb, Disc, Box, Screenshot, Menu, Chapter, BoxRear, Profile`

**`BaseItemKind`** (relevant subset) — `Movie, Series, Season, Episode, BoxSet, CollectionFolder, Folder, Genre, Person, Playlist, Trailer, UserView, Video`

### Which `fields` value gives which property

Verified against `Emby.Server.Implementations/Dto/DtoService.cs` @ v12.2 — <https://github.com/jellyfin/jellyfin/blob/v12.2/Emby.Server.Implementations/Dto/DtoService.cs>. This is the load-bearing table; the `fields` enum does **not** map one-to-one onto DTO property names.

| Wanted | How to get it | Evidence |
| --- | --- | --- |
| **Backdrops** (`BackdropImageTags`) | **Not a `fields` value.** Controlled by `enableImages` + `enableImageTypes` containing `Backdrop` + `imageTypeLimit`. | `dto.cs:1145` `var backdropLimit = options.GetImageLimit(ImageType.Backdrop); if (backdropLimit > 0) dto.BackdropImageTags = …` |
| **Logos** (`ImageTags.Logo`) | **Not a `fields` value.** Needs `enableImages` true and `Logo` in `enableImageTypes`. | `dto.cs:1157-1175` — iterates `item.ImageInfos`, includes each type whose `GetImageLimit(type) > 0`, into `dto.ImageTags[type]`. |
| `DateCreated` | `fields=DateCreated` | `dto.cs:1113` |
| `ChildCount` | `fields=ChildCount` **and a resolved user** | `dto.cs:198`, `dto.cs:653` — both guarded by `user is not null`. |
| `MediaStreams` | `fields=MediaStreams` | `dto.cs:1467` |
| `Overview` | `fields=Overview` | `dto.cs:1225` |
| `Genres` | `fields=Genres` (also fills `GenreItems`) | `dto.cs:1151` |
| `People` | `fields=People` | `dto.cs:251`, `dto.cs:363` |
| `ProviderIds` | `fields=ProviderIds` | `dto.cs:1257` |
| **`RunTimeTicks`** | **no field needed — always populated** | `dto.cs:1262` `dto.RunTimeTicks = item.RunTimeTicks;` unguarded |
| **`UserData`** | **not a field — `enableUserData` (defaults true)** | `dto.cs:174`, `dto.cs:205`, `dto.cs:618`, `dto.cs:671` all guard on `options.EnableUserData`. |
| `Trickplay` | `fields=Trickplay` | `dto.cs:1449` |
| `Chapters` | `fields=Chapters` | |
| `MediaSources` | `fields=MediaSources` | |
| `RemoteTrailers` | `fields=RemoteTrailers` (story 75, YouTube) | |
| `LocalTrailerCount` | `fields=LocalTrailerCount` (stories 24/25) | |
| `CanDownload` | `fields=CanDownload` (stories 76/77) | |

**Defaults when the parameter is omitted** — `Jellyfin.Api/Extensions/DtoExtensions.cs` `AddAdditionalDtoOptions` + `MediaBrowser.Controller/Dto/DtoOptions.cs`:

- `enableImages` omitted → `true`.
- `enableImageTypes` omitted/empty → `ImageTypes` stays at **all** `ImageType` values.
- `imageTypeLimit` omitted → `int.MaxValue`.
- `enableUserData` omitted → stays `true`.

So `ImageTags` (incl. `Logo`, `Primary`, `Thumb`) and `BackdropImageTags` and `UserData` all come back by default. Narrow them deliberately for row queries: `enableImageTypes=Primary,Backdrop,Logo,Thumb&imageTypeLimit=1`.

### A recommended row query

```
GET /Items
  ?userId=<uid>
  &includeItemTypes=Movie,Series
  &recursive=true
  &sortBy=DateCreated&sortOrder=Descending
  &fields=Overview,Genres,ProviderIds,DateCreated,ChildCount
  &enableImageTypes=Primary,Backdrop,Logo,Thumb
  &imageTypeLimit=1
  &enableTotalRecordCount=false
  &limit=30
```

---

## 5. Row endpoints — 12.x forms

**All six exist at exactly the paths given in the brief**, and the old `/Users/{userId}/…` forms are **gone**. The complete list of `/Users/*` paths in the 12.2.0 spec is:

```
/Users                      GET POST
/Users/AuthenticateByName   POST
/Users/AuthenticateWithQuickConnect POST
/Users/Configuration        POST
/Users/ForgotPassword       POST
/Users/ForgotPassword/Pin   POST
/Users/Me                   GET
/Users/New                  POST
/Users/Password             POST
/Users/Public               GET
/Users/{userId}             GET DELETE
/Users/{userId}/Policy      POST
```

No `/Users/{userId}/Items`, no `/Users/{userId}/Items/Resume`, no `/Users/{userId}/Items/Latest`, no `/Users/{userId}/Items/{id}`, no `/Users/{userId}/PlayedItems/{id}`, no `/Users/{userId}/FavoriteItems/{id}`. The user is taken from the token, with an optional `userId` **query** parameter to override.

| Need | 12.x path | Key params | Response |
| --- | --- | --- | --- |
| Continue Watching (started) | `GET /UserItems/Resume` | `userId, startIndex, limit, searchTerm, parentId, fields, mediaTypes, enableUserData, imageTypeLimit, enableImageTypes, excludeItemTypes, includeItemTypes, enableTotalRecordCount, enableImages, excludeActiveSessions` | `BaseItemDtoQueryResult` |
| Continue Watching (next episode) | `GET /Shows/NextUp` | `userId, startIndex, limit, fields, seriesId, parentId, enableImages, imageTypeLimit, enableImageTypes, enableUserData, nextUpDateCutoff, enableTotalRecordCount, enableResumable, enableRewatching` | `BaseItemDtoQueryResult` |
| New on Jellyflick | `GET /Items/Latest` | `userId, parentId, fields, includeItemTypes, isPlayed, enableImages, imageTypeLimit, enableImageTypes, enableUserData, limit, groupItems` | **bare `BaseItemDto[]`**, not a query result |
| More like this | `GET /Items/{itemId}/Similar` | `itemId` (path), `userId, limit, fields, excludeArtistIds` | `BaseItemDtoQueryResult` |
| Because You Watched | `GET /Movies/Recommendations` | `userId, parentId, fields, categoryLimit, itemLimit` | **`RecommendationDto[]`** |
| Collection membership | `GET /Items/{itemId}/Collections` | `itemId` (path), `userId, startIndex, limit, fields` | `BaseItemDtoQueryResult` |

Notes:

- **`/Items/Latest` returns a bare array.** Do not expect `{Items, TotalRecordCount}`. `groupItems=true` is what makes a Series appear once instead of per-episode (story 41).
- `/Shows/NextUp` has `enableResumable` and `enableRewatching` — relevant to how Continue Watching is composed (stories 35, 39).
- `/UserItems/Resume` has `excludeActiveSessions`, handy to avoid showing what is playing elsewhere right now.
- `/Movies/Recommendations` returns `RecommendationDto`, a different shape from the others (it carries a category plus items) — it is the natural backing for "Because You Watched" rows (stories 43, 28).
- `GET /Items/Suggestions` also exists (`userId, mediaType, type, startIndex, limit, enableTotalRecordCount`) but takes **no `fields`**, so items come back thin. Prefer `/Movies/Recommendations` or a hand-rolled `/Items` query.
- There is also `GET /Items/{itemId}` for a single item and `GET /Items/{itemId}/LocalTrailers` (stories 24/75) and `GET /Items/{itemId}/Intros`.

---

## 6. User-data writes

### The general write: `POST /UserItems/{itemId}/UserData`

- `GET /UserItems/{itemId}/UserData?userId=…` → `UserItemDataDto`
- `POST /UserItems/{itemId}/UserData?userId=…`, body `UpdateUserItemDataDto` → `UserItemDataDto`

`UpdateUserItemDataDto` (all nullable, send only what you change):

```json
{
  "PlaybackPositionTicks": 123456789,
  "Played": true,
  "IsFavorite": true,
  "PlayedPercentage": 42.5,
  "PlayCount": 3,
  "LastPlayedDate": "2026-10-10T12:00:00Z",
  "Rating": 8,
  "Likes": true,
  "UnplayedItemCount": 0,
  "Key": null,
  "ItemId": null
}
```

`UserItemDataDto` (the response, and `BaseItemDto.UserData`): `Rating`, `PlayedPercentage`, `UnplayedItemCount`, `PlaybackPositionTicks`, `PlayCount`, `IsFavorite`, `Likes`, `LastPlayedDate`, `Played`, `Key` (required), `ItemId`.

### The 12.x replacements for the legacy played/favorite routes

| Legacy (gone) | 12.x replacement |
| --- | --- |
| `POST /Users/{userId}/PlayedItems/{id}` | **`POST /UserPlayedItems/{itemId}?userId=…&datePlayed=…`** |
| `DELETE /Users/{userId}/PlayedItems/{id}` | **`DELETE /UserPlayedItems/{itemId}?userId=…`** |
| `POST /Users/{userId}/FavoriteItems/{id}` | **`POST /UserFavoriteItems/{itemId}?userId=…`** |
| `DELETE /Users/{userId}/FavoriteItems/{id}` | **`DELETE /UserFavoriteItems/{itemId}?userId=…`** |

All four return `UserItemDataDto`. `userId` is an optional query parameter (defaults to the token's user). There is also `POST`/`DELETE /UserItems/{itemId}/Rating`.

For My List (stories 40, 58, 70) use `/UserFavoriteItems/{itemId}` for writes and `GET /Items?isFavorite=true` (or `filters=IsFavorite`) for reads. For mark watched/unwatched (story 78) use `/UserPlayedItems/{itemId}`. Use `POST /UserItems/{itemId}/UserData` with `PlaybackPositionTicks: 0` for "remove from Continue Watching" (stories 37, 38) — it clears the resume point without touching `Played`.

---

## 7. DisplayPreferences, `CustomPrefs`, and the `homesection` reservation

Only one path: `/DisplayPreferences/{displayPreferencesId}`, `GET` and `POST`.

**Both require `client` as a query parameter** — it is `[FromQuery, Required] string client` in the controller and `required: true` in the spec. `userId` is optional.

```
GET  /DisplayPreferences/{displayPreferencesId}?client=jellyflick&userId=<uid>   → DisplayPreferencesDto
POST /DisplayPreferences/{displayPreferencesId}?client=jellyflick&userId=<uid>   body DisplayPreferencesDto → 204 No Content
```

`DisplayPreferencesDto`: `Id`, `ViewType`, `SortBy`, `IndexBy`, `RememberIndexing`, `PrimaryImageHeight`, `PrimaryImageWidth`, **`CustomPrefs`** (`object`, i.e. `Record<string, string | null>`), `ScrollDirection`, `ShowBackdrop`, `RememberSorting`, `SortOrder`, `ShowSidebar`, `Client`.

`CustomPrefs` is the storage for Home Layout, Billboard Source, Accent Colour, UI language and per-subtitle-file offsets (stories 49, 102, 112, 113).

### Behaviour, from `Jellyfin.Api/Controllers/DisplayPreferencesController.cs` @ v12.2

<https://github.com/jellyfin/jellyfin/blob/v12.2/Jellyfin.Api/Controllers/DisplayPreferencesController.cs>

`displayPreferencesId` is parsed as a GUID; if it is not one, the server uses `displayPreferencesId.GetMD5()`. So an arbitrary string key such as `"jellyflick"` is legal and stable.

**Reserved key prefixes — do not use these.** On `GET`, the server *injects* these keys into `CustomPrefs` (they are not yours and will reappear):

- `homesection0`, `homesection1`, … — one per stored `HomeSection`
- `chromecastVersion`, `skipForwardLength`, `skipBackLength`, `enableNextVideoInfoOverlay`, `tvhome`, `dashboardTheme`

On `POST`, the server *consumes and removes* them before storing the rest:

- Every key matching `key.StartsWith("homesection", OrdinalIgnoreCase)` is parsed as `int.Parse(key[("homesection".Length)..])` and turned into a `HomeSection`. **A key beginning `homesection` whose suffix is not an integer will throw.** This is a hard reservation: never name a Jellyflick pref `homesection…`, `homeSections`, `homesectionLayout`, etc.
- `chromecastVersion`, `enableNextVideoInfoOverlay`, `skipBackLength`, `skipForwardLength`, `dashboardTheme`, `tvhome` are each read out and removed.
- Keys matching `landing-*` are validated against the `ViewType` enum and dropped if invalid — **also effectively reserved**.
- Everything left over goes to `SetCustomItemDisplayPreferences(userId, itemId, client, displayPreferences.CustomPrefs)`.

**Two consequences to design around:**

1. **Prefix every Jellyflick key**, e.g. `jf.homeLayout`, `jf.billboardSource`, `jf.accentColour`, `jf.uiLanguage`, `jf.subOffset.<hash>`. Avoid `homesection`, `landing-`, and the six literal keys above.
2. A `POST` hands the server the *whole* remaining `CustomPrefs` map. **Read-modify-write**: `GET` first, strip the reserved keys the server injected, merge your change, `POST` the result. *To verify in implementation:* whether `SetCustomItemDisplayPreferences` replaces the whole custom set or merges per key — the controller's call signature suggests whole-set replacement, so read-modify-write is the safe assumption either way.
3. `POST` returns **204 No Content**, not the updated DTO.

The `client` parameter partitions storage, so `client=jellyflick` keeps our prefs out of the official web client's.

---

## 8. UserConfiguration — and the per-user UI language question

- **Read:** there is **no `GET /Users/Configuration`**. Read it from `UserDto.Configuration` via `GET /Users/Me` (or `GET /Users/Public` / `GET /Users/{userId}`).
- **Write:** `POST /Users/Configuration?userId=<uid>`, body `UserConfiguration`, → 204.

Full `UserConfiguration` for 12.2.0:

| Field | Type |
| --- | --- |
| **`AudioLanguagePreference`** | string (nullable) |
| `PlayDefaultAudioTrack` | bool |
| **`SubtitleLanguagePreference`** | string (nullable) |
| `DisplayMissingEpisodes` | bool |
| `GroupedFolders` | string[] |
| **`SubtitleMode`** | `SubtitlePlaybackMode` |
| `DisplayCollectionsView` | bool |
| `EnableLocalPassword` | bool |
| `OrderedViews` | string[] |
| `LatestItemsExcludes` | string[] |
| `MyMediaExcludes` | string[] |
| `HidePlayedInLatest` | bool |
| `RememberAudioSelections` | bool |
| `RememberSubtitleSelections` | bool |
| **`EnableNextEpisodeAutoPlay`** | bool |
| `CastReceiverId` | string (nullable) |

`SubtitlePlaybackMode` enum: **`Default, Always, OnlyForced, None, Smart`**.

`AudioLanguagePreference` / `SubtitleLanguagePreference` are language *strings*. *To verify in implementation:* whether they hold ISO 639-2/B three-letter codes (`spa`) or display names — the spec says only `string`. `MediaStream` exposes both `ThreeLetterISOLanguageName` and `Language`, so match against `MediaStream.Language`, which is what ffprobe reports (usually the 3-letter code).

### Does 12.x store a per-user UI language? **No.**

Established negatively from the spec, which is sufficient because the spec is generated from the server's own DTOs:

- `UserConfiguration` has **no** UI/display/interface language field (full list above).
- `UserDto` has no language field either: `Name, ServerId, ServerName, Id, PrimaryImageTag, HasPassword, HasConfiguredPassword, HasConfiguredEasyPassword, EnableAutoLogin, LastLoginDate, LastActivityDate, Configuration, Policy, PrimaryImageAspectRatio`.
- A grep of every `*Language*` key in the whole 12.2.0 spec yields only: `MetadataLanguage`, `Language`, `PreferredMetadataLanguage`, `subtitleLanguages`, `audioLanguages`, `ThreeLetterISOLanguageName(s)`, `TwoLetterISOLanguageName`, `includeAllLanguages`, `SubtitleLanguages`, `SubtitleLanguagePreference`, `SubtitleDownloadLanguages`, `PreferredLanguage`, `OriginalLanguage`, `LocalizedLanguage`, `AudioLanguages`, `AudioLanguagePreference`. None is a per-user UI language.
- The only UI language in 12.x is **server-wide**: `ServerConfiguration.UICulture`, default `"en-US"` (<https://github.com/jellyfin/jellyfin/blob/v12.2/MediaBrowser.Model/Configuration/ServerConfiguration.cs#L197>). The official web client stores its own UI language client-side for the same reason.

**Conclusion for story 113:** the UI language must live in `DisplayPreferences.CustomPrefs` (e.g. `jf.uiLanguage`), falling back to `navigator.language`. It cannot be "edited in the user's Jellyfin settings" the way audio/subtitle/autoplay can (story 114) — worth flagging to the spec author, since story 114 lists "my language" alongside three settings that *are* server-stored.

---

## 16. Image URLs

### Item images

```
GET /Items/{itemId}/Images/{imageType}
GET /Items/{itemId}/Images/{imageType}/{imageIndex}
```

`imageType` is an `ImageType` value: `Primary`, `Backdrop`, `Logo`, `Thumb`, `Art`, `Banner`, `Disc`, `Box`, `BoxRear`, `Screenshot`, `Menu`, `Chapter`, `Profile`.

Query parameters (identical on `GET` and `HEAD`):

`maxWidth`, `maxHeight`, `width`, `height`, `quality`, `fillWidth`, `fillHeight`, **`tag`**, `format`, `percentPlayed`, `unplayedCount`, `blur`, `backgroundColor`, `foregroundLayer`, `imageIndex`.

- **`tag`** is the cache-buster. Pass the tag from the item so the URL changes when the image changes and is otherwise cacheable forever.
- `maxWidth` + `quality` is the pair to use for responsive art. `fillWidth`/`fillHeight` crop to fill; `maxWidth`/`maxHeight` fit inside.
- There is also a long positional form, `/Items/{itemId}/Images/{imageType}/{imageIndex}/{tag}/{format}/{maxWidth}/{maxHeight}/{percentPlayed}/{unplayedCount}` — ignore it, the query form is clearer.
- These endpoints are anonymous in 12.2 (no `[Authorize]`), so `<img src>` works without a token. Append `?ApiKey=` only if a reverse proxy demands it.

### User images

```
GET  /UserImage?userId=<uid>&tag=<tag>&format=<fmt>
HEAD /UserImage?…
POST /UserImage?userId=<uid>     (body image/*)
DELETE /UserImage?userId=<uid>
```

Note: **no `maxWidth`/`quality` on `/UserImage`** — only `userId`, `tag`, `format`. Size user pictures with CSS. The tag comes from `UserDto.PrimaryImageTag`; **a null `PrimaryImageTag` means the user has no picture** — show initials instead (stories 10, 61).

### Telling from an item whether a Logo or Backdrop exists

Both are on `BaseItemDto` and both are populated by the image options, not by `fields` (see §4):

| Property | Shape | Means |
| --- | --- | --- |
| **`ImageTags`** | `Record<string, string>` keyed by `ImageType` name | `ImageTags.Logo` present and non-empty → the item has its own logo. Same for `ImageTags.Primary`, `ImageTags.Thumb`. |
| **`BackdropImageTags`** | `string[]` | non-empty → the item has its own backdrops; `length` is how many, and the array index is the `imageIndex`. |
| `ParentLogoImageTag` + `ParentLogoItemId` | string, string | inherited logo — e.g. an Episode inheriting the Series logo. |
| `ParentBackdropImageTags` + `ParentBackdropItemId` | string[], string | inherited backdrops. `DtoService.cs:1805` only fills these when the item has none of its own. |
| `ParentThumbImageTag` + `ParentThumbItemId` | string, string | inherited thumb. |
| `SeriesPrimaryImageTag`, `SeriesThumbImageTag`, `ParentPrimaryImageTag`, `ParentArtImageTag`, `AlbumPrimaryImageTag` | string | other inherited forms. |
| `ImageBlurHashes` | nested object | blurhash per type per tag — free low-quality placeholders. |

Spotlight's "only Titles with a backdrop, preferring ones with a logo" (story 32) is therefore: `BackdropImageTags?.length > 0`, scored up when `ImageTags?.Logo` is present. Build the URL against the **parent** item id when falling back to `ParentBackdropItemId` / `ParentLogoItemId`.

---

## 17. Ratings fields on items

All on `BaseItemDto`. Verified against `DtoService.cs` for whether a `fields` value is needed:

| Field | Type | Gating | Evidence |
| --- | --- | --- | --- |
| **`CriticRating`** | `number` nullable — Rotten Tomatoes critic score, 0–100 | **none, always sent** | `dto.cs:1205` `dto.CriticRating = item.CriticRating;` |
| **`CommunityRating`** | `number` nullable — IMDb/TMDb community score, 0–10 | **none, but only set when `> 0`** | `dto.cs:1285` `if ((item.CommunityRating ?? 0) > 0) dto.CommunityRating = item.CommunityRating;` |
| **`OfficialRating`** | `string` nullable — age rating, e.g. `"PG-13"` | **none, always sent** | `dto.cs:1223` `dto.OfficialRating = item.OfficialRating;` |
| **`ProviderIds`** | `Record<string, string>` | **`fields=ProviderIds` required** | `dto.cs:1257` |
| `CustomRating` | string | `fields=CustomRating` | |

The `CommunityRating` guard is a gift for story 81 ("missing ratings left out, not shown as zero"): a zero community rating arrives as **absent**, not `0`. `CriticRating` and `OfficialRating` are *not* guarded, so handle `null` / `""` for those yourself.

### `ProviderIds` key spelling

Keys are the `MetadataProvider` enum member names, serialised via `.ToString()` — <https://github.com/jellyfin/jellyfin/blob/v12.2/MediaBrowser.Model/Entities/MetadataProvider.cs>:

```
Custom, Imdb, Tmdb, Tvdb, Tvcom, TmdbCollection,
MusicBrainzAlbum, MusicBrainzAlbumArtist, MusicBrainzArtist,
MusicBrainzReleaseGroup, Zap2It, TvRage,
AudioDbArtist, AudioDbAlbum, MusicBrainzTrack, TvMaze, MusicBrainzRecording
```

So the exact spellings we need are **`Imdb`** and **`Tmdb`** — initial capital, rest lowercase. Not `IMDB`, `IMDb`, `TMDB` or `tmdb`.

```ts
const imdb = item.ProviderIds?.Imdb; // "tt0133093"
const tmdb = item.ProviderIds?.Tmdb; // "603"
```

`item.ExternalUrls` (needs `fields=ExternalUrls`) gives ready-made `{Name, Url}` links to the same providers if we ever want to link out. Feed `ProviderIds.Imdb` (preferred) or `ProviderIds.Tmdb` to MDBList — see [`ratings-mdblist.md`](./ratings-mdblist.md).

---

## 18. `@jellyfin/sdk` — types without the axios runtime

Read from the real tarball (`npm pack @jellyfin/sdk@1.0.0`, extracted and inspected).

### Version situation — read this before pinning

| SDK version | `API_VERSION` (spec it was generated from) | `MINIMUM_VERSION` |
| --- | --- | --- |
| 0.11.0 | `10.10.0` | `10.9.0` |
| 0.12.0 | `10.11.0` | `10.10.0` |
| 0.13.0 | `10.11.1` | `10.10.0` |
| **1.0.0** (latest) | **`13.0.0`** | **`10.10.0`** |
| `0.0.0-unstable.202610081140` | `13.0.0` | `10.10.0` |

From `lib/versions.d.ts` in each tarball.

**There is no published `@jellyfin/sdk` whose `API_VERSION` is 12.x.** 1.0.0 jumped from `10.11.1` to `13.0.0` — it is generated from the *unstable* spec. ADR 0001's phrasing ("the version the official SDK 1.0 targets") should be read as "1.0.0 is the SDK generation that dropped 10.x-era clients", not as "1.0.0 is pinned to 12.x".

**This is fine in practice**, and here is the evidence: the 12.2.0 and 13.0.0 specs have **identical path sets** and differ in only three schemas (`AuthenticationInfo` → `AuthenticationInfoDto`, `AuthenticationInfoQueryResult` → `AuthenticationInfoDtoQueryResult`, and `SeriesInfo`). None is used by Jellyflick. So **`@jellyfin/sdk@1.0.0`'s generated types are accurate for a 12.2 server** for everything in these notes. Pin the exact version (`"@jellyfin/sdk": "1.0.0"`) and re-check on upgrade.

Also note `MINIMUM_VERSION` is `"10.10.0"` — **do not use the SDK's constant for the `>= 12.0` gate** (ADR 0001). Hard-code `12` and compare against `PublicSystemInfo.Version`.

### Types only, no runtime

`package.json` has **no `exports` field** (`main: ./lib/index.js`, `typings: ./lib/index.d.ts`, `type: "module"`), so deep subpath imports are permitted by Node and by bundlers.

Every model lives in its own file under `lib/generated-client/models/` as a `.d.ts` whose only imports are `import type { … } from './sibling'`. **A `.d.ts`-only import emits no JavaScript**, so `axios` (a `peerDependency`, `^1.12.0`) is never pulled in and never needs installing.

454 files in `lib/generated-client/models/`. Concrete imports:

```ts
import type { BaseItemDto }            from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import type { UserDto }                from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import type { UserConfiguration }      from '@jellyfin/sdk/lib/generated-client/models/user-configuration';
import type { UserPolicy }             from '@jellyfin/sdk/lib/generated-client/models/user-policy';
import type { UserItemDataDto }        from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import type { UpdateUserItemDataDto }  from '@jellyfin/sdk/lib/generated-client/models/update-user-item-data-dto';
import type { AuthenticationResult }   from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import type { QuickConnectResult }     from '@jellyfin/sdk/lib/generated-client/models/quick-connect-result';
import type { PublicSystemInfo }       from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import type { DisplayPreferencesDto }  from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import type { PlaybackInfoResponse }   from '@jellyfin/sdk/lib/generated-client/models/playback-info-response';
import type { PlaybackInfoDto }        from '@jellyfin/sdk/lib/generated-client/models/playback-info-dto';
import type { DeviceProfile }          from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type { MediaSourceInfo }        from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { MediaStream }            from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import type { MediaSegmentDto }        from '@jellyfin/sdk/lib/generated-client/models/media-segment-dto';
import type { TrickplayInfoDto }       from '@jellyfin/sdk/lib/generated-client/models/trickplay-info-dto';
import type { SessionInfoDto }         from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import type { ClientCapabilitiesDto }  from '@jellyfin/sdk/lib/generated-client/models/client-capabilities-dto';
import type { PlaybackStartInfo }      from '@jellyfin/sdk/lib/generated-client/models/playback-start-info';
import type { PlaybackProgressInfo }   from '@jellyfin/sdk/lib/generated-client/models/playback-progress-info';
import type { PlaybackStopInfo }       from '@jellyfin/sdk/lib/generated-client/models/playback-stop-info';
```

**Exact type-name notes** (all confirmed present as files):

- The session type is **`SessionInfoDto`**, not `SessionInfo`. Used in `AuthenticationResult.SessionInfo` and as the element type of `GET /Sessions`.
- The media segment type is **`MediaSegmentDto`** (plus `MediaSegmentDtoQueryResult`) — no bare `MediaSegment`.
- Trickplay is **`TrickplayInfoDto`**.
- `PlaybackInfoResponse` carries `MediaSources`, `PlaySessionId`, `ErrorCode` only — the per-source playback flags live on `MediaSourceInfo` (see `jellyfin-playback.md` §9).
- Capabilities is `ClientCapabilitiesDto`.

`lib/generated-client/models/index.d.ts` re-exports everything, so `import type { BaseItemDto, UserDto } from '@jellyfin/sdk/lib/generated-client/models'` also works and still emits nothing. Prefer it for brevity; prefer the per-file paths if you want to be certain no bundler ever follows the barrel.

### Enums are `const` objects, not types — these DO emit JS

Generated enums come as a `.d.ts` **and a `.js`**. E.g. `lib/generated-client/models/base-item-kind.d.ts`:

```ts
export declare const BaseItemKind: {
    readonly AggregateFolder: "AggregateFolder";
    readonly Audio: "Audio";
    // …
};
```

So `import { BaseItemKind } from '…/base-item-kind'` (value import) pulls in a small runtime object — harmless, tree-shakeable, still no axios. `import type { BaseItemKind }` gives you the union type with no runtime cost. Enums with a `.js` sibling include `base-item-kind`, `item-fields`, `item-sort-by`, `media-segment-type`, `subtitle-delivery-method`, `general-command-type`, `play-command`, `audio-spatial-format`, `activity-log-sort-by`, and the rest.

Given ADR 0002 (transpile for Chromium 68) and the "as light as possible" goal: **take types from the SDK, write the HTTP layer by hand with `fetch`.** Do not import from `@jellyfin/sdk` root or `@jellyfin/sdk/lib/api/*` — those are the axios-backed generated API clients.

Two small runtime constants worth copying rather than importing, from `lib/constants.d.ts`:

```ts
const AUTHORIZATION_HEADER   = 'Authorization';
const ACCEPT_LANGUAGE_HEADER = 'Accept-Language';
const AUTHORIZATION_PARAMETER = 'ApiKey';
```
