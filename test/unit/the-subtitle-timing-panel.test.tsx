import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/preact';
import { en } from '../../src/i18n/en';
import {
  HOLD_FIRST_REPEAT_MS,
  HOLD_REPEAT_MS,
  SubtitleTiming,
} from '../../src/playback/subtitle-timing';
import { shiftSubtitleOffset } from '../../src/playback/subtitle-offset';
import { testDeviceLayer } from '../device/profiles';

/**
 * The Subtitle timing panel (#28, stories 96–101) on its own, the way
 * `PlayerControls` is drawn on its own: it owns no offset, it reports presses,
 * and the player is the one place the offset in force lives. So a test can hand
 * it any state and read back exactly what a User would see.
 *
 * What is **not** here: the offset reaching the picture, which is the journey
 * (`shifting-the-subtitles.test.tsx`), and where an arrow key sends focus,
 * which needs a laid-out screen (`test/e2e/the-subtitle-offset.spec.ts`).
 *
 * The timers are fake, because hold-to-repeat is the one behaviour in the panel
 * made of them. `shouldAdvanceTime` is off: nothing here waits on the network.
 */

afterEach(() => {
  vi.useRealTimers();
});

const device = testDeviceLayer();

/** The panel with an offset of its own, which is what the player holds. */
function Panel(props: { initial?: number; canSync?: boolean; onSettled?: () => void }) {
  const [offset, setOffset] = useState(props.initial ?? 0);
  return (
    <SubtitleTiming
      offsetSeconds={offset}
      device={device}
      onShift={(steps) => setOffset((held) => shiftSubtitleOffset(held, steps))}
      onReset={() => setOffset(0)}
      {...(props.canSync === false ? {} : { onSyncToLine: () => setOffset(1.4) })}
      onSettled={props.onSettled ?? (() => undefined)}
      onClose={() => undefined}
    />
  );
}

function panel(): HTMLElement {
  return screen.getByRole('dialog', { name: en['player.subtitleTiming'] });
}

function readout(): string {
  return panel().querySelector('.player__timing-readout')?.textContent ?? '';
}

function later(): HTMLElement {
  return screen.getByRole('button', { name: en['player.subtitlesStepLater'] });
}

function earlier(): HTMLElement {
  return screen.getByRole('button', { name: en['player.subtitlesStepEarlier'] });
}

describe('the readout', () => {
  it('says the subtitles are in sync when nothing has been shifted', () => {
    render(<Panel />);

    expect(readout()).toBe(en['player.subtitlesInSync']);
  });

  /** Story 99's own example: "Subtitles 0.8 s later". */
  it('writes out how far later the subtitles are', () => {
    render(<Panel initial={0.8} />);

    expect(readout()).toBe('Subtitles 0.8 s later');
  });

  /**
   * The other direction is its own sentence rather than a minus sign in front
   * of the first: "earlier" is the word a User thinks in and `-0.8` is not.
   */
  it('writes out how far earlier they are, in words rather than with a sign', () => {
    render(<Panel initial={-1.5} />);

    expect(readout()).toBe('Subtitles 1.5 s earlier');
  });
});

describe('the step buttons', () => {
  it('shifts the subtitles a tenth of a second later, and back again', () => {
    render(<Panel />);

    fireEvent.click(later());
    expect(readout()).toBe('Subtitles 0.1 s later');

    fireEvent.click(earlier());
    expect(readout()).toBe(en['player.subtitlesInSync']);

    fireEvent.click(earlier());
    expect(readout()).toBe('Subtitles 0.1 s earlier');
  });

  /**
   * Story 97: holding repeats, and repeats **faster** the longer it is held, so
   * a User can walk a tenth at a time or cross several seconds with one thumb.
   * The first press is immediate — a tap is one step, whatever happens next.
   */
  it('repeats while it is held, and faster the longer it is held', () => {
    vi.useFakeTimers();
    render(<Panel />);

    act(() => {
      fireEvent.pointerDown(later());
    });
    // The press itself, before any timer has run.
    expect(readout()).toBe('Subtitles 0.1 s later');

    act(() => {
      vi.advanceTimersByTime(HOLD_FIRST_REPEAT_MS + HOLD_REPEAT_MS * 3);
    });
    // Four more steps: the first repeat and three after it, all a tenth each.
    expect(readout()).toBe('Subtitles 0.5 s later');

    // Held long enough to be going faster: the same four ticks move further.
    const before = readout();
    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_MS * 40);
    });
    expect(readout()).not.toBe(before);
    expect(Number(/([\d.]+)/.exec(readout())?.[1] ?? '0')).toBeGreaterThan(4);
  });

  it('stops repeating the moment the button is let go', () => {
    vi.useFakeTimers();
    render(<Panel />);

    act(() => {
      fireEvent.pointerDown(later());
      vi.advanceTimersByTime(HOLD_FIRST_REPEAT_MS + HOLD_REPEAT_MS);
      fireEvent.pointerUp(later());
    });
    const held = readout();

    act(() => {
      vi.advanceTimersByTime(HOLD_REPEAT_MS * 20);
    });

    expect(readout()).toBe(held);
  });

  /**
   * A pointer that leaves the button is a press abandoned, which is what every
   * platform's own buttons do. Without it, dragging off a held `+` on a phone
   * would leave the offset running away with nothing on screen to stop it.
   */
  it('stops repeating when the pointer leaves the button', () => {
    vi.useFakeTimers();
    render(<Panel />);

    act(() => {
      fireEvent.pointerDown(later());
      vi.advanceTimersByTime(HOLD_FIRST_REPEAT_MS);
      fireEvent.pointerLeave(later());
      vi.advanceTimersByTime(HOLD_REPEAT_MS * 20);
    });

    expect(readout()).toBe('Subtitles 0.2 s later');
  });

  /**
   * A press that came through a pointer must not also count as a click: a
   * browser fires both for one tap, and a panel that acted on each would move
   * two tenths for one press. A keyboard press has no pointer and so is the
   * click alone.
   */
  it('counts one press once, whether it came from a pointer or a key', () => {
    render(<Panel />);

    // What a browser really sends for a tap, in order.
    fireEvent.pointerDown(later());
    fireEvent.pointerUp(later());
    fireEvent.click(later());
    expect(readout()).toBe('Subtitles 0.1 s later');

    // And Enter on the focused button, which is a click with no pointer.
    fireEvent.click(later());
    expect(readout()).toBe('Subtitles 0.2 s later');
  });
});

