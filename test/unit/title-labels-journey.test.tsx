import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import type { Messages } from '../../src/i18n/index';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * What a User actually sees of #14: the label on the card, on a real Home
 * reading the sample library through the fake Jellyfin.
 *
 * The device layer's clock is fixed at 2026-06-15T12:00:00Z, which the sample
 * library is dated around, so what each Title has to say about itself is a
 * fact of the sample data rather than of the day the suite runs.
 */

afterEach(resetFakeState);

async function signInAndLand(messages: Messages = en, language = 'en') {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({
        storage: inMemoryDeviceStorage(),
        // The language the app is drawn in is the device's until the User
        // chooses one, so this is how a Spanish-speaking household arrives.
        preferredLanguages: [language],
      })}
      messages={messages}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText(messages['signIn.passwordLabel']), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: messages['signIn.submit'] }));
  await screen.findByText(messages['home.signedInAs']({ name: 'Rafael' }));
}

/** The label on one card, or nothing when that Title has none. */
function labelOn(name: string): string | undefined {
  const card = screen.getByRole('listitem', { name });
  return card.querySelector('.card__label')?.textContent ?? undefined;
}

describe('a User browsing Home', () => {
  it('sees what is new about each Title on its card art', async () => {
    await signInAndLand();

    // Waits for the labels, which are a read of their own behind the Row.
    await waitFor(() => expect(labelOn('Paddington')).toBe('Recently Added'));

    expect(labelOn('Arrival')).toBe('Recently Added');
    // A Season of Severance arrived six days ago; the Series is from February.
    expect(labelOn('Severance')).toBe('New Season');
    // Two Episodes of Bluey yesterday, and no new Season of it.
    expect(labelOn('Bluey')).toBe('New Episodes');
  });

  it('sees nothing on a Title that has not changed in a month', async () => {
    await signInAndLand();

    await waitFor(() => expect(labelOn('Paddington')).toBe('Recently Added'));

    // A fortnight and three hours old, so just outside the window.
    expect(labelOn('Heat')).toBeUndefined();
    expect(labelOn('The Unfinished')).toBeUndefined();
  });

  it('reads the label in the language the app is in', async () => {
    await signInAndLand(es, 'es');

    await waitFor(() => expect(labelOn('Severance')).toBe('Nueva temporada'));
  });

  it('is shown its Titles as usual when the Server will not say what is new', async () => {
    await setFakeState({ failLibraryQueriesWith: 503 });

    await signInAndLand();

    // The Row itself says the Server would not answer; what matters here is
    // that a label nobody could read is not a second problem on the screen.
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not read what is new from the Server.',
    );
    expect(document.querySelector('.card__label')).toBeNull();
  });
});
