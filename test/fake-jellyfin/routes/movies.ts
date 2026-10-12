import type { FakeItem, FakeJellyfinState } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { asAskedFor, lastPlayedAtOf } from './items.ts';
import { userForToken } from './users.ts';

/**
 * `MoviesController`, which is one endpoint: `GET /Movies/Recommendations`,
 * what backs the Because You Watched Row for a Movie (#15, story 43).
 *
 * Two of its habits are what a client has to cope with, and both are modelled:
 *
 * - it answers a **bare array** of `RecommendationDto`, not a
 *   `BaseItemDtoQueryResult` — a different shape from every other Row's
 *   endpoint;
 * - a category says which Title it is **about**, in `BaselineItemName`, and
 *   that is the only thing naming the Row after the Title can be built on.
 *
 * The real Server works its categories out from what has been played lately.
 * This fake serves one category per played Movie that `state.movieRecommendations`
 * has an entry for, most recently played first, so which Title the Row is
 * about follows the household's viewing history as it does on a real Server.
 * `categoryLimit` and `itemLimit` are honoured, because a client that sends
 * them and gets everything anyway would not find out it had asked wrongly.
 */
export const movieRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Movies/Recommendations',
    handle: (request, state) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      // A recommendation is a thing the Server says about the library, so it
      // goes quiet with the rest of them.
      if (state.failRelatedQueriesWith !== null) {
        return {
          status: state.failRelatedQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail related queries.' },
        };
      }

      const played = state.played[user.Id] ?? [];
      const itemLimit = limitOf(request.query.get('itemLimit'));
      const categoryLimit = limitOf(request.query.get('categoryLimit'));

      const categories = played
        .filter((itemId) => itemOf(state, itemId)?.Type === 'Movie')
        .filter((itemId) => (state.movieRecommendations[itemId] ?? []).length > 0)
        .sort(
          (left, right) =>
            lastPlayedAtOf(state, user.Id, right) - lastPlayedAtOf(state, user.Id, left),
        )
        .slice(0, categoryLimit)
        .map((baselineId) => ({
          // The real Server's category id is a GUID of its own; what a client
          // reads is the name beside it.
          CategoryId: `category-${baselineId}`,
          RecommendationType: 'SimilarToRecentlyPlayed',
          BaselineItemName: itemOf(state, baselineId)?.Name,
          Items: (state.movieRecommendations[baselineId] ?? [])
            .map((itemId) => itemOf(state, itemId))
            .filter((item): item is FakeItem => item !== undefined)
            .slice(0, itemLimit)
            .map((item) => asAskedFor(item, request, state, user.Id)),
        }));

      // A bare array, deliberately: this endpoint is the odd one out.
      return { status: 200, body: categories };
    },
  },
];

function itemOf(state: FakeJellyfinState, itemId: string): FakeItem | undefined {
  return state.items.find((candidate) => candidate.Id === itemId);
}

function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
