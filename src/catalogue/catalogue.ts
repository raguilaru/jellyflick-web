import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

/**
 * The catalogue: Jellyfin's items as this app's vocabulary.
 *
 * Jellyfin serves everything as a `BaseItemDto` with a `Type` discriminator —
 * Movies and Series next to Seasons, Episodes, BoxSets, music and photos. This
 * module is the one place that reading is done, so no screen ever has to know
 * what a `BaseItemDto` is.
 *
 * Only the four kinds the app shows come out of it: a Title is a Movie or a
 * Series, and a Season or an Episode is something that belongs to a Series.
 * Anything else is nothing this app shows, and comes back as `undefined`.
 */

/** The item an image URL is built against, with the tag that caches it. */
export type Artwork = {
  readonly itemId: string;
  readonly imageTag: string;
};

/** A Movie or a Series: the only kinds of content the app shows. */
export type Title = {
  readonly kind: 'Movie' | 'Series';
  readonly itemId: string;
  readonly name: string;
  /** `DateCreated` as milliseconds since the epoch. Absent if the Server left it out. */
  readonly addedAt?: number;
  /** The Primary image. Absent when the Server has none for this item. */
  readonly artwork?: Artwork;
};

/**
 * One Episode of a Series. It carries the Series it belongs to rather than just
 * its id, because that is what a Row needs to show a Series once however many
 * Episodes were added.
 */
export type Episode = {
  readonly kind: 'Episode';
  readonly itemId: string;
  readonly name: string;
  readonly series: Title;
  readonly addedAt?: number;
  /** `ParentIndexNumber`. Absent for an Episode the Server has not placed. */
  readonly seasonNumber?: number;
  /** `IndexNumber`. Absent for an Episode the Server has not numbered. */
  readonly episodeNumber?: number;
};

/** One Season of a Series. Like an Episode, it carries its Series. */
export type Season = {
  readonly kind: 'Season';
  readonly itemId: string;
  readonly name: string;
  readonly series: Title;
  readonly addedAt?: number;
  /** `IndexNumber` on a Season, which is the Season's own number. */
  readonly seasonNumber?: number;
};

export type CatalogueItem = Title | Season | Episode;

/** One person in a Title's cast: who they are, and who they played. */
export type CastMember = {
  readonly name: string;
  /** `Role`. Absent when the Server does not say who they played. */
  readonly role?: string;
};

/**
 * Everything the title page shows about one Title (#17).
 *
 * It is a Title plus the fields only a detail query asks for, rather than a
 * fatter `Title`: a Row carries hundreds of Titles and has no use for a cast
 * list, and keeping the two apart is what stops a Row's query growing fields
 * nothing on it reads.
 *
 * Every field the Server may leave out is optional here, and is left out rather
 * than defaulted: story 81 says a missing rating is omitted, not shown as zero.
 * `CommunityRating` arrives absent when it is zero — the Server's own guard —
 * but `CriticRating` and `OfficialRating` are unguarded, so a null and an empty
 * string are handled here.
 */
export type TitleDetails = {
  readonly title: Title;
  /** `ProductionYear`. */
  readonly year?: number;
  /** `OfficialRating`, e.g. "PG-13". */
  readonly ageRating?: string;
  /** `RunTimeTicks`, as whole minutes. */
  readonly runtimeMinutes?: number;
  readonly genres: readonly string[];
  readonly overview?: string;
  /** `CriticRating`: the Rotten Tomatoes critic score, 0–100. */
  readonly criticRating?: number;
  /** `CommunityRating`: Jellyfin's community score, 0–10. */
  readonly communityRating?: number;
  readonly cast: readonly CastMember[];
  /** The first `BackdropImageTags` entry, which is the one the page shows. */
  readonly backdrop?: Artwork;
  /** `ImageTags.Logo`, shown in place of the name when the Title has one. */
  readonly logo?: Artwork;
  /** Three-letter language codes from the audio `MediaStreams`, each once. */
  readonly audioLanguages: readonly string[];
  /** The same from the subtitle streams. */
  readonly subtitleLanguages: readonly string[];
  /** `UserData.Played`: whether this User has marked the Title watched. */
  readonly watched: boolean;
  /**
   * `UserData.PlaybackPositionTicks`: where this User left off, in Jellyfin's
   * 100-nanosecond ticks, and so what Play resumes from (#25).
   *
   * Left out when it is zero, which is every Title nobody has started — the
   * Server sends a zero rather than nothing, and "start from the beginning" is
   * the *absence* of a resume point, not a resume point of zero.
   */
  readonly resumePositionTicks?: number;
};

