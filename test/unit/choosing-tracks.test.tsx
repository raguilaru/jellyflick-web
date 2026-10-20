import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
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
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Choosing the sound and the subtitles while something is playing (#27).
 *
 * The journey is the seam, because that is where the ticket's promises live:
 * the tracks come from the Server, the default ones come from the *User's own
 * Jellyfin account*, a subtitle track is fetched and drawn by the app, and
 * switching one does not start the Title again. Parsing and timing are pinned
 * down on their own in `subtitle-cues.test.ts` and the stream list in
 * `the-tracks-of-a-title.test.ts`; this file is about what a User sees and what
 * the Server is asked.
 *
 * What a browser is needed for is `test/e2e/playing-a-title.spec.ts`: happy-dom
 * gives every element a zero-sized box, so **no unit test here can say where an
 * arrow key sends focus** (`architecture.md`). What it can say is that every
 * choice is a real focus stop with a name and a pressed state, which is the
 * half of "usable with arrow keys" that is not geometry.
 *
 * Arrival is the Title throughout: English audio at stream 1, French at 2,
 * English subtitles at 3 and Spanish at 4.
 */

const RAFAEL = 'user-rafael';

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

/** Plays one Title the way a User reaches it, and waits for it to be going. */
async function play(name = 'Arrival'): Promise<void> {
  await signIn();
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', name);
  await screen.findByRole('heading', { name, level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: `Playing ${name}` });
  // The controls are what the picker is opened from, and they wait for the
  // negotiation before there is anything to press.
  await screen.findByRole('button', { name: `Audio and subtitles for ${name}` });
  // And the start report has landed, so a test counting reports or
  // negotiations afterwards is counting against a settled player rather than
  // racing the one request this journey always makes.
  await waitFor(async () => {
    expect(await startReports()).toBe(1);
  });
}

function video(): HTMLVideoElement {
  const found = document.querySelector('video');
  if (found === null) throw new Error('The player has no video element.');
  return found as HTMLVideoElement;
}

/** Opens the track picker, as a User does. */
async function openPicker(name = 'Arrival'): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: `Audio and subtitles for ${name}` }));
  return await screen.findByRole('dialog', { name: en['player.tracksLabel'] });
}

