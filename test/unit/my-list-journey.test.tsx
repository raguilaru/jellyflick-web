import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * A User managing My List: adding a Title from a card, finding it in the Row on
 * Home and on the My List page, and taking it out again.
 *
 * What a browser is needed for — hover, and the arrow keys over the page's grid
 * — is in `test/e2e/my-list.spec.ts`. happy-dom gives every element a
 * zero-sized rectangle, so nothing here can be about layout.
 */

afterEach(resetFakeState);

// The window's history outlives a test, and a test that navigated to the My
// List page would otherwise start the next one there instead of on Home.
beforeEach(() => {
  window.history.replaceState(null, '', '/');
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
}

/** The names on one Row's cards, in the order they are shown. */
function cardNames(rowName: string): string[] {
  const row = screen.getByRole('list', { name: rowName });
  return Array.from(row.querySelectorAll('.card__name')).map((name) => name.textContent ?? '');
}

describe('a User managing My List', () => {
  it('has no My List Row on Home until something is in the list', async () => {
    await signInAndLand();

    await screen.findByRole('list', { name: 'New on Jellyflick' });
    expect(screen.queryByRole('list', { name: 'My List' })).toBeNull();
  });

  it('sees a Title added from a card on Home appear in the My List Row', async () => {
    await signInAndLand();
    await screen.findByRole('list', { name: 'New on Jellyflick' });

    fireEvent.click(await screen.findByRole('button', { name: 'Add Arrival to My List' }));

    await waitFor(() => expect(cardNames('My List')).toEqual(['Arrival']));
    // And the card now offers the other half of the toggle.
    expect(screen.queryByRole('button', { name: 'Add Arrival to My List' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Remove Arrival from My List' }).length).toBe(2);
  });

  it('sees My List on its own page, in the Server’s order', async () => {
    await setFakeState({
      favourites: { 'user-rafael': ['movie-heat', 'series-bluey', 'movie-arrival'] },
    });
    await signInAndLand();

    fireEvent.click(screen.getByRole('link', { name: 'My List' }));

    await waitFor(() => expect(cardNames('My List')).toEqual(['Arrival', 'Bluey', 'Heat']));
    expect(await screen.findByRole('heading', { name: 'My List', level: 1 })).toBeTruthy();
  });

  it('can take a Title out from its page, and it goes at once', async () => {
    await setFakeState({ favourites: { 'user-rafael': ['movie-heat', 'movie-arrival'] } });
    await signInAndLand();
    fireEvent.click(screen.getByRole('link', { name: 'My List' }));
    await waitFor(() => expect(cardNames('My List')).toEqual(['Arrival', 'Heat']));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Heat from My List' }));

    expect(cardNames('My List')).toEqual(['Arrival']);
  });

  it('is told plainly when there is nothing in My List yet', async () => {
    await signInAndLand();

    fireEvent.click(screen.getByRole('link', { name: 'My List' }));

    expect(
      await screen.findByText('Nothing is in My List yet. Add a Title from any Row to find it here.'),
    ).toBeTruthy();
  });

  it('is told plainly when the Server will not say what is in My List', async () => {
    await setFakeState({ failFavouriteQueriesWith: 500 });
    await signInAndLand();

    fireEvent.click(screen.getByRole('link', { name: 'My List' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not read My List from the Server.',
    );
  });

  it('is told when the Server would not save a change, and sees it undone', async () => {
    await setFakeState({
      favourites: { 'user-rafael': ['movie-heat'] },
      failFavouriteWritesWith: 500,
    });
    await signInAndLand();
    fireEvent.click(screen.getByRole('link', { name: 'My List' }));
    await waitFor(() => expect(cardNames('My List')).toEqual(['Heat']));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Heat from My List' }));

    expect(
      await screen.findByText('Jellyflick could not save that change on the Server.'),
    ).toBeTruthy();
    expect(cardNames('My List')).toEqual(['Heat']);
  });
});
