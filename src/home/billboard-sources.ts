import { titleDetailsFrom, type TitleDetails } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import {
  continueWatchingRow,
  loadContinueWatching,
  type HiddenSeries,
} from './continue-watching';
import { loadNewOnJellyflick } from './new-on-jellyflick';
import { canBeABillboard, spotlightPick } from './spotlight';
import { loadBecauseYouWatched } from './suggestion-rows';

/**
 * What the Billboard reads from the Server (#16, stories 22 to 33): the Title
 * it features, and the trailer it can play over the backdrop. `billboard.tsx`
 * is what a User sees.
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
 * Client Settings (`jf.billboardSource`), and Spotlight is what they get before
 * they have chosen (story 29).
 *
 * It is a union rather than a `string` so a Source without a loader cannot be
 * named, and the union grows with `BILLBOARD_SOURCES` below. A *stored* Source
 * is a plain string for the reason every stored name here is — a Source a newer
 * Jellyflick offers has to survive being read by this one — and `loadBillboard`
 * is where that falls back.
 */
export type BillboardSourceId =
  | 'spotlight'
  | 'resume'
  | 'newest-addition'
  | 'because-you-watched';

/**
 * Every Source there is, in the order the settings screen offers them:
 * Spotlight first because it is the default.
 */
export const BILLBOARD_SOURCE_IDS: readonly BillboardSourceId[] = [
  'spotlight',
  'resume',
  'newest-addition',
  'because-you-watched',
];

/**
 * One stored Source as a Source this version knows, or Spotlight.
 *
 * A Source is stored as a plain string, so what comes back may be a Source a
 * newer Jellyflick offers and this one has never heard of. Falling back when it
 * is *read* rather than rewriting it is the treatment `accentColourFor` gives a
 * preset and `HomeRow.parameter` gets in a layout: the User's real choice is
 * left on the Server for the version that understands it.
 */
export function billboardSourceFor(stored: string | undefined): BillboardSourceId {
  const known = BILLBOARD_SOURCE_IDS.indexOf(stored as BillboardSourceId) !== -1;
  return known ? (stored as BillboardSourceId) : DEFAULT_BILLBOARD_SOURCE;
}

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
  /**
   * The Series the User has taken out of Continue Watching (#12, story 38).
   *
   * The Resume Source shows what that Row shows, and a Series the User put
   * away is exactly what the Row does **not** show — featuring it on the
   * Billboard, twice the size of the card they dismissed, would be the one
   * place their choice was ignored.
   */
  hidden?: readonly HiddenSeries[];
};

/**
 * One Source: the whole question of which Title to feature, given the Server
 * and one draw. #22 adds its three beside Spotlight's.
 */
type BillboardSourceLoader = (
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
) => Promise<BillboardResult>;

export async function loadBillboard(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  const source = options.source ?? DEFAULT_BILLBOARD_SOURCE;
  // A Source the union allows always has a loader, so this cannot be undefined;
  // the fallback is for a stored Source read back from a newer Jellyflick.
  const load = BILLBOARD_SOURCES[source] ?? BILLBOARD_SOURCES[DEFAULT_BILLBOARD_SOURCE];
  return load(gateway, options);
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
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  const candidates = await billboardCandidates(gateway);
  if (candidates === undefined) return { outcome: 'unavailable' };
  return spotlightOf(candidates, options.draw);
}

/**
 * Every Title the Billboard could draw, with the fields it draws them with, or
 * `undefined` for a Server that would not say what it holds.
 *
 * One read serves two purposes for the Sources below, which is why it is shared
 * rather than each Source's own: it is both where a Source's chosen Title gets
 * the backdrop, logo and overview that **no Row asks the Server for**, and the
 * pool Spotlight falls back over. A Source that read its Row and then read one
 * item would be two round trips and still have no fallback in hand.
 */
async function billboardCandidates(
  gateway: JellyfinGateway,
): Promise<readonly TitleDetails[] | undefined> {
  let items;
  try {
    items = await gateway.getBillboardCandidates();
  } catch {
    return undefined;
  }

  // `titleDetailsFrom` is `src/catalogue/`'s, so this module never reads a
  // `BaseItemDto` itself. It drops anything that is not a Title, which is
  // already nothing the query asked for.
  return items
    .map(titleDetailsFrom)
    .filter((details): details is TitleDetails => details !== undefined);
}

/** Spotlight over a pool already read. */
function spotlightOf(candidates: readonly TitleDetails[], draw: number): BillboardResult {
  const feature = spotlightPick(candidates, draw);
  return feature === undefined ? { outcome: 'empty' } : { outcome: 'feature', feature };
}

