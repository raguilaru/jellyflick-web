import { titleDetailsFrom, type TitleDetails } from '../catalogue/catalogue';
import type { DeviceForm } from '../device/types';
import type { Translate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * The rules behind the enlarged hover card (#21, stories 52 and 53): which
 * devices get one, how long a pointer has to rest before it opens, and which
 * facts it says.
 *
 * No DOM and no components, for the reason `src/playback/subtitle-offset.ts`
 * has none: happy-dom gives every element a zero-sized rectangle, so what a
 * unit test can hold still is the rule and never the layout. `hover-card.tsx`
 * is the card itself, and `test/e2e/desktop-hover-cards.spec.ts` is the only
 * place the enlargement is measured.
 */

/**
 * Whether an enlarged hover card belongs on this device at all.
 *
 * Two facts, and **both** of them have to agree:
 *
 * - **The pointer can hover and is fine**, which is the media query in
 *   `src/shell/layout.ts`. A touch screen has neither, and a card that
 *   enlarges under a finger would cover the Row the finger is scrolling.
 * - **The device is not a TV.** This is the half a query cannot answer: an LG
 *   magic remote is a pointer the browser reports as `fine` *and* `hover`, so
 *   the query alone would put an enlarged card on the one screen in the house
 *   that is driven from across a room — where Right is how a User reaches the
 *   next card and nothing is resting on anything. `deviceForm()` is the fact
 *   the app trusts over the query, exactly as "Signing in" does for Quick
 *   Connect (#9).
 *
 * A handheld is excluded on the same ground: a tablet with a trackpad case
 * reports a hovering pointer, and the title page is what serves it (story 55).
 */
export function hoverCardsAvailable(form: DeviceForm, pointerCanHover: boolean): boolean {
  return form === 'computer' && pointerCanHover;
}

/**
 * The one line of facts on an enlarged card: the age rating, the length and
 * the genres, which is exactly what story 52 asks for.
 *
 * Deliberately **narrower than the title page's own facts line**
 * (`factsOf` in `src/title/title-screen.tsx`), and not shared with it. That
 * one opens with the year and closes with the Server's two ratings, because a
 * title page is where a Title is read about; a card is something a User is
 * skimming past, and the scores on it are the *extra* ratings underneath —
 * four more numbers beside them would be a wall of them.
 *
 * Every fact the Server left out is simply not in the line, which is story 81
 * past the ratings as well as in them: a Series has no running time at all,
 * and a label with nothing after it says less than no label.
 */
export function hoverCardFactsOf(details: TitleDetails, t: Translate): readonly string[] {
  const facts: string[] = [];
  if (details.ageRating !== undefined) facts.push(details.ageRating);
  if (details.runtimeMinutes !== undefined) {
    facts.push(t('title.runtime', { minutes: details.runtimeMinutes }));
  }
  if (details.genres.length > 0) facts.push(details.genres.join(', '));
  return facts;
}

/**
 * How long the pointer has to rest on a card before it enlarges, in
 * milliseconds.
 *
 * It is **Jellyflick's own number**, like Quick Connect's deadline
 * (`decisions.md` §11) and the next Episode's countdown (§13): nothing in
 * Jellyfin or the spec says how long resting is. Story 53 says why there is a
 * delay at all — a pointer sweeping across a Row to reach the far end of it
 * must not open and close six cards on the way, and each one of those would be
 * a read off the Server and, through `ExtraRatings`, a request against
 * MDBList's thousand a day.
 *
 * 400ms is long enough that crossing a card is not resting on it and short
 * enough that resting on one does not feel broken. The timer is restarted by
 * every card the pointer enters, so scrolling a Row under a still pointer —
 * where the cards move and the pointer does not — opens nothing either.
 */
export const HOVER_CARD_DELAY_MS = 400;

/**
 * One Title's details, for the card the pointer is resting on.
 *
 * A `RowCard` carries a name, some artwork and how far through it the User is,
 * which is all a Row needs and none of what an enlarged card says. So the card
 * reads the Title itself — the same `getTitles({ detail: true })` the title
 * page makes, and deliberately not `loadTitlePage`, which also asks for More
 * like this, the Collections and a Series' every Episode. An enlarged card
 * wants none of those.
 *
 * **Held per Title, as a promise**, which is `src/ratings/extra-ratings.ts`'s
 * bargain for the same reason: a User moving back and forth along a Row rests
 * on the same card several times and must not ask the Server again each time.
 * A **failure is forgotten** rather than remembered, so one blip does not
 * leave a card unable to enlarge for the rest of the visit.
 *
 * The key carries the Server's address as well as the Title's id: two Servers
 * can hold the same id, and a cache that forgot which would show one
 * household's Title on another's Home.
 */
const detailsByTitle = new Map<string, Promise<TitleDetails | undefined>>();

export function readCardDetails(
  gateway: JellyfinGateway,
  titleId: string,
): Promise<TitleDetails | undefined> {
  const key = `${gateway.serverAddress}|${titleId}`;
  const known = detailsByTitle.get(key);
  if (known !== undefined) return known;

  const reading = gateway
    .getTitles({ ids: [titleId], detail: true })
    .then((items) => {
      const dto = items[0];
      return dto === undefined ? undefined : titleDetailsFrom(dto);
    })
    .catch(() => {
      // Forgotten, not remembered: see above.
      detailsByTitle.delete(key);
      return undefined;
    });

  detailsByTitle.set(key, reading);
  return reading;
}

/** Empties the cache. For tests, which must not leak one Server into the next. */
export function forgetCardDetails(): void {
  detailsByTitle.clear();
}
