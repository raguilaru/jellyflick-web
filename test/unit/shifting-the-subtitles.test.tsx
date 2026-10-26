import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { SUBTITLE_OFFSETS_KEY } from '../../src/settings/client-settings';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
  savesHaveSettled,
  setFakeState,
} from '../fake-jellyfin/control';
import { BLUEY_SEASON_1_SUBTITLE_PACK, SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Shifting the subtitles while something is playing (#28, stories 96–102).
 *
 * The journey is the seam, as it is for #27's track picker: the ticket's
 * promises are about what a User sees and what the Server is told, and both
 * span the panel, the player, the subtitle engine and the Client Settings
 * store. The arithmetic is held still on its own in
 * `the-subtitle-offset.test.ts` and the panel's own behaviour — the readout's
 * wording, hold-to-repeat, the arrow keys — in
 * `the-subtitle-timing-panel.test.tsx`; neither is repeated here.
 *
 * What a browser is needed for is `test/e2e/the-subtitle-offset.spec.ts`: the
 * panel really not covering the subtitle line, which happy-dom cannot say
 * because every element there has a zero-sized box.
 *
 * Arrival throughout, with English subtitles at stream 3. The file the fake
 * serves is two cues: `Hello` from 0.5 to 3 seconds and `Goodbye (Arrival)`
 * from 3 to 6.
 */

const RAFAEL = 'user-rafael';
/** What `subtitleFileOf` answers for that track: the source, and the stream. */
const ENGLISH_SUBTITLE_FILE = 'stream:source-movie-arrival:3';

/**
 * A Client Settings save is written **behind** the User, so one a test started
 * can still be in flight when that test ends — and if it lands after the next
 * test has reseeded the Server, that test is handed an offset nobody in it ever
 * made. `architecture.md` names the same hazard for the e2e suite, where a
 * stop report outlives its browser context.
 *
 * So each test waits for the writes to stop arriving before the Server is
 * reseeded. Two equal counts in a row is settled: every save here is one
 * request, started before the test returned.
 */
afterEach(resetFakeState);

/*
 * **The settle goes in `beforeEach`, not in `afterEach`** (#46, #52). The
 * player sends a stop report **behind** the User as it is torn down, from an
 * effect cleanup nothing awaits — and the unmount that fires it is Testing
 * Library's `cleanup`, registered in `test/setup.ts`, so Vitest runs it
 * *after* this file's own `afterEach`. The write has not been made by then.
 * Settling here, before the log is forgotten and the Server reseeded, is the
 * only place that catches it, and `architecture.md`'s "Running the tests"
 * states that ordering rule.
 */
beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await savesHaveSettled();
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

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

async function play(): Promise<void> {
  await signIn();
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

function subtitleText(): string {
  return document.querySelector('.player__subtitles')?.textContent ?? '';
}

async function openPicker(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Arrival' }));
  return await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
}

/** Presses one of the subtitle choices in the menu, by its name. */
function chooseSubtitleTrack(picker: HTMLElement, name: string): void {
  const group = within(picker).getByRole('group', { name: en['player.subtitleTracks'] });
  fireEvent.click(within(group).getByRole('button', { name }));
}

/** Turns the English track on and waits for its first cue to be drawn. */
async function turnEnglishSubtitlesOn(): Promise<void> {
  const picker = await openPicker();
  chooseSubtitleTrack(picker, 'English');
  watchUpTo(1);
  await waitFor(() => {
    expect(subtitleText()).toContain('Hello');
  });
}

/** Opens Subtitle timing from the subtitle menu, which is where story 96 puts it. */
async function openTiming(): Promise<HTMLElement> {
  const picker = await openPicker();
  fireEvent.click(within(picker).getByRole('button', { name: en['player.subtitleTiming'] }));
  return await screen.findByRole('dialog', { name: en['player.subtitleTiming'] });
}

function readout(): string {
  return document.querySelector('.player__timing-readout')?.textContent ?? '';
}

function shiftLater(times: number): void {
  for (let at = 0; at < times; at += 1) {
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitlesStepLater'] }));
  }
}

/** The `jf.subtitleOffsets` of the last `/DisplayPreferences` POST, if any. */
async function savedOffsets(): Promise<unknown> {
  const writes = await fakeWrites();
  const saved = writes.filter((write) => write.path.startsWith('/DisplayPreferences'));
  const last = saved[saved.length - 1]?.body as
    | { CustomPrefs?: Record<string, string | null> }
    | undefined;
  const stored = last?.CustomPrefs?.[SUBTITLE_OFFSETS_KEY];
  return typeof stored === 'string' ? JSON.parse(stored) : undefined;
}

async function playbackInfoRequests(): Promise<number> {
  return (await fakeRequests()).filter((entry) =>
    entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
  ).length;
}

describe('opening Subtitle timing', () => {
  /** Story 96: from the subtitle menu, while the video keeps playing. */
  it('opens from the subtitle menu and leaves the Title playing', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    await openTiming();

    // The whole of "doesn't pause the video": nothing the panel did touched
    // the media element, and the picture is still where it was.
    expect(video().paused).toBe(false);
    expect(subtitleText()).toContain('Hello');
  });

  /** The menu it was opened from is gone: the panel is what is being read now. */
  it('closes the menu it was opened from', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    await openTiming();

    expect(screen.queryByRole('dialog', { name: en['player.tracksLabel'] })).toBeNull();
  });

  /**
   * With subtitles off there is nothing to time, and a control that opens a
   * panel about nothing is a stop the arrow keys have to step through for
   * nothing — the same call `PlayerControls` makes about the menu itself when a
   * Title has no tracks to choose between.
   */
  it('is not offered while subtitles are off', async () => {
    await play();
    const picker = await openPicker();

    expect(
      within(picker).queryByRole('button', { name: en['player.subtitleTiming'] }),
    ).toBeNull();
  });

  /** Back closes the panel and leaves the Title playing, as the menu's does. */
  it('closes on Back, and the Title is still playing', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: en['player.subtitleTiming'] })).toBeNull();
    });
    expect(screen.getByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
    expect(video().paused).toBe(false);
  });
});

