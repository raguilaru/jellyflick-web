import { servedViewOf, type FakeItem, type FakeJellyfinState } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { lastPlayedAtOf, userDataFor } from './items.ts';
import { userForToken } from './users.ts';

/**
 * `UserLibraryController`'s resume list and the general user-data write — the
 * two halves of Continue Watching the Server keeps (#12).
 *
 * `GET /UserItems/Resume` is what one User has started and not finished, most
 * recently played first. 12.x dropped `/Users/{userId}/Items/Resume` for it,
 * and it answers with a `BaseItemDtoQueryResult` rather than a bare array.
 *
 * `POST /UserItems/{itemId}/UserData` is the one write that can *move* a resume
 * point, and the important thing about it is what it leaves alone: the real
 * controller takes an `UpdateUserItemDataDto` whose fields are all nullable and
 * changes only the ones that are there. Clearing a position must not touch
 * `Played` or `PlayCount` (story 37), so this fake refuses a body that is not
 * an object and ignores nothing it was sent.
 */
export const userItemRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/UserItems/Resume',
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

      const includeItemTypes = csvOf(request.query.get('includeItemTypes'));
      const positions = state.playbackPositions[user.Id] ?? {};
      const played = state.played[user.Id] ?? [];

      const resumable = state.items
        // Something started and not finished: the real Server's own rule, and
        // the reason clearing a position takes a Title off this list.
        .filter((item) => (positions[item.Id] ?? 0) > 0 && !played.includes(item.Id))
        .filter(
          (item) => includeItemTypes.length === 0 || includeItemTypes.includes(item.Type),
        )
        .sort(
          (left, right) =>
            lastPlayedAtOf(state, user.Id, right.Id) - lastPlayedAtOf(state, user.Id, left.Id),
        )
        .slice(0, limitOf(request.query.get('limit')))
        .map((item) => asServed(item, state, user.Id, request.query.get('enableUserData')));

      return {
        status: 200,
        body: { Items: resumable, TotalRecordCount: resumable.length, StartIndex: 0 },
      };
    },
  },

  {
    method: 'POST',
    path: '/UserItems/:itemId/UserData',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failUserItemDataWritesWith !== null) {
        return {
          status: state.failUserItemDataWritesWith,
          body: { error: 'The fake Jellyfin was told to fail user-data writes.' },
        };
      }

      const itemId = params.itemId ?? '';
      const item = state.items.find((candidate) => candidate.Id === itemId);
      if (item === undefined) {
        return { status: 404, body: { error: `No item ${itemId}.` } };
      }

      const body = request.body;
      if (body === null || typeof body !== 'object') {
        return {
          status: 400,
          body: { error: 'A user-data write needs an UpdateUserItemDataDto body.' },
        };
      }

      const userId = request.query.get('userId') ?? user.Id;
      const update = body as Record<string, unknown>;

      // Only what was sent. Everything else — `Played`, the play count, the
      // favourite flag, when it was last played — is left exactly as it was,
      // which is the whole point of this endpoint.
      if (typeof update.PlaybackPositionTicks === 'number') {
        const forUser = state.playbackPositions[userId] ?? {};
        forUser[itemId] = update.PlaybackPositionTicks;
        state.playbackPositions[userId] = forUser;
      }
      if (typeof update.Played === 'boolean') {
        const held = state.played[userId] ?? [];
        const without = held.filter((candidate) => candidate !== itemId);
        state.played[userId] = update.Played ? [...without, itemId] : without;
      }

      return { status: 200, body: userDataFor(item, state, userId) };
    },
  },
];

/** An item as a query asked for it: `enableUserData=false` is the only option. */
function asServed(
  item: FakeItem,
  state: FakeJellyfinState,
  userId: string,
  enableUserData: string | null,
): Record<string, unknown> {
  const dto: Record<string, unknown> = { ...servedViewOf(item) };
  if (enableUserData === 'false') {
    delete dto.UserData;
    return dto;
  }
  dto.UserData = userDataFor(item, state, userId);
  return dto;
}

function csvOf(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
