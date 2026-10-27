import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { catalogueItemFrom, titleOf, type Title } from '../catalogue/catalogue';
import type { JellyfinGateway, TitleKind } from '../jellyfin/gateway';
import { cardForTitle, type RowCard } from './row';
import { NO_SHARED_READS, type SharedReads } from './shared-reads';

/**
 * The suggestion Rows (#15, stories 43 to 46): Watch Again, Because You
 * Watched, a genre Row and a Collection Row.
 *
 * They share one module because they share one shape — ask the Server a
 * question, turn the answer into cards — and differ only in the question. Each
 * is a pure function of the gateway, so the components in `home-rows.tsx` hold
 * no rules of their own, as `new-on-jellyflick.ts` and `continue-watching.ts`
 * do for theirs.
 *
 * Each Row carries its own heading where the Server is what names it: the
 * genre, the Collection, or the Title a suggestion came from. A Row whose name
 * is the app's own leaves it out and `ROW_NAME_KEYS` says it instead.
 */

/** How many Titles one of these Rows shows. A strip, not a library. */
export const SUGGESTION_ROW_LIMIT = 20;

/**
 * What one of these Rows came to. "The Server would not answer" is an outcome
 * rather than a thrown error, because Home shows the rest of itself either way;
 * an empty Row is a different thing again, and draws nothing at all.
 */
export type SuggestionRowResult =
  | {
      outcome: 'row';
      titles: readonly RowCard[];
      /** What heads the Row when the Server is what names it. */
      heading?: string;
    }
  | { outcome: 'unavailable' };

/**
 * Watch Again: the Titles this User has finished, most recently finished first
 * (story 46).
 *
 * The Server does the whole of the selecting — `isPlayed=true` over Movies and
 * Series, in `DatePlayed` order — so there is nothing to merge here. A finished
 * Episode is not among them: what a User rewatches is its Series.
 */
export function loadWatchAgain(
  gateway: JellyfinGateway,
  limit: number = SUGGESTION_ROW_LIMIT,
): Promise<SuggestionRowResult> {
  return gateway
    .getPlayedTitles({ limit })
    .then((items) => rowOf(gateway, items))
    .catch(unavailable);
}

export type GenreRowOptions = {
  limit?: number;
  /**
   * One kind only, for a genre Row in the Movies or Series section (#23).
   * The same Row on Home holds both kinds, which is what makes this the
   * section's question rather than the Row's.
   */
  kind?: TitleKind;
};

/** The Titles in one genre, by the genre's name (story 44). */
export function loadGenreRow(
  gateway: JellyfinGateway,
  genre: string,
  options: GenreRowOptions = {},
): Promise<SuggestionRowResult> {
  return gateway
    .getTitles({
      genre,
      limit: options.limit ?? SUGGESTION_ROW_LIMIT,
      ...(options.kind === undefined ? {} : { kind: options.kind }),
    })
    // The genre's own name heads the Row, as it does on the Search screen.
    .then((items) => rowOf(gateway, items, genre))
    .catch(unavailable);
}

/**
 * One Collection's Titles, by the Collection's item id (story 45).
 *
 * The Collection is read as well as its members, because the Row is headed by
 * the Collection's **own** name: the layout stores an id, which is what
 * survives the Collection being renamed, so the name has to come from the
 * Server every time rather than from what the User chose months ago.
 *
 * A Collection that is no longer there is an empty Row rather than a failure —
 * a User whose franchise was deleted on the Server has a Row with nothing in
 * it, which draws nothing, and not a problem to report.
 */
export function loadCollectionRow(
  gateway: JellyfinGateway,
  collectionId: string,
  limit: number = SUGGESTION_ROW_LIMIT,
): Promise<SuggestionRowResult> {
  return Promise.all([
    gateway.getCollections(),
    gateway.getCollectionTitles({ collectionId, limit }),
  ])
    .then(([collections, items]) => {
      const named = collections.find((collection) => collection.Id === collectionId);
      const heading = typeof named?.Name === 'string' ? named.Name : undefined;
      return rowOf(gateway, items, heading);
    })
    .catch(unavailable);
}

