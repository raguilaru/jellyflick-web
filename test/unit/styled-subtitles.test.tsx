import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import type { CapabilityProfileName, FakeStyledRenderer } from '../device/profiles';
import { fakeStyledRenderer, inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
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
 * `choosing-how-to-draw-subtitles.test.ts`; this file is about what a User ends
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

/**
 * A Client Settings save is written **behind** the User, so one a test started
 * can still be in flight when that test ends — and if it lands after the next
 * test has reseeded the Server, that test is handed an offset nobody in it
 * ever made (#46). Two tests here move the Subtitle Offset, so this file has
 * the same exposure `shifting-the-subtitles.test.tsx` guards against, and the
 * same guard: two equal counts in a row is settled.
 *
 * It is worth the words here because of how this one would fail. #28 met this
 * hazard as a subtitle that **silently refused to draw** rather than as
 * anything resembling a settings bug, and a styled track that draws nothing is
 * this file's most ordinary failure. A victim test fails only in sequence and
 * never in isolation, which is the signature to recognise.
 */
async function savesHaveSettled(): Promise<void> {
  let seen = -1;
  await waitFor(async () => {
    const now = (await fakeWrites()).length;
    const quiet = now === seen;
    seen = now;
    expect(quiet).toBe(true);
  });
}

afterEach(async () => {
  await savesHaveSettled();
  await resetFakeState();
});

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

/** Signs in on a device of the given class, which is what each test varies. */
async function signIn(
  profile: CapabilityProfileName,
  styledRenderer?: FakeStyledRenderer,
): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({
        profile,
        storage: inMemoryDeviceStorage(),
        ...(styledRenderer === undefined ? {} : { styledRenderer }),
      })}
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

async function play(
  profile: CapabilityProfileName,
  styledRenderer?: FakeStyledRenderer,
): Promise<void> {
  await signIn(profile, styledRenderer);
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

describe('a styled track on a device that can draw the styling', () => {
  /** Where the renderer draws: a canvas over the picture, inside the player. */
  function styledCanvas(): HTMLCanvasElement | null {
    return document.querySelector<HTMLCanvasElement>('.player__styled-subtitles');
  }

  it('hands the styled file and its embedded fonts to the renderer', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();

    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });
    const started = renderer.started[0];
    if (started === undefined) throw new Error('No renderer was started.');

    // The file itself, not a conversion of it: the styling is the point.
    expect(started.content).toContain('[Events]');
    expect(started.content).toContain('Heptapod Sans');
    // Both embedded fonts, and **not** the cover image that sits beside them.
    expect(started.fontUrls).toHaveLength(2);
    expect(started.fontUrls[0]).toContain('/Attachments/0');
    expect(started.fontUrls[1]).toContain('/Attachments/1');
    expect(started.fontUrls.join(' ')).not.toContain('/Attachments/2');
  });

  /**
   * The styling is drawn by the renderer on its own canvas, so the app-drawn
   * text overlay must not also be drawing the same words underneath it —
   * which would be every line on the screen twice.
   */
  it('draws on its own canvas and leaves the plain-text overlay empty', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    expect(styledCanvas()).not.toBeNull();
    watchUpTo(1);
    expect(subtitleText()).toBe('');
  });

  /**
   * #28 on the styled path. The architecture note is explicit that the offset
   * is "deliberately not a feature of the text renderer": the player holds it
   * and the styled renderer is handed the same number, which it gives to
   * libass's own `timeOffset`.
   */
  it('passes the Subtitle Offset to the renderer rather than re-drawing anything', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    // The subtitle menu's timing panel, which is #28's.
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
    const picker = await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    fireEvent.click(within(picker).getByRole('button', { name: en['player.subtitleTiming'] }));
    await screen.findByRole('dialog', { name: en['player.subtitleTiming'] });
    const later = screen.getByRole('button', { name: en['player.subtitlesStepLater'] });

    fireEvent.click(later);

    // A tenth of a second later, reaching the renderer and nothing else.
    await waitFor(() => {
      // `at()` is Chrome 92, above ADR 0002's floor, so indexed from length.
      expect(renderer.offsets[renderer.offsets.length - 1]).toBeCloseTo(0.1, 5);
    });
  });

  it('takes the renderer away when the track is turned off', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    fireEvent.click(
      within(screen.getByRole('group', { name: en['player.subtitleTracks'] })).getByRole('button', {
        name: en['player.subtitlesOff'],
      }),
    );

    await waitFor(() => {
      expect(renderer.destroyed).toBe(1);
    });
    expect(styledCanvas()).toBeNull();
  });

  /**
   * The case the whole fallback exists for: the device said it could draw the
   * styling and then the engine would not load — a dropped chunk, a WASM
   * binary the browser refused. A User who asked for subtitles is owed the
   * words far more than the styling, so they get the words.
   */
  it('falls back to the words when the renderer will not load', async () => {
    const renderer = fakeStyledRenderer({ failing: true });
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();
    watchUpTo(1);

    await waitFor(() => {
      expect(subtitleText()).toContain('こんにちは');
    });
    expect(styledCanvas()).toBeNull();
    // And it is not said to be unavailable: there are subtitles on the screen.
    expect(screen.queryByText(en['player.subtitlesUnavailable'])).toBeNull();
  });

  /**
   * The reason the styled path reports flattened cues up at all. "Sync to this
   * line" (#28, story 100) asks which line is on the screen, and the player is
   * where it lives — so a styled track flattens the same file purely to answer
   * that. Without it, the one feature this app adds over other clients would
   * stop working on exactly the subtitles it works hardest to draw.
   */
  it('still syncs to the line on screen, though libass is what drew it', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
    await chooseTheStyledTrack();
    await waitFor(() => {
      expect(renderer.started).toHaveLength(1);
    });

    // The first line runs 0.5–3s in the file. A User hears it at 2s, which
    // means it is a second and a half late.
    video().currentTime = 2;
    fireEvent(video(), new Event('timeupdate'));

    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
    const picker = await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    fireEvent.click(within(picker).getByRole('button', { name: en['player.subtitleTiming'] }));
    await screen.findByRole('dialog', { name: en['player.subtitleTiming'] });
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleSyncToLine'] }));

    await waitFor(() => {
      expect(renderer.offsets[renderer.offsets.length - 1]).toBeCloseTo(1.5, 5);
    });
  });

  /** A plain-text track never asks for a renderer, so nothing is downloaded. */
  it('never loads the renderer for a plain-text track', async () => {
    const renderer = fakeStyledRenderer();
    await play('modern-desktop-browser', renderer);
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

    expect(renderer.started).toHaveLength(0);
  });

  /** And neither does a device that says it cannot draw the styling. */
  it('never loads the renderer on a device that cannot draw the styling', async () => {
    const renderer = fakeStyledRenderer();
    await play('webos-5-like', renderer);
    await chooseTheStyledTrack();
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('こんにちは');
    });

    expect(renderer.started).toHaveLength(0);
  });
});
