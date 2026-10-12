import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { BILLBOARD_TRAILER_DELAY_MS } from '../../src/home/billboard';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * A User landing on Home and being offered one Title to watch (#16, stories 22
 * to 33).
 *
 * The draw is fixed through the device layer, which is what makes "Spotlight
 * featured Arrival" something a test can say at all. Of the sample library's
 * three Titles with a backdrop — Arrival, Paddington and Severance in the
 * Server's name order, weighing 4, 1 and 4 — a draw of 0 features Arrival, 0.5
 * features Paddington, which has no logo, and 0.9 features Severance.
 *
 * What a browser is needed for — a real decode, the backdrop filling the
 * screen — is `test/e2e/the-billboard.spec.ts`.
 */

/** The draws that feature each of the three, given the weights above. */
const FEATURES_ARRIVAL = 0;
const FEATURES_PADDINGTON = 0.5;
const FEATURES_SEVERANCE = 0.9;

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
});

async function signInAndLand(draw: number): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({
        storage: inMemoryDeviceStorage(),
        randomSequence: [draw],
      })}
      messages={en}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in as Rafael.');
}

/** The Billboard itself, once Spotlight has picked something to feature. */
async function billboard(): Promise<HTMLElement> {
  return await screen.findByRole('region', { name: 'Featured' });
}

/**
 * The name of the Title the Billboard is featuring, however it is drawn: the
 * heading holds either the Title's logo, which names it through `alt`, or its
 * name as text.
 */
async function featuredTitle(): Promise<string> {
  const heading = await screen.findByRole('heading', { level: 1 });
  const logo = heading.querySelector('img');
  return logo === null ? (heading.textContent ?? '') : (logo.getAttribute('alt') ?? '');
}

/** Long enough for the trailer's delay to have passed, and then some. */
const PAST_THE_DELAY = BILLBOARD_TRAILER_DELAY_MS + 2000;

/** Waits out the trailer's delay, for asserting that nothing starts. */
async function waitOutTheDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, BILLBOARD_TRAILER_DELAY_MS + 200));
}

describe('a User landing on Home', () => {
  it('is offered one Title at the top of Home', async () => {
    await signInAndLand(FEATURES_ARRIVAL);

    expect(await featuredTitle()).toBe('Arrival');
  });

  it('sees the Title’s backdrop behind it', async () => {
    await signInAndLand(FEATURES_ARRIVAL);

    const backdrop = (await billboard()).querySelector('.billboard__backdrop');
    expect(backdrop?.getAttribute('src')).toBe(
      `${fakeJellyfinUrl()}/Items/movie-arrival/Images/Backdrop?tag=tag-arrival-backdrop&maxWidth=1920`,
    );
  });

  it('sees the Title’s logo in place of its name', async () => {
    await signInAndLand(FEATURES_ARRIVAL);

    const logo = (await billboard()).querySelector('.billboard__logo');
    expect(logo?.getAttribute('src')).toBe(
      `${fakeJellyfinUrl()}/Items/movie-arrival/Images/Logo?tag=tag-arrival-logo&maxWidth=600`,
    );
    // The logo is the heading, so the Title is still named for a screen reader.
    expect(logo?.getAttribute('alt')).toBe('Arrival');
  });

  it('sees the Title’s name in the logo font when the Server has no logo', async () => {
    await signInAndLand(FEATURES_PADDINGTON);

    expect(await featuredTitle()).toBe('Paddington');
    const board = await billboard();
    expect(board.querySelector('.billboard__logo')).toBeNull();
    // Drawn as the wordmark is, which is what makes it stand in for a logo
    // rather than look like a heading that failed to load.
    expect(board.querySelector('.billboard__name')).not.toBeNull();
  });

  it('sees the short description and the age rating', async () => {
    await signInAndLand(FEATURES_ARRIVAL);

    const board = await billboard();
    expect(board.textContent).toContain('A linguist is asked to talk to the visitors.');
    expect(board.textContent).toContain('PG-13');
  });

  it('is offered Play and More info', async () => {
    await signInAndLand(FEATURES_ARRIVAL);

    const board = await billboard();
    expect(board.querySelector('.billboard__play')).not.toBeNull();
    expect(board.querySelector('.billboard__more-info')).not.toBeNull();
  });

  it('opens the Title’s page from More info', async () => {
    await signInAndLand(FEATURES_ARRIVAL);
    const board = await billboard();

    fireEvent.click(board.querySelector('.billboard__more-info') as HTMLElement);

    // The title page is its own address, so Home is gone and the page is there.
    await waitFor(() => {
      expect(window.location.pathname).toBe('/title/movie-arrival');
    });
  });

  it('keeps the same Title on coming back from its title page', async () => {
    // Story 31: the Billboard must not change behind the User's back. The
    // device layer answers the same draw every time here, so the proof is that
    // the Server is not asked again at all — a second read would re-pick on a
    // real device layer.
    await signInAndLand(FEATURES_ARRIVAL);
    const board = await billboard();
    fireEvent.click(board.querySelector('.billboard__more-info') as HTMLElement);
    await screen.findByRole('heading', { name: 'Arrival', level: 1 });

    window.history.back();

    await screen.findByText('Signed in as Rafael.');
    expect(await featuredTitle()).toBe('Arrival');
  });

  it('shows nothing rather than an empty Billboard when no Title has a backdrop', async () => {
    await setFakeState({
      items: [
        {
          Id: 'movie-plain',
          Name: 'A Plain Film',
          Type: 'Movie',
          DateCreated: '2026-06-01T09:00:00Z',
          libraryId: 'lib-movies',
        },
      ],
    });

    await signInAndLand(FEATURES_ARRIVAL);

    // Home carries on to its Rows: a library with nothing to feature is an
    // ordinary state and not worth a notice on every visit.
    await screen.findByText('Signed in as Rafael.');
    expect(screen.queryByRole('region', { name: 'Featured' })).toBeNull();
    expect(screen.queryAllByRole('heading', { level: 1 })).toEqual([]);
  });

  it('is told plainly when the Server will not say what to feature', async () => {
    await setFakeState({ failLibraryQueriesWith: 500 });

    await signInAndLand(FEATURES_ARRIVAL);

    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
        'Jellyflick could not read a Title to feature from the Server.',
      ),
    );
  });
});