describe('shifting the subtitles while watching', () => {
  /**
   * Story 96's "see the result live": the cue on the screen changes as the
   * offset moves, without the picture moving at all.
   *
   * Two tenths later at 3.1 seconds reads the file at 2.9, which is the first
   * cue rather than the second — a different **line**, not merely a gap, so a
   * player that had quietly stopped drawing could not pass this.
   */
  it('draws a different line as the offset moves, without moving the picture', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();

    watchUpTo(3.1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Goodbye');
    });

    shiftLater(2);

    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });
    expect(readout()).toBe('Subtitles 0.2 s later');
    // The picture did not move and was never asked for again.
    expect(video().currentTime).toBe(3.1);
    expect(video().paused).toBe(false);
  });

  /**
   * Story 100: "Sync to this line" works the offset out from the moment it is
   * pressed. At one second the line on the screen is the cue the file starts at
   * half a second, so the shift that puts its start under the User's thumb is
   * half a second later.
   */
  it('syncs to the line on the screen from the moment the button is pressed', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();
    watchUpTo(1);

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleSyncToLine'] }));

    expect(readout()).toBe('Subtitles 0.5 s later');
  });

  /**
   * And it reads the element rather than the position the controls are drawing
   * with, which is the four-times-a-second one: a User presses this on hearing
   * a line, and the half-second the seek bar is behind by would be half a
   * second of error in exactly the number being measured.
   */
  it('syncs against where the picture really is, not the readout’s copy of it', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();
    watchUpTo(1);
    // The element moves on without telling anybody, as it does between ticks.
    video().currentTime = 2.4;

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleSyncToLine'] }));

    // 2.4 - 0.5, not 1 - 0.5.
    expect(readout()).toBe('Subtitles 1.9 s later');
  });

  it('puts the subtitles back where they were on Reset', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();
    shiftLater(5);
    watchUpTo(3.1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTimingReset'] }));

    await waitFor(() => {
      expect(subtitleText()).toContain('Goodbye');
    });
    expect(readout()).toBe(en['player.subtitlesInSync']);
  });

  /**
   * Switching the subtitles never touches the media element (#27), and shifting
   * them is the same promise one step further in: the offset is this app's own
   * arithmetic, applied as a cue is chosen, so there is nothing to re-negotiate.
   */
  it('never asks the Server how to play the Title again', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    const asked = await playbackInfoRequests();
    const source = video().src;

    await openTiming();
    shiftLater(3);

    expect(await playbackInfoRequests()).toBe(asked);
    expect(video().src).toBe(source);
  });
});

