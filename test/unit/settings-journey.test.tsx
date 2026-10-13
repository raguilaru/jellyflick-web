import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import {
  ACCENT_COLOUR_KEY,
  BILLBOARD_TRAILER_AUTOPLAY_KEY,
  UI_LANGUAGE_KEY,
} from '../../src/settings/client-settings';
import { accentColourFor } from '../../src/settings/accent-colours';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeWrites,
  forgetFakeWrites,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
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

/** The row of languages for the sound, as against the one for the subtitles. */
function audioLanguages(): HTMLElement {
  return screen.getByRole('group', { name: 'Audio language' });
}

/** The `UserConfiguration` the fake Jellyfin was last asked to store. */
async function lastSavedConfiguration(): Promise<Record<string, unknown>> {
  const writes = await fakeWrites();
  const configurations = writes.filter((write) => write.path.startsWith('/Users/Configuration'));
  return (configurations[configurations.length - 1]?.body ?? {}) as Record<string, unknown>;
}

/** Every write to the Client Settings store, which is a different place. */
async function savedPreferenceWrites(): Promise<unknown[]> {
  return (await fakeWrites()).filter((write) => write.path.startsWith('/DisplayPreferences'));
}

/**
 * The Billboard trailer (#16, story 27). One of Jellyflick's own settings, so
 * it lands in Client Settings rather than in the User's Jellyfin account — no
 * other Jellyfin app has a Billboard for it to mean anything to.
 */
describe('a User turning the Billboard trailer off', () => {
  it('is offered it on, which is what Home does out of the box', async () => {
    await signInAndLand();
    await openSettings();

    expect(
      screen.getByRole('button', { name: 'Play it automatically', pressed: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Just show the backdrop', pressed: false }),
    ).toBeTruthy();
  });

  it('has their choice kept in Client Settings, under a key of ours', async () => {
    await signInAndLand();
    await openSettings();
    await forgetFakeWrites();

    fireEvent.click(screen.getByRole('button', { name: 'Just show the backdrop' }));

    await waitFor(async () => {
      expect((await lastSavedPreferences())[BILLBOARD_TRAILER_AUTOPLAY_KEY]).toBe('false');
    });
    expect(
      screen.getByRole('button', { name: 'Just show the backdrop', pressed: true }),
    ).toBeTruthy();
  });

  it('is offered what they chose last time', async () => {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': { [BILLBOARD_TRAILER_AUTOPLAY_KEY]: 'false' },
      },
    });

    await signInAndLand();
    await openSettings();

    expect(
      screen.getByRole('button', { name: 'Just show the backdrop', pressed: true }),
    ).toBeTruthy();
  });
});

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

/**
 * The three Playback Preferences (#35, story 114). These really are Jellyfin's
 * own settings — `UserConfiguration` fields, shared with every other Jellyfin
 * app — which is the opposite case from the UI language above, and the reason
 * the screen has to be careful about which it says about what.
 */
describe('a User choosing what plays', () => {
  it('is offered what their Jellyfin account already says', async () => {
    await setFakeState({
      userConfiguration: {
        'user-rafael': {
          AudioLanguagePreference: 'spa',
          SubtitleMode: 'Always',
          EnableNextEpisodeAutoPlay: false,
        },
      },
    });

    await signInAndLand();
    await openSettings();

    expect(screen.getByRole('button', { name: 'Spanish', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Always', pressed: true })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Ask me each time', pressed: true }),
    ).toBeTruthy();
  });

  it('starts from the Server’s own defaults, not Jellyflick’s opinion', async () => {
    await signInAndLand();
    await openSettings();

    // A new Jellyfin account has no language preference and autoplay on. Saying
    // anything else here would tell a User their account says something it does
    // not — and the Server is where the player will read it from.
    expect(screen.getAllByRole('button', { name: 'No preference', pressed: true })).toHaveLength(2);
    expect(
      screen.getByRole('button', {
        name: 'Whatever the Movie or Episode marks as default',
        pressed: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Start the next one', pressed: true }),
    ).toBeTruthy();
  });

  it('has a choice kept in their Jellyfin configuration, not in Client Settings', async () => {
    await signInAndLand();
    await openSettings();
    // Signing in and opening the screen writes nothing of its own, but earlier
    // tests in this file have: this one is about where *this* press lands.
    await forgetFakeWrites();

    // Both language rows offer the same languages, so a press has to say which
    // row it is in — as a User does by looking at the heading above it.
    fireEvent.click(within(audioLanguages()).getByRole('button', { name: 'Japanese' }));

    await waitFor(async () => {
      expect((await lastSavedConfiguration()).AudioLanguagePreference).toBe('jpn');
    });
    // And nothing went to the Client Settings store: these are different
    // places on the Server and the ticket turns on which one is written.
    expect(await savedPreferenceWrites()).toHaveLength(0);
  });

  it('presses none of its presets for a language it does not offer, and keeps it', async () => {
    // Set in another Jellyfin app, or by a newer Jellyflick. It is the User's
    // preference either way, so this screen shows it as "none of mine" rather
    // than quietly replacing it.
    await setFakeState({
      userConfiguration: { 'user-rafael': { AudioLanguagePreference: 'swe' } },
    });

    await signInAndLand();
    await openSettings();

    expect(audioLanguages().querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);

    // Changing a different setting leaves it exactly as it was.
    fireEvent.click(screen.getByRole('button', { name: 'Always' }));
    await waitFor(async () => {
      expect((await lastSavedConfiguration()).SubtitleMode).toBe('Always');
    });
    expect((await lastSavedConfiguration()).AudioLanguagePreference).toBe('swe');
  });

  it('is told when the Server would not keep the change', async () => {
    await signInAndLand();
    await openSettings();
    await setFakeState({ failUserConfigurationWith: 500 });

    fireEvent.click(screen.getByRole('button', { name: 'Never' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not save that change to the Server.',
    );
    // And their press still shows: undoing it as well as failing to save it
    // would be worse.
    expect(screen.getByRole('button', { name: 'Never', pressed: true })).toBeTruthy();
  });

  it('says plainly that Jellyfin keeps these, which the language setting is not', async () => {
    // The subtlest thing on this screen. #11's language copy says Jellyfin has
    // no language setting of its own, which is true of the language the app is
    // *drawn* in; these four really are `UserConfiguration` fields. Both
    // sentences have to be on the screen at once and neither may make the other
    // read as a lie — so each names what it is about.
    await signInAndLand();
    await openSettings();

    expect(
      screen.getByText(
        'These are kept by Jellyfin on your account, not by Jellyflick, so every Jellyfin app you use follows them — and a change here shows up the next time you play something.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'The language to hear when a Movie or Episode offers more than one. This is the sound, not the language Jellyflick itself is in.',
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
