import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { ACCENT_COLOUR_KEY, UI_LANGUAGE_KEY } from '../../src/settings/client-settings';
import { accentColourFor } from '../../src/settings/accent-colours';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { fakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The settings screen, as a User uses it (#11, stories 112 and 113).
 *
 * The seam is the rendered app: the whole thing, signed in, reached the way a
 * User reaches it. What a colour *is* — that each preset's text reads on it —
 * is `accent-colours.test.ts`; what the store does with a setting is
 * `client-settings.test.ts`. These tests are about the screen turning a press
 * into a change the User can see and the Server keeps.
 *
 * Whether a change really crosses devices is `test/e2e/settings.spec.ts`,
 * where a second browser context signs in with nothing of this one's.
 */

afterEach(async () => {
  // A save is a round trip the screen does not wait for, so one can still be in
  // flight when a test ends; it would otherwise land after the reset below and
  // leak a colour into the next file.
  await savesHaveLanded();
  await resetFakeState();
  // These tests really navigate, so the next one would start on the screen the
  // last one left.
  history.replaceState(null, '', '/');
  // The accent is painted on the root element, which outlives a render.
  document.documentElement.removeAttribute('style');
});

/** Waits until the fake Jellyfin has stopped receiving writes. */
async function savesHaveLanded(): Promise<void> {
  let seen = -1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const writes = await fakeWrites();
    if (writes.length === seen) return;
    seen = writes.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function signInAndLand(): Promise<void> {
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

/** Opens the settings screen from the navigation, the way a User does. */
async function openSettings(name = 'Settings'): Promise<void> {
  fireEvent.click(await screen.findByRole('link', { name }));
  await screen.findByRole('heading', { level: 1, name });
  // The screen waits for the Server before offering a control, so a press can
  // never land on the defaults and save them over what the User really has.
  await waitFor(() => {
    expect(screen.queryByText('Looking for your settings…')).toBeNull();
    expect(screen.queryByText('Buscando tus ajustes…')).toBeNull();
  });
}

/** What the app is actually painted with, which is the point of the setting. */
function paintedAccent(): { colour: string; text: string } {
  const style = document.documentElement.style;
  return {
    colour: style.getPropertyValue('--accent').trim(),
    text: style.getPropertyValue('--accent-text').trim(),
  };
}

/** The settings the fake Jellyfin was last asked to store. */
async function lastSavedPreferences(): Promise<Record<string, string | null>> {
  const writes = await fakeWrites();
  const displayPreferences = writes.filter((write) =>
    write.path.startsWith('/DisplayPreferences'),
  );
  const last = displayPreferences[displayPreferences.length - 1];
  return ((last?.body as { CustomPrefs?: Record<string, string | null> } | undefined)
    ?.CustomPrefs ?? {}) as Record<string, string | null>;
}

describe('a User choosing their Accent Colour', () => {
  it('is offered the presets, with the one they are using marked', async () => {
    await signInAndLand();
    await openSettings();

    // Red until they choose otherwise (story 112).
    expect(screen.getByRole('button', { name: 'Red', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Teal', pressed: false })).toBeTruthy();
  });

  it('sees the app change colour as soon as they press one', async () => {
    await signInAndLand();
    await openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Teal' }));

    const teal = accentColourFor('teal');
    await waitFor(() => {
      expect(paintedAccent()).toEqual({ colour: teal.colour, text: teal.text });
    });
    expect(screen.getByRole('button', { name: 'Teal', pressed: true })).toBeTruthy();
  });

  it('has their choice kept on the Server, so it follows them', async () => {
    await signInAndLand();
    await openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));

    await waitFor(async () => {
      expect((await lastSavedPreferences())[ACCENT_COLOUR_KEY]).toBe('blue');
    });
  });

  it('opens in the colour they chose last time', async () => {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': { [ACCENT_COLOUR_KEY]: 'violet' },
      },
    });

    await signInAndLand();

    const violet = accentColourFor('violet');
    await waitFor(() => {
      expect(paintedAccent().colour).toBe(violet.colour);
    });
  });

  it('is told when the Server would not keep the change', async () => {
    await signInAndLand();
    await openSettings();
    await setFakeState({ failDisplayPreferencesWith: 500 });

    fireEvent.click(screen.getByRole('button', { name: 'Amber' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not save that change to the Server.',
    );
    // And the colour they picked is still what they are looking at: undoing
    // their press as well as failing to save it would be worse.
    expect(paintedAccent().colour).toBe(accentColourFor('amber').colour);
  });
});

describe('a User choosing the language the app is in', () => {
  it('matches their device until they choose otherwise', async () => {
    await signInAndLand();
    await openSettings();

    expect(
      screen.getByRole('button', { name: 'Match my device (English)', pressed: true }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Español', pressed: false })).toBeTruthy();
  });

  it('sees the app in Spanish as soon as they pick it', async () => {
    await signInAndLand();
    await openSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Español' }));

    expect(await screen.findByRole('heading', { name: 'Ajustes', level: 1 })).toBeTruthy();
  });

  it('goes back to their device’s language', async () => {
    await setFakeState({
      displayPreferences: { 'jellyflick|jellyflick|user-rafael': { [UI_LANGUAGE_KEY]: 'es' } },
    });
    await signInAndLand();
    await openSettings('Ajustes');

    fireEvent.click(screen.getByRole('button', { name: 'El de mi dispositivo (English)' }));

    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeTruthy();
    await waitFor(async () => {
      // Stored as "no choice", not as English: a User who later signs in on a
      // Spanish device should get Spanish again.
      expect((await lastSavedPreferences())[UI_LANGUAGE_KEY]).toBe('');
    });
  });

  it('is told plainly that this is Jellyflick’s own setting, not Jellyfin’s', async () => {
    // Jellyfin 12.x has no per-user UI language at all (`decisions.md` §2), so
    // the screen must not suggest that picking one reaches the User's other
    // Jellyfin apps. This is the sentence that says so.
    await signInAndLand();
    await openSettings();

    expect(
      screen.getByText(
        'The language Jellyflick itself is in. Jellyflick keeps this one for you and it follows you to every device, but Jellyfin has no language setting of its own — so your other Jellyfin apps keep their own language.',
      ),
    ).toBeTruthy();
  });
});

describe('the rest of a User’s settings', () => {
  it('reaches the Home Layout editor from here', async () => {
    await signInAndLand();
    await openSettings();

    fireEvent.click(screen.getByRole('link', { name: 'Edit Home' }));

    expect(await screen.findByRole('heading', { name: 'Edit Home', level: 1 })).toBeTruthy();
  });
});