/**
 * Because You Watched: Titles related to one the User recently watched (story
 * 43).
 *
 * Which endpoint answers depends on what they watched, and that is the whole
 * ticket: Jellyfin has `/Movies/Recommendations` for films, which is its own
 * "because you watched" and comes back already grouped by the Title it came
 * from, and nothing of the kind for a Series — so a Series is asked
 * `/Items/{id}/Similar` instead. The Row is named after the Title either way,
 * because "Because You Watched" with nothing after it tells a User nothing.
 *
 * The most recently finished Title is the one suggested from, and the Titles
 * before it are the fallback: a Title the Server has nothing to say about would
 * otherwise leave the Row empty while the one before it had plenty. Each
 * attempt is a round trip, so only a few are made — a household with nothing
 * suggestable in its last few finished Titles has an empty Row, which is a
 * cheaper answer than reading its whole history to avoid one.
 *
 * A User who has finished nothing gets an empty Row rather than a notice:
 * there is nothing wrong, there is simply nothing to go on yet.
 */
export function loadBecauseYouWatched(
  gateway: JellyfinGateway,
  limit: number = SUGGESTION_ROW_LIMIT,
  /**
   * Whether the answer is still wanted, asked before each follow-up request.
   *
   * This is the one loader that asks the Server **twice in sequence**, so it is
   * the one that can still be talking to a Server after the Row it was for has
   * gone — a User who leaves Home while the first answer is in flight would
   * otherwise have a second question asked on their behalf for a screen nobody
   * is looking at. The same property is what made the test suite flaky: a
   * second request issued after a spec had finished landed in the next one.
   */
  stillWanted: () => boolean = () => true,
  /**
   * The screen's shared reads (#41). The Because You Watched Billboard Source
   * calls this very function, so with one of these in hand the Billboard and
   * the Row make this Row's two-step question once between them.
   *
   * `stillWanted` is handed to `once` rather than used here, so the shared
   * read goes on while **either** of them still wants it: a Row that has gone
   * must not keep asking, and a Billboard that joined must not be cut off
   * because the Row left.
   */
  reads: SharedReads = NO_SHARED_READS,
): Promise<SuggestionRowResult> {
  return reads.once<SuggestionRowResult>(
    `because-you-watched|${String(limit)}`,
    (wanted) => readBecauseYouWatched(gateway, limit, wanted),
    stillWanted,
  );
}

function readBecauseYouWatched(
  gateway: JellyfinGateway,
  limit: number,
  stillWanted: () => boolean,
): Promise<SuggestionRowResult> {
  return gateway
    .getPlayedTitles({ limit: RECENTLY_WATCHED_READ })
    .then((played) => {
      if (!stillWanted()) return { outcome: 'row' as const, titles: [] };

      const watched = played
        .map((dto) => catalogueItemFrom(dto))
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        .map((item) => titleOf(item))
        .slice(0, SUGGESTION_ATTEMPTS);

      return suggestFrom(gateway, watched, limit, stillWanted);
    })
    .catch(unavailable);
}

/**
 * How many finished Titles are read, and how many of them are actually asked
 * about. The read is one query either way; each attempt is a round trip of its
 * own, which is why far fewer are tried than are read.
 */
const RECENTLY_WATCHED_READ = 10;
const SUGGESTION_ATTEMPTS = 3;

/**
 * The first of these Titles the Server has suggestions for, as a Row. Tried in
 * order, one at a time rather than all at once: the usual case is that the
 * first one answers, and asking about three Titles to use one would be two
 * round trips a household never needed.
 */
function suggestFrom(
  gateway: JellyfinGateway,
  watched: readonly Title[],
  limit: number,
  stillWanted: () => boolean,
): Promise<SuggestionRowResult> {
  const [next, ...rest] = watched;
  if (next === undefined || !stillWanted()) {
    return Promise.resolve({ outcome: 'row', titles: [] });
  }

  return suggestionsFrom(gateway, next, limit).then((suggestion) => {
    // The Title that was watched never stands among its own suggestions:
    // `/Movies/Recommendations` can include it, and a Row offering a User the
    // very thing they just finished is not a suggestion.
    const items = suggestion.items.filter((dto) => dto.Id !== next.itemId);
    if (items.length === 0) return suggestFrom(gateway, rest, limit, stillWanted);
    return rowOf(gateway, items, suggestion.from);
  });
}

