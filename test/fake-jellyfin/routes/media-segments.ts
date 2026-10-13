import type { FakeMediaSegment } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `MediaSegmentsController`: `GET /MediaSegments/{itemId}`, the intro and
 * credits markers a player offers to skip (#31).
 *
 * Two of the real endpoint's habits are reproduced because #31's whole
 * behaviour hangs off them (`jellyfin-playback.md` §12):
 *
 * - **`includeSegmentTypes` really narrows.** It is a CSV of
 *   `MediaSegmentType`, and the parameter exists so a client can ask for the
 *   two types it draws a button for rather than everything a detection plugin
 *   found. A fake that ignored it would let a client that asked for nothing
 *   pass, and that client would then draw a Skip button for a `Commercial` on
 *   a real Server.
 * - **An item with no markers answers 404**, not an empty result. §12 says a
 *   Server with no segment provider installed may do either and leaves which
 *   open; this fake picks the harder of the two on purpose, because a client
 *   that treats a 404 as a failure rather than as "nothing to skip" would show
 *   a User an error for the ordinary case. The empty-result half is
 *   `TotalRecordCount: 0` for an item the Server *does* hold a provider for,
 *   which is what a seeded empty array gives.
 *
 * Note that `MediaSegmentType` has **no `Credits`** value: the credits marker
 * is `Outro` (`decisions.md` §5), and a test asking for `Credits` gets nothing
 * because that is what a real Server would do with it.
 */
export const mediaSegmentRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/MediaSegments/:itemId',
    handle: (request, state, params) => {
      // The real endpoint is authorized like every other item read.
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      const itemId = params.itemId ?? '';
      const held = state.mediaSegments[itemId];
      if (held === undefined) {
        return {
          status: 404,
          body: { error: `No media segments for ${itemId}.` },
        };
      }

      const wanted = typesWanted(request.query.get('includeSegmentTypes'));
      const items = held
        .filter((segment) => wanted === undefined || wanted.includes(segment.Type))
        .map((segment, index) => dtoFor(itemId, segment, index));

      return {
        status: 200,
        body: { Items: items, TotalRecordCount: items.length, StartIndex: 0 },
      };
    },
  },
];

/** The types a client asked for, or `undefined` for "everything held". */
function typesWanted(value: string | null): string[] | undefined {
  if (value === null || value === '') return undefined;
  return value.split(',').map((type) => type.trim());
}

/**
 * One segment as the wire carries it. The ids are derived from the item and the
 * segment's place in what the Server holds, so they are stable across a run
 * and a test can name one.
 */
function dtoFor(
  itemId: string,
  segment: FakeMediaSegment,
  index: number,
): Record<string, unknown> {
  return {
    Id: `segment-${itemId}-${String(index)}`,
    ItemId: itemId,
    Type: segment.Type,
    StartTicks: segment.StartTicks,
    EndTicks: segment.EndTicks,
  };
}