function groupNamed(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

/** Puts the picture at a moment, the way playback does. */
function watchUpTo(seconds: number): void {
  video().currentTime = seconds;
  fireEvent(video(), new Event('timeupdate'));
}

/** What the subtitle overlay is showing, if anything. */
function subtitleText(): string {
  return document.querySelector('.player__subtitles')?.textContent ?? '';
}

async function playbackInfoRequests(): Promise<number> {
  return (await fakeRequests()).filter((entry) =>
    entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
  ).length;
}

async function startReports(): Promise<number> {
  return (await fakeWrites()).filter((write) => write.path === '/Sessions/Playing').length;
}

describe('the track picker', () => {
  it('offers every sound and subtitle track the Title holds', async () => {
    await play();
    await openPicker();

    const sound = groupNamed(en['player.audioTracks']);
    expect(within(sound).getByRole('button', { name: 'English' })).toBeTruthy();
    expect(within(sound).getByRole('button', { name: 'French' })).toBeTruthy();

    const subtitles = groupNamed(en['player.subtitleTracks']);
    expect(within(subtitles).getByRole('button', { name: en['player.subtitlesOff'] })).toBeTruthy();
    expect(within(subtitles).getByRole('button', { name: 'English' })).toBeTruthy();
    expect(within(subtitles).getByRole('button', { name: 'Spanish' })).toBeTruthy();
  });

  /**
   * Every choice is a `<button>` with `aria-pressed` rather than a radio group,
   * which is the same call the settings screen made (#11, #35) and for the same
   * reason: native radios take Left and Right for themselves to move the
   * selection, and `src/navigation/` owns the arrow keys for moving focus. Two
   * meanings for one key press, on a screen driven with a remote, is the thing
   * being avoided.
   */
  it('says which track is playing, as a pressed button rather than a radio group', async () => {
    await play();
    await openPicker();

    const sound = groupNamed(en['player.audioTracks']);
    expect(within(sound).getByRole('button', { name: 'English', pressed: true })).toBeTruthy();
    expect(within(sound).getByRole('button', { name: 'French', pressed: false })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    // Nothing is chosen among the subtitles, so Off is what is pressed.
    expect(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', {
        name: en['player.subtitlesOff'],
        pressed: true,
      }),
    ).toBeTruthy();
  });

  /**
   * The controls that appear take focus for the reason `player-controls.tsx`
   * explains, and a menu over them is the same case: focus is on the button
   * that opened it, which the menu is drawn over.
   */
  it('takes focus when it opens, so a remote is inside it', async () => {
    await play();
    const picker = await openPicker();

    await waitFor(() => {
      expect(picker.contains(document.activeElement)).toBe(true);
    });
  });

  /**
   * **And it hands focus back out with the menu** (#53), which is the half
   * that was missing until then — the identical defect #32 met in the options
   * menu, left alone there because this is #27's control.
   *
   * Every way out of this menu removes the focused element: Done closes it,
   * Back closes it, and a subtitle choice that needs no re-negotiation closes
   * it. The focused button goes with the menu, so a browser hands focus to the
   * **document** — and from there the arrow keys are not inside the player at
   * all, so the next press walks the title page *behind* the picture, because
   * the flow rule can only keep focus in an overlay focus is already in (#7,
   * #40). #32's e2e watched that happen on a 390px screen with every unit
   * assertion green.
   *
   * Focused before the press, which a browser does for itself and `fireEvent`
   * does not: a press leaves focus on the button pressed, and "what had focus
   * when the menu opened" is the whole of what the menu gives back.
   */
  it('hands focus back to the control it was opened from', async () => {
    await play();
    const opener = screen.getByRole('button', { name: 'Audio and subtitles for Arrival' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });

    fireEvent.click(screen.getByRole('button', { name: en['player.tracksDone'] }));

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  /** Back is a way out of the menu like any other, and owes the same. */
  it('hands focus back when Back closes the menu', async () => {
    await play();
    const opener = screen.getByRole('button', { name: 'Audio and subtitles for Arrival' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  /**
   * And so does a choice: switching to a text subtitle track touches nothing
   * but this app, so the control row is still there to go back to.
   */
  it('hands focus back when a subtitle choice closes the menu', async () => {
    await play();
    const opener = screen.getByRole('button', { name: 'Audio and subtitles for Arrival' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });

    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'English' }),
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  /**
   * **Unless the control went with a re-negotiation**, which is the guard #32
   * found and which is load-bearing here too: choosing a different sound track
   * asks the Server again and rebuilds the whole control row, so the button
   * this was opened from is detached by the time the menu unmounts. Focusing a
   * detached node puts focus on the document — the very thing being avoided —
   * so that case is the controls' own `ready` effect's to answer.
   */
  it('leaves focus to the controls when the choice rebuilt them', async () => {
    await play();
    const opener = screen.getByRole('button', { name: 'Audio and subtitles for Arrival' });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });

    fireEvent.click(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', { name: 'French' }),
    );

    await waitFor(async () => {
      expect(await playbackInfoRequests()).toBe(2);
    });
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.closest('.player')).toBeTruthy();
    });
  });

  /**
   * The claim stack in `src/shell/back.ts` is innermost-last, which is what
   * lets the picker claim Back on top of the player's claim without either of
   * them knowing about the other.
   */
  it('closes on Back before the player does, and the player is still playing', async () => {
    await play();
    await openPicker();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.querySelector('video')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Playing Arrival' })).toBeTruthy();
  });

  /**
   * **#30 retired the undrawable track.** This test used to assert the
   * opposite: that a bitmap was offered, carried `aria-disabled` and was
   * explained by a "Jellyflick cannot draw picture subtitles yet" notice,
   * which was the honest thing to say while it was true.
   *
   * It is no longer true of any track. A picture track is either decoded here
   * (PGS, on a device that can) or burned into the picture by the Server
   * (VobSub and DVB, everywhere), and both of those are the words arriving on
   * the screen — so every track in the list is now one a User can press and
   * see the result of. The test is kept rather than deleted because what it
   * guards is still worth guarding: that a bitmap track is *offered*, which
   * is the half #27 got right and which leaving it out would break.
   */
  it('offers a picture subtitle track like any other, now that one can be drawn', async () => {
    // Heat carries a PGS track, which is a picture rather than text.
    await play('Heat');
    fireEvent.click(screen.getByRole('button', { name: 'Audio and subtitles for Heat' }));
    await screen.findByRole('dialog', { name: en['player.tracksLabel'] });

    const track = within(groupNamed(en['player.subtitleTracks'])).getByRole('button', {
      name: /English \(PGS\)/,
    });
    expect(track.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('the tracks a Title starts with', () => {
  it('starts with the file’s own sound and no subtitles for a User who has chosen nothing', async () => {
    await play();

    expect(subtitleText()).toBe('');
    await openPicker();
    expect(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', {
        name: 'English',
        pressed: true,
      }),
    ).toBeTruthy();
  });

  /**
   * The whole of "default tracks from the User's Jellyfin configuration": the
   * preference is set on the **account**, the Server applies it when it says
   * how to play the Title, and the app reads its answer. Nothing in the client
   * matches a language.
   */
  it('starts with the subtitles the User’s Jellyfin account asks for, and draws them', async () => {
    await setFakeState({
      userConfiguration: { [RAFAEL]: { SubtitleLanguagePreference: 'spa', SubtitleMode: 'Always' } },
    });

    await play();
    watchUpTo(1);

    // The Spanish track, fetched from the Server and drawn by the app.
    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });
    await openPicker();
    expect(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', {
        name: 'Spanish',
        pressed: true,
      }),
    ).toBeTruthy();
  });

  it('starts with the sound the User’s Jellyfin account asks for', async () => {
    await setFakeState({ userConfiguration: { [RAFAEL]: { AudioLanguagePreference: 'fra' } } });

    await play();
    await openPicker();

    expect(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', {
        name: 'French',
        pressed: true,
      }),
    ).toBeTruthy();
  });
});