describe('remembering an offset', () => {
  /**
   * Story 102: stored per subtitle file, on the Server, so it follows the User
   * rather than the device. The key is the subtitle file's own —
   * `subtitleFileOf` — and the value is what the readout said.
   */
  it('saves the offset for that subtitle file on the Server', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();

    shiftLater(8);

    await waitFor(async () => {
      expect(await savedOffsets()).toEqual([{ file: ENGLISH_SUBTITLE_FILE, seconds: 0.8 }]);
    });
  });

  /**
   * Reset forgets the file rather than storing a shift of nothing: a User who
   * has put a subtitle back in sync has nothing to remember, and the Server
   * would otherwise collect a zero per file a household ever watched.
   */
  it('forgets the file again when the User presses Reset', async () => {
    await play();
    await turnEnglishSubtitlesOn();
    await openTiming();
    shiftLater(8);
    await waitFor(async () => {
      expect(await savedOffsets()).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTimingReset'] }));

    await waitFor(async () => {
      expect(await savedOffsets()).toEqual([]);
    });
  });

  /**
   * The other half of story 102, and the half that says "on any device": this
   * is a device that has never shifted anything, reading an offset the User
   * made somewhere else. It applies the moment the track is chosen, with
   * nothing for the User to press.
   */
  it('applies an offset the User made on another device, without being asked', async () => {
    await setFakeState({
      displayPreferences: {
        [`jellyflick|jellyflick|${RAFAEL}`]: {
          [SUBTITLE_OFFSETS_KEY]: JSON.stringify([
            { file: ENGLISH_SUBTITLE_FILE, seconds: 0.2 },
          ]),
        },
      },
    });

    await play();
    const picker = await openPicker();
    chooseSubtitleTrack(picker, 'English');

    // Two tenths of lateness in force: at 3.1 the file is read at 2.9, which is
    // the first cue — where an unshifted playback draws the second.
    watchUpTo(3.1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });
    // And the panel opens saying so rather than saying the subtitles are in sync.
    await openTiming();
    expect(readout()).toBe('Subtitles 0.2 s later');
  });

  /**
   * An offset belongs to a **file**, so switching to another track is not
   * shifted by it. A single offset for "the subtitles" would mean fixing the
   * Spanish file broke the English one.
   */
  it('keeps each subtitle file’s own offset, not one for the Title', async () => {
    await setFakeState({
      displayPreferences: {
        [`jellyflick|jellyflick|${RAFAEL}`]: {
          [SUBTITLE_OFFSETS_KEY]: JSON.stringify([
            { file: ENGLISH_SUBTITLE_FILE, seconds: 0.2 },
          ]),
        },
      },
    });

    await play();
    const picker = await openPicker();
    chooseSubtitleTrack(picker, 'Spanish');
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });

    await openTiming();

    expect(readout()).toBe(en['player.subtitlesInSync']);
  });
});

/**
 * **Story 102's cross-Episode half, delivered** (#47).
 *
 * The story reads literally: an offset "applies to every Episode that uses the
 * same file". Until #47 that was only half-reachable — `subtitleFileOf`
 * preferred `MediaStream.Path` on the strength of an *assumption* about what a
 * real Server sends, and the fake gave no subtitle stream a path at all, so
 * the whole `path:` branch was unexercised against a Server and this half of
 * the story was never shown working.
 *
 * #47 measured it against the host's Jellyfin 12.2.0: an external sidecar
 * carries a real absolute server-side path, a stream inside the container
 * carries `null`. The fake now serves that split, and both Episodes of Bluey
 * Season 1 point at one pack — `BLUEY_SEASON_1_SUBTITLE_PACK` — which is what
 * these two tests are about.
 *
 * They are a pair on purpose. The first proves the app really writes the
 * **shared** key when a User adjusts an Episode; the second proves another
 * Episode reads it back. Either alone would pass with a key that was merely
 * stable per Episode.
 */
