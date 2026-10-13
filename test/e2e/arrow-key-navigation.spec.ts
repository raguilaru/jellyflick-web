import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Driving Home with nothing but the arrow keys, Enter and Back (stories 64 and
 * 65), and scrolling a Row the three other ways it scrolls.
 *
 * This is where the focus geometry is really checked: happy-dom gives every
 * element a zero-sized rectangle, so the unit tests can only pin down the
 * arithmetic (`nearest-in-direction`, `revealing-the-focused-item`) and the
 * Row's memory. Only a browser lays a screen out.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** The sample library, newest first, as `new-on-jellyflick-on-home` has it. */
const ROW = ['Bluey', 'Severance', 'Paddington', 'Arrival', 'Heat', 'The Unfinished'] as const;

/** Below this width the bottom bar takes over. Mirrors `src/shell/layout.ts`. */
const PHONE_WIDTH = 768;

/**
 * One size for every project: wide enough for the top bar, so there is
 * something above the Row to move up into, and narrow enough that six cards do
 * not fit, so the Row has somewhere to scroll to. What these tests are about is
 * the keys, not the layout, and the projects still differ in the one way that
 * matters here — whether a pointer exists at all.
 */
const TOP_BAR_AND_A_ROW_THAT_SCROLLS = { width: 820, height: 700 } as const;

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

async function signInAndLand(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/** What focus is on, by the name a User would hear for it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute('aria-label') ?? active.textContent;
  });
}

function strip(page: Page) {
  return page.getByRole('list', { name: 'New on Jellyflick' });
}

function scrollLeftOfRow(page: Page): Promise<number> {
  return strip(page).evaluate((element) => element.scrollLeft);
}

test.describe('driving Home with the arrow keys', () => {
  test.use({ viewport: TOP_BAR_AND_A_ROW_THAT_SCROLLS });

  test('the arrow keys enter the screen and move along the Row', async ({ page }) => {
    await signInAndLand(page);

    // Nothing is focused to begin with, so the first press comes in from the top.
    await page.keyboard.press('ArrowDown');
    expect(await focused(page)).not.toBeNull();

    // Down from the navigation reaches the Row, at the card it offers to start on.
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => focused(page)).toBe(ROW[0]);

    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe(ROW[1]);

    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe(ROW[2]);

    await page.keyboard.press('ArrowLeft');
    expect(await focused(page)).toBe(ROW[1]);
  });

  test('the end of a Row is the end: focus stays on the last card', async ({ page }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    for (let press = 0; press < ROW.length + 2; press += 1) {
      await page.keyboard.press('ArrowRight');
    }

    await expect.poll(() => focused(page)).toBe(ROW[ROW.length - 1]);
  });

  test('a Row is returned to the card focus left it on', async ({ page }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe(ROW[2]);

    // Out of the Row entirely, then back down into it.
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focused(page)).not.toBe(ROW[2]);
    await page.keyboard.press('ArrowDown');

    await expect.poll(() => focused(page)).toBe(ROW[2]);
  });

  test('the focused card is the one card Tab reaches, so Tab steps past the Row', async ({
    page,
  }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe(ROW[1]);

    // One tab stop per Row: a Row of twenty cards is not twenty presses of Tab.
    await expect(strip(page).locator('[tabindex="0"]')).toHaveCount(1);
    await expect(strip(page).getByRole('listitem', { name: ROW[1] })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  test('the Row scrolls itself to the card focus moves to', async ({ page }) => {
    await signInAndLand(page);

    // The Row really does have somewhere to scroll to, or this proves nothing.
    expect(
      await strip(page).evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeGreaterThan(0);
    expect(await scrollLeftOfRow(page)).toBe(0);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    for (let press = 0; press < ROW.length - 1; press += 1) {
      await page.keyboard.press('ArrowRight');
    }

    await expect.poll(() => focused(page)).toBe(ROW[ROW.length - 1]);
    await expect.poll(() => scrollLeftOfRow(page)).toBeGreaterThan(0);

    // And back to the start, which is where the first card is.
    for (let press = 0; press < ROW.length - 1; press += 1) {
      await page.keyboard.press('ArrowLeft');
    }
    await expect.poll(() => focused(page)).toBe(ROW[0]);
    await expect.poll(() => scrollLeftOfRow(page)).toBe(0);
  });

  test('a Row scrolls on its own, so a swipe moves it and not the page', async ({ page }) => {
    await signInAndLand(page);

    // What makes a touch swipe scroll a Row is that the strip is the scroller:
    // it overflows, it scrolls sideways, and it keeps the overflow to itself.
    const style = await strip(page).evaluate((element) => {
      const computed = window.getComputedStyle(element);
      return { overflowX: computed.overflowX, overscroll: computed.overscrollBehaviorX };
    });
    expect(style.overflowX).toBe('auto');
    expect(style.overscroll).toBe('contain');

    await strip(page).evaluate((element) => {
      element.scrollLeft = 200;
    });
    expect(await scrollLeftOfRow(page)).toBe(200);
    expect(await page.evaluate(() => window.pageYOffset)).toBe(0);
  });

  test.describe('with a pointer', () => {
    test.skip(({ keyboardOnly }) => keyboardOnly, 'a pointer is what this is about');

    test('a plain downward wheel over a Row scrolls the Row sideways', async ({ page }) => {
        await signInAndLand(page);

      await strip(page).hover();
      // Where the page is *before* the wheel, not zero: hovering scrolls the
      // Row into view, and since #16 the Billboard above it means that really
      // moves the page. What this test is about is the wheel, so the reading
      // it compares against is the one taken once the pointer is in place.
      const before = await page.evaluate(() => window.pageYOffset);

      await page.mouse.wheel(0, 200);

      await expect.poll(() => scrollLeftOfRow(page)).toBeGreaterThan(0);
      // The page stayed where it was: the Row took the wheel.
      expect(await page.evaluate(() => window.pageYOffset)).toBe(before);
    });

    test('a sideways wheel scrolls the Row too, which is what a trackpad sends', async ({
      page,
    }) => {
        await signInAndLand(page);

      await strip(page).hover();
      await page.mouse.wheel(200, 0);

      await expect.poll(() => scrollLeftOfRow(page)).toBeGreaterThan(0);
    });

    test('a card pressed with the mouse is not given the keyboard’s highlight', async ({
      page,
    }) => {
      await signInAndLand(page);
      const card = strip(page).getByRole('listitem', { name: ROW[1] });

      await card.focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      expect((await outlineOf(page, ROW[1])).style).toBe('solid');

      // The press, not the whole click: since #17 a completed click opens the
      // Title's page, and this is about the highlight, not about where a card
      // goes. `input-modality.ts` listens for `pointerdown`, which is what
      // makes the ring settle before the click would even land.
      await card.hover();
      await page.mouse.down();

      await expect.poll(async () => (await outlineOf(page, ROW[1])).style).toBe('none');
      // Still focused, though: only the highlight went away.
      expect(await focused(page)).toBe(ROW[1]);

      // Released away from the card, so no click is completed and Home stays.
      await page.mouse.move(0, 0);
      await page.mouse.up();
    });
  });

  test('the focused card is clearly highlighted for the keyboard', async ({ page }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => focused(page)).toBe(ROW[1]);

    const outline = await outlineOf(page, ROW[1]);
    expect(outline.style).toBe('solid');
    expect(outline.width).toBe('3px');

    // In the accent colour, not a browser default, so it reads from a sofa.
    const accent = await page.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    );
    expect(accent).not.toBe('');
    expect(outline.colour).toBe(await asRgb(page, accent));
  });

  test('Enter presses the card focus is on, which opens its title page', async ({ page }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    await page.keyboard.press('Enter');

    // #17 gave Enter somewhere to go: the Title's own address.
    await expect(page).toHaveURL(/\/title\//);
    await expect(page.getByRole('heading', { name: ROW[0], level: 1 })).toBeVisible();
  });

  /**
   * The highlight drawn around a card. `outline-width` is read alongside the
   * style because a suppressed outline keeps its width and only loses its style,
   * so the width alone would say a card is highlighted when it is not.
   */
});

