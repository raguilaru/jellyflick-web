import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { ACCENT_COLOUR_KEY } from '../../src/settings/client-settings';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeState,
  forgetFakeWrites,
  resetFakeState,
  savesHaveSettled,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The guard itself, held against the failure it exists for (#46).
 *
 * `savesHaveSettled` is an `afterEach` line in five other files, and an
 * `afterEach` line that never changed anything is indistinguishable from one
 * that did. So this file reproduces the leak on purpose and is the one place
 * that would go red if the guard stopped working.
 *
 * **The shape of the leak.** A Client Settings save is written behind the
 * User: the screen shows the change at once and the round trip happens after
 * it. Each save is a read-modify-write — two round trips — and
 * `SettingsProvider` chains them so a later change never overwrites an earlier
 * one. A handful of quick presses is therefore a queue of saves that is still
 * draining when the test that made them ends, while the reseed in `afterEach`
 * is a single round trip that walks straight past it. Whatever is still in the
 * queue then lands on a freshly seeded Server, and the *next* test reads a
 * setting nobody in it ever chose.
 *
 * **How it is held against the failure.** Take `savesHaveSettled()` out of the
 * `afterEach` below and the second test goes red — the User it signs in as is
 * painted Pink by a press the first test made. Measured rather than asserted:
 * 10 runs of this file without the guard, 10 red; 20 runs with it, 20 green.
 *
 * It is deliberately *not* a test of the settings screen — `settings-journey`
 * is that. Nothing here asserts what a press does; the first test exists only
 * to leave saves in flight, and the second only to notice them.
 */

/** Enough quick presses that the queue outlives the test that made them. */
const PRESSES = ['Amber', 'Green', 'Teal', 'Blue', 'Violet', 'Pink'] as const;

afterEach(async () => {
  // The line this file exists to prove. Without it the reseed below overtakes
  // the saves the first test started.
  await savesHaveSettled();
  await resetFakeState();
  history.replaceState(null, '', '/');
  // The accent is painted on the root element, which outlives a render.
  document.documentElement.removeAttribute('style');
});

beforeEach(async () => {
  history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
});

async function signInAndOpenSettings(): Promise<void> {
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

  fireEvent.click(await screen.findByRole('link', { name: 'Settings' }));
  await screen.findByRole('heading', { level: 1, name: 'Settings' });
  // The screen offers nothing to press until the Server has answered, so a
  // press can never land on the defaults and save them over the User's own.
  await waitFor(() => {
    expect(screen.queryByText('Looking for your settings…')).toBeNull();
  });
}

/** The Client Settings the fake Jellyfin is holding for Rafael, right now. */
async function storedSettings(): Promise<Record<string, string>> {
  const state = (await fakeState()) as {
    displayPreferences?: Record<string, Record<string, string>>;
  };
  return state.displayPreferences?.['jellyflick|jellyflick|user-rafael'] ?? {};
}

describe('a Client Settings save that outlives the test that started it', () => {
  it('leaves a queue of saves still draining when the test ends', async () => {
    await signInAndOpenSettings();

    // No waiting between them, which is what a User on a remote does and what
    // fills the queue. The screen follows each press at once, so the last one
    // is on the screen long before the first has reached the Server.
    for (const preset of PRESSES) {
      fireEvent.click(screen.getByRole('button', { name: preset }));
    }
    expect(screen.getByRole('button', { name: 'Pink', pressed: true })).toBeTruthy();
  });

  it('cannot reach the test after it: that User has never chosen a colour', async () => {
    // Nothing in this test chose an accent and the Server was reseeded before
    // it started, so a stored one could only have come from the test above.
    expect(await storedSettings()).not.toHaveProperty(ACCENT_COLOUR_KEY);

    await signInAndOpenSettings();

    // Red until they choose otherwise — the default a new User gets.
    expect(screen.getByRole('button', { name: 'Red', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pink', pressed: false })).toBeTruthy();
    expect(await storedSettings()).not.toHaveProperty(ACCENT_COLOUR_KEY);
  });

  it('is seeded state the test after that still sees, not a one-off', async () => {
    // The leak is a *file*-wide hazard: Vitest runs one file at a time against
    // one fake, so a straggler can land several tests later. Asserting it
    // twice is cheap and says the guard holds for the whole file.
    await setFakeState({
      displayPreferences: { 'jellyflick|jellyflick|user-rafael': { [ACCENT_COLOUR_KEY]: 'teal' } },
    });

    await signInAndOpenSettings();

    expect(screen.getByRole('button', { name: 'Teal', pressed: true })).toBeTruthy();
  });
});