/**
 * What this User has done with one item: where they got to, how far through
 * that is, and when they last played it.
 *
 * It is read apart from the item itself because it belongs to a *User* rather
 * than to the catalogue — the same Episode has a different one for everybody in
 * the household — and because only the Rows and screens that ask the Server for
 * `UserData` have it at all.
 *
 * Every field is left out rather than defaulted, as everywhere else here: a
 * resume point of zero is the *absence* of a resume point (the Server sends a
 * zero rather than nothing), and an item nobody has played has no last-played
 * date rather than one at the epoch.
 */
export type PlaybackState = {
  /** `UserData.PlaybackPositionTicks`, in Jellyfin's 100-nanosecond ticks. */
  readonly positionTicks?: number;
  /** How far through, from 0 to 1 — what a card draws its progress bar from. */
  readonly progress?: number;
  /** `UserData.LastPlayedDate` as milliseconds since the epoch. */
  readonly lastPlayedAt?: number;
  /** `UserData.Played`: whether this User has finished it. */
  readonly played: boolean;
};

/**
 * One item's playback state for the User the query was made as.
 *
 * `PlayedPercentage` is the Server's own answer and is preferred, because it
 * knows the real length of the file; `RunTimeTicks` is the fallback, for the
 * endpoints that send a position but no percentage. Either way the progress is
 * clamped into 0–1 and left out when there is nothing to say.
 */
export function playbackStateOf(dto: BaseItemDto): PlaybackState {
  const userData = dto.UserData;
  const positionTicks =
    typeof userData?.PlaybackPositionTicks === 'number' && userData.PlaybackPositionTicks > 0
      ? userData.PlaybackPositionTicks
      : undefined;

  return {
    ...positiveNumberOf('positionTicks', positionTicks),
    ...numberOf('progress', progressOf(userData?.PlayedPercentage, positionTicks, dto.RunTimeTicks)),
    ...numberOf('lastPlayedAt', dateOf(userData?.LastPlayedDate)),
    played: userData?.Played === true,
  };
}

function progressOf(
  playedPercentage: unknown,
  positionTicks: number | undefined,
  runTimeTicks: unknown,
): number | undefined {
  if (typeof playedPercentage === 'number' && Number.isFinite(playedPercentage)) {
    return clampedToAFraction(playedPercentage / 100);
  }
  if (
    positionTicks === undefined ||
    typeof runTimeTicks !== 'number' ||
    !Number.isFinite(runTimeTicks) ||
    runTimeTicks <= 0
  ) {
    return undefined;
  }
  return clampedToAFraction(positionTicks / runTimeTicks);
}

/** A fraction of the way through, however badly the Server reported it. */
function clampedToAFraction(fraction: number): number {
  return Math.max(0, Math.min(1, fraction));
}

/** An ISO date as a timestamp, left out when there was none or it was unreadable. */
function dateOf(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at;
}

/**
 * One item as everything the title page shows, or `undefined` when it is not a
 * Title at all — which is also what a hand-typed address for an Episode or an
 * album comes to.
 */
export function titleDetailsFrom(dto: BaseItemDto): TitleDetails | undefined {
  const item = catalogueItemFrom(dto);
  if (item === undefined || (item.kind !== 'Movie' && item.kind !== 'Series')) return undefined;

  const streams = dto.MediaStreams ?? [];
  return {
    title: item,
    ...numberOf('year', dto.ProductionYear),
    ...textOf('ageRating', dto.OfficialRating),
    ...numberOf('runtimeMinutes', minutesOfTicks(dto.RunTimeTicks)),
    genres: dto.Genres?.filter((genre): genre is string => typeof genre === 'string') ?? [],
    ...textOf('overview', dto.Overview),
    ...numberOf('criticRating', dto.CriticRating),
    ...numberOf('communityRating', dto.CommunityRating),
    cast: (dto.People ?? [])
      .filter((person) => person.Type === 'Actor' && typeof person.Name === 'string')
      .map((person) => ({
        name: person.Name as string,
        ...textOf('role', person.Role),
      })),
    // Jellyfin serves several backdrops; the page shows one, so it takes the
    // first rather than making every screen choose.
    ...prefixed('backdrop', artworkOf(item.itemId, dto.BackdropImageTags?.[0])),
    ...prefixed('logo', artworkOf(item.itemId, dto.ImageTags?.Logo)),
    audioLanguages: languagesOf(streams, 'Audio'),
    subtitleLanguages: languagesOf(streams, 'Subtitle'),
    watched: dto.UserData?.Played === true,
    ...positiveNumberOf('resumePositionTicks', dto.UserData?.PlaybackPositionTicks),
  };
}

/**
 * Jellyfin's 100-nanosecond ticks as whole minutes. `undefined` when the Server
 * sent no runtime, which is different from a runtime of zero.
 */
