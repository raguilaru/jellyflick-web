import { afterEach, describe, expect, it } from 'vitest';
import { fixedRootOf } from '../../src/navigation/focusable';

/**
 * Which flow the arrow keys think a thing is in (#26, #27).
 *
 * `src/navigation/spatial-navigation.ts` keeps focus inside an overlay by
 * putting everything in one flow with it and offering no way out of that flow,
 * and the flow is "the fixed thing this is inside". Overlays nest, so *which*
 * fixed thing is the whole question — and getting it wrong does not fail
 * loudly. It quietly makes two things one flow, and then a press that should
 * have had nowhere to go lands on whatever the geometry liked best.
 *
 * These are the shapes the app really builds, written out as bare elements:
 * the geometry is not the point here and a browser is where it gets checked
 * (`test/e2e/playing-a-title.spec.ts`), which is also the only place the bug
 * below could show itself.
 */

function fixed(): HTMLElement {
  const element = document.createElement('div');
  element.style.position = 'fixed';
  return element;
}

function nest(...elements: HTMLElement[]): HTMLElement {
  elements.reduce((parent, child) => {
    parent.append(child);
    return child;
  });
  document.body.append(elements[0]);
  return elements[elements.length - 1];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the flow a focusable belongs to', () => {
  it('is nothing at all for something in the page itself', () => {
    const card = nest(document.createElement('div'), document.createElement('button'));

    expect(fixedRootOf(card)).toBeUndefined();
  });

  it('is the screen, for something on a screen that is fixed', () => {
    // The title page's pop-up shape (#17): fixed on purpose, because that is
    // what makes the arrow keys treat the pop-up as the flow.
    const screen = fixed();
    const card = nest(screen, document.createElement('div'), document.createElement('button'));

    expect(fixedRootOf(card)).toBe(screen);
  });

  /**
   * The one that was wrong. Reading the **outermost** fixed ancestor answered
   * the screen for both of these, so the player's controls and the cards on
   * the page behind the picture sat in one flow — and the rule that an overlay
   * has no way out of it stopped meaning anything on the one screen a Title is
   * played from. Right from the subtitle menu focused a card behind it.
   */
  it('separates an overlay from the fixed screen it is drawn over', () => {
    const screen = fixed();
    const cardBehind = nest(screen, document.createElement('ul'), document.createElement('li'));

    const player = fixed();
    const control = nest(player, document.createElement('p'), document.createElement('button'));
    screen.append(player);

    expect(fixedRootOf(control)).toBe(player);
    expect(fixedRootOf(cardBehind)).toBe(screen);
    expect(fixedRootOf(control)).not.toBe(fixedRootOf(cardBehind));
  });

  /**
   * And a menu inside the player is a flow of its own, not the player's: it is
   * drawn over those controls and is `aria-modal`, so "nothing further that
   * way" is the honest answer at its edge. `track-picker.tsx` says this is why
   * it needs no focus-trapping code.
   */
  it('separates a menu from the overlay it is drawn inside', () => {
    const player = fixed();
    const control = nest(player, document.createElement('p'), document.createElement('button'));

    const menu = fixed();
    const choice = nest(menu, document.createElement('div'), document.createElement('button'));
    player.append(menu);

    expect(fixedRootOf(choice)).toBe(menu);
    expect(fixedRootOf(control)).toBe(player);
  });
});