describe('the Billboard’s trailer', () => {
  it('plays the Title’s local trailer, muted, once the delay has passed', async () => {
    await signInAndLand(FEATURES_ARRIVAL);
    await billboard();

    const video = await waitFor(
      () => {
        const found = document.querySelector('.billboard__trailer');
        if (found === null) throw new Error('No trailer yet.');
        return found as HTMLVideoElement;
      },
      { timeout: PAST_THE_DELAY },
    );

    // Muted, because a Home that made noise by itself would be unusable.
    expect(video.muted).toBe(true);
    // The trailer's own item, negotiated like any other playback.
    await waitFor(() => {
      expect(video.getAttribute('src')).toContain('trailer-arrival');
    });
  });

  it('can be unmuted and muted again', async () => {
    await signInAndLand(FEATURES_ARRIVAL);
    await billboard();
    await screen.findByRole(
      'button',
      { name: 'Unmute the trailer' },
      { timeout: PAST_THE_DELAY },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unmute the trailer' }));

    const video = document.querySelector('.billboard__trailer') as HTMLVideoElement;
    expect(video.muted).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: 'Mute the trailer' }));
    expect(video.muted).toBe(true);
  });

  it('can be paused', async () => {
    await signInAndLand(FEATURES_ARRIVAL);
    await billboard();

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Pause the trailer' },
        { timeout: PAST_THE_DELAY },
      ),
    );

    const video = document.querySelector('.billboard__trailer') as HTMLVideoElement;
    expect(video.paused).toBe(true);
    expect(await screen.findByRole('button', { name: 'Play the trailer' })).toBeTruthy();
  });

  it('shows only the backdrop for a Title with no trailer beside it', async () => {
    // Story 25: Paddington has no local trailer, so there is no empty player.
    await signInAndLand(FEATURES_PADDINGTON);
    await billboard();
    expect(await featuredTitle()).toBe('Paddington');

    // Waited out rather than checked at once: the point is that nothing starts
    // *later* either.
    await waitOutTheDelay();

    expect(screen.queryByRole('button', { name: 'Unmute the trailer' })).toBeNull();
    expect(document.querySelector('.billboard__trailer')).toBeNull();
  });

  it('is not played at all for a User who turned autoplay off', async () => {
    // Story 27, through the Client Setting the settings screen writes.
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': { 'jf.billboardTrailerAutoplay': 'false' },
      },
    });

    await signInAndLand(FEATURES_ARRIVAL);
    await billboard();
    expect(await featuredTitle()).toBe('Arrival');

    await waitOutTheDelay();

    expect(screen.queryByRole('button', { name: 'Unmute the trailer' })).toBeNull();
    expect(document.querySelector('.billboard__trailer')).toBeNull();
  });

  it('features the Title the draw chose whichever it is', async () => {
    await signInAndLand(FEATURES_SEVERANCE);

    expect(await featuredTitle()).toBe('Severance');
  });
});