describe('the subtitles the app draws', () => {
  /** Turns the English track on and waits for its first cue. */
  async function turnEnglishSubtitlesOn(): Promise<void> {
    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'English' }),
    );
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });
  }

  it('draws the cue that belongs to the moment, and changes it as the picture moves', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    // The fake's file is two cues: 0.5–3s and 3–6s.
    watchUpTo(4);
    await waitFor(() => {
      expect(subtitleText()).toContain('Goodbye');
    });

    // And nothing at all once the cues have run out.
    watchUpTo(20);
    await waitFor(() => {
      expect(subtitleText()).toBe('');
    });
  });

  it('draws them over the picture, in the element that goes full-screen', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    const overlay = document.querySelector('.player__subtitles');
    // Inside the player rather than inside the `<video>`: native cues are drawn
    // by the browser inside the video, and an app-drawn overlay has to be a
    // sibling within whatever goes full-screen or it vanishes
    // (`player-subtitles.md` §6c pitfall 3).
    expect(overlay?.closest('.player')).not.toBeNull();
    expect(overlay?.closest('video')).toBeNull();
  });

  /**
   * A subtitle file is untrusted input out of a media library. The engine hands
   * back plain text and the overlay sets `textContent`, so a cue can never
   * become an element however the file was written.
   */
  it('draws a cue as text, never as markup', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    const overlay = document.querySelector('.player__subtitles');
    expect(overlay?.querySelector('script')).toBeNull();
    expect(overlay?.querySelector('img')).toBeNull();
  });

  it('says so when the Server will not hand over a subtitle track, and keeps playing', async () => {
    await setFakeState({ failSubtitleFetchWith: 500 });
    await play();

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'English' }),
    );

    await screen.findByText(en['player.subtitlesUnavailable']);
    expect(video().paused).toBe(false);
  });

  it('stops drawing them when the User turns them off', async () => {
    await play();
    await turnEnglishSubtitlesOn();

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', {
        name: en['player.subtitlesOff'],
      }),
    );

    await waitFor(() => {
      expect(subtitleText()).toBe('');
    });
  });
});

