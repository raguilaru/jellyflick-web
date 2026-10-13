import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { fakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Opening a title page and what it offers: pressing a card on Home, the address
 * it has of its own, Back, My List and marking a Title watched.
 *
 * This is the journey through `<App>`, so it covers the whole chain a card press
 * goes through — the Row's handler, the address, the gateway, the catalogue and
 * the screen. What needs a browser — the pop-up at a wide pointer against the
 * full page on a phone, and the arrow keys over a laid-out page — is in
 * `test/e2e/the-title-page.spec.ts`: happy-dom gives every element a zero-sized
 * rectangle and has no pointer at all.
 */

afterEach(resetFakeState);

beforeEach(async () => {
  // The window's history outlives a test, so a test that opened a title page
  // would otherwise start the next one there instead of on Home.
  window.history.replaceState(null, '', '/');
  await resetFakeState();
});

/**
 * Signs Rafael in without saying where that lands: the shell shows whatever the
 * address asks for, which for a title page opened directly is not Home.
 */
async function signIn(): Promise<void> {
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
}

async function signInAndLand() {
  await signIn();
  await screen.findByText('Signed in as Rafael.');
}

/** Presses a card on one of Home's Rows, the way Enter and a click both do. */
function pressCard(rowName: string, name: string): void {
  const row = screen.getByRole('list', { name: rowName });
  const cards = Array.from(row.querySelectorAll('.card'));
  const card = cards.find((candidate) => candidate.getAttribute('aria-label') === name);
  if (card === undefined) throw new Error(`No card for ${name} on the ${rowName} Row.`);
  fireEvent.click(card);
}

/** Opens Arrival's title page from Home, which is how a User gets to one. */
async function openArrival(): Promise<void> {
  await signInAndLand();
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Arrival');
  await screen.findByRole('heading', { name: 'Arrival', level: 1 });
}

describe('a User opening a title page', () => {
  it('opens it by pressing a card on Home, at an address of its own', async () => {
    await openArrival();

    expect(window.location.pathname).toBe('/title/movie-arrival');
  });

  it('shows what the Server knows about the Title', async () => {
    await openArrival();

    // Year, age rating and length, which the Server sends unasked.
    expect(screen.getByText('2016')).toBeTruthy();
    expect(screen.getByText('PG-13')).toBeTruthy();
    expect(screen.getByText('1h 56m')).toBeTruthy();
    // Genres, the description and the cast.
    expect(screen.getByText('Science Fiction, Drama')).toBeTruthy();
    expect(screen.getByText('A linguist is asked to talk to the visitors.')).toBeTruthy();
    expect(screen.getByText('Amy Adams, Jeremy Renner')).toBeTruthy();
    // The ratings, each said as what it is rather than as a bare number.
    expect(screen.getByText('94% critics')).toBeTruthy();
    expect(screen.getByText('7.9 from the community')).toBeTruthy();
    // The languages there are to watch and read it in.
    expect(screen.getByText('English, French')).toBeTruthy();
    expect(screen.getByText('English, Spanish')).toBeTruthy();
    // The Collection it belongs to, which is `/Items/{id}/Collections`.
    expect(screen.getByText('Crime Classics')).toBeTruthy();
    // And a Play button, for the player tickets to wire up.
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('leaves out every rating and field the Server did not send', async () => {
    await signInAndLand();
    await screen.findByRole('list', { name: 'New on Jellyflick' });

    pressCard('New on Jellyflick', 'The Unfinished');
    await screen.findByRole('heading', { name: 'The Unfinished', level: 1 });

    // The Unfinished has no year, no length, no overview, no cast and no
    // ratings at all, and none of them is shown as an empty label or a zero.
    expect(screen.queryByText('critics', { exact: false })).toBeNull();
    expect(screen.queryByText('from the community', { exact: false })).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText(en['title.cast'])).toBeNull();
    expect(screen.queryByText(en['title.audio'])).toBeNull();
    // What it does have is still there.
    expect(screen.getByText('Drama')).toBeTruthy();
  });

  it('still shows the page when the extra ratings cannot be read at all', async () => {
    // There is no container behind this test, so the ratings route (#20) is not
    // there to answer: the page must come up with the Server's own two ratings
    // and simply nothing extra. Story 80 treats MDBList as an optional extra,
    // and story 81 leaves a missing rating out rather than saying anything.
    await openArrival();

    expect(screen.getByText('94% critics')).toBeTruthy();
    expect(screen.getByText('7.9 from the community')).toBeTruthy();
    expect(screen.queryByRole('list', { name: en['ratings.heading'] })).toBeNull();
  });

  it('shows More like this, and opens another title page from it', async () => {
    await openArrival();

    const row = screen.getByRole('list', { name: 'More like this' });
    expect(
      Array.from(row.querySelectorAll('.card__name')).map((name) => name.textContent),
    ).toEqual(['Severance', 'Heat']);

    pressCard('More like this', 'Heat');
    await screen.findByRole('heading', { name: 'Heat', level: 1 });
    expect(window.location.pathname).toBe('/title/movie-heat');
  });

  it('closes on Back, which is where the card was pressed', async () => {
    await openArrival();

    window.history.back();

    await screen.findByRole('list', { name: 'New on Jellyflick' });
    expect(window.location.pathname).toBe('/');
    // The page itself is gone. Asserted on the page's own sheet rather than on
    // "no level-1 heading named Arrival": since #16 Home has a heading of its
    // own — the Billboard's featured Title — which may be this one.
    expect(document.querySelector('.title__sheet')).toBeNull();
  });

  it('adds the Title to My List, and the Row on Home has it', async () => {
    await openArrival();

    fireEvent.click(screen.getByRole('button', { name: 'Add Arrival to My List' }));
    await screen.findByRole('button', { name: 'Remove Arrival from My List' });

    // Back to Home, where the one My List store has already heard about it.
    window.history.back();
    const row = await screen.findByRole('list', { name: 'My List' });
    expect(
      Array.from(row.querySelectorAll('.card__name')).map((name) => name.textContent),
    ).toEqual(['Arrival']);
  });

  it('marks the Title watched and unwatched, and tells the Server', async () => {
    await openArrival();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Arrival as watched' }));
    await screen.findByRole('button', { name: 'Mark Arrival as not watched' });

    fireEvent.click(screen.getByRole('button', { name: 'Mark Arrival as not watched' }));
    await screen.findByRole('button', { name: 'Mark Arrival as watched' });

    await waitFor(async () => {
      const writes = await fakeWrites();
      expect(
        writes
          .filter((write) => write.path.startsWith('/UserPlayedItems/'))
          .map((write) => [write.method, write.path]),
      ).toEqual([
        ['POST', '/UserPlayedItems/movie-arrival'],
        ['DELETE', '/UserPlayedItems/movie-arrival'],
      ]);
    });
  });

  it('starts out watched when the Server says the User has watched it', async () => {
    await setFakeState({ played: { 'user-rafael': ['movie-arrival'] } });

    await openArrival();

    expect(screen.getByRole('button', { name: 'Mark Arrival as not watched' })).toBeTruthy();
  });

  it('says so for an address that is not a Title the app shows', async () => {
    // The "only Movies and Series" rule lives in the gateway, so a hand-typed
    // address for an Episode answers with nothing rather than with a page.
    window.history.replaceState(null, '', '/title/episode-bluey-s2e3');
    await signIn();

    expect(await screen.findByText(en['title.notFound'])).toBeTruthy();
  });

  it('says so when the Server will not say anything about the Title', async () => {
    await setFakeState({ failLibraryQueriesWith: 503 });
    window.history.replaceState(null, '', '/title/movie-arrival');
    await signIn();

    expect(await screen.findByText(en['title.unavailable'])).toBeTruthy();
  });
});
