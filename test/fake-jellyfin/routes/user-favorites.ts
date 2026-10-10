import type { FakeJellyfinState } from '../data.ts';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `UserLibraryController`'s favourite routes: the writes behind My List.
 *
 * Jellyfin 12.x dropped `/Users/{userId}/FavoriteItems/{id}` for
 * `/UserFavoriteItems/{itemId}`, with the User taken from the token and an
 * optional `userId` query parameter overriding it. Both answer with the item's
 * `UserItemDataDto`, which is what lets a write tell the client what the Server
 * now holds.
 */
export const userFavoriteRoutes: readonly FakeRoute[] = [
  {
    method: 'POST',
    path: '/UserFavoriteItems/:itemId',
    handle: (request, state, params) => favouriteWrite(request, state, params, true),
  },
  {
    method: 'DELETE',
    path: '/UserFavoriteItems/:itemId',
    handle: (request, state, params) => favouriteWrite(request, state, params, false),
  },
];

function favouriteWrite(
  request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
  isFavorite: boolean,
): FakeResponse {
  const user = userForToken(request.headers.authorization ?? '', state.users);
  if (user === undefined) {
    return { status: 401, body: { error: 'No valid token.' } };
  }

  if (state.failFavouriteWritesWith !== null) {
    return {
      status: state.failFavouriteWritesWith,
      body: { error: 'The fake Jellyfin was told to fail favourite writes.' },
    };
  }

  const itemId = params.itemId ?? '';
  if (!state.items.some((item) => item.Id === itemId)) {
    return { status: 404, body: { error: `No item ${itemId}.` } };
  }

  // The real Server takes the User from the token, with `userId` as an override.
  const userId = request.query.get('userId') ?? user.Id;
  const held = state.favourites[userId] ?? [];
  const without = held.filter((candidate) => candidate !== itemId);
  state.favourites[userId] = isFavorite ? [...without, itemId] : without;

  return {
    status: 200,
    body: { Key: itemId, ItemId: itemId, IsFavorite: isFavorite, Played: false, PlayCount: 0 },
  };
}