/**
 * "Switching tracks doesn't restart playback where avoidable" — and which of
 * the two is avoidable is not a matter of effort:
 *
 * - **A subtitle track is the app's own.** It is a separate file the app
 *   fetches and draws, so switching one never touches the media element.
 * - **A sound track is the Server's.** A direct-played file arrives with every
 *   track in it and the browser picks one with no API to choose; a transcode
 *   carries the single track the Server was told to use. So the sound needs a
 *   new `PlaybackInfo` and a new source — and what is owed the User is that
 *   they keep their place, not that nothing happened.
 */
describe('switching a track while watching', () => {
  it('switches the subtitles without asking the Server how to play the Title again', async () => {
    await play();
    const asked = await playbackInfoRequests();
    const started = await startReports();
    const source = video().src;
    watchUpTo(200);

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'Spanish' }),
    );
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });

    // Nothing about the playback moved: no new negotiation, no new play
    // session, and the same file still attached to the same element.
    expect(await playbackInfoRequests()).toBe(asked);
    expect(await startReports()).toBe(started);
    expect(video().src).toBe(source);
    expect(video().paused).toBe(false);
  });

  /**
   * The reports are the whole of what Jellyfin — and so every other Jellyfin
   * app looking at this session (#34) — knows about what is playing, and
   * `AudioStreamIndex`/`SubtitleStreamIndex` are two of their fields. A
   * subtitle switch deliberately does not re-negotiate, so nothing else would
   * ever correct the Server's own first answer.
   */
  it('tells the Server which subtitle track the User is really reading', async () => {
    await play();

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'Spanish' }),
    );
    // A seek is news, so it is reported at once rather than on the throttle.
    watchUpTo(400);

    await waitFor(async () => {
      const progress = (await fakeWrites()).filter(
        (write) => write.path === '/Sessions/Playing/Progress',
      );
      expect(progress[progress.length - 1]?.body).toMatchObject({ SubtitleStreamIndex: 4 });
    });
  });

  it('switches from one subtitle track to another without a restart either', async () => {
    await play();
    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'English' }),
    );
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hello');
    });

    const asked = await playbackInfoRequests();
    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'Spanish' }),
    );

    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });
    expect(await playbackInfoRequests()).toBe(asked);
  });

  it('asks the Server for a new sound track, and carries on from where the User was', async () => {
    await play();
    watchUpTo(300);
    const asked = await playbackInfoRequests();

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', { name: 'French' }),
    );

    // A new negotiation, naming the track the User chose.
    await waitFor(async () => {
      expect(await playbackInfoRequests()).toBe(asked + 1);
    });
    const asks = (await fakeRequests()).filter((entry) =>
      entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
    );
    expect(asks[asks.length - 1]?.body).toMatchObject({ AudioStreamIndex: 2 });

    // And the User's place is kept, which is what is really owed them.
    await waitFor(() => {
      expect(video().currentTime).toBe(300);
    });
    await openPicker();
    expect(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', {
        name: 'French',
        pressed: true,
      }),
    ).toBeTruthy();
  });

  it('keeps the subtitles the User chose across a change of sound track', async () => {
    await play();
    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', { name: 'Spanish' }),
    );
    watchUpTo(1);
    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });

    await openPicker();
    fireEvent.click(
      within(groupNamed(en['player.audioTracks'])).getByRole('button', { name: 'French' }),
    );

    // The sound was re-negotiated; what the User was reading is still theirs,
    // and is still being drawn.
    await waitFor(() => {
      expect(subtitleText()).toContain('Hola');
    });
    await openPicker();
    expect(
      within(groupNamed(en['player.subtitleTracks'])).getByRole('button', {
        name: 'Spanish',
        pressed: true,
      }),
    ).toBeTruthy();
  });
});
