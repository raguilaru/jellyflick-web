import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import type { DeviceStorage } from '../../src/device/types';

/**
 * The trap in several Users: everything per-User is now live. The Client
 * Settings and so the Home Layout are #10's, My List is #13's, and both are
 * read once for the User the shell was built for.
 *
 * Switching User must not leave the User who was watching on the screen. These
 * tests are about exactly that, which is why they assert on what is drawn
 * rather than on any store: a store that resets correctly and a screen that
 * keeps the old draw anyway is the failure worth catching.
 */

let storage: DeviceStorage;

beforeEach(() => {
  storage = inMemoryDeviceStorage();
});

afterEach(resetFakeState);

function renderApp() {
  return render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage })}
      messages={en}
    />,
  );
}

async function signInAs(name: string) {
  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText(`Signed in as ${name}.`)).toBeTruthy();
}

async function openThePicker(currentName: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Switch User, currently ${currentName}` }),
  );
  expect(await screen.findByRole('heading', { name: 'Who is watching?' })).toBeTruthy();
}

/** Both household members signed in, with Marina the one watching. */
async function signInBoth() {
  renderApp();
  await signInAs('Rafael');
  await openThePicker('Rafael');
  fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
  await signInAs('Marina');
}

async function switchTo(from: string, to: string) {
  await openThePicker(from);
  fireEvent.click(screen.getByRole('button', { name: to }));
  expect(await screen.findByText(`Signed in as ${to}.`)).toBeTruthy();
}

describe('switching User', () => {
  it('does not leave the last User’s My List on the screen', async () => {
    // Only Rafael has anything in My List, so the Row is his alone.
    await setFakeState({ favourites: { 'user-rafael': ['movie-arrival'] } });
    await signInBoth();

    await switchTo('Marina', 'Rafael');
    expect(await screen.findByRole('heading', { name: 'My List' })).toBeTruthy();
    expect(screen.getByLabelText('Arrival')).toBeTruthy();

    await switchTo('Rafael', 'Marina');

    // Marina's My List is empty, so there is no Row of it on her Home at all.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'My List' })).toBeNull();
    });
    expect(screen.queryByLabelText('Arrival')).toBeNull();
  });

  it('does not leave the last User’s Home Layout on the screen', async () => {
    // Rafael has edited his Home down to one Row; Marina has never edited hers.
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': JSON.stringify([{ kind: 'my-list' }]),
        },
      },
    });
    await signInBoth();

    // Marina's Home is the default layout, which has New on Jellyflick on it.
    expect(await screen.findByRole('heading', { name: 'New on Jellyflick' })).toBeTruthy();

    await switchTo('Marina', 'Rafael');

    // Rafael's layout has no New on Jellyflick, so Marina's Home may not
    // still be showing it.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'New on Jellyflick' })).toBeNull();
    });

    await switchTo('Rafael', 'Marina');

    expect(await screen.findByRole('heading', { name: 'New on Jellyflick' })).toBeTruthy();
  });

  it('asks the Server as the User who is now watching, with their own token', async () => {
    await signInBoth();
    const marina = await tokenOf('user-marina');

    await forgetRequests();
    await switchTo('Marina', 'Rafael');

    // The fake derives a token per User and DeviceId, so a Row read with
    // Marina's token is Marina's Row however the screen is labelled. Nothing
    // asked after the switch may carry it.
    const seen = await requestsCarryingAToken();
    expect(seen.length).toBeGreaterThan(0);
    for (const entry of seen) {
      expect(entry.headers.authorization, entry.path).not.toContain(marina);
    }
    expect(seen.some((entry) => (entry.headers.authorization ?? '').includes('token-user-rafael-'))).toBe(
      true,
    );
  });
});

type SeenRequest = { method: string; path: string; headers: Record<string, string> };

async function forgetRequests(): Promise<void> {
  await fetch(`${fakeJellyfinUrl()}/__fake/requests`, { method: 'DELETE' });
}

async function requestsCarryingAToken(): Promise<SeenRequest[]> {
  const response = await fetch(`${fakeJellyfinUrl()}/__fake/requests`);
  const all = (await response.json()) as SeenRequest[];
  return all.filter((entry) => (entry.headers.authorization ?? '').includes('Token="'));
}

/** The token the fake issued to one User on this device. */
async function tokenOf(userId: string): Promise<string> {
  const seen = await requestsCarryingAToken();
  const match = seen
    .map((entry) => /Token="(token-[^"]+)"/.exec(entry.headers.authorization ?? '')?.[1])
    .find((token) => token !== undefined && token.startsWith(`token-${userId}-`));
  expect(match).toBeTruthy();
  return match ?? '';
}
