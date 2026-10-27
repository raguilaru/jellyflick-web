import { servedViewOf, type FakeItem, type FakeJellyfinState } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { asAskedFor, lastPlayedAtOf, userDataFor } from './items.ts';
import { userForToken } from './users.ts';

/**
 * `TvShowsController`, as far as Continue Watching needs it (#12).
 *
 * `GET /Shows/NextUp` is the Server's answer to "which Episode comes next in
 * each Series this User is watching", and the two properties a client leans on
 * are modelled here:
 *
 * - **one Episode per Series**, which is what makes "a Series appears once" the
 *   Server's own doing rather than a client's merge;
 * - **the Series they watched most recently first**, which is the only ordering
 *   a client has for a Series — the Episode it answers with has never been
 *   played and so carries no `LastPlayedDate` at all. That gap is why the Row
 *   also asks when each Series was last watched.
 *
 * A Series the User has never touched is not in the answer: there is no "next"
 * Episode of a show nobody has started. The real endpoint's
 * `enableResumable` defaults to true, so a part-watched Episode is the next one
 * up — it is simply the first unplayed Episode, and no special case here.
 */
export const showRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Shows/NextUp',
    handle: (request, state) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      const seriesId = request.query.get('seriesId');
      const nextUp = seriesWatchedBy(state, user.Id)
        .filter((id) => seriesId === null || id === seriesId)
        .map((id) => ({ seriesId: id, episode: nextEpisodeOf(state, user.Id, id) }))
        .filter(
          (next): next is { seriesId: string; episode: FakeItem } => next.episode !== undefined,
        )
        .sort(
          (left, right) =>
            lastWatchedAtOf(state, user.Id, right.seriesId) -
            lastWatchedAtOf(state, user.Id, left.seriesId),
        )
        .slice(0, limitOf(request.query.get('limit')))
        .map((next) => {
          const dto: Record<string, unknown> = { ...servedViewOf(next.episode) };
          if (request.query.get('enableUserData') === 'false') {
            delete dto.UserData;
            return dto;
          }
          dto.UserData = userDataFor(next.episode, state, user.Id);
          return dto;
        });

      return {
        status: 200,
        body: { Items: nextUp, TotalRecordCount: nextUp.length, StartIndex: 0 },
      };
    },
  },

  /**
   * `GET /Shows/{seriesId}/Seasons` — the Seasons of one Series, which is what
   * the title page's picker is built from (#18).
   *
   * **Aired order**, which is the Season number: it is the order the real
   * endpoint answers in, and a client that re-sorted the answer would be
   * working around a property it already has. A Series whose Seasons the Server
   * does not hold as items of their own answers with nothing, which is a real
   * answer rather than a failure — Jellyfin serves Episodes whose Season is not
   * an item, and the client's fallback is the number on the Episodes.
   */
  {
    method: 'GET',
    path: '/Shows/:seriesId/Seasons',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      const seriesId = params.seriesId ?? '';
      if (!state.items.some((item) => item.Id === seriesId && item.Type === 'Series')) {
        return { status: 404, body: { error: `No Series ${seriesId}.` } };
      }

      const seasons = state.items
        .filter((item) => item.Type === 'Season' && item.SeriesId === seriesId)
        .sort((left, right) => numberOf(left.IndexNumber) - numberOf(right.IndexNumber))
        .map((item) => asAskedFor(item, request, state, user.Id));

      return {
        status: 200,
        body: { Items: seasons, TotalRecordCount: seasons.length, StartIndex: 0 },
      };
    },
  },

  /**
   * `GET /Shows/{seriesId}/Episodes` — every Episode of one Series, across its
   * Seasons, in **aired order** (#18).
   *
   * That order is the point of the endpoint, and it is the Server's own answer:
   * the Season number then the Episode number, with an Episode the Server has
   * not numbered last, because there is nowhere else to put it. A client that
   * sorted this itself would be re-deriving something it was told.
   *
   * It goes through `asAskedFor` like `/Items` does, so a query that forgot to
   * ask for `Overview` sees none here either.
   */
  {
    method: 'GET',
    path: '/Shows/:seriesId/Episodes',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      const seriesId = params.seriesId ?? '';
      if (!state.items.some((item) => item.Id === seriesId && item.Type === 'Series')) {
        return { status: 404, body: { error: `No Series ${seriesId}.` } };
      }

      // The real endpoint narrows to one Season when asked. Nothing in this app
      // does — the title page reads the whole Series at once and switches
      // Season without asking again — so an unimplemented parameter is refused
      // rather than quietly ignored.
      const seasonId = request.query.get('seasonId') ?? request.query.get('season');
      if (seasonId !== null) {
        return {
          status: 400,
          body: {
            error:
              'The fake Jellyfin only implements the whole Series. Implement seasonId/season in test/fake-jellyfin/routes/shows.ts if a ticket needs one Season at a time.',
          },
        };
      }

      const episodes = state.items
        .filter((item) => item.Type === 'Episode' && item.SeriesId === seriesId)
        .sort((left, right) => orderOf(left) - orderOf(right))
        .map((item) => asAskedFor(item, request, state, user.Id));

      return {
        status: 200,
        body: { Items: episodes, TotalRecordCount: episodes.length, StartIndex: 0 },
      };
    },
  },
];

/** A Season's number, with an unnumbered one sorted last. */
function numberOf(value: number | undefined): number {
  return value ?? Number.MAX_SAFE_INTEGER;
}

/** Every Series this User has played or started an Episode of, once each. */
function seriesWatchedBy(state: FakeJellyfinState, userId: string): string[] {
  const touched = [
    ...(state.played[userId] ?? []),
    ...Object.keys(state.playbackPositions[userId] ?? {}).filter(
      (itemId) => (state.playbackPositions[userId]?.[itemId] ?? 0) > 0,
    ),
  ];

  const series: string[] = [];
  for (const itemId of touched) {
    const item = state.items.find((candidate) => candidate.Id === itemId);
    const id = item?.SeriesId;
    if (typeof id !== 'string' || id === '') continue;
    if (!series.includes(id)) series.push(id);
  }
  return series;
}

/**
 * The first Episode of a Series this User has not finished, in Season and
 * Episode order. An Episode the Server has not numbered sorts last, as it does
 * everywhere: there is nowhere else to put it.
 */
function nextEpisodeOf(
  state: FakeJellyfinState,
  userId: string,
  seriesId: string,
): FakeItem | undefined {
  const played = state.played[userId] ?? [];
  return state.items
    .filter((item) => item.Type === 'Episode' && item.SeriesId === seriesId)
    .sort((left, right) => orderOf(left) - orderOf(right))
    .find((item) => !played.includes(item.Id));
}

function orderOf(episode: FakeItem): number {
  const season = episode.ParentIndexNumber ?? Number.MAX_SAFE_INTEGER;
  const number = episode.IndexNumber ?? Number.MAX_SAFE_INTEGER;
  return season * 10_000 + number;
}

/** When this User last watched anything of a Series. */
function lastWatchedAtOf(state: FakeJellyfinState, userId: string, seriesId: string): number {
  return state.items
    .filter((item) => item.SeriesId === seriesId)
    .reduce((latest, item) => Math.max(latest, lastPlayedAtOf(state, userId, item.Id)), 0);
}

function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
