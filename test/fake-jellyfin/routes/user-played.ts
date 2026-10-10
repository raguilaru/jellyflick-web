import type { FakeJellyfinState } from '../data.ts';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `UserLibraryController`'s played routes: mark watched and unwatched (#17,
 * story 78).
 *
 * Jellyfin 12.x dropped `/Users/{userId}/PlayedItems/{id}` for
 * `/UserPlayedItems/{itemId}`, with the User taken from the token and an
 * optional `userId` query parameter overriding it — exactly as the favourite
 * routes beside them. Both answer with the item's `UserItemDataDto`, so a write
 * tells the client what the Server now holds.
 */
export const userPlayedRoutes: readonly FakeRoute[] = [
  {
    method: 'POST',
    path: '/UserPlayedItems/:itemId',
    handle: (request, state, params) => playedWrite(request, state, params, true),
  },
  {
    method: 'DELETE',
    path: '/UserPlayedItems/:itemId',
    handle: (request, state, params) => playedWrite(request, state, params, false),
  },
];

function playedWrite(
  request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
  played: boolean,
): FakeResponse {
  const user = userForToken(request.headers.authorization ?? '', state.users);
  if (user === undefined) {
    return { status: 401, body: { error: 'No valid token.' } };
  }

  if (state.failPlayedWritesWith !== null) {
    return {
      status: state.failPlayedWritesWith,
      body: { error: 'The fake Jellyfin was told to fail played writes.' },
    };
  }

  const itemId = params.itemId ?? '';
  if (!state.items.some((item) => item.Id === itemId)) {
    return { status: 404, body: { error: `No item ${itemId}.` } };
  }

  const userId = request.query.get('userId') ?? user.Id;
  const held = state.played[userId] ?? [];
  const without = held.filter((candidate) => candidate !== itemId);
  state.played[userId] = played ? [...without, itemId] : without;

  return {
    status: 200,
    body: {
      Key: itemId,
      ItemId: itemId,
      Played: played,
      PlayCount: played ? 1 : 0,
      IsFavorite: (state.favourites[userId] ?? []).includes(itemId),
    },
  };
}
