import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * Reaching a control with the arrow keys alone, which is what "usable with a
 * remote" means in this suite.
 *
 * It lives beside the specs rather than inside one because two of them need
 * it: #27's track picker was the first (`playing-a-title.spec.ts`) and #31's
 * Skip buttons and next-Episode offer are the second
 * (`skipping-and-the-next-episode.spec.ts`). The long reasoning below is #27's,
 * kept word for word — it is a record of three ways of doing this that looked
 * right and were not, and the geometry it warns about has not changed.
 *
 * It is **not** a fixture: there is no per-test state here, only functions of a
 * `Page`.
 */

/**
 * Walks focus to one control with the arrow keys alone, and fails if it cannot
 * be reached that way.
 *
 * A **search** rather than a fixed sequence of presses, because what the ticket
 * asks for is that every choice is *reachable* by direction. Asserting one
 * exact route would be asserting this stylesheet's column count instead, and
 * that differs between the projects this suite runs in: the track picker is
 * three columns wide on the desktop viewport and two on the phone one.
 *
 * The route it takes is the one a User takes: **it presses towards the thing it
 * wants**. Down when the target is on a line below, along when it is on this
 * one, and the other axis when the first press finds nothing that way. That is
 * what "reachable by direction" means to a person holding a remote, and it is
 * the only route that does not quietly assume a shape for the menu.
 *
 * It replaces a row-by-row sweep — along until focus stops moving, then down
 * and back the other way — which read as if it reached every cell of a grid and
 * did not. A sweep only covers a row if it *enters* that row at one end, and
 * `Down` lands wherever the geometry says, which is often the middle; the sweep
 * then turned and walked away from the half it had not seen. It also assumed
 * `Right` stays on its row, and in the one-column layout the menu falls into on
 * a narrow screen `Right` from a track jumps to the Done button centred below
 * it, because that really is the only thing to the right. Both holes depend on
 * how many columns the menu has, which depends on how wide its buttons are,
 * which depends on the **fonts the machine has** — so this passed on every
 * developer's macOS and never once on CI's Linux, where the choices are a
 * hair's width wider. Measured across fourteen viewport widths, the sweep could
 * not reach Spanish at 340, 360 or 375 and this reaches it at all fourteen.
 *
 * **Left and Right are not pressed while the seek bar has focus.** There they
 * are a ten-second seek rather than a move of focus — #26's rule, and the
 * player takes those keys before the navigator sees them — so pressing one
 * would scrub the Title instead of moving along. An even earlier version of
 * this did exactly that and quietly ran the film to its end.
 */
export async function reachByArrowKeys(page: Page, target: ReturnType<Page['getByRole']>): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) return;

    if (await page.evaluate(() => document.activeElement?.hasAttribute('data-player-seek') === true)) {
      /*
       * **Off the bar vertically, towards the target.** It used to be Down
       * unconditionally, which is right for everything below the bar — #27's
       * track picker is opened from a button in the row under it — and walks
       * away from anything above it. #31's Skip button sits over the bottom of
       * the picture, so Down from the bar landed back on the play/pause button,
       * whose own step towards the Skip button is Up, which is the bar again:
       * the search ping-ponged until its presses ran out and reported a button
       * a remote reaches in two presses as unreachable.
       */
      const keys = await keysTowards(page, target);
      const vertical = keys.find((key) => key === 'ArrowUp' || key === 'ArrowDown');
      if (!(await pressAndSettle(page, vertical ?? 'ArrowDown'))) break;
      continue;
    }

    let moved = false;
    for (const key of await keysTowards(page, target)) {
      if (await pressAndSettle(page, key)) {
        moved = true;
        break;
      }
    }
    // Nothing in any direction: pressing on cannot help, and the assertion
    // below is the one that should say so.
    if (!moved) break;
  }

  await expect(target).toBeFocused();
}

/**
 * Presses a key and answers whether focus really moved.
 *
 * It **waits** for the answer rather than taking one reading straight after the
 * press. The navigator moves focus synchronously inside its own `keydown`
 * handler today (`src/navigation/spatial-navigation.ts` calls `focus()` there),
 * so one reading is right — but a single sample is only right for as long as
 * that stays true, and a screen that moved focus from an effect instead would
 * turn this helper's every press into "that moved nothing" on slow hardware and
 * nowhere else. Waiting for it to settle costs nothing when it already has.
 *
 * Focus is compared **by identity**, not by position in the document: the old
 * reading was an index into a live `querySelectorAll` over the whole page, and
 * the title page behind the player is still filling its Rows in while this
 * runs, so an element arriving ahead of the focused one shifted that index and
 * read as a move that never happened. Identity cannot be fooled that way, and
 * it still tells apart two buttons that are identical in every other respect —
 * the sound and the subtitles both offer one named "English".
 */
export async function pressAndSettle(page: Page, key: string): Promise<boolean> {
  const before = await focusToken(page);
  await page.keyboard.press(key);
  for (let wait = 0; wait < 10; wait += 1) {
    if ((await focusToken(page)) !== before) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

/** What focus is on, as a token that is stable for as long as that element is. */
export function focusToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scope = window as unknown as { __focusIds?: WeakMap<Element, string>; __focusN?: number };
    if (scope.__focusIds === undefined) {
      scope.__focusIds = new WeakMap();
      scope.__focusN = 0;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return 'nothing';
    let token = scope.__focusIds.get(active);
    if (token === undefined) {
      scope.__focusN = (scope.__focusN ?? 0) + 1;
      token = `focus-${String(scope.__focusN)}`;
      scope.__focusIds.set(active, token);
    }
    return token;
  });
}

/**
 * The arrow keys that go towards the target, the most useful first.
 *
 * Whether the target shares a line with what focus is on is read off the boxes
 * rather than assumed: two things on one line is exactly what the navigator's
 * own geometry means by a row, and it is the fact that decides whether the
 * useful press is along the line or across it. The two keys that lead away come
 * last, so a corner the first two cannot leave still has somewhere to go.
 */
export async function keysTowards(page: Page, target: ReturnType<Page['getByRole']>): Promise<string[]> {
  const here = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const box = active.getBoundingClientRect();
    return { y: box.top, height: box.height, middleX: box.left + box.width / 2, middleY: box.top + box.height / 2 };
  });
  const there = await target.boundingBox();
  if (here === null || there === null) return ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

  const onOneLine = there.y < here.y + here.height && here.y < there.y + there.height;
  const across = there.y + there.height / 2 > here.middleY ? 'ArrowDown' : 'ArrowUp';
  const along = there.x + there.width / 2 > here.middleX ? 'ArrowRight' : 'ArrowLeft';
  const backAcross = across === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';
  const backAlong = along === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';

  return onOneLine ? [along, across, backAlong, backAcross] : [across, along, backAcross, backAlong];
}
