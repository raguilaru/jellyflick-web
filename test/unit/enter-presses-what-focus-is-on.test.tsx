import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { Row, type RowCard } from '../../src/home/row';
import { useSpatialNavigation } from '../../src/navigation/spatial-navigation';
import { testDeviceLayer } from '../device/profiles';

/**
 * Enter, and the keys the app has to keep its hands off.
 *
 * "Every screen fully usable with only arrow keys, Enter and Back" (story 64)
 * puts Enter in the same place as the arrows: one handler, reading the device
 * layer's logical keys, so a TV remote's Enter needs no second path. A card is
 * a focus stop rather than a button, so Enter has to press it; a real button or
 * link is the browser's own job and must not be pressed twice.
 *
 * Where focus *moves* is geometry, and happy-dom gives every element a
 * zero-sized rectangle, so that half is covered in a browser:
 * `test/e2e/arrow-key-navigation.spec.ts`.
 */

const CARDS: readonly RowCard[] = [
  { titleId: 'bluey', kind: 'Movie' as const, name: 'Bluey' },
  { titleId: 'severance', kind: 'Movie' as const, name: 'Severance' },
];

/** A screen with the navigation installed, as the app installs it once. */
function Screen({ onCardPress }: { onCardPress?: (card: RowCard) => void }) {
  useSpatialNavigation(testDeviceLayer());
  return (
    <div>
      <button type="button" onClick={onCardPress && (() => onCardPress(CARDS[0] as RowCard))}>
        Play
      </button>
      <label>
        Search
        <input type="text" />
      </label>
      <Row heading="New on Jellyflick" cards={CARDS} {...(onCardPress ? { onCardPress } : {})} />
    </div>
  );
}

/** Longer than Preact's own after-paint timeout, so the listener is really on. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 150);
  });
}

function press(key: string, target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('Enter, and the keys that are not the app’s', () => {
  it('presses the card focus is on', async () => {
    const pressed = vi.fn();
    render(<Screen onCardPress={pressed} />);
    await afterPaint();

    screen.getByRole('listitem', { name: 'Severance' }).focus();
    press('Enter');

    expect(pressed).toHaveBeenCalledTimes(1);
    expect(pressed).toHaveBeenCalledWith(CARDS[1]);
  });

  it('leaves a button or a link to the browser, so Enter never presses it twice', async () => {
    const pressed = vi.fn();
    render(<Screen onCardPress={pressed} />);
    await afterPaint();

    screen.getByRole('button', { name: 'Play' }).focus();
    const event = press('Enter');

    // The browser presses a focused button on Enter by itself. happy-dom does
    // not, which is exactly why a second press here would be invisible in a
    // browser and doubled in the app.
    expect(pressed).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the arrow keys to a field the User is typing in', async () => {
    render(<Screen />);
    await afterPaint();

    const field = screen.getByLabelText('Search');
    field.focus();

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      expect(press(key, field).defaultPrevented, key).toBe(false);
    }
  });
});
