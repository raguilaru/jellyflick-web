import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { HOVER_CARD_DELAY_MS } from '../../src/home/hover-card';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Resting the pointer on a card on Home (#21, stories 52 and 53).
 *
 * This is the journey through the real app: a real Server behind it, the real
 * Home, and the card's own controls. What it cannot see is everything the
 * enlargement *is* — happy-dom gives every element a zero-sized rectangle — so
 * that it grows, that it stays on the screen and that it fits at 375px are
 * `test/e2e/desktop-hover-cards.spec.ts`.
 *
 * Real timers and the real delay, deliberately: the open is a timer racing a
 * pointer and two reads off the Server, and fake timers interleaved with those
 * promises test the interleaving rather than the behaviour.
 */

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
});

async function signInAndLand() {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
      messages={en}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in as Rafael.');
  await screen.findByRole('list', { name: 'New on Jellyflick' });
}

/** Arrival's card on New on Jellyflick, which is where the pointer rests. */
function arrivalCard(): HTMLElement {
  return screen
    .getByRole('list', { name: 'New on Jellyflick' })
    .querySelector('[aria-label="Arrival"]') as HTMLElement;
}

/**
 * Whether this is the card the pointer is resting on, which is what makes it
 * the enlarged one. The attribute is the card's own, written by the panel
 * inside it, and `base.css` is what grows the card it is on — happy-dom has no
 * layout, so the attribute is as far as a unit test can follow it.
 */
function isEnlarged(card: HTMLElement): boolean {
  return card.hasAttribute('data-resting');
}

/**
 * Rests the pointer on a card and waits for the card to enlarge.
 *
 * The pointer is put back on the card on every attempt, which is the point
 * rather than belt-and-braces. A Row appears before the panels inside it have
 * attached themselves to their cards, and a Row that has just landed is also
 * about to re-render — the Title Labels and My List both arrive after it. A
 * real pointer is moving and so enters the card again by itself; a test fires
 * `mouseenter` exactly once and can fire it into the gap. `my-list.spec.ts`
 * records the same lesson for the same Row.
 */
async function restOn(card: HTMLElement): Promise<void> {
  await waitFor(
    () => {
      fireEvent.mouseEnter(card);
      expect(isEnlarged(card)).toBe(true);
    },
    { timeout: HOVER_CARD_DELAY_MS + 4_000, interval: HOVER_CARD_DELAY_MS + 100 },
  );
}

describe('a User resting the pointer on a card on Home', () => {
  it('sees the age rating, the length and the genres once the card enlarges', async () => {
    await signInAndLand();

    await restOn(arrivalCard());

    // Arrival on the sample Server: PG-13, 116 minutes, two genres.
    expect(await screen.findByText('PG-13')).toBeTruthy();
    expect(screen.getByText('1h 56m')).toBeTruthy();
    expect(screen.getByText('Science Fiction, Drama')).toBeTruthy();
  });

  it('says none of that until the pointer has actually rested there', async () => {
    await signInAndLand();

    // The Row is drawn and nothing is hovered: no card has read its own
    // details, which is what keeps a Row of twenty cards from asking the
    // Server twenty questions — and, through `ExtraRatings`, from burning
    // MDBList's thousand requests a day on a User scrolling past.
    expect(screen.queryByText('PG-13')).toBeNull();
    expect(screen.queryByText('1h 56m')).toBeNull();
  });

  it('does not enlarge a card the pointer only passed over', async () => {
    await signInAndLand();
    const card = arrivalCard();

    // Straight across it, which is what scrolling a Row quickly looks like:
    // in and out again well inside the delay (story 53).
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);

    await new Promise((resolve) => setTimeout(resolve, HOVER_CARD_DELAY_MS + 200));
    expect(isEnlarged(card)).toBe(false);
    expect(screen.queryByText('PG-13')).toBeNull();
  });

  it('closes the enlarged card again when the pointer leaves', async () => {
    await signInAndLand();
    const card = arrivalCard();
    await restOn(card);

    fireEvent.mouseLeave(card);

    await waitFor(() => {
      expect(isEnlarged(card)).toBe(false);
    });
    expect(screen.queryByText('1h 56m')).toBeNull();
  });

  it('offers Play, My List and More info on the card it has enlarged', async () => {
    await signInAndLand();

    await restOn(arrivalCard());

    // Each one named after its own Title: a Row of twenty cards would
    // otherwise be twenty buttons called "Play".
    expect(screen.getByRole('button', { name: 'Play Arrival' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Arrival to My List' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More info about Arrival' })).toBeTruthy();
  });
});

describe('the buttons on an enlarged card', () => {
  it('opens the Title’s page from More info', async () => {
    await signInAndLand();
    await restOn(arrivalCard());

    fireEvent.click(screen.getByRole('button', { name: 'More info about Arrival' }));

    expect(await screen.findByRole('heading', { name: 'Arrival', level: 1 })).toBeTruthy();
  });

  it('puts the Title in My List, and the same card then offers to take it out', async () => {
    await signInAndLand();
    await restOn(arrivalCard());

    fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to My List' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Remove Arrival from My List' }).length).toBeGreaterThan(0);
    });
  });

  it('plays the Title without opening its page, which is what the card is for', async () => {
    await signInAndLand();
    const card = arrivalCard();
    await restOn(card);

    fireEvent.click(screen.getByRole('button', { name: 'Play Arrival' }));

    // The player over Home, and Home still underneath it: story 52 is about
    // acting on a Title *without* opening the title page.
    expect(await screen.findByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
    expect(screen.getByText('Signed in as Rafael.')).toBeTruthy();
    // And the card it was pressed on has let go: the player covers the screen,
    // so an enlarged card behind it is a second "Play Arrival" in the document
    // that nobody can see.
    expect(isEnlarged(card)).toBe(false);
  });

  it('plays nothing on the card until Play is pressed, so hover stays quiet', async () => {
    await signInAndLand();
    const card = arrivalCard();

    await restOn(card);

    // Story 53: no video on the card. Not a paused one, not a muted one —
    // none. Scoped to the card because the Billboard above it has a trailer of
    // its own, which is #16's and a thing the User did not ask for either.
    expect(card.querySelectorAll('video').length).toBe(0);
  });
});
