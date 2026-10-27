/**
 * A sideways smooth scroll, seen through to the offset it was asked for (#64).
 *
 * `reveal.ts` works out where a scroller has to be; this puts it there. The
 * difference between the two is the whole point of this module: the arithmetic
 * is exact, and what the browser *realises* need not be. A smooth scroll is an
 * animation nothing in the app starts, observes the end of, or re-runs, and a
 * Row is scrolled by focus moving to a card — so once focus is already on the
 * card the Row wants, no further event will ever come to finish the job. A Row
 * that comes to rest a few pixels short of where it was sent stays there.
 *
 * So the scroll is watched to a standstill and the last few pixels are taken by
 * hand. Three rules keep that from becoming a worse bug than the one it fixes:
 *
 * - **It watches with `requestAnimationFrame`.** `scrollend` is Chrome 114 and
 *   ADR 0002's floor is 68, so there is no event to listen for.
 * - **It never fights whoever else is in charge.** A scroller moving *away*
 *   from the target is one the User is scrolling — by touch, or by the wheel
 *   `row.tsx` turns sideways — and the correction is abandoned on the spot.
 *   So is one that comes to rest further off than `CLOSE_ENOUGH`: a correction
 *   is a nudge over the last few pixels, not a second attempt at the scroll.
 * - **It ends.** Every watch is cancellable, for focus moving to another card
 *   and for the component unmounting, and gives up after `FRAME_BUDGET` frames
 *   whatever happens.
 */

/** What this needs of a scroller: an offset it can read and write, and the ask. */
export type SidewaysScroller = {
  scrollLeft: number;
  scrollTo: (options: ScrollToOptions) => void;
};

/** Animation frames, injected so a test can hand them out one at a time. */
export type Frames = {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

/**
 * How many pixels short a correction will reach across. The defect is a
 * sub-pixel-to-a-few-pixels residual — #42 saw 3 — and a card plus its gap is
 * 166, so this is wide enough to cover the residual and nowhere near wide
 * enough to move the Row off the card it settled on.
 */
const CLOSE_ENOUGH = 8;

/**
 * How many frames of an unchanged offset count as the animation having
 * finished, counting the frame the offset last moved on as the first of them.
 * One is not enough: a smooth scroll can sit still for the frame before it
 * starts — and on slow hardware it can sit still for several, which is why no
 * number here is safe on its own and stillness is only counted once the offset
 * has moved at all.
 */
const STILL_FRAMES = 3;

/**
 * The most frames one correction may watch for — about two seconds at 60Hz,
 * against a smooth scroll of roughly a third of one. A scroller that is still
 * moving by then is not this animation's any more.
 */
const FRAME_BUDGET = 120;

const animationFrames: Frames = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => {
    window.cancelAnimationFrame(handle);
  },
};

/**
 * Scrolls sideways to `left` and sees it through, returning the way to abandon
 * the correction — which the caller must do when focus moves on or the
 * scroller goes away.
 */
export function scrollSidewaysTo(
  scroller: SidewaysScroller,
  left: number,
  frames: Frames = animationFrames,
): () => void {
  if (scroller.scrollLeft === left) return () => undefined;

  try {
    scroller.scrollTo({ left, behavior: 'smooth' });
  } catch {
    // An engine too old for `scrollTo` with options throws rather than
    // ignoring them. There is no animation to watch: it is already there.
    scroller.scrollLeft = left;
    return () => undefined;
  }

  return watchItSettle(scroller, left, frames);
}

function watchItSettle(scroller: SidewaysScroller, left: number, frames: Frames): () => void {
  let handle: number | undefined;
  let previous: number | undefined;
  let still = 1;
  // Whether the offset has moved since the scroll was asked for. Until it has,
  // an unchanged offset is a scroll that has not begun rather than one that has
  // finished, and the two are indistinguishable from stillness alone.
  let moved = false;
  let framesLeft = FRAME_BUDGET;
  // Cancelling a frame does not unqueue one the browser is already running,
  // and Preact runs an unmount's cleanup a flush late, so being abandoned has
  // to be a fact the next frame reads rather than only a cancelled handle.
  let abandoned = false;

  const stop = (): void => {
    abandoned = true;
    if (handle !== undefined) frames.cancel(handle);
    handle = undefined;
  };

  /** Takes the last few pixels by hand, where that is all they are. */
  const takeTheRest = (at: number): void => {
    if (Math.abs(at - left) <= CLOSE_ENOUGH) scroller.scrollLeft = left;
  };

  const look = (): void => {
    handle = undefined;
    if (abandoned) return;
    const at = scroller.scrollLeft;
    if (at === left) return;

    if (previous !== undefined) {
      // Further away than it was: the User, or something else, has the Row.
      if (Math.abs(at - left) > Math.abs(previous - left)) return;
      if (at === previous) {
        // Only an animation that has moved can have come to a standstill. A
        // still frame before the first movement is the scroll waiting to start,
        // and three of those in a row are ordinary on a television — counting
        // them would end the watch before the animation it is watching began.
        if (moved) still++;
      } else {
        moved = true;
        still = 1;
      }
    }
    previous = at;

    if (still >= STILL_FRAMES) {
      takeTheRest(at);
      return;
    }

    framesLeft--;
    if (framesLeft <= 0) {
      // Out of budget having never moved at all: an engine that took
      // `behavior: 'smooth'` and did nothing with it. There is no animation and
      // so nobody else in charge of the Row, and the offset is still exactly
      // where it was left — which is #64's defect, so correct it.
      if (!moved) takeTheRest(at);
      return;
    }
    handle = frames.request(look);
  };

  handle = frames.request(look);
  return stop;
}
