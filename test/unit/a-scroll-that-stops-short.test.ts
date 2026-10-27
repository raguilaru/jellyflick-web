import { describe, expect, it } from 'vitest';
import { scrollSidewaysTo, type Frames, type SidewaysScroller } from '../../src/navigation/settled-scroll';

/**
 * Seeing a sideways smooth scroll through to the offset it was asked for (#64).
 *
 * A Row is scrolled by focus moving to a card, and nothing in the app observes
 * the end of that animation: once focus is already on the card the Row wants,
 * no further event will ever come to finish the job, so a Row that comes to
 * rest a few pixels short stays there.
 *
 * These are unit tests of the watcher, not a reproduction of the browser's
 * imprecision — the stub below comes to rest short because the test tells it
 * to. What a real browser does is #64's open question; what this watcher does
 * about it is here.
 */

/** A strip that is scrolled only by what the test assigns to it. */
function strip(): SidewaysScroller & { asked: ScrollToOptions[] } {
  const asked: ScrollToOptions[] = [];
  return {
    scrollLeft: 0,
    asked,
    scrollTo(options: ScrollToOptions) {
      asked.push(options);
    },
  };
}

/** A strip on an engine too old for `scrollTo` with options, which throws. */
function unanimatedStrip(): SidewaysScroller {
  return {
    scrollLeft: 0,
    scrollTo() {
      throw new TypeError('Failed to execute scrollTo: parameter 1 is not of type number.');
    },
  };
}

/** Animation frames the test hands out one at a time. */
function frameQueue(): Frames & { tick: (times?: number) => void; waiting: () => number } {
  let nextHandle = 1;
  const pending = new Map<number, () => void>();
  return {
    request(callback) {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      pending.delete(handle);
    },
    waiting: () => pending.size,
    tick(times = 1) {
      for (let count = 0; count < times; count++) {
        const due = [...pending.values()];
        pending.clear();
        for (const callback of due) callback();
      }
    },
  };
}

describe('a sideways scroll that stops short', () => {
  it('asks the browser to animate, where it can', () => {
    const row = strip();

    scrollSidewaysTo(row, 208, frameQueue());

    expect(row.asked).toEqual([{ left: 208, behavior: 'smooth' }]);
  });

  it('puts a Row that came to rest short exactly where it was asked for', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    // The browser's animation runs, and stops three pixels short of 208.
    row.scrollLeft = 160;
    frames.tick();
    row.scrollLeft = 205;
    frames.tick(3);

    expect(row.scrollLeft).toBe(208);
    expect(frames.waiting()).toBe(0);
  });

  it('stops watching a Row that arrived on its own', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    row.scrollLeft = 208;
    frames.tick();

    expect(frames.waiting()).toBe(0);
  });

  it('abandons a Row the User has scrolled away themselves', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    row.scrollLeft = 160;
    frames.tick();
    // A wheel over the Row, which `row.tsx` turns into a write of `scrollLeft`.
    row.scrollLeft = 40;
    frames.tick();

    // Let go on the frame it sees the Row move away, rather than lingering
    // over a Row somebody else is scrolling.
    expect(frames.waiting()).toBe(0);
    frames.tick(4);
    expect(row.scrollLeft).toBe(40);
  });

  it('leaves a Row that settled nowhere near the target alone', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    row.scrollLeft = 60;
    frames.tick();
    // Far short is not the defect this corrects: something else is in charge.
    row.scrollLeft = 100;
    frames.tick(3);

    expect(row.scrollLeft).toBe(100);
    expect(frames.waiting()).toBe(0);
  });

  it('does not take a scroll that has not begun for one that has finished', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    // Three frames in which the browser has not moved the offset at all —
    // ordinary on a webOS 5 television, and reachable here with
    // `E2E_CPU_THROTTLE=4`. Reading those as a standstill would end the watch
    // before the animation began, which is #64's defect left in place on
    // exactly the hardware it was filed about.
    frames.tick(3);
    // Then the animation runs, and comes to rest three pixels short.
    row.scrollLeft = 205;
    frames.tick(3);

    expect(row.scrollLeft).toBe(208);
    expect(frames.waiting()).toBe(0);
  });

  it('takes the last pixels by hand where the engine never animated at all', () => {
    const row = strip();
    const frames = frameQueue();
    row.scrollLeft = 203;

    scrollSidewaysTo(row, 208, frames);
    // An engine that accepted `behavior: 'smooth'` and then did nothing with
    // it: the offset never moves, so there is no standstill to watch for and
    // the frame budget is what ends the watch. Nobody else is in charge of a
    // Row that never moved, so the residual is still this module's to take.
    frames.tick(500);

    expect(row.scrollLeft).toBe(208);
    expect(frames.waiting()).toBe(0);
  });

  it('stops dead when it is cancelled, which is how focus moving on and unmounting end it', () => {
    const row = strip();
    const frames = frameQueue();

    const abandon = scrollSidewaysTo(row, 208, frames);
    row.scrollLeft = 205;
    frames.tick();
    abandon();
    frames.tick(4);

    expect(row.scrollLeft).toBe(205);
    expect(frames.waiting()).toBe(0);
  });

  it('ignores a frame that had already begun when it was abandoned', () => {
    const row = strip();
    const frames = frameQueue();
    let abandon = (): void => undefined;
    // Something else on the same frame abandons the correction — which is
    // exactly the Row unmounting, since Preact takes its cleanups on a frame.
    // Cancelling cannot unqueue a frame the browser has already begun.
    frames.request(() => {
      abandon();
    });

    abandon = scrollSidewaysTo(row, 208, frames);
    row.scrollLeft = 205;
    frames.tick(4);

    expect(row.scrollLeft).toBe(205);
    expect(frames.waiting()).toBe(0);
  });

  it('gives up rather than watching for ever', () => {
    const row = strip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);
    // A Row forever approaching and never arriving, which no watcher may follow.
    for (let count = 0; count < 500 && frames.waiting() > 0; count++) {
      row.scrollLeft = 208 - 100 / (count + 1);
      frames.tick();
    }

    expect(frames.waiting()).toBe(0);
    expect(row.scrollLeft).not.toBe(208);
  });

  it('jumps, and watches nothing, where the engine cannot animate at all', () => {
    const row = unanimatedStrip();
    const frames = frameQueue();

    scrollSidewaysTo(row, 208, frames);

    expect(row.scrollLeft).toBe(208);
    expect(frames.waiting()).toBe(0);
  });

  it('does nothing at all to a Row already where it was asked for', () => {
    const row = strip();
    const frames = frameQueue();
    row.scrollLeft = 208;

    scrollSidewaysTo(row, 208, frames);

    expect(row.asked).toEqual([]);
    expect(frames.waiting()).toBe(0);
  });
});