/**
 * Story 98: a TV User adjusts the offset with the remote's Left and Right while
 * the panel is open. The keys are taken on the panel itself rather than from
 * `window`, so they are the panel's only while focus is **inside** it — and
 * `preventDefault` is what takes them off `src/navigation/`, which otherwise
 * moves focus with the same press (the player's own handler uses exactly this
 * mechanism for the seek bar).
 */
describe('the arrow keys while the panel is focused', () => {
  it('shifts the subtitles later on Right and earlier on Left', () => {
    render(<Panel />);

    fireEvent.keyDown(later(), { key: 'ArrowRight', bubbles: true });
    expect(readout()).toBe('Subtitles 0.1 s later');

    fireEvent.keyDown(later(), { key: 'ArrowLeft', bubbles: true });
    fireEvent.keyDown(later(), { key: 'ArrowLeft', bubbles: true });
    expect(readout()).toBe('Subtitles 0.1 s earlier');
  });

  it('takes the key, so the arrow keys do not also move focus', () => {
    render(<Panel />);
    const press = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });

    panel().dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);
  });

  /** Up and Down are the navigator's: they move between the panel's buttons. */
  it('leaves Up and Down alone', () => {
    render(<Panel />);
    const press = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

    panel().dispatchEvent(press);

    expect(press.defaultPrevented).toBe(false);
    expect(readout()).toBe(en['player.subtitlesInSync']);
  });
});

describe('Reset and Sync to this line', () => {
  it('puts the subtitles back in sync', () => {
    render(<Panel initial={2.3} />);

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTimingReset'] }));

    expect(readout()).toBe(en['player.subtitlesInSync']);
  });

  it('syncs to the line on the screen', () => {
    render(<Panel />);

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleSyncToLine'] }));

    expect(readout()).toBe('Subtitles 1.4 s later');
  });

  /**
   * Nothing on the screen is nothing to sync to. The button stays, as an
   * undrawable subtitle track does in the menu: `aria-disabled` keeps it a
   * focus stop a remote can reach and read the reason off, where `disabled`
   * would take it out of the arrow keys' reach entirely.
   *
   * The reason is said when a User **presses** it, not for as long as there is
   * no line: a notice blinking on and off through every pause in the dialogue,
   * right beside the number being read, is worse than one that answers the
   * press that asked.
   */
  it('says why it cannot sync, when a User presses it with no line on the screen', () => {
    render(<Panel canSync={false} />);

    const sync = screen.getByRole('button', { name: en['player.subtitleSyncToLine'] });
    expect(sync.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByText(en['player.subtitleSyncUnavailable'])).toBeNull();

    fireEvent.click(sync);

    expect(screen.getByText(en['player.subtitleSyncUnavailable'])).toBeTruthy();
    // And nothing was shifted by a press that could not do anything.
    expect(readout()).toBe(en['player.subtitlesInSync']);
  });
});

/**
 * When the offset is **saved**.
 *
 * Not on every step: a Client Settings save is a read-modify-write against the
 * Server, and a held button takes forty of them. The panel says when an
 * adjustment has *finished* instead — a button let go, a key let go, Reset,
 * Sync — and the player saves that. No timer is involved, which is why the
 * player still has exactly the two it had before (#31).
 */
describe('saying when an adjustment has finished', () => {
  it('does not say so for every step of a held button', () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    render(<Panel onSettled={settled} />);

    act(() => {
      fireEvent.pointerDown(later());
      vi.advanceTimersByTime(HOLD_FIRST_REPEAT_MS + HOLD_REPEAT_MS * 5);
    });

    expect(settled).not.toHaveBeenCalled();
  });

  it('says so once when the button is let go', () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    render(<Panel onSettled={settled} />);

    act(() => {
      fireEvent.pointerDown(later());
      vi.advanceTimersByTime(HOLD_FIRST_REPEAT_MS + HOLD_REPEAT_MS * 5);
      fireEvent.pointerUp(later());
    });

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('says so when an arrow key is let go, which is how a remote adjusts', () => {
    const settled = vi.fn();
    render(<Panel onSettled={settled} />);

    fireEvent.keyDown(later(), { key: 'ArrowRight', bubbles: true });
    fireEvent.keyUp(later(), { key: 'ArrowRight', bubbles: true });

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('says so for Reset and for Sync to this line, which are each one press', () => {
    const settled = vi.fn();
    render(<Panel onSettled={settled} />);

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleSyncToLine'] }));
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTimingReset'] }));

    expect(settled).toHaveBeenCalledTimes(2);
  });

  it('says so for a press that came from a key on a step button', () => {
    const settled = vi.fn();
    render(<Panel onSettled={settled} />);

    fireEvent.click(later());

    expect(settled).toHaveBeenCalledTimes(1);
  });
});
