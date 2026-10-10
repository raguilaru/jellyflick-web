import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

afterEach(resetFakeState);

/** Signs Rafael in and waits for Home, which is where the Row lives. */
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

/** The names on the Row's cards, in the order they are shown. */
function cardNames(): string[] {
  const row = screen.getByRole('list', { name: 'New on Jellyflick' });
  return Array.from(row.querySelectorAll('.card__name')).map((name) => name.textContent ?? '');
}

describe('a User landing on Home', () => {
  it('is shown the newest Titles across all libraries, newest first', async () => {
    await signInAndLand();

    await waitFor(() =>
      expect(cardNames()).toEqual([
        'Bluey',
        'Severance',
        'Paddington',
        'Arrival',
        'Heat',
        'The Unfinished',
      ]),
    );
  });

  it('is shown each Title by its artwork and its name', async () => {
    await signInAndLand();

    // A Series shows the Series' artwork, not the Episode's that was added.
    const bluey = await screen.findByRole('listitem', { name: 'Bluey' });
    expect(bluey.querySelector('img')?.getAttribute('src')).toBe(
      `${fakeJellyfinUrl()}/Items/series-bluey/Images/Primary?tag=tag-bluey&maxWidth=400`,
    );

    // The Unfinished has no artwork on the Server, so its name stands in for it.
    const unfinished = screen.getByRole('listitem', { name: 'The Unfinished' });
    expect(unfinished.querySelector('img')).toBeNull();
    expect(unfinished.textContent).toContain('The Unfinished');
  });

  it('sees the Row under its own heading', async () => {
    await signInAndLand();

    expect(
      await screen.findByRole('heading', { name: 'New on Jellyflick', level: 2 }),
    ).toBeTruthy();
  });

  it('is told plainly when the Server will not say what is new', async () => {
    await setFakeState({ failLibraryQueriesWith: 500 });

    await signInAndLand();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not read what is new from the Server.',
    );
  });

  it('is told the libraries are empty rather than shown an empty Row', async () => {
    await setFakeState({ items: [] });

    await signInAndLand();

    expect(
      await screen.findByText('Nothing has been added to your libraries yet.'),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'New on Jellyflick' })).toBeNull();
  });
});