/**
 * The Titles one of the Rows selected, in the Row's own order — which is the
 * whole of what a Row-shaped Source has to decide (#22).
 *
 * It answers **ids**, because a Row and the Billboard want different fields of
 * the same Title: a Row's query asks for a poster and a name, and the Billboard
 * needs a backdrop, a logo and an overview. So the Row answers *which* Titles
 * and in what order, and `billboardCandidates` above answers what they look
 * like. Calling the Row's own loader is what makes "the same rules as the Row"
 * true by construction rather than by a second copy of the rule that can drift.
 *
 * A Row that would not load answers with nothing, which sends the Source to
 * Spotlight — see `billboardFromRow`.
 */
type RowSelection = (
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
) => Promise<readonly string[]>;

/**
 * A Source that features what one Row would put first.
 *
 * Two rules, and both are the ticket's:
 *
 * - **The Row's order decides**, so the Billboard features what the User would
 *   see at the left-hand end of that Row — except that a Title the Server has
 *   no backdrop for cannot be drawn as a Billboard at all, so the first one
 *   that *can* be is featured. This is why the newest addition to a library
 *   and the Billboard's Newest Addition can honestly differ.
 * - **Spotlight when there is nothing to show.** An empty Row, a Row of Titles
 *   that have no artwork for it, and a Row the Server refused all come to the
 *   same place: the Billboard is the first thing on Home and an empty one is
 *   the single answer worth avoiding (#16, story 33). Only a Server that will
 *   not answer the Billboard's *own* query leaves it unavailable, because then
 *   there is nothing to draw either way.
 */
async function billboardFromRow(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
  selection: RowSelection,
): Promise<BillboardResult> {
  const candidates = await billboardCandidates(gateway);
  if (candidates === undefined) return { outcome: 'unavailable' };

  const selected = await selection(gateway, options);
  const drawable = new Map<string, TitleDetails>();
  for (const candidate of candidates) {
    if (canBeABillboard(candidate)) drawable.set(candidate.title.itemId, candidate);
  }

  for (const itemId of selected) {
    const feature = drawable.get(itemId);
    if (feature !== undefined) return { outcome: 'feature', feature };
  }

  return spotlightOf(candidates, options.draw);
}

/**
 * Newest Addition: what New on Jellyflick puts first (#22, and #4's Row).
 *
 * The Row's own merge is what answers, so a Series stands for its newest
 * Episode here exactly as it does there — the Billboard features *Severance*
 * when a new Episode of it arrives, never the Episode, because the Billboard
 * only ever features a Title.
 */
async function loadNewestAdditionBillboard(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  return billboardFromRow(gateway, options, async (forGateway) => {
    const row = await loadNewOnJellyflick(forGateway);
    return row.outcome === 'row' ? row.titles.map((card) => card.titleId) : [];
  });
}

/**
 * Resume: what Continue Watching puts first (#22, and #12's Row).
 *
 * The Row's three reads and its merge are what answer, so the Billboard
 * inherits all of it — a part-watched Episode beating a next-up one, one entry
 * per Title, most recent activity first, and a Series the User hid staying hid.
 *
 * What the Row offers is a Movie or an **Episode**, and the Billboard features
 * the Title it belongs to: `ContinueWatchingItem.title` is the Movie or the
 * Series, which is the same Title the Row draws a card for. Pressing Play on a
 * Series then means the Episode the User is up to, which is
 * `resolvePlayTarget`'s rule and not this module's.
 */
async function loadResumeBillboard(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  return billboardFromRow(gateway, options, async (forGateway, forOptions) => {
    const read = await loadContinueWatching(forGateway);
    if (read.outcome !== 'read') return [];
    const row = continueWatchingRow({
      gateway: forGateway,
      read,
      ...(forOptions.hidden === undefined ? {} : { hidden: forOptions.hidden }),
    });
    return row.entries.map((entry) => entry.card.titleId);
  });
}

/**
 * Because You Watched: what that Row puts first (#22, and #15's Row).
 *
 * The Row's two-step question is what answers — the most recently finished
 * Title, then Jellyfin's recommendations for a Movie or what is similar to a
 * Series — so the Billboard features a suggestion rather than something the
 * User has already seen, for the same reasons and with the same fallbacks.
 */
async function loadBecauseYouWatchedBillboard(
  gateway: JellyfinGateway,
  options: LoadBillboardOptions,
): Promise<BillboardResult> {
  return billboardFromRow(gateway, options, async (forGateway) => {
    const row = await loadBecauseYouWatched(forGateway);
    return row.outcome === 'row' ? row.titles.map((card) => card.titleId) : [];
  });
}

/**
 * Every Billboard Source there is. **This is the seam #22 extends**: a Source
 * is an entry here and a loader beside `loadSpotlightBillboard`, and the
 * Billboard itself goes on knowing only `BillboardResult`.
 */
const BILLBOARD_SOURCES: Readonly<Record<BillboardSourceId, BillboardSourceLoader>> = {
  spotlight: loadSpotlightBillboard,
  resume: loadResumeBillboard,
  'newest-addition': loadNewestAdditionBillboard,
  'because-you-watched': loadBecauseYouWatchedBillboard,
};
