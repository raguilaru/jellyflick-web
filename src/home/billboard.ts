import { titleDetailsFrom, type TitleDetails } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { spotlightPick } from './spotlight';

/**
 * The Billboard: the one Title featured at the top of Home (#16, stories 22 to
 * 33).
 *
 * **What picks that Title is the Billboard Source**, and this module is the
 * seam the Sources sit behind. Spotlight is the default and the only one built
 * today (story 29); Resume, Newest Addition and Because You Watched are #22,
 * and each arrives as one entry in `BILLBOARD_SOURCES` plus a loader of its
 * own — nothing that *draws* the Billboard has to change for them, because
 * every Source answers with the same `BillboardResult`.
 *
 * A Source is handed the draw rather than the device layer: randomness belongs
 * to the device layer and is read **once**, at the edge, so a Source stays a
 * pure question about the library plus a number. That is what makes a pick
 * reproducible in a test.
 */

/**
 * Which rule picks the featured Title. A User's choice of Source is stored in
 * Client Settings by #22; until then every Billboard is Spotlight's.
 *
 * It is a union rather than a `string` so a Source without a loader cannot be
 * named, and the union grows with `BILLBOARD_SOURCES` below.
 */
export type BillboardSourceId = 'spotlight';

/** Spotlight, which is what a User gets before they have chosen (story 29). */
export const DEFAULT_BILLBOARD_SOURCE: BillboardSourceId = 'spotlight';

/**
 * What the Billboard came to.
 *
 * Three answers, and the last two are not the same thing: a Server that would
 * not say what it holds is a problem worth showing, and a library with nothing
 * that can be drawn as a Billboard is an ordinary state — Home simply carries
 * on to the Rows.
 */
export type BillboardResult =
  | { outcome: 'feature'; feature: TitleDetails }
  | { outcome: 'empty' }
  | { outcome: 'unavailable' };

export type LoadBillboardOptions = {
  /**
   * One number in [0, 1), from `device.random()`. Read at the edge and passed
   * in, so this module and every Source stay reproducible.
   */
  draw: number;
  /** Which Source picks the Title. Spotlight unless something says otherwise. */
  source?: BillboardSourceId;
};

/**
 * One Source: the whole question of which Title to feature, given the Server
 * and one draw. #22 adds its three beside Spotlight's.
 */
type BillboardSourceLoader = (
  gateway: JellyfinGateway,
  draw: number,
) => Promise<BillboardResult>;

export async function loadBillboard(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  const source = options.source ?? DEFAULT_BILLBOARD_SOURCE;
  // A Source the union allows always has a loader, so this cannot be undefined;
  // the fallback is for a stored Source read back from a newer Jellyflick.
  const load = BILLBOARD_SOURCES[source] ?? BILLBOARD_SOURCES[DEFAULT_BILLBOARD_SOURCE];
  return load(gateway, options.draw);
}

/**
 * The trailer the Billboard can play over the backdrop, or nothing at all.
 *
 * "Nothing" covers both a Title with no trailer beside it and a Server that
 * would not say, deliberately: either way the Billboard shows its backdrop
 * (story 25), and a message about a trailer nobody asked for would be noise
 * over the one thing Home is meant to be.
 */
export type BillboardTrailer =
  /** The trailer's own item id, which is what playback is negotiated for. */
  | { outcome: 'trailer'; itemId: string }
  | { outcome: 'none' };

/**
 * The Title's local trailer file (story 24), through
 * `Items/{id}/LocalTrailers`.
 *
 * **Local only.** Jellyfin's `RemoteTrailers` are YouTube links, and the
 * Billboard never loads one — story 75's Watch trailer button on the title
 * page is where a remote trailer belongs, behind a press, so that a heavy
 * embed is something a User asked for.
 *
 * The first of them when there are several: the Server lists them in its own
 * order, the Billboard shows one, and there is nothing here to choose on.
 */
export async function loadBillboardTrailer(
  gateway: JellyfinGateway,
  itemId: string,
): Promise<BillboardTrailer> {
  let trailers;
  try {
    trailers = await gateway.getLocalTrailers(itemId);
  } catch {
    return { outcome: 'none' };
  }

  for (const trailer of trailers) {
    // The trailer is not a Title, so `src/catalogue/` has nothing to say about
    // it: an id is all that is played.
    if (typeof trailer.Id === 'string' && trailer.Id !== '') {
      return { outcome: 'trailer', itemId: trailer.Id };
    }
  }
  return { outcome: 'none' };
}

/**
 * Spotlight (stories 30, 32 and 33): the Titles this User can see, weighed up
 * by `spotlight.ts` and one of them drawn.
 *
 * The whole catalogue is read and the rules applied here rather than asked of
 * the Server, because the fallback is a *second* pool — "any Title with a
 * backdrop" once nothing unfinished has one — and two queries to find that out
 * would be two round trips for an answer one already holds.
 */
async function loadSpotlightBillboard(
  gateway: JellyfinGateway,
  draw: number,
): Promise<BillboardResult> {
  let items;
  try {
    items = await gateway.getBillboardCandidates();
  } catch {
    return { outcome: 'unavailable' };
  }

  // `titleDetailsFrom` is `src/catalogue/`'s, so this module never reads a
  // `BaseItemDto` itself. It drops anything that is not a Title, which is
  // already nothing the query asked for.
  const candidates = items
    .map(titleDetailsFrom)
    .filter((details): details is TitleDetails => details !== undefined);

  const feature = spotlightPick(candidates, draw);
  return feature === undefined ? { outcome: 'empty' } : { outcome: 'feature', feature };
}

/**
 * Every Billboard Source there is. **This is the seam #22 extends**: a Source
 * is an entry here and a loader beside `loadSpotlightBillboard`, and the
 * Billboard itself goes on knowing only `BillboardResult`.
 */
const BILLBOARD_SOURCES: Readonly<Record<BillboardSourceId, BillboardSourceLoader>> = {
  spotlight: loadSpotlightBillboard,
};
