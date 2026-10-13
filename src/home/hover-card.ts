import type { DeviceForm } from '../device/types';

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