/** Some suggestions, and the Title the Server says they came from. */
type Suggestion = {
  readonly items: readonly BaseItemDto[];
  readonly from: string;
};

/**
 * The Server's suggestions from one Title, by what kind of Title it is. A
 * Movie's come from Jellyfin's own recommendations; a Series' from what is
 * similar to it.
 */
function suggestionsFrom(
  gateway: JellyfinGateway,
  watched: Title,
  limit: number,
): Promise<Suggestion> {
  if (watched.kind === 'Series') {
    return gateway
      .getSimilarTitles({ itemId: watched.itemId, limit })
      .then((items) => ({ items, from: watched.name }));
  }

  return gateway.getMovieRecommendations({ itemLimit: limit }).then((categories) => {
    // A category about this Movie if the Server offered one, and otherwise the
    // first it did offer — which is still "because you watched", but of
    // something else, so the Row takes **that** category's name. The heading
    // has to say what the suggestions really came from or it is a lie about
    // why they are there.
    const chosen =
      categories.find((category) => category.BaselineItemName === watched.name) ??
      categories[0];
    if (chosen === undefined) return { items: [], from: watched.name };

    const from =
      typeof chosen.BaselineItemName === 'string' && chosen.BaselineItemName !== ''
        ? chosen.BaselineItemName
        : watched.name;
    return { items: chosen.Items ?? [], from };
  });
}

/** The Titles the Server answered with, as cards. */
function rowOf(
  gateway: JellyfinGateway,
  items: readonly BaseItemDto[],
  heading?: string,
): SuggestionRowResult {
  return {
    outcome: 'row',
    titles: items
      .map((dto) => catalogueItemFrom(dto))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map((item) => titleOf(item))
      .map((title) => cardForTitle(gateway, title)),
    ...(heading === undefined ? {} : { heading }),
  };
}

function unavailable(): SuggestionRowResult {
  return { outcome: 'unavailable' };
}

/**
 * One thing a User can make a Row of: what is stored, and what it is called.
 *
 * The two are the same for a genre — `/Items?genres=` matches on the name, so
 * the name *is* the choice — and deliberately different for a Collection,
 * whose id is what survives it being renamed on the Server.
 */
export type RowChoice = {
  /** What a Row's `parameter` becomes. */
  readonly value: string;
  readonly name: string;
};

export type RowChoicesResult =
  | { outcome: 'choices'; choices: readonly RowChoice[] }
  | { outcome: 'unavailable' };

/** The genres there are to make a Row of, by name, in the Server's order. */
export function loadGenreChoices(gateway: JellyfinGateway): Promise<RowChoicesResult> {
  return gateway
    .getTitleGenres()
    .then((genres) => ({ outcome: 'choices' as const, choices: choicesFrom(genres, named) }))
    .catch(unavailableChoices);
}

/** The Collections there are to make a Row of: the id is stored, the name shown. */
export function loadCollectionChoices(gateway: JellyfinGateway): Promise<RowChoicesResult> {
  return gateway
    .getCollections()
    .then((collections) => ({
      outcome: 'choices' as const,
      choices: choicesFrom(collections, identified),
    }))
    .catch(unavailableChoices);
}

/** A genre is chosen by its name, which is what the Server matches on. */
function named(item: BaseItemDto): RowChoice | undefined {
  const name = item.Name;
  if (typeof name !== 'string' || name === '') return undefined;
  return { value: name, name };
}

/** A Collection is chosen by its id, so that renaming it on the Server shows. */
function identified(item: BaseItemDto): RowChoice | undefined {
  const name = item.Name;
  const id = item.Id;
  if (typeof name !== 'string' || name === '') return undefined;
  if (typeof id !== 'string' || id === '') return undefined;
  return { value: id, name };
}

function choicesFrom(
  items: readonly BaseItemDto[],
  choiceOf: (item: BaseItemDto) => RowChoice | undefined,
): readonly RowChoice[] {
  return items
    .map((item) => choiceOf(item))
    .filter((choice): choice is RowChoice => choice !== undefined);
}

function unavailableChoices(): RowChoicesResult {
  return { outcome: 'unavailable' };
}