function minutesOfTicks(ticks: unknown): number | undefined {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks <= 0) return undefined;
  return Math.round(ticks / 10_000_000 / 60);
}

/**
 * The languages of one kind of stream, each once and in the order the Server
 * listed them. A stream the Server gave no language is skipped: "und" is not a
 * language a User can be offered, and neither is nothing at all.
 */
function languagesOf(
  streams: readonly { Type?: string | null; Language?: string | null }[],
  type: 'Audio' | 'Subtitle',
): readonly string[] {
  const languages: string[] = [];
  for (const stream of streams) {
    if (stream.Type !== type) continue;
    const language = stream.Language;
    if (typeof language !== 'string' || language === '' || language === 'und') continue;
    if (languages.indexOf(language) === -1) languages.push(language);
  }
  return languages;
}

/**
 * The Title an item stands for: a Movie or a Series is itself, and a Season or
 * an Episode is its Series. This is where Episodes collapse into the Series
 * they belong to.
 */
export function titleOf(item: CatalogueItem): Title {
  switch (item.kind) {
    case 'Movie':
    case 'Series':
      return item;
    case 'Season':
    case 'Episode':
      return item.series;
  }
}

/**
 * One Jellyfin item as this app's vocabulary, or `undefined` when it is
 * something the app does not show.
 */
export function catalogueItemFrom(dto: BaseItemDto): CatalogueItem | undefined {
  const itemId = dto.Id;
  if (typeof itemId !== 'string' || itemId === '') return undefined;

  if (dto.Type === 'Movie' || dto.Type === 'Series') {
    return {
      kind: dto.Type,
      itemId,
      name: dto.Name ?? itemId,
      ...addedAtOf(dto),
      ...artworkOf(itemId, dto.ImageTags?.Primary),
    };
  }

  if (dto.Type === 'Season') {
    const series = seriesOf(dto);
    if (series === undefined) return undefined;
    return {
      kind: 'Season',
      itemId,
      name: dto.Name ?? itemId,
      series,
      ...addedAtOf(dto),
      // On a Season, `IndexNumber` is the Season's own number; on an Episode it
      // is the Episode's, and the Season's is `ParentIndexNumber`.
      ...numberOf('seasonNumber', dto.IndexNumber),
    };
  }

  if (dto.Type === 'Episode') {
    const series = seriesOf(dto);
    if (series === undefined) return undefined;
    return {
      kind: 'Episode',
      itemId,
      name: dto.Name ?? itemId,
      series,
      ...addedAtOf(dto),
      ...numberOf('seasonNumber', dto.ParentIndexNumber),
      ...numberOf('episodeNumber', dto.IndexNumber),
    };
  }

  return undefined;
}

/**
 * The Series an Episode or a Season belongs to, built from the fields Jellyfin
 * puts on the child itself. `undefined` when the Server did not say which Series
 * it is, which leaves nothing a Row could show it as.
 */
function seriesOf(dto: BaseItemDto): Title | undefined {
  const seriesId = dto.SeriesId;
  if (typeof seriesId !== 'string' || seriesId === '') return undefined;
  return {
    kind: 'Series',
    itemId: seriesId,
    name: dto.SeriesName ?? seriesId,
    ...artworkOf(seriesId, dto.SeriesPrimaryImageTag),
  };
}

/** A number field that only means something above zero, as a tick count does. */
function positiveNumberOf<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: number } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return {};
  return { [key]: value } as { [P in K]?: number };
}

function numberOf<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: number } {
  if (typeof value !== 'number' || !Number.isFinite(value)) return {};
  return { [key]: value } as { [P in K]?: number };
}

/** `DateCreated` as a timestamp, left out when the Server did not send one. */
function addedAtOf(dto: BaseItemDto): { addedAt?: number } {
  if (typeof dto.DateCreated !== 'string') return {};
  const addedAt = Date.parse(dto.DateCreated);
  return Number.isNaN(addedAt) ? {} : { addedAt };
}

function artworkOf(itemId: string, imageTag: unknown): { artwork?: Artwork } {
  if (typeof imageTag !== 'string' || imageTag === '') return {};
  return { artwork: { itemId, imageTag } };
}

/** A string field, left out when the Server sent nothing or an empty one. */
function textOf<K extends string>(key: K, value: unknown): { [P in K]?: string } {
  if (typeof value !== 'string' || value === '') return {};
  return { [key]: value } as { [P in K]?: string };
}

/**
 * `artworkOf`'s answer under another name, so one `Artwork` reader serves the
 * poster, the backdrop and the logo.
 */
function prefixed<K extends string>(key: K, found: { artwork?: Artwork }): { [P in K]?: Artwork } {
  if (found.artwork === undefined) return {};
  return { [key]: found.artwork } as { [P in K]?: Artwork };
}