/**
 * The phone's bottom bar is fixed to the bottom of the screen, which makes it
 * the nearest thing downwards from anywhere on the page. It must still be
 * reachable, and it must not swallow a Down press that has a Row to go to —
 * which is why `spatial-navigation.ts` tries the page's own flow first.
 */
test.describe('on a phone', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= PHONE_WIDTH,
    'the bottom bar is for phone widths',
  );

  test('Down from the last Row reaches the bottom bar', async ({ page }) => {
    await signInAndLand(page);

    await strip(page).getByRole('listitem', { name: ROW[0] }).focus();
    await page.keyboard.press('ArrowDown');

    await expect.poll(() => focused(page)).toBe('Home');
    const bar = page.getByRole('navigation');
    await expect(bar.getByRole('link', { name: 'Home', exact: true })).toBeFocused();
  });
});

function outlineOf(
  page: Page,
  name: string,
): Promise<{ style: string; width: string; colour: string }> {
  return page.getByRole('listitem', { name }).evaluate((card) => {
    const computed = window.getComputedStyle(card);
    return {
      style: computed.outlineStyle,
      width: computed.outlineWidth,
      colour: computed.outlineColor,
    };
  });
}

/** A colour as the browser reports it, so two spellings of red can be compared. */
function asRgb(page: Page, colour: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.append(probe);
    const computed = window.getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, colour);
}
