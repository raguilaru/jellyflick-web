import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { Row, type RowCard } from '../../src/home/row';

/**
 * A Row as a focus stop: which of its cards the keyboard reaches, and what
 * happens when one is pressed.
 *
 * Each Row has exactly one tab stop — the card focus was last on — so Tab steps
 * from Row to Row rather than through twenty cards, and so arrow keys arriving
 * from another Row land where they left off (story 65). Which card the arrows
 * pick inside a Row is geometry, and is covered in a browser:
 * `test/e2e/arrow-key-navigation.spec.ts`.
 */

const CARDS: readonly RowCard[] = [
  { titleId: 'bluey', kind: 'Movie' as const, name: 'Bluey' },
  { titleId: 'severance', kind: 'Movie' as const, name: 'Severance' },
  { titleId: 'arrival', kind: 'Movie' as const, name: 'Arrival' },
];

function card(name: string): HTMLElement {
  return screen.getByRole('listitem', { name });
}

/** The card in a Row that Tab reaches: the one it remembers. */
function tabStopIn(heading: string): string | undefined {
  const strip = screen.getByRole('list', { name: heading });
  const stop = strip.querySelector('[tabindex="0"]');
  return stop?.getAttribute('aria-label') ?? undefined;
}

describe('a Row remembering where focus was', () => {
  it('offers its first card to the keyboard before anything has been focused', () => {
    render(<Row heading="New on Jellyflick" cards={CARDS} />);

    expect(tabStopIn('New on Jellyflick')).toBe('Bluey');
    // And the rest are reachable by the arrow keys only, not by Tab.
    expect(card('Severance').getAttribute('tabindex')).toBe('-1');
    expect(card('Arrival').getAttribute('tabindex')).toBe('-1');
  });

  it('remembers the card focus moved to', async () => {
    render(<Row heading="New on Jellyflick" cards={CARDS} />);

    card('Arrival').focus();

    await waitFor(() => {
      expect(tabStopIn('New on Jellyflick')).toBe('Arrival');
    });
    expect(card('Bluey').getAttribute('tabindex')).toBe('-1');
  });

  it('remembers one card per Row, not one for the screen', async () => {
    render(
      <div>
        <Row heading="New on Jellyflick" cards={CARDS} />
        <Row heading="My List" cards={CARDS} />
      </div>,
    );

    const myList = screen.getByRole('list', { name: 'My List' });
    (myList.querySelectorAll('[aria-label="Severance"]')[0] as HTMLElement).focus();

    await waitFor(() => {
      expect(tabStopIn('My List')).toBe('Severance');
    });
    expect(tabStopIn('New on Jellyflick')).toBe('Bluey');
  });

  it('falls back to its first card when the Row it remembered into has shrunk', async () => {
    const { rerender } = render(<Row heading="New on Jellyflick" cards={CARDS} />);
    card('Arrival').focus();
    await waitFor(() => {
      expect(tabStopIn('New on Jellyflick')).toBe('Arrival');
    });

    rerender(<Row heading="New on Jellyflick" cards={[CARDS[0] as RowCard]} />);

    expect(tabStopIn('New on Jellyflick')).toBe('Bluey');
  });

  it('presses the card that was pressed, and no other', () => {
    const pressed = vi.fn();
    render(<Row heading="New on Jellyflick" cards={CARDS} onCardPress={pressed} />);

    fireEvent.click(card('Severance'));

    expect(pressed).toHaveBeenCalledTimes(1);
    expect(pressed).toHaveBeenCalledWith(CARDS[1]);
  });
});
