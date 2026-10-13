import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import type { CapabilityProfileName } from '../device/profiles';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Styled subtitles, as a User meets them (#29, stories 103 and 104).
 *
 * The journey is the seam because that is where the ticket's promise lives: a
 * styled track is drawn **with its styling where the device can manage it and
 * as plain text where it cannot**, and the Subtitle Offset works either way.
 * The grammar is pinned down on its own in
 * `flattening-styled-subtitles.test.ts` and the decision in
 * `choosing-a-subtitle-renderer.test.ts`; this file is about what a User ends
 * up looking at, and which file the Server was asked for.
 *
 * **The capability profile is what each test varies**, which is the one thing
 * that makes this file different from `choosing-tracks.test.tsx`:
 * `webos-5-like` is the Chromium 68 floor and says it cannot draw styling, and
 * `modern-desktop-browser` says it can. So the same track, the same Server and
 * the same press give two different answers, which is the whole ticket.
 *
 * Arrival carries the styled track: ASS at stream 5, Japanese, labelled
 * "Japanese (Styled)", with two embedded fonts and a cover image among its
 * attachments.
 */

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

/** Signs in on a device of the given class, which is what each test varies. */
async function signIn(profile: CapabilityProfileName): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ profile, storage: inMemoryDeviceStorage() })}
      messages={en}
    />,
  );
  // A TV offers Quick Connect before a password (#9, story 13), so reaching
  // the Users there takes the one press a household member would make. It is
  // awaited rather than queried: the screen arrives with the public Users.
  if (profile === 'webos-5-like') {
    fireEvent.click(await screen.findByRole('button', { name: 'Use a password instead' }));
  }

  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in as Rafael.');
}

function pressCard(rowName: string, name: string): void {
  const row = screen.getByRole('list', { name: rowName });
  const card = Array.from(row.querySelectorAll('.card')).find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  );
  if (card === undefined) throw new Error(`No card for ${name}.`);
  fireEvent.click(card);
}

async function play(profile: CapabilityProfileName): Promise<void> {
  await signIn(profile);
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Arrival');
  await screen.findByRole('heading', { name: 'Arrival', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: 'Playing Arrival' });
  await screen.findByRole('button', { name: 'Audio and subtitles for Arrival' });
}

function video(): HTMLVideoElement {
  const found = document.querySelector('video');
  if (found === null) throw new Error('The player has no video element.');
  return found as HTMLVideoElement;
}

/** Puts the picture at a moment, the way playback does. */
function watchUpTo(seconds: number): void {
  video().currentTime = seconds;
  fireEvent(video(), new Event('timeupdate'));
}

/** What the app-drawn overlay is showing, if anything. */
function subtitleText(): string {
  return document.querySelector('.player__subtitles')?.textContent ?? '';
}

/** Turns the styled track on, the way a User does. */
async function chooseTheStyledTrack(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
  await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
  fireEvent.click(
    within(screen.getByRole('group', { name: en['player.subtitleTracks'] })).getByRole('button', {
      name: 'Japanese (Styled)',
    }),
  );
}

/** Which subtitle files the Server was asked for, newest last. */
async function subtitleRequests(): Promise<readonly string[]> {
  return (await fakeRequests())
    .map((entry) => entry.path)
    .filter((path) => path.includes('/Subtitles/'));
}

describe('a styled track on a device that cannot draw the styling', () => {
  /**
   * The Chromium 68 floor. The words and the timing survive; the styling does
   * not, which is story 104's "as plain text otherwise, so that they're always
   * readable and shiftable".
   */
  it('draws the words as plain text, with the styling stripped out', async () => {
    await play('webos-5-like');
    await chooseTheStyledTrack();
    watchUpTo(1);

    await waitFor(() => {
      expect(subtitleText()).toContain('こんにちは');
    });
    // The file wraps that line in `{\i1}…{\i0}`, and the override block is not
    // something to draw at a User.
    expect(subtitleText()).not.toContain('\\i1');
    expect(subtitleText()).not.toContain('{');
  });

  it('keeps the timing, so the next line replaces it as the picture moves', async () => {
    await play('webos-5-like');
    await chooseTheStyledTrack();
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('こんにちは');
    });

    // The styled file's cues are 0.5–3s and 3–6s, the same moments every other
    // format of this track uses.
    watchUpTo(4);
    await waitFor(() => {
      expect(subtitleText()).toContain('さようなら');
    });
  });

  /**
   * It asks for the **styled** file even though it is going to flatten it, so
   * that one flattener gives one answer on every device — see
   * `styled-subtitles.ts` for why that is worth a round trip the Server could
   * have saved.
   */
  it('asks the Server for the styled file, not a converted one', async () => {
    await play('webos-5-like');
    await chooseTheStyledTrack();
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('こんにちは');
    });

    const asked = await subtitleRequests();
    expect(asked.some((path) => path.includes('/Subtitles/5/0/Stream.ass'))).toBe(true);
  });

  /** A plain track is unchanged by any of this: still WebVTT, still drawn. */
  it('still asks for WebVTT for a plain-text track', async () => {
    await play('webos-5-like');
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    fireEvent.click(
      within(screen.getByRole('group', { name: en['player.subtitleTracks'] })).getByRole('button', {
        name: 'English',
      }),
    );
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });

    const asked = await subtitleRequests();
    expect(asked.some((path) => path.includes('/Subtitles/3/0/Stream.vtt'))).toBe(true);
  });
});
