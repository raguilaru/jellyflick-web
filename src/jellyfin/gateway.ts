import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import type { DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import type { QuickConnectResult } from '@jellyfin/sdk/lib/generated-client/models/quick-connect-result';
import type { RecommendationDto } from '@jellyfin/sdk/lib/generated-client/models/recommendation-dto';
import type { UserConfiguration } from '@jellyfin/sdk/lib/generated-client/models/user-configuration';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import { buildAuthorizationHeader, type ServerIdentity } from './authorization';

/**
 * The only module that talks HTTP to the Server. A thin layer over `fetch`:
 * request and response shapes come from `@jellyfin/sdk`'s type definitions, none
 * of its runtime.
 *
 * Each ticket that needs a new endpoint adds one method here, and nowhere else.
 */
export type JellyfinGateway = {
  /** The address this gateway talks to, with no trailing slash. */
  readonly serverAddress: string;
  /**
   * The `Authorization` header every request from this gateway carries. A
   * gateway is created per (address, identity), so this is fixed for its
   * lifetime: a new token means a new gateway.
   */
  authorizationHeader(): string;
  /** `GET /System/Info/Public` — anonymous, and the source of the version gate. */
  getPublicSystemInfo(): Promise<PublicSystemInfo>;
  /**
   * `GET /Users/Public` — anonymous. Users whose `Policy.IsHidden` is true are
   * left out by the Server, which is why a typed username is also offered.
   */
  getPublicUsers(): Promise<UserDto[]>;
  /**
   * `POST /Users/AuthenticateByName`. The request carries this gateway's
   * identity *without* a token: that is how the Server records which device the
   * new token belongs to, so call it on a gateway built with no token.
   */
  authenticateByName(username: string, password: string): Promise<AuthenticationResult>;
  /**
   * `GET /QuickConnect/Enabled` — whether the Server's admin has switched
   * Quick Connect on. Anonymous, and a bare JSON boolean rather than an object.
   */
  isQuickConnectEnabled(): Promise<boolean>;
  /**
   * `POST /QuickConnect/Initiate` — asks the Server for a code to show.
   *
   * It takes no parameters: the Server reads the client, the device and the
   * **DeviceId** off this gateway's `Authorization` header and remembers them
   * against the request, and the token it eventually issues belongs to that
   * DeviceId. So call it on a gateway built with no token and with the DeviceId
   * the signed-in User is going to keep.
   */
  initiateQuickConnect(): Promise<QuickConnectResult>;
  /**
   * `GET /QuickConnect/Connect?secret=` — whether the code has been approved
   * yet. `secret` is required.
   *
   * A **404** means there is no request for that secret any more, and the
   * Server does not say which of the three reasons it is: it expired, it was
   * withdrawn, or it has already been exchanged. No client can tell them apart.
   */
  getQuickConnectState(secret: string): Promise<QuickConnectResult>;
  /**
   * `POST /Users/AuthenticateWithQuickConnect` — the approved secret for a
   * token. The body is `{ Secret }`, and `Secret` is required.
   *
   * A **401** means the request is there but nobody has approved it; a **404**
   * means it is gone. The `AccessToken` it answers with belongs to the DeviceId
   * that initiated, so it is the DeviceId this gateway was built with.
   */
  authenticateWithQuickConnect(secret: string): Promise<AuthenticationResult>;
  /**
   * `GET /Users/Me` — the signed-in User behind this gateway's token, and so
   * also the check that the token is still one the Server accepts.
   */
  getCurrentUser(): Promise<UserDto>;
  /**
   * `POST /Sessions/Logout` — drops the token this gateway carries, and only
   * that one. It takes no parameters: the Server revokes the token the request
   * arrives with, which is what makes it safe when several Users are signed in
   * on one device, each on their own DeviceId. Answers 204.
   */
  signOut(): Promise<void>;
  /**
   * The URL of a User's picture. Anonymous on the Server, so an `<img src>`
   * needs no token. There are no sizing parameters on this endpoint — size the
   * picture with CSS.
   */
  userImageUrl(userId: string, tag: string): string;
  /**
   * `GET /UserViews` — the libraries this token's User can see. The legacy
   * `/Users/{userId}/Views` is gone in 12.x, and this one answers with a query
   * result rather than a bare array.
   */
  getUserViews(): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/Latest` — one library's newest additions, newest first.
   *
   * It answers for a single library, so a view of the whole Server means one
   * call per library. The response is a **bare array**, not a query result. The
   * Server's own `groupItems` is deliberately switched off: collapsing Episodes
   * into their Series is the caller's, which is the only place that has seen
   * every library.
   */
  getLatestItems(options: LatestItemsOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items?isFavorite=true` — the Titles in the token User's My List.
   *
   * My List *is* Jellyfin's Favorites, so this is the same list every other
   * Jellyfin app shows: `isFavorite` is the Server's own filter over the whole
   * library, and `/UserFavoriteItems` below is what puts things in it.
   *
   * Ordered by `Name`, ascending, and **not** by `SortName`: a client that
   * inserts a Title it has just added has only the name to place it by, and
   * `SortName` strips articles, so the two would disagree about where "The
   * Unfinished" goes.
   */
  getFavouriteItems(options?: FavouriteItemsOptions): Promise<BaseItemDto[]>;
  /**
   * `POST /UserFavoriteItems/{itemId}` — adds an item to the token User's
   * Favorites. The 12.x replacement for `/Users/{userId}/FavoriteItems/{id}`,
   * which is gone (ADR 0001 bans the legacy routes anyway).
   */
  addToFavourites(itemId: string): Promise<UserItemDataDto>;
  /** `DELETE /UserFavoriteItems/{itemId}` — takes one back out again. */
  removeFromFavourites(itemId: string): Promise<UserItemDataDto>;
  /**
   * `GET /Items` — Titles across the whole Server, in name order.
   *
   * It is "Titles" rather than "items" because the query always asks for
   * `Movie,Series` and nothing else: Episodes, Seasons, music and stray video
   * files are the Server's to leave out, not a screen's to filter. `recursive`
   * is on, or the Server answers with the library folders themselves.
   */
  getTitles(options?: TitlesQueryOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items` again, and deliberately **not** `getTitles`: the newest
   * additions to the Server, newest first, as the four kinds they really are —
   * a Movie, a Series, a Season or an Episode (#14).
   *
   * Every other query in this gateway narrows to `Movie,Series`, because that
   * is all the app *shows*. A Title Label is about what was **added**, and what
   * is added to a Series is a Season or an Episode, never the Series itself —
   * so this one query has to see them, and the Titles they stand for are
   * `src/catalogue/`'s to work out.
   *
   * `/Items/Latest` is the wrong endpoint for it, however close it sounds: it
   * answers per library, and it leaves Seasons out altogether, which is exactly
   * the difference between "New Season" and "New Episodes".
   */
  getRecentAdditions(options?: RecentAdditionsOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items` once more, for the Titles the **Billboard** can feature (#16).
   *
   * Deliberately neither `getTitles` nor `getTitles({ detail: true })`: the
   * Billboard needs the backdrop, the logo and the overview, which no Row asks
   * for, and needs none of the cast, the streams or the provider ids, which a
   * title page does. Asking with `detail` would pull a cast list for every
   * Title in the library to draw one of them.
   *
   * It asks for the whole catalogue rather than a page of it, because the pick
   * is **ours** and not the Server's: `sortBy=Random` would take the choice
   * away from the device layer and make a pick unreproducible, and a limit on a
   * name-ordered query would quietly confine the Billboard to the first Titles
   * in the alphabet. `limit` is there for a caller that knows its library is
   * enormous.
   */
  getBillboardCandidates(options?: BillboardCandidatesOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items` once more, for the genres of one kind of Title and nothing
   * else — which is how the Movies and Series sections rank theirs (#23).
   *
   * Deliberately not `getTitles({ kind })`: the ranking is a count over the
   * whole of one kind, and asking that question through a Row's query would
   * pull a poster tag for every Title in the library to count words. This one
   * asks for no artwork and no user data, and for `Genres` by name — which
   * the Server does **not** send unasked (`jellyfin-api.md` §4).
   *
   * `/Genres` is the wrong endpoint for it, however close it sounds: it
   * answers the distinct *set* of genres and says nothing about how many
   * Titles are in each, so it cannot put them in order.
   */
  getGenresOfTitles(options?: GenresOfTitlesOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/{itemId}/LocalTrailers` — the trailer files that sit beside a
   * Title on the Server, which is what the Billboard autoplays (#16, story 24).
   *
   * **Local only, and that is the point.** Jellyfin also serves
   * `RemoteTrailers` through `fields=RemoteTrailers`, which are YouTube links;
   * the Billboard never shows one, so there is no method here that would hand
   * it one. Story 75's Watch trailer button is where a remote trailer belongs,
   * behind a press.
   *
   * Answers a **bare array**, not a `BaseItemDtoQueryResult`.
   */
  getLocalTrailers(itemId: string): Promise<BaseItemDto[]>;
  /**
   * `GET /UserItems/Resume` — what this User has started and not finished, most
   * recently played first, which is half of Continue Watching (#12).
   *
   * Movies and **Episodes**, deliberately: a part-watched Episode is a thing a
   * User resumes, so this is the one Row whose items are not all Titles. The
   * legacy `/Users/{userId}/Items/Resume` is gone in 12.x.
   */
  getResumeItems(options?: ContinueWatchingOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Shows/NextUp` — the next unwatched Episode of each Series this User
   * is watching, the Series they watched most recently first. The other half of
   * Continue Watching.
   *
   * It answers one Episode per Series, which is what makes "one entry per
   * Series" the Server's own property rather than something merged here.
   */
  getNextUpItems(options?: ContinueWatchingOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Shows/{seriesId}/Seasons` — the Seasons of one Series, in the order
   * the Server airs them, which is what the title page's picker offers (#18).
   *
   * It is the Seasons' own endpoint rather than `/Items?parentId=`, because a
   * Season is not a Title and every `/Items` query here narrows to
   * `Movie,Series`. What it is read for is each Season's name and number: a
   * Season carries no Episodes of its own in the answer.
   */
  getSeasons(seriesId: string): Promise<BaseItemDto[]>;
  /**
   * `GET /Shows/{seriesId}/Episodes` — **every** Episode of one Series, across
   * its Seasons, in the Server's aired order (#18).
   *
   * Deliberately the whole Series rather than one Season at a time: the one
   * question that spans Seasons is which Episode Play starts, and asking per
   * Season would make that a merge of several answers whose order is only
   * within each. Switching Season in the picker is then not a question for the
   * Server at all.
   *
   * It asks for the three fields the list draws and no more — the description,
   * the still and this User's own progress.
   */
  getEpisodes(seriesId: string): Promise<BaseItemDto[]>;
  /**
   * `POST /UserItems/{itemId}/UserData` — the general user-data write, and the
   * only one that can move a resume point (#12, stories 37 and 38).
   *
   * Everything left out of `UpdateUserItemDataDto` is left alone, which is the
   * whole reason this is not `markPlayed`: taking something out of Continue
   * Watching clears where the User got to **without** touching whether they
   * watched it or how many times.
   */
  saveUserItemData(options: UserItemDataWrite): Promise<UserItemDataDto>;
  /**
   * `GET /Items?isPlayed=true&sortBy=DatePlayed` — the Episodes this User has
   * finished, most recently played first (#12).
   *
   * It exists for one reason: **when a Series was last watched**. The next
   * unwatched Episode `/Shows/NextUp` answers with has never been played, so it
   * carries no `LastPlayedDate` of its own and there is nothing on it to order
   * Continue Watching by. The Episode *before* it has one, and this is how the
   * Row reads it — one query for the whole Row rather than one per Series.
   */
  getPlayedEpisodes(options?: ContinueWatchingOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items?isPlayed=true&sortBy=DatePlayed` again, for the two kinds the
   * app shows: the **Titles** this User has finished, most recently finished
   * first, which is the Watch Again Row (#15, story 46).
   *
   * Deliberately not `getPlayedEpisodes` with another `includeItemTypes`: that
   * one asks for no artwork at all, because nothing it answers is drawn, and a
   * Row's cards are. A finished Episode is left to the Server to exclude — what
   * a User rewatches is its Series, which Jellyfin marks played in its own
   * right once every Episode has been.
   *
   * It is also what Because You Watched reads to find a Title to suggest from,
   * so the Row that says "because you watched Severance" and the Row that
   * offers Severance again agree about what was watched last.
   */
  getPlayedTitles(options?: ContinueWatchingOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/{itemId}/Similar` — the Titles the Server thinks are like a
   * given one, which is the title page's More like this Row (#17).
   *
   * The Server's own order is kept: "most like this first" is a property of the
   * answer, not something a client should sort away.
   */
  getSimilarTitles(options: SimilarTitlesOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/{itemId}/Collections` — the Collections one Title belongs to.
   * A Title in none is an empty answer rather than a failure.
   */
  getCollectionsFor(itemId: string): Promise<BaseItemDto[]>;
  /**
   * `GET /Movies/Recommendations` — Jellyfin's own "because you watched" for
   * films, which is what the Because You Watched Row reads for a Movie (#15,
   * story 43).
   *
   * It is the odd one out twice over: it answers a **bare array** of
   * `RecommendationDto` rather than a `BaseItemDtoQueryResult`, and each entry
   * is a *category* — some Titles, plus the `BaselineItemName` saying which
   * Title the Server suggested them from. That name is the only thing a Row
   * saying "Because you watched Heat" can be built on.
   *
   * There is no equivalent for a Series: `/Items/{id}/Similar` is what answers
   * for one, which is why the Row has two branches at all.
   */
  getMovieRecommendations(options?: MovieRecommendationsOptions): Promise<RecommendationDto[]>;
  /**
   * `GET /Items?includeItemTypes=BoxSet` — the Collections on the Server, in
   * name order, which is what a User picks one of when they add a Collection
   * Row (#15, story 45).
   *
   * A Collection is a `BoxSet`, so this is deliberately not `getTitles`: that
   * one narrows to `Movie,Series` everywhere, and a BoxSet is neither.
   */
  getCollections(): Promise<BaseItemDto[]>;
  /**
   * `GET /Items?parentId={collectionId}` — the Titles in one Collection, which
   * is the Collection Row itself.
   *
   * `recursive` is on and the kinds are narrowed as everywhere else, so a
   * Collection that also holds a trailer or a stray video answers with the
   * Titles alone.
   */
  getCollectionTitles(options: CollectionTitlesOptions): Promise<BaseItemDto[]>;
  /**
   * `POST /UserPlayedItems/{itemId}` — marks a Title watched (story 78). The
   * 12.x replacement for `/Users/{userId}/PlayedItems/{id}`, which is gone.
   */
  markPlayed(itemId: string): Promise<UserItemDataDto>;
  /** `DELETE /UserPlayedItems/{itemId}` — marks it unwatched again. */
  markUnplayed(itemId: string): Promise<UserItemDataDto>;
  /**
   * `GET /Genres` — the distinct genres the Server's Movies and Series are in,
   * in name order. The Server does the collecting, so a client never reads
   * every Title to find out what genres there are.
   *
   * Note there is no `recursive` on this endpoint: it is already the set across
   * everything the User can see.
   */
  getTitleGenres(): Promise<BaseItemDto[]>;
  /**
   * The URL of one of an item's images. Anonymous on the Server, so an
   * `<img src>` needs no token. The tag is the cache-buster: with it the URL
   * changes when the image does and is otherwise cacheable forever.
   */
  itemImageUrl(itemId: string, imageType: ItemImageType, options?: ItemImageOptions): string;
  /**
   * `POST /Items/{itemId}/PlaybackInfo` — how to play one Title (#25).
   *
   * **`POST`, and everything in the body.** The `GET` form cannot carry a
   * `DeviceProfile` at all, and the `POST` form's query parameters are the older
   * way of saying the same things (`jellyfin-playback.md` §9). The body is the
   * typed, generated shape, so it is the only one used.
   *
   * Note what is *not* on the answer: `TranscodingUrl`, `SupportsDirectPlay`
   * and `SupportsDirectStream` are fields of each `MediaSourceInfo`, never of
   * the response.
   */
  getPlaybackInfo(options: PlaybackInfoOptions): Promise<PlaybackInfoResponse>;
  /**
   * The URL of a media source served as it is — `static=true`, which is what
   * tells the Server not to touch the file.
   *
   * The token goes in the query as `ApiKey`, because a `<video src>` cannot
   * send a header. The Server's own generated URLs do the same.
   */
  videoStreamUrl(options: VideoStreamOptions): string;
  /**
   * One of the Server's own server-relative URLs — a `TranscodingUrl` — made
   * absolute. It is already parameterised and already carries its own `ApiKey`,
   * so this is the *only* thing a client may do to it.
   */
  absoluteUrl(serverRelativeUrl: string): string;
  /**
   * `GET /Items/{itemId}/Download` — the Title's original file, as an address
   * an anchor can be given (#19, stories 76 and 77).
   *
   * Unlike the video stream this endpoint **is** authorised, by exactly the
   * `EnableContentDownloading` permission (`jellyfin-playback.md` §15), and an
   * `<a href>` cannot send an `Authorization` header — so the token goes in
   * the query as `ApiKey`, which is the same bargain `videoStreamUrl` makes
   * and what the Server's own generated links do.
   *
   * It is a URL rather than a request on purpose: the browser's own download
   * is what saves the file, and fetching a film into memory to hand it back
   * would be a different and much worse feature.
   */
  downloadUrl(itemId: string): string;
  /**
   * The URL of one subtitle stream, converted by the Server to the format
   * asked for (#27).
   *
   * **Everything goes in the path**, which is the canonical form the Server
   * generates for itself (`jellyfin-playback.md` §14): the same arguments
   * exist as query parameters, and `format` among them is annotated
   * `[ParameterObsolete]`. The format *is* the file extension.
   */
  subtitleStreamUrl(options: SubtitleStreamOptions): string;
  /**
   * One subtitle track as text, for `src/playback/subtitle-cues.ts` to parse.
   *
   * The one place in this app that fetches something which is not JSON, and
   * the reason it is a gateway method rather than a `fetch` in the player: the
   * Server is another origin, and nothing outside `src/jellyfin/` calls
   * `fetch`. It also sidesteps `player-subtitles.md` §6c pitfall 4 — a
   * cross-origin `<track src>` fails silently — because the text arrives here
   * and is parsed rather than handed to an element.
   */
  getSubtitleText(options: SubtitleStreamOptions): Promise<string>;
  /**
   * `GET /Videos/{itemId}/{mediaSourceId}/Attachments/{index}` — one file
   * muxed in beside the video, which for this app means an **embedded font**
   * for the styled subtitle renderer (#29).
   *
   * A URL rather than the bytes, because the renderer fetches it itself: it
   * runs in a worker and wants the font there, so handing it an address keeps
   * the bytes off the main thread entirely. That makes this the one gateway
   * method whose answer is fetched by something other than the gateway, and
   * the token rides in the query as `ApiKey` for the same reason the video's
   * does — nothing else can send a header for it.
   */
  attachmentUrl(options: AttachmentOptions): string;
  /**
   * `GET /Items?ids={itemId}&fields=Trickplay` — the scrubbing thumbnails one
   * media source has, or nothing (#32, story 90).
   *
   * **`fields=Trickplay` is the whole of why this is a method of its own.**
   * The property is gated (`jellyfin-api.md` §4), and the player is handed an
   * item id rather than an item: a Title opened from the Billboard or from a
   * card never went through a title page, so there is nowhere else the
   * manifest could already be. It is `/Items` with an `ids` rather than
   * `/Items/{itemId}` for the same reason `getTitles` is — except that this
   * one deliberately does **not** narrow to `Movie,Series`, because the thing
   * being played is as often an Episode.
   *
   * Unlike `HasSegments` for the markers (#31), **there is no flag that says
   * whether a Server has any**, so this costs one read per playback on every
   * Server. Nothing on `PlaybackInfo` carries it and no cheaper question
   * exists; the answer being empty is the common case and is not an error.
   */
  getTrickplay(itemId: string): Promise<TrickplayMap | undefined>;
  /**
   * `GET /Videos/{itemId}/Trickplay/{width}/{index}.jpg` — one **tile image**,
   * which holds `TileWidth × TileHeight` thumbnails rather than one.
   *
   * `width` is the inner key of the `Trickplay` map, and `tileIndex` is the
   * tile image's index and not the thumbnail's — the single easiest thing to
   * get wrong here, so the parameter is named for it.
   *
   * A URL rather than the bytes, because an `<img>` fetches it: the token
   * rides in the query as `ApiKey`, the same bargain `videoStreamUrl` makes
   * and for the same reason — an element cannot send a header.
   */
  trickplayTileUrl(options: TrickplayTileOptions): string;
  /**
   * `GET /MediaSegments/{itemId}?includeSegmentTypes={csv}` — the intro and
   * credits markers a player offers to skip (#31).
   *
   * The types are **narrowed in the request**, which is what the parameter is
   * for: a Server whose intro-detection plugin also found `Recap`, `Preview`
   * and `Commercial` segments would otherwise send markers this app draws no
   * button for. There is no `Credits` type — the credits marker is `Outro`
   * (`decisions.md` §5).
   *
   * It **fails for an item the Server holds nothing for**, which is a 404 on a
   * real Server as well as on the fake, and that is deliberately left to the
   * caller: `src/playback/media-segments.ts` is the one place a 404 and an
   * empty answer are made the same thing, so nothing else has to know they
   * are two spellings of "nothing to skip".
   */
  getMediaSegments(
    itemId: string,
    types?: readonly MediaSegmentType[],
  ): Promise<MediaSegmentDto[]>;
  /**
   * `POST /Sessions/Playing` — playback has started. 204, no body back.
   *
   * The three reports and the ping are how the Server knows anything is
   * playing: they drive the resume point, Continue Watching, the session list
   * and keeping a transcode alive.
   */
  reportPlaybackStarted(report: PlaybackProgressReport): Promise<void>;
  /** `POST /Sessions/Playing/Progress` — the same shape, with a new position. */
  reportPlaybackProgress(report: PlaybackProgressReport): Promise<void>;
  /**
   * `POST /Sessions/Playing/Stopped` — a **different, smaller** shape: no
   * `IsPaused`, no `PlayMethod`, and a `Failed` flag the other two lack.
   */
  reportPlaybackStopped(report: PlaybackStopReport): Promise<void>;
  /**
   * `POST /Sessions/Playing/Ping` — keeps a transcode alive without moving the
   * position. The one reporting endpoint whose argument is a **query**
   * parameter, and it is required.
   */
  pingPlayback(playSessionId: string): Promise<void>;
  /**
   * `GET /DisplayPreferences/{id}` — where a User's Client Settings are kept.
   *
   * `client` is a **required** query parameter, and it partitions storage, so
   * Jellyflick's settings never land in another client's. The Server mixes keys
   * of its own into `CustomPrefs` when it answers; stripping them is the
   * caller's, in `src/settings/client-settings.ts`.
   */
  getDisplayPreferences(options: DisplayPreferencesOptions): Promise<DisplayPreferencesDto>;
  /**
   * `POST /DisplayPreferences/{id}` — answers 204, not the stored DTO.
   *
   * The body carries the **whole** `CustomPrefs` set and the Server stores it
   * as given, so every write is a read-modify-write.
   */
  saveDisplayPreferences(
    options: DisplayPreferencesOptions & { preferences: DisplayPreferencesDto },
  ): Promise<void>;
  /**
   * `POST /Users/Configuration?userId=…` — the User's **Jellyfin** settings,
   * which every Jellyfin app shares, as against the per-client Client Settings
   * above. Answers 204.
   *
   * There is deliberately no read here: 12.x has **no `GET
   * /Users/Configuration`**, so a User's configuration is read from
   * `UserDto.Configuration` through `getCurrentUser`.
   *
   * The body is the **whole** `UserConfiguration` and the Server assigns it as
   * given, so every write is a read-modify-write — see
   * `src/settings/playback-preferences.ts`.
   */
  saveUserConfiguration(options: {
    userId: string;
    configuration: UserConfiguration;
  }): Promise<void>;
};

/**
 * `PlaybackInfoDto`, as this app fills it in. Everything here goes in the body.
 */
export type PlaybackInfoOptions = {
  itemId: string;
  userId: string;
  /** The device's own profile, which is the whole of the negotiation. */
  deviceProfile: unknown;
  /** Where to start, in 100-nanosecond ticks: the resume point. */
  startTimeTicks?: number;
  maxStreamingBitrate?: number;
  /**
   * A track to use rather than the one the Server would choose (#27). Left out
   * means "you decide", and the Server then applies the User's own
   * `UserConfiguration` — which is how a Title starts with the right tracks
   * without this app matching languages itself.
   */
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
};

/**
 * `PlaybackInfoResponse`, which has only three fields. The useful ones are all
 * on the media sources.
 */
export type PlaybackInfoResponse = {
  MediaSources?: MediaSourceInfo[] | null;
  PlaySessionId?: string | null;
  /** A `PlaybackErrorCode`: `NotAllowed`, `NoCompatibleStream`, … */
  ErrorCode?: string | null;
};

/** The fields of `MediaSourceInfo` this app reads. */
export type MediaSourceInfo = {
  Id?: string | null;
  Container?: string | null;
  SupportsDirectPlay?: boolean | null;
  SupportsDirectStream?: boolean | null;
  SupportsTranscoding?: boolean | null;
  /** Server-relative, fully parameterised, already carrying `ApiKey`. */
  TranscodingUrl?: string | null;
  /** `MediaStreamProtocol`: `hls` decides hls.js or a native playlist. */
  TranscodingSubProtocol?: string | null;
  TranscodingContainer?: string | null;
  RunTimeTicks?: number | null;
  /** The Server has already applied the User's own language preferences. */
  DefaultAudioStreamIndex?: number | null;
  DefaultSubtitleStreamIndex?: number | null;
  HasSegments?: boolean | null;
  /** Every track in the file: what the picker offers (#27). */
  MediaStreams?: MediaStream[] | null;
  /**
   * The files muxed in beside the video, which for this app's purposes means
   * **the fonts a styled subtitle file is drawn with** (#29, story 104). An
   * ASS file names its typefaces by name and the library's own file is what
   * carries them, so without these a typeset sign is drawn in whatever face
   * the device happens to have.
   */
  MediaAttachments?: MediaAttachment[] | null;
};

/**
 * The fields of `MediaAttachment` this app reads. `src/playback/
 * styled-subtitles.ts` is the one place they are read, where `embeddedFontsOf`
 * decides which of them is a font — a Server answers that inconsistently
 * enough that it takes three fields to tell.
 */
export type MediaAttachment = {
  /** What the Attachments URL is built from. */
  Index?: number;
  /** ffprobe's name for the attachment stream: `ttf`, `otf`, `mjpeg`, … */
  Codec?: string | null;
  /** Frequently null on a real Server, which is why it is not the only test. */
  MimeType?: string | null;
  FileName?: string | null;
  /** The Server's own address for it, preferred where it gave one. */
  DeliveryUrl?: string | null;
};

/**
 * The fields of `MediaStream` this app reads, for the audio and subtitle
 * pickers. `src/playback/media-tracks.ts` is the one place they are read.
 *
 * `Index` is the **stream's own** index, which is what `AudioStreamIndex` and
 * `SubtitleStreamIndex` are set to — not its position in `MediaStreams`, which
 * an appended external subtitle file makes a different number.
 */
export type MediaStream = {
  Index?: number | null;
  /** A `MediaStreamType`: `Video`, `Audio`, `Subtitle`, `EmbeddedImage`, … */
  Type?: string | null;
  /** The ffprobe codec name, which is what tells a bitmap from text. */
  Codec?: string | null;
  Language?: string | null;
  /** The Server's own label: the language, the codec and the channel count. */
  DisplayTitle?: string | null;
  Title?: string | null;
  /** What the *file* was marked with, not what this User prefers. */
  IsDefault?: boolean | null;
  IsForced?: boolean | null;
  IsHearingImpaired?: boolean | null;
  IsExternal?: boolean | null;
  /** Serialised; its image-side siblings are `[JsonIgnore]` and are not. */
  IsTextSubtitleStream?: boolean | null;
  SupportsExternalStream?: boolean | null;
  /** A `SubtitleDeliveryMethod`: `External` is the only shiftable one. */
  DeliveryMethod?: string | null;
  /** Set when the Server has a URL of its own for this stream. */
  DeliveryUrl?: string | null;
  IsExternalUrl?: boolean | null;
  /**
   * The subtitle **file** behind an external stream, on the Server's own disk.
   * It is what the Subtitle Offset is remembered per (#28): two Episodes can
   * point at one file, and only this says so.
   */
  Path?: string | null;
};

/**
 * `MediaSegmentType` — the **whole** enum, in the Server's own order
 * (`jellyfin-playback.md` §12).
 *
 * `Outro` is the credits marker and there is no `Credits` value at all
 * (`decisions.md` §5). `Commercial` is a Live TV concern this app never shows.
 */
export type MediaSegmentType =
  | 'Unknown'
  | 'Commercial'
  | 'Preview'
  | 'Recap'
  | 'Outro'
  | 'Intro';

/** One marker on an item. Ticks are 100 ns, as everywhere on this API. */
export type MediaSegmentDto = {
  Id?: string | null;
  ItemId?: string | null;
  Type?: MediaSegmentType | null;
  StartTicks?: number | null;
  EndTicks?: number | null;
};

/** `MediaSegmentDtoQueryResult`, which is the ordinary paged shape. */
export type MediaSegmentsQueryResult = {
  Items?: MediaSegmentDto[] | null;
  TotalRecordCount?: number | null;
  StartIndex?: number | null;
};

/**
 * `TrickplayInfoDto`: one set of scrubbing thumbnails, for one media source at
 * one width (#32, `jellyfin-playback.md` §13).
 */
export type TrickplayInfo = {
  /** One thumbnail's width, and the number that goes in the tile image's path. */
  readonly Width: number;
  readonly Height: number;
  /** Thumbnails per row in a tile image. */
  readonly TileWidth: number;
  /** Thumbnails per column in a tile image. */
  readonly TileHeight: number;
  /** How many thumbnails there are in all, across every tile image. */
  readonly ThumbnailCount: number;
  /** Milliseconds between one thumbnail and the next. */
  readonly Interval: number;
  readonly Bandwidth?: number;
};

/**
 * `BaseItemDto.Trickplay`, which is a **map of maps**: the media source id on
 * the outside and the thumbnail width, *as a string*, on the inside. A Server
 * may have generated several widths for one source, and a Server with the
 * feature switched off has none at all — which is what both the nullable
 * inner map and the absent field mean.
 */
export type TrickplayMap = Record<string, Record<string, TrickplayInfo> | null | undefined>;

/** `PlayMethod`: which branch of the negotiation was taken. */
export type PlayMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

/**
 * `PlaybackStartInfo` and `PlaybackProgressInfo`, which are field-for-field
 * identical in 12.2.0, as this app fills them in.
 */
export type PlaybackProgressReport = {
  ItemId: string;
  PlaySessionId: string;
  MediaSourceId: string;
  PositionTicks: number;
  PlayMethod: PlayMethod;
  IsPaused: boolean;
  CanSeek: boolean;
  AudioStreamIndex?: number;
  SubtitleStreamIndex?: number;
};

/** `PlaybackStopInfo`: smaller, and with a `Failed` flag of its own. */
export type PlaybackStopReport = {
  ItemId: string;
  PlaySessionId: string;
  MediaSourceId: string;
  PositionTicks: number;
  Failed: boolean;
};

export type DisplayPreferencesOptions = {
  /**
   * The preferences' own id. Not a GUID: the Server MD5s anything that is not
   * one, so a plain name is legal and stable.
   */
  id: string;
  /** Required by the Server, and what keeps one client's settings its own. */
  client: string;
  userId: string;
};

/** The `ImageType` values this app asks for. */
export type ItemImageType = 'Primary' | 'Backdrop' | 'Logo' | 'Thumb';

export type ItemImageOptions = {
  tag?: string;
  /** Asks the Server to resize, so a card does not download a full-size poster. */
  maxWidth?: number;
};

export type LatestItemsOptions = {
  /** The library to ask. Without one the Server answers across all of them. */
  parentId: string;
  limit?: number;
};

export type FavouriteItemsOptions = {
  limit?: number;
};

/**
 * One of the two kinds of Title the app shows, as `includeItemTypes` spells
 * it. A query given one narrows to it; a query given none asks for both, which
 * is what every screen but the Movies and Series sections wants (#23).
 *
 * It is written out here rather than imported from `src/catalogue/`: this
 * module is the HTTP layer and knows the Server's vocabulary, not the app's.
 */
export type TitleKind = 'Movie' | 'Series';

export type TitlesQueryOptions = {
  /** Jellyfin's own matching, which is more than a substring of the name. */
  searchTerm?: string;
  /** One kind only, for a section that is about Movies or about Series. */
  kind?: TitleKind;
  /** A genre *name*, which is what `genres` takes; `genreIds` takes GUIDs. */
  genre?: string;
  limit?: number;
  /**
   * Particular items, by id. One id is how the title page reads its Title: it
   * is `/Items` rather than `/Items/{itemId}` on purpose, so the query's
   * `includeItemTypes=Movie,Series` goes on protecting it and a hand-typed
   * address for an Episode or an album comes back empty instead of showing a
   * page for something the app does not show.
   */
  ids?: readonly string[];
  /**
   * Everything the title page shows and no Row needs: the overview, the cast,
   * the streams, the provider ids, the logo and backdrop artwork, and this
   * User's own data — which is where the watched state is. A Row leaves it off,
   * so a strip of twenty cards still costs a strip of twenty cards.
   */
  detail?: boolean;
};

export type ContinueWatchingOptions = {
  limit?: number;
  /**
   * One kind of Title only (#23). What that narrows to is the question each
   * endpoint answers rather than the literal kind: `getResumeItems` asks for
   * **Episodes** for a Series, because a Series holds no file and is never
   * resumable itself.
   */
  kind?: TitleKind;
};

export type GenresOfTitlesOptions = {
  /** One kind only: the Movies section ranks the genres of Movies. */
  kind?: TitleKind;
  /** How many Titles to read. Absent means every one of them. */
  limit?: number;
};

/**
 * One user-data field, or a few, to change on an item. Only what is named is
 * sent, because the Server leaves the rest of the record as it is — and that is
 * exactly what "my watch history stays as it is" means in story 37.
 */
export type UserItemDataWrite = {
  itemId: string;
  /** Where the User got to, in Jellyfin's 100-nanosecond ticks. */
  playbackPositionTicks?: number;
};

export type RecentAdditionsOptions = {
  /**
   * How many of the newest additions to read. The Server has no "added since"
   * filter on this endpoint, so the window is a count rather than a date, and
   * the caller is what turns it into days.
   */
  limit?: number;
};

export type BillboardCandidatesOptions = {
  /**
   * How many Titles to consider. Absent means every one of them, which is the
   * default on purpose — see the note on the method.
   */
  limit?: number;
  /** One kind only, for the Billboard over the Movies or Series section (#23). */
  kind?: TitleKind;
};

export type SimilarTitlesOptions = {
  itemId: string;
  limit?: number;
};

export type MovieRecommendationsOptions = {
  /** How many categories the Server offers: how many Titles it suggests from. */
  categoryLimit?: number;
  /** How many Titles in each category, which is one Row's worth. */
  itemLimit?: number;
};

export type CollectionTitlesOptions = {
  /** The Collection's own item id, which is what a Home Layout stores. */
  collectionId: string;
  limit?: number;
};

export type VideoStreamOptions = {
  itemId: string;
  mediaSourceId: string;
  playSessionId: string;
  /** Put in the path, so the browser sees a sensible extension. */
  container?: string;
};

export type AttachmentOptions = {
  itemId: string;
  mediaSourceId: string;
  /** `MediaAttachment.Index`, which is its own index and not a list position. */
  index: number;
  /** `MediaAttachment.DeliveryUrl`, preferred where the Server gave one. */
  deliveryUrl?: string;
};

export type TrickplayTileOptions = {
  itemId: string;
  mediaSourceId: string;
  /** The thumbnail width: the inner key of the `Trickplay` map, in the path. */
  width: number;
  /** The **tile image's** index, not the thumbnail's. */
  tileIndex: number;
};

export type SubtitleStreamOptions = {
  itemId: string;
  mediaSourceId: string;
  /** `MediaStream.Index`: the stream's own index, not its place in the list. */
  index: number;
  /** The file extension, which is how the Server is asked to convert: `vtt`. */
  format: string;
  /**
   * Windows the output. `0` — the default — is the whole file, which is what
   * an app applying its own offset (#28) wants: `startPositionTicks` is not an
   * offset and shifting with it would cut the file instead.
   */
  startPositionTicks?: number;
  /**
   * `MediaStream.DeliveryUrl`, when the Server populated it. Preferred over a
   * URL built here: `jellyfin-playback.md` §14 shows the Server hands back an
   * address of its own for an external stream already at an absolute one.
   */
  deliveryUrl?: string;
};

export type JellyfinGatewayOptions = ServerIdentity & {
  serverAddress: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
};

/**
 * The only `BaseItemKind`s this app shows, as `includeItemTypes` takes them.
 * Every Title query carries it, so "only Movies and Series" is one fact in one
 * place rather than a filter on each screen.
 */
const TITLE_ITEM_TYPES = 'Movie,Series';

/**
 * The kinds an *addition* can be, which is a wider set than the app shows: a
 * Series grows by a Season or an Episode, so a query about what is new has to
 * see those even though no screen ever draws one. Only `getRecentAdditions`
 * uses it.
 */
const ADDITION_ITEM_TYPES = 'Movie,Series,Season,Episode';

/**
 * What a User can resume: a Movie, or one Episode of a Series. Only
 * `getResumeItems` uses it — a Series is resumed through its next Episode,
 * which is a different endpoint.
 */
const RESUMABLE_ITEM_TYPES = 'Movie,Episode';

/**
 * What one kind of Title is resumed *as* (#23). A Movie is its own file; a
 * Series holds none at all, so what a User resumes of one is an Episode. This
 * is the same fact `src/title/play-target.ts` keeps for Play, read here as a
 * query rather than as a target.
 */
const RESUMABLE_KIND_OF: Readonly<Record<TitleKind, string>> = {
  Movie: 'Movie',
  Series: 'Episode',
};

/**
 * The `fields` a title page needs and a Row does not. The ratings,
 * `RunTimeTicks`, `ProductionYear` and `OfficialRating` are deliberately absent:
 * the Server sends all four unasked (`jellyfin-api.md` §4/§17), and naming a
 * field that is not one would be a quiet lie about where they come from.
 */
const TITLE_DETAIL_FIELDS =
  'Overview,People,MediaStreams,ProviderIds,RemoteTrailers,LocalTrailerCount,CanDownload,Genres';

/** Posters, and the artwork only a title page shows: a backdrop and a logo. */
const TITLE_DETAIL_IMAGE_TYPES = 'Primary,Backdrop,Logo,Thumb';

/**
 * What the Billboard reads and a Row does not (#16): the short description.
 * The age rating and the community rating are **not** here, because the Server
 * sends `OfficialRating` and `CommunityRating` unasked — see the note above.
 */
const BILLBOARD_FIELDS = 'Overview';

/**
 * The Billboard's artwork: its backdrop, the logo over it, and the poster,
 * which is what a card for the same Title shows if one is drawn beside it. No
 * `Thumb`: nothing on the Billboard draws one.
 */
const BILLBOARD_IMAGE_TYPES = 'Primary,Backdrop,Logo';

/** A request that reached the Server but came back with a non-2xx status. */
export class JellyfinHttpError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`${method} ${path} returned ${String(status)}`);
    this.name = 'JellyfinHttpError';
    this.status = status;
  }
}

/** A request that never reached the Server: wrong address, DNS, TLS, offline. */
export class JellyfinUnreachableError extends Error {
  /** What `fetch` threw. Not `Error.cause`, which is Chrome 93. */
  readonly reason: unknown;

  constructor(serverAddress: string, reason: unknown) {
    super(`Could not reach ${serverAddress}`);
    this.name = 'JellyfinUnreachableError';
    this.reason = reason;
  }
}

export function createJellyfinGateway(options: JellyfinGatewayOptions): JellyfinGateway {
  const serverAddress = normaliseServerAddress(options.serverAddress);
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const authorization = buildAuthorizationHeader(options);
  /** This gateway's own token, for the URLs a media element has to carry it in. */
  const accessToken = options.token;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${serverAddress}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (reason) {
      throw new JellyfinUnreachableError(serverAddress, reason);
    }
    if (!response.ok) {
      throw new JellyfinHttpError(method, path, response.status);
    }
    return (await response.json()) as T;
  }

  /**
   * A request whose answer is text rather than JSON: a subtitle file. Its own
   * shape because `Accept` has to say so and the answer is not parsed — the
   * Server converts by file extension and a graphical track comes back as the
   * raw file whatever was asked for (`jellyfin-playback.md` §14), so the
   * caller is what decides whether there was anything in it.
   */
  async function requestText(url: string): Promise<string> {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: 'GET',
        headers: { Accept: 'text/plain, */*', Authorization: authorization },
      });
    } catch (reason) {
      throw new JellyfinUnreachableError(serverAddress, reason);
    }
    if (!response.ok) {
      throw new JellyfinHttpError('GET', url, response.status);
    }
    return await response.text();
  }

  /**
   * A request whose answer has no body. `response.json()` on a 204 throws, so
   * an endpoint that answers "No Content" needs its own shape rather than a
   * `request<void>`.
   */
  async function requestWithoutAnswer(method: string, path: string, body?: unknown): Promise<void> {
    let response: Response;
    try {
      response = await doFetch(`${serverAddress}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (reason) {
      throw new JellyfinUnreachableError(serverAddress, reason);
    }
    if (!response.ok) {
      throw new JellyfinHttpError(method, path, response.status);
    }
  }

  return {
    serverAddress,
    authorizationHeader: () => authorization,
    getPublicSystemInfo: () => request<PublicSystemInfo>('GET', '/System/Info/Public'),
    getPublicUsers: () => request<UserDto[]>('GET', '/Users/Public'),
    getCurrentUser: () => request<UserDto>('GET', '/Users/Me'),
    // The body field is `Pw`, not `Password`.
    authenticateByName: (username, password) =>
      request<AuthenticationResult>('POST', '/Users/AuthenticateByName', {
        Username: username,
        Pw: password,
      }),

    isQuickConnectEnabled: () => request<boolean>('GET', '/QuickConnect/Enabled'),
    initiateQuickConnect: () => request<QuickConnectResult>('POST', '/QuickConnect/Initiate'),
    getQuickConnectState: (secret) =>
      request<QuickConnectResult>(
        'GET',
        `/QuickConnect/Connect${query({ secret })}`,
      ),
    // The body field is `Secret`, and the Server requires it.
    authenticateWithQuickConnect: (secret) =>
      request<AuthenticationResult>('POST', '/Users/AuthenticateWithQuickConnect', {
        Secret: secret,
      }),

    signOut: () => requestWithoutAnswer('POST', '/Sessions/Logout'),
    userImageUrl: (userId, tag) =>
      `${serverAddress}/UserImage?userId=${encodeURIComponent(userId)}&tag=${encodeURIComponent(tag)}`,

    getUserViews: () =>
      request<BaseItemDtoQueryResult>('GET', '/UserViews').then((result) => result.Items ?? []),

    getLatestItems: (options) =>
      request<BaseItemDto[]>(
        'GET',
        `/Items/Latest${query({
          parentId: options.parentId,
          // `DateCreated` is not returned unless it is asked for by name, and
          // without it there is nothing to merge libraries by.
          fields: 'DateCreated',
          // Posters only: the default is every image type, at every size.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          groupItems: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ),

    getFavouriteItems: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          isFavorite: true,
          // My List is a list of Titles: a favourited album or Episode is not
          // one, and the Server is the right place to leave them out.
          includeItemTypes: TITLE_ITEM_TYPES,
          // Without this the Server answers with the library folders.
          recursive: true,
          // `Name`, deliberately not `SortName`: see the note on the method.
          sortBy: 'Name',
          sortOrder: 'Ascending',
          // Posters only: the default is every image type, at every size.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          // The list itself says how long it is, so the Server can skip a COUNT.
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getTitles: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          // Only the two kinds the app shows, so the Server never sends an
          // Episode, a Season, an album or a stray video file at all — or just
          // one of them, for a section that is about one kind (#23).
          includeItemTypes: options.kind ?? TITLE_ITEM_TYPES,
          // Without this the Server answers with the library folders.
          recursive: true,
          // Name order, so a term that matches several Titles comes back the
          // same way twice. Positionally paired with `sortBy`.
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          // Posters only unless a title page asked for the rest: the default is
          // every image type, at every size.
          enableImageTypes:
            options.detail === true ? TITLE_DETAIL_IMAGE_TYPES : 'Primary',
          imageTypeLimit: 1,
          // The watched state is a `UserData` field, so a title page needs it
          // and a Row does not.
          enableUserData: options.detail === true,
          ...(options.detail === true ? { fields: TITLE_DETAIL_FIELDS } : {}),
          // Nothing shows a total, and asking for one costs the Server a COUNT.
          enableTotalRecordCount: false,
          ...(options.searchTerm === undefined ? {} : { searchTerm: options.searchTerm }),
          ...(options.genre === undefined ? {} : { genres: options.genre }),
          ...(options.ids === undefined ? {} : { ids: options.ids.join(',') }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getRecentAdditions: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          // The four kinds an addition can be. A Season and an Episode are here
          // only to say what happened to a Series — see the note on the method.
          includeItemTypes: ADDITION_ITEM_TYPES,
          recursive: true,
          // Newest first, which is the whole point of the query: with a limit,
          // this is "the most recent additions" rather than an arbitrary page.
          sortBy: 'DateCreated',
          sortOrder: 'Descending',
          // `DateCreated` is not returned unless it is asked for by name, and
          // it is the only field a label is derived from.
          fields: 'DateCreated',
          // A label is drawn over artwork a Row already asked for, so this
          // query wants none of its own.
          enableImages: false,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getBillboardCandidates: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          // Only the two kinds the app shows: the Billboard features a Title.
          // One of them over a section about one kind (#23).
          includeItemTypes: options.kind ?? TITLE_ITEM_TYPES,
          recursive: true,
          // A fixed order, so the same draw picks the same Title twice. The
          // randomness is the device layer's, never the Server's.
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          enableImageTypes: BILLBOARD_IMAGE_TYPES,
          imageTypeLimit: 1,
          fields: BILLBOARD_FIELDS,
          // Whether this User has finished a Title decides whether Spotlight
          // may feature it, and where they left off is what Play resumes from.
          enableUserData: true,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getGenresOfTitles: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          includeItemTypes: options.kind ?? TITLE_ITEM_TYPES,
          recursive: true,
          // A fixed order, so two reads of an unchanged library rank its
          // genres the same way and a tie breaks the same way twice.
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          // The one thing this query is for, and the Server does not send it
          // unasked (`jellyfin-api.md` §4).
          fields: 'Genres',
          // Nothing it answers is ever drawn: it is counted.
          enableImages: false,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    // A bare array, like `/Items/Latest` and unlike everything around it.
    getLocalTrailers: (itemId) =>
      request<BaseItemDto[]>(
        'GET',
        `/Items/${encodeURIComponent(itemId)}/LocalTrailers`,
      ),

    getResumeItems: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/UserItems/Resume${query({
          // A Movie or an Episode: the two things a User resumes. A Series is
          // never resumable itself — its next Episode is `/Shows/NextUp` — so
          // a section about Series asks for Episodes rather than for Series
          // (#23), which is why the kind is mapped rather than passed on.
          includeItemTypes:
            options.kind === undefined
              ? RESUMABLE_ITEM_TYPES
              : RESUMABLE_KIND_OF[options.kind],
          mediaTypes: 'Video',
          // The progress bar and the resume point are both `UserData`, so this
          // is the one Row that cannot do without it.
          enableUserData: true,
          // A card shows the Series' poster, which an Episode carries as
          // `SeriesPrimaryImageTag` rather than as an image of its own.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getNextUpItems: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Shows/NextUp${query({
          enableUserData: true,
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getSeasons: (seriesId) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Shows/${encodeURIComponent(seriesId)}/Seasons${query({
          // The picker draws a name, so no artwork and no user data: whether a
          // Season has been watched is the sum of its Episodes', which the
          // Episodes themselves carry.
          enableImages: false,
          enableUserData: false,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    getEpisodes: (seriesId) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Shows/${encodeURIComponent(seriesId)}/Episodes${query({
          // The description is the only one of the three that is a `fields`
          // value: `RunTimeTicks` is always sent and the still is an image
          // type (`jellyfin-api.md` §4).
          fields: 'Overview',
          // An Episode's own `Primary` image is the still from the programme,
          // which is what a list of them shows.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          // How far through each Episode this User is, and which they have
          // finished: the progress bar and the choice Play makes both need it.
          enableUserData: true,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    saveUserItemData: (options) =>
      request<UserItemDataDto>(
        'POST',
        `/UserItems/${encodeURIComponent(options.itemId)}/UserData`,
        {
          // Only the fields that were asked for: an absent field is one the
          // Server does not change.
          ...(options.playbackPositionTicks === undefined
            ? {}
            : { PlaybackPositionTicks: options.playbackPositionTicks }),
        },
      ),

    getPlayedEpisodes: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          includeItemTypes: 'Episode',
          recursive: true,
          isPlayed: true,
          // When they were played, newest first, which is the only thing this
          // query is for.
          sortBy: 'DatePlayed',
          sortOrder: 'Descending',
          // The date lives in `UserData`; nothing here is drawn, so no artwork.
          enableUserData: true,
          enableImages: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getPlayedTitles: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          includeItemTypes: TITLE_ITEM_TYPES,
          recursive: true,
          isPlayed: true,
          // When they were finished, most recent first, which is the order
          // Watch Again offers them in.
          sortBy: 'DatePlayed',
          sortOrder: 'Descending',
          // These are drawn as cards, unlike the Episodes beside them.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getSimilarTitles: (options) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items/${encodeURIComponent(options.itemId)}/Similar${query({
          // The Server's "like this" spans everything it holds, so the two
          // kinds the app shows are narrowed here as everywhere else.
          includeItemTypes: TITLE_ITEM_TYPES,
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getCollectionsFor: (itemId) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items/${encodeURIComponent(itemId)}/Collections${query({
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    getMovieRecommendations: (options = {}) =>
      // A bare array, not a query result: this endpoint is the odd one out.
      request<RecommendationDto[]>(
        'GET',
        `/Movies/Recommendations${query({
          // The categories are about Movies whatever is asked for, but saying
          // so keeps the query honest about what the Row shows.
          includeItemTypes: 'Movie',
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          ...(options.categoryLimit === undefined
            ? {}
            : { categoryLimit: options.categoryLimit }),
          ...(options.itemLimit === undefined ? {} : { itemLimit: options.itemLimit }),
        })}`,
      ),

    getCollections: () =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          // A Collection is a BoxSet, which is neither of the kinds every
          // other query here narrows to.
          includeItemTypes: 'BoxSet',
          recursive: true,
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    getCollectionTitles: (options) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          parentId: options.collectionId,
          includeItemTypes: TITLE_ITEM_TYPES,
          recursive: true,
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    markPlayed: (itemId) =>
      request<UserItemDataDto>('POST', `/UserPlayedItems/${encodeURIComponent(itemId)}`),

    markUnplayed: (itemId) =>
      request<UserItemDataDto>('DELETE', `/UserPlayedItems/${encodeURIComponent(itemId)}`),

    addToFavourites: (itemId) =>
      request<UserItemDataDto>('POST', `/UserFavoriteItems/${encodeURIComponent(itemId)}`),

    removeFromFavourites: (itemId) =>
      request<UserItemDataDto>('DELETE', `/UserFavoriteItems/${encodeURIComponent(itemId)}`),

    getTitleGenres: () =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Genres${query({
          // The genres of the Titles this app shows, so a music-only genre is
          // never offered as something to browse.
          includeItemTypes: TITLE_ITEM_TYPES,
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          // A genre is browsed by its name, so its own artwork is not wanted.
          enableImages: false,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    getPlaybackInfo: (options) =>
      request<PlaybackInfoResponse>(
        'POST',
        // No query string at all: the deprecated query form of these arguments
        // cannot carry a DeviceProfile, so everything goes in the body.
        `/Items/${encodeURIComponent(options.itemId)}/PlaybackInfo`,
        {
          UserId: options.userId,
          DeviceProfile: options.deviceProfile,
          StartTimeTicks: options.startTimeTicks ?? 0,
          ...(options.maxStreamingBitrate === undefined
            ? {}
            : { MaxStreamingBitrate: options.maxStreamingBitrate }),
          ...(options.audioStreamIndex === undefined
            ? {}
            : { AudioStreamIndex: options.audioStreamIndex }),
          ...(options.subtitleStreamIndex === undefined
            ? {}
            : { SubtitleStreamIndex: options.subtitleStreamIndex }),
          // The app can take any of the three, and which one it gets is the
          // Server's to decide from the profile.
          EnableDirectPlay: true,
          EnableDirectStream: true,
          EnableTranscoding: true,
          AllowVideoStreamCopy: true,
          AllowAudioStreamCopy: true,
          AutoOpenLiveStream: false,
        },
      ),

    videoStreamUrl: (options) => {
      const path = options.container === undefined ? 'stream' : `stream.${options.container}`;
      return `${serverAddress}/Videos/${encodeURIComponent(options.itemId)}/${path}${query({
        static: true,
        mediaSourceId: options.mediaSourceId,
        playSessionId: options.playSessionId,
        // A <video src> cannot send an Authorization header, so the token goes
        // in the query — which is what the Server's own generated URLs do.
        ...(accessToken === undefined || accessToken === '' ? {} : { ApiKey: accessToken }),
      })}`;
    },

    downloadUrl: (itemId) =>
      `${serverAddress}/Items/${encodeURIComponent(itemId)}/Download${query({
        ...(accessToken === undefined || accessToken === '' ? {} : { ApiKey: accessToken }),
      })}`,

    absoluteUrl: (serverRelativeUrl) =>
      serverRelativeUrl.startsWith('/')
        ? `${serverAddress}${serverRelativeUrl}`
        : `${serverAddress}/${serverRelativeUrl}`,

    subtitleStreamUrl: (options) => subtitleUrlFor(options),
    getSubtitleText: (options) => requestText(subtitleUrlFor(options)),
    attachmentUrl: (options) => attachmentUrlFor(options),

    getTrickplay: (itemId) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          ids: itemId,
          // Without this the Server answers with the library folders.
          recursive: true,
          // The one field this read exists for. The Server sends it only when
          // it is named (`jellyfin-api.md` §4).
          fields: 'Trickplay',
          // Nothing here draws artwork or reads a watched state.
          enableImages: false,
          enableUserData: false,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => {
        const item = (result.Items ?? [])[0] as { Trickplay?: TrickplayMap | null } | undefined;
        const trickplay = item?.Trickplay;
        return trickplay === null || trickplay === undefined ? undefined : trickplay;
      }),

    trickplayTileUrl: (options) =>
      `${serverAddress}/Videos/${encodeURIComponent(options.itemId)}/Trickplay/${String(
        options.width,
      )}/${String(options.tileIndex)}.jpg${query({
        mediaSourceId: options.mediaSourceId,
        // An <img src> cannot send an Authorization header, as a <video src>
        // cannot — so the token goes in the query, as the Server's own
        // generated URLs do.
        ...(accessToken === undefined || accessToken === '' ? {} : { ApiKey: accessToken }),
      })}`,

    getMediaSegments: (itemId, types) =>
      request<MediaSegmentsQueryResult>(
        'GET',
        `/MediaSegments/${encodeURIComponent(itemId)}${query({
          // Left out altogether when the caller wants everything the Server
          // holds: an empty parameter is not the same request.
          ...(types === undefined || types.length === 0
            ? {}
            : { includeSegmentTypes: types.join(',') }),
        })}`,
      ).then((result) => result.Items ?? []),

    reportPlaybackStarted: (report) =>
      requestWithoutAnswer('POST', '/Sessions/Playing', report),
    reportPlaybackProgress: (report) =>
      requestWithoutAnswer('POST', '/Sessions/Playing/Progress', report),
    reportPlaybackStopped: (report) =>
      requestWithoutAnswer('POST', '/Sessions/Playing/Stopped', report),
    pingPlayback: (playSessionId) =>
      requestWithoutAnswer(
        'POST',
        `/Sessions/Playing/Ping${query({ playSessionId })}`,
      ),

    getDisplayPreferences: (options) =>
      request<DisplayPreferencesDto>('GET', `/DisplayPreferences/${displayPreferencesPath(options)}`),

    saveDisplayPreferences: (options) =>
      requestWithoutAnswer(
        'POST',
        `/DisplayPreferences/${displayPreferencesPath(options)}`,
        options.preferences,
      ),

    saveUserConfiguration: (options) =>
      requestWithoutAnswer(
        'POST',
        `/Users/Configuration${query({ userId: options.userId })}`,
        options.configuration,
      ),

    itemImageUrl: (itemId, imageType, options = {}) =>
      `${serverAddress}/Items/${encodeURIComponent(itemId)}/Images/${imageType}${query({
        ...(options.tag === undefined ? {} : { tag: options.tag }),
        ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      })}`,
  };

  /**
   * The Server's own address for a subtitle stream where it gave one, and the
   * canonical path otherwise. Shared by the URL and the fetch so the two can
   * never disagree about which it is.
   *
   * The token goes in the query as `ApiKey`, as it does for the video: it is
   * the form the Server's own generated URLs take, and `StreamInfo.cs` appends
   * exactly this to an external subtitle URL too.
   */
  function subtitleUrlFor(options: SubtitleStreamOptions): string {
    const apiKey: Record<string, string> =
      accessToken === undefined || accessToken === '' ? {} : { ApiKey: accessToken };

    if (options.deliveryUrl !== undefined && options.deliveryUrl !== '') {
      const given = options.deliveryUrl;
      // An absolute one is the Server pointing at somewhere else entirely, and
      // is used untouched; a server-relative one is only made absolute.
      return /^https?:\/\//i.test(given)
        ? given
        : `${serverAddress}${given.startsWith('/') ? '' : '/'}${given}`;
    }

    const startTicks = options.startPositionTicks ?? 0;
    return `${serverAddress}/Videos/${encodeURIComponent(options.itemId)}/${encodeURIComponent(
      options.mediaSourceId,
    )}/Subtitles/${String(options.index)}/${String(startTicks)}/Stream.${encodeURIComponent(
      options.format,
    )}${query(apiKey)}`;
  }

  /**
   * One attachment's address — an embedded font (#29). Shaped exactly like the
   * subtitle one above, and for the same reasons: the Server's own
   * `DeliveryUrl` wherever it gave one, the canonical path otherwise, and the
   * token in the query because the renderer's worker fetches this and cannot
   * send a header.
   */
  function attachmentUrlFor(options: AttachmentOptions): string {
    const apiKey: Record<string, string> =
      accessToken === undefined || accessToken === '' ? {} : { ApiKey: accessToken };

    if (options.deliveryUrl !== undefined && options.deliveryUrl !== '') {
      const given = options.deliveryUrl;
      return /^https?:\/\//i.test(given)
        ? given
        : `${serverAddress}${given.startsWith('/') ? '' : '/'}${given}`;
    }

    return `${serverAddress}/Videos/${encodeURIComponent(options.itemId)}/${encodeURIComponent(
      options.mediaSourceId,
    )}/Attachments/${String(options.index)}${query(apiKey)}`;
  }
}

/** The path and query both `/DisplayPreferences` calls share. */
function displayPreferencesPath(options: DisplayPreferencesOptions): string {
  return `${encodeURIComponent(options.id)}${query({
    client: options.client,
    userId: options.userId,
  })}`;
}

/**
 * A query string from values that are already decided. Numbers and booleans are
 * written the way Jellyfin reads them, and `URLSearchParams` does the escaping.
 */
function query(values: Readonly<Record<string, string | number | boolean>>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    params.set(name, typeof value === 'string' ? value : String(value));
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** Trims whitespace and trailing slashes so paths can always be concatenated. */
export function normaliseServerAddress(address: string): string {
  return address.trim().replace(/\/+$/, '');
}
