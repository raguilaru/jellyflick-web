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