describe('an offset on a subtitle file two Episodes share', () => {
  /** What `subtitleFileOf` answers for that sidecar: the path, not the stream. */
  const PACK_FILE = `path:${BLUEY_SEASON_1_SUBTITLE_PACK}`;

  /**
   * Plays Bluey and turns the shared pack on. Which Episode `Play` starts is
   * #18's rule — the first unwatched one — so the caller seeds `played` to
   * choose.
   */
  async function playBlueyWithThePack(episodeName: string): Promise<void> {
    await signIn();
    await screen.findByRole('list', { name: 'New on Jellyflick' });
    pressCard('New on Jellyflick', 'Bluey');
    await screen.findByRole('heading', { name: 'Bluey', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await screen.findByRole('region', { name: `Playing Bluey: ${episodeName}` });
    const open = await screen.findByRole('button', {
      name: `Audio and subtitles for Bluey: ${episodeName}`,
    });
    fireEvent.click(open);
    const picker = await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    const group = within(picker).getByRole('group', { name: en['player.subtitleTracks'] });
    fireEvent.click(within(group).getByRole('button', { name: 'English (pack)' }));
  }

  /** The timing panel for an Episode, whose button carries the Episode's name. */
  async function openTimingFor(episodeName: string): Promise<void> {
    fireEvent.click(
      screen.getByRole('button', { name: `Audio and subtitles for Bluey: ${episodeName}` }),
    );
    const picker = await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    fireEvent.click(within(picker).getByRole('button', { name: en['player.subtitleTiming'] }));
    await screen.findByRole('dialog', { name: en['player.subtitleTiming'] });
  }

  /**
   * The write, and the **key** is the assertion: a User adjusting the pack on
   * one Episode must store it against the file, not against this Episode's
   * media source — or the Episode after it would start in sync again.
   */
  it('is stored against the shared file rather than the Episode', async () => {
    await playBlueyWithThePack('The Magic Xylophone');
    await openTimingFor('The Magic Xylophone');
    shiftLater(3);
    fireEvent.click(screen.getByRole('button', { name: en['player.subtitleTimingDone'] }));

    await waitFor(async () => {
      expect(await savedOffsets()).toEqual([{ file: PACK_FILE, seconds: 0.3 }]);
    });
  });

  /**
   * And the other Episode reads it back. `played` puts `s1e1` behind the User
   * so #18's rule starts `s1e2` — a different Episode, a different media
   * source, the same `.srt`.
   */
  it('is already in force on the next Episode, which shares the file', async () => {
    await setFakeState({
      played: { [RAFAEL]: ['episode-bluey-s1e1'] },
      displayPreferences: {
        [`jellyflick|jellyflick|${RAFAEL}`]: {
          [SUBTITLE_OFFSETS_KEY]: JSON.stringify([{ file: PACK_FILE, seconds: 0.3 }]),
        },
      },
    });

    await playBlueyWithThePack('Hotel');
    await openTimingFor('Hotel');

    expect(readout()).toBe('Subtitles 0.3 s later');
  });

  /**
   * The control, and the reason the pair above is not enough on its own: the
   * **embedded** track of the very same Episode has no file of its own, so it
   * keys per media source and the pack's offset must not touch it. Without
   * this, a key that ignored `Path` entirely — one offset for "the subtitles
   * of this Episode" — would pass both tests above.
   */
  it('does not shift the Episode’s own embedded track', async () => {
    await setFakeState({
      played: { [RAFAEL]: ['episode-bluey-s1e1'] },
      displayPreferences: {
        [`jellyflick|jellyflick|${RAFAEL}`]: {
          [SUBTITLE_OFFSETS_KEY]: JSON.stringify([{ file: PACK_FILE, seconds: 0.3 }]),
        },
      },
    });

    await signIn();
    await screen.findByRole('list', { name: 'New on Jellyflick' });
    pressCard('New on Jellyflick', 'Bluey');
    await screen.findByRole('heading', { name: 'Bluey', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await screen.findByRole('region', { name: 'Playing Bluey: Hotel' });
    const open = await screen.findByRole('button', {
      name: 'Audio and subtitles for Bluey: Hotel',
    });
    fireEvent.click(open);
    const picker = await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
    const group = within(picker).getByRole('group', { name: en['player.subtitleTracks'] });
    // The muxed-in track, which the Server sends with `Path: null`.
    fireEvent.click(within(group).getByRole('button', { name: 'English', exact: true }));

    await openTimingFor('Hotel');

    expect(readout()).toBe(en['player.subtitlesInSync']);
  });
});
