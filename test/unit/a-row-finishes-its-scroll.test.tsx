import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { Row, type RowCard } from '../../src/home/row';

/**
 * A Row seeing its own scroll through (#64), and — the part that matters —
 * letting go of it.
 *
 * `revealCard` scrolls the strip when focus lands on a card, and the animation
 * that follows is watched to a standstill by `settled-scroll.ts`. This is the
 * wiring around that watch rather than the watch itself: that the Row abandons
 * one card's correction when focus moves to another, and that nothing is left
 * running once the Row has gone.
 *
 * happy-dom gives every element a zero-sized rectangle and no scrolling at
 * all, so the strip's geometry is stood up by hand below. That is the browser
 * being faked, not a module of ours: without it `scrollToReveal` has nothing
 * to measure and the Row never scrolls, which is why none of this can be
 * caught by any other unit test.
 */

const CARDS: readonly RowCard[] = [
  { titleId: 'bluey', kind: 'Movie' as const, name: 'Bluey' },
  { titleId: 'severance', kind: 'Movie' as const, name: 'Severance' },
  { titleId: 'arrival', kind: 'Movie' as const, name: 'Arrival' },
];

/**
 * The animation frames the page would otherwise be handed, held so a test can
 * count what is waiting on one and hand them all out at a moment it chooses.
 * Preact's own deferred work queues here too, which is what makes `tick` the
 * way to let an unmount's cleanup run.
 */
const frames = new Map<number, FrameRequestCallback>();
let nextHandle = 1;
let realRequest: typeof window.requestAnimationFrame;
let realCancel: typeof window.cancelAnimationFrame;

/**
 * Preact defers an unmount's effect cleanups to its next flush, which it takes
 * at whichever comes first of the next frame and a 100ms timer. No frame is
 * handed out here, so it is the timer that gets there, and waiting it out is
 * how a test sees what the Row let go of.
 */
async function preactHasFlushed(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 150);
  });
}

beforeEach(() => {
  frames.clear();
  nextHandle = 1;
  realRequest = window.requestAnimationFrame;
  realCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = nextHandle++;
    frames.set(handle, callback);
    return handle;
  };
  window.cancelAnimationFrame = (handle: number): void => {
    frames.delete(handle);
  };
});

afterEach(() => {
  window.requestAnimationFrame = realRequest;
  window.cancelAnimationFrame = realCancel;
});

/**
 * Gives the strip and its cards the geometry a browser would: a 600px strip
 * holding 1000px of cards, 150px wide and far enough apart that the second and
 * third both start beyond the far edge. Focus landing on one is then a scroll
 * rather than nothing to do.
 */
function layOutTheStrip(heading: string): HTMLElement {
  const strip = screen.getByRole('list', { name: heading });
  boxOf(strip, 0, 600);
  Object.defineProperty(strip, 'clientWidth', { value: 600, configurable: true });
  Object.defineProperty(strip, 'scrollWidth', { value: 1000, configurable: true });
  strip.scrollTo = () => undefined;
  [...strip.children].forEach((card, index) => {
    boxOf(card as HTMLElement, index * 500, 150);
  });
  return strip;
}

function boxOf(element: HTMLElement, left: number, width: number): void {
  element.getBoundingClientRect = () =>
    ({ left, width, right: left + width, top: 0, bottom: 0, height: 0, x: left, y: 0 }) as DOMRect;
}

function card(name: string): HTMLElement {
  return screen.getByRole('listitem', { name });
}

describe('a Row finishing its own scroll', () => {
  it('watches the scroll it starts when focus lands on a card', () => {
    render(<Row heading="New on Jellyflick" cards={CARDS} />);
    layOutTheStrip('New on Jellyflick');

    card('Arrival').focus();

    expect(frames.size).toBe(1);
  });

  it('leaves nothing watching once the Row has gone', async () => {
    const { unmount } = render(<Row heading="New on Jellyflick" cards={CARDS} />);
    layOutTheStrip('New on Jellyflick');
    card('Arrival').focus();
    expect(frames.size).toBe(1);

    unmount();
    await preactHasFlushed();

    expect(frames.size).toBe(0);
  });

  it('abandons one card’s correction when focus moves to another', () => {
    render(<Row heading="New on Jellyflick" cards={CARDS} />);
    const strip = layOutTheStrip('New on Jellyflick');
    card('Arrival').focus();
    expect(frames.size).toBe(1);

    // Focus comes back to the first card, which scrolls the Row the other way.
    strip.scrollLeft = 574;
    card('Bluey').focus();

    // One watch, not two: a correction aimed at the card focus has left would
    // scroll the Row away from the card focus is on.
    expect(frames.size).toBe(1);
  });
});
