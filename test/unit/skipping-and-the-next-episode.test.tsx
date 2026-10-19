import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { NEXT_EPISODE_COUNTDOWN_SECONDS } from '../../src/playback/next-episode';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
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
 * Skipping an intro or the credits, and what happens when an Episode runs out
 * (#31, stories 87 to 89).
 *
 * The journey is the seam, because that is where the ticket's promises are: a
 * button appears while the Server says there is a marker, pressing it moves the
 * picture, and the end of an Episode offers the next one **following the User's
 * own Jellyfin account**. The arithmetic is pinned down on its own in
 * `skipping-intros-and-credits.test.ts` and which Episode comes next in
 * `the-next-episode.test.ts`; this file is about what a User sees.
 *
 * What a browser is needed for is `test/e2e/skipping-and-the-next-episode.spec.ts`:
 * happy-dom gives every element a zero-sized box, so no test here can say where
 * an arrow key sends focus, or that the row of buttons fits on a screen.
 *
 * Bluey is the Series throughout — four Episodes in aired order, `s1e1` The
 * Magic Xylophone first and `s1e2` Hotel after it — because an intro, a set of
 * credits and a next Episode are all things an Episode has and a Movie does
 * not.
 */

const RAFAEL = 'user-rafael';

/** Intro from ten seconds to forty, credits from five minutes to six. */
const BLUEY_MARKERS = {
  'episode-bluey-s1e1': [
    { Type: 'Intro', StartTicks: 100_000_000, EndTicks: 400_000_000 },
    { Type: 'Outro', StartTicks: 3_000_000_000, EndTicks: 3_600_000_000 },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  return resetFakeState();
});

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

/**
 * Plays Bluey from its title page, which by #18's rule is `s1e1` — the first
 * unwatched Episode of a Series nobody has started.
 */
async function playBluey(episodeName = 'The Magic Xylophone'): Promise<void> {
  await signIn();
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', 'Bluey');
  await screen.findByRole('heading', { name: 'Bluey', level: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
  await screen.findByRole('region', { name: `Playing Bluey: ${episodeName}` });
  // The controls wait for the negotiation, so this is a settled player.
  await screen.findByRole('button', { name: `Pause Bluey: ${episodeName}` });
  await settled();
}

/**
 * Waits until the Server has been told playback started.
 *
 * It is the same wait `choosing-tracks.test.tsx` makes and for the same
 * reason: until the one report every playback sends has landed, the player is
 * still attaching its source, and an `ended` fired into that gap reaches a
 * media element the player has not finished wiring up.
 */
async function settled(): Promise<void> {
  await waitFor(async () => {
    const started = (await fakeWrites()).filter((write) => write.path === '/Sessions/Playing');
    expect(started.length).toBeGreaterThan(0);
  });
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

/** Runs the Episode out, which is what the end of a file looks like. */
function runToTheEnd(): void {
  video().currentTime = 360;
  fireEvent(video(), new Event('ended'));
}

/**
 * The Skip buttons, found by their **accessible** name, which carries the
 * Episode: that is the name a screen reader reads and a remote User hears, and
 * the short words on the face of the button are checked separately below.
 */
const INTRO_NAME = 'Skip the intro of Bluey: The Magic Xylophone';
const CREDITS_NAME = 'Skip the credits of Bluey: The Magic Xylophone';

const skipIntro = () => screen.queryByRole('button', { name: INTRO_NAME });
const skipCredits = () => screen.queryByRole('button', { name: CREDITS_NAME });

describe('skipping an intro and the credits', () => {
  it('offers nothing to skip on a Server that holds no markers', async () => {
    await playBluey();
    watchUpTo(20);

    expect(skipIntro()).toBeNull();
    expect(skipCredits()).toBeNull();
  });

  it('offers Skip Intro while the intro is playing, and not before', async () => {
    await setFakeState({ mediaSegments: BLUEY_MARKERS });
    await playBluey();

    watchUpTo(5);
    expect(skipIntro()).toBeNull();

    watchUpTo(20);
    await waitFor(() => {
      expect(skipIntro()).not.toBeNull();
    });
  });

  it('moves the picture to the end of the intro when it is pressed', async () => {
    await setFakeState({ mediaSegments: BLUEY_MARKERS });
    await playBluey();
    watchUpTo(20);

    const button = await screen.findByRole('button', { name: INTRO_NAME });
    fireEvent.click(button);

    // Forty seconds is where the Server said the intro ends.
    expect(video().currentTime).toBe(40);
    // And the offer is gone, because the marker it belonged to is behind them.
    await waitFor(() => {
      expect(skipIntro()).toBeNull();
    });
  });

  /**
   * `decisions.md` §5: there is no `Credits` segment type, so the button a
   * User reads as Skip Credits is driven by an `Outro`.
   */
  it('offers Skip Credits in the credits, which the Server calls an Outro', async () => {
    await setFakeState({ mediaSegments: BLUEY_MARKERS });
    await playBluey();
    watchUpTo(320);

    await waitFor(() => {
      expect(skipCredits()).not.toBeNull();
    });
    expect(skipIntro()).toBeNull();
  });

  /**
   * Every control in the player carries the Title's name, so a screen reader
   * hears *what* is being skipped — and a player's Skip is never confused with
   * anything on the title page underneath it.
   */
  it('names the Episode being skipped, and says only Skip Intro on its face', async () => {
    await setFakeState({ mediaSegments: BLUEY_MARKERS });
    await playBluey();
    watchUpTo(20);

    const button = await screen.findByRole('button', { name: INTRO_NAME });
    // The short words are what fits a phone; the name is what is heard.
    expect(button.textContent).toBe(en['player.skipIntro']);
  });

  /**
   * It is a real `<button>` inside the player, which is the half of "focusable
   * with the remote" a test with no layout can say. Where an arrow key really
   * lands is the e2e suite's.
   */
  it('is a focus stop inside the player, which is what a remote reaches', async () => {
    await setFakeState({ mediaSegments: BLUEY_MARKERS });
    await playBluey();
    watchUpTo(20);

    const button = await screen.findByRole('button', { name: INTRO_NAME });
    expect(button.closest('.player')).not.toBeNull();
    expect(button.hasAttribute('disabled')).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('asks the Server for markers only where it said there are some', async () => {
    await playBluey();
    watchUpTo(20);

    // `MediaSourceInfo.HasSegments` was false, and §12 says that flag exists
    // precisely so a client does not make this request.
    await waitFor(async () => {
      expect(await segmentRequests()).toBe(0);
    });
  });
});

describe('the next Episode when one runs out', () => {
  it('offers the Episode that follows, named', async () => {
    await playBluey();
    runToTheEnd();

    await screen.findByRole('region', { name: en['player.nextUpLabel'] });
    expect(screen.getByText('Next: Bluey: Hotel')).toBeTruthy();
  });

  /**
   * The ticket's third box, and the account is the only place the answer lives:
   * `UserConfiguration.EnableNextEpisodeAutoPlay`, which #35 already reads into
   * `usePlaybackPreferences()`. The settings screen offers the two readings as
   * "Start the next one" and "Ask me each time", and these are those two.
   */
  it('counts down when the User’s Jellyfin account says to start the next one', async () => {
    await playBluey();
    runToTheEnd();

    await screen.findByText(
      en['player.nextUpCountdown']({ seconds: NEXT_EPISODE_COUNTDOWN_SECONDS }),
    );
  });

  it('asks instead of counting down when their account says to ask each time', async () => {
    await setFakeState({
      userConfiguration: { [RAFAEL]: { EnableNextEpisodeAutoPlay: false } },
    });
    await playBluey();
    runToTheEnd();

    await screen.findByRole('region', { name: en['player.nextUpLabel'] });
    // The offer stands, with nothing counting: a User who asked to be asked is
    // asked, which is what the settings screen promised them.
    expect(
      screen.queryByText(
        en['player.nextUpCountdown']({ seconds: NEXT_EPISODE_COUNTDOWN_SECONDS }),
      ),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Play Bluey: Hotel now' })).toBeTruthy();
  });

  it('starts the next Episode when the countdown runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await playBluey();
    runToTheEnd();
    await screen.findByRole('region', { name: en['player.nextUpLabel'] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync((NEXT_EPISODE_COUNTDOWN_SECONDS + 1) * 1000);
    });

    await screen.findByRole('region', { name: 'Playing Bluey: Hotel' });
  });

  it('starts it at once when the User presses Play now', async () => {
    await playBluey();
    runToTheEnd();

    fireEvent.click(await screen.findByRole('button', { name: 'Play Bluey: Hotel now' }));

    await screen.findByRole('region', { name: 'Playing Bluey: Hotel' });
  });

  /**
   * Story 89. Cancelling **stays at the end** rather than closing: the Episode
   * is over, the controls are up because there is nothing playing behind them,
   * and the title page is one press of Close or Back away. Closing outright
   * would take a decision the User did not make — they said "not the next
   * one", not "take me out of here".
   */
  it('stays at the end of the Episode when the User cancels', async () => {
    await playBluey();
    runToTheEnd();

    fireEvent.click(await screen.findByRole('button', { name: 'Do not play Bluey: Hotel' }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: en['player.nextUpLabel'] })).toBeNull();
    });
    // Still the Episode that just finished, and still something to press.
    expect(screen.getByRole('region', { name: 'Playing Bluey: The Magic Xylophone' })).toBeTruthy();
    expect(screen.getByRole('button', { name: en['player.close'] })).toBeTruthy();
  });

  it('does not start the next Episode after it has been cancelled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await playBluey();
    runToTheEnd();

    fireEvent.click(await screen.findByRole('button', { name: 'Do not play Bluey: Hotel' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync((NEXT_EPISODE_COUNTDOWN_SECONDS + 5) * 1000);
    });

    expect(screen.queryByRole('region', { name: 'Playing Bluey: Hotel' })).toBeNull();
  });

  /**
   * The last Episode of a Series, and a Movie, have nothing after them — so
   * the player closes as it always did and the User is back on the title page.
   */
  it('closes as before at the end of the last Episode there is', async () => {
    await setFakeState({
      // Everything but the last Episode watched, so Play starts `s2e3`.
      played: {
        [RAFAEL]: ['episode-bluey-s1e1', 'episode-bluey-s1e2', 'episode-bluey-s2e2'],
      },
    });
    await playBluey('Sleepytime');
    runToTheEnd();

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: /^Playing/ })).toBeNull();
    });
    expect(screen.getByRole('heading', { name: 'Bluey', level: 1 })).toBeTruthy();
  });

  it('closes as before at the end of a Movie, which has no next Episode', async () => {
    await signIn();
    await screen.findByRole('list', { name: 'New on Jellyflick' });
    pressCard('New on Jellyflick', 'Arrival');
    await screen.findByRole('heading', { name: 'Arrival', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await screen.findByRole('region', { name: 'Playing Arrival' });
    await screen.findByRole('button', { name: 'Pause Arrival' });
    await settled();

    runToTheEnd();

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Playing Arrival' })).toBeNull();
    });
  });

  /**
   * The Episode that finished is reported stopped, as it always was, and the
   * next one opens a session of its own. A household bingeing a Season has to
   * leave the Server a resume point per Episode, not one for the Series.
   */
  it('tells the Server the first Episode stopped and the next one started', async () => {
    await playBluey();
    runToTheEnd();

    fireEvent.click(await screen.findByRole('button', { name: 'Play Bluey: Hotel now' }));
    await screen.findByRole('region', { name: 'Playing Bluey: Hotel' });

    await waitFor(async () => {
      const started = (await fakeWrites())
        .filter((write) => write.path === '/Sessions/Playing')
        .map((write) => (write.body as { ItemId?: string }).ItemId);
      expect(started).toContain('episode-bluey-s1e1');
      expect(started).toContain('episode-bluey-s1e2');
    });

    const stopped = (await fakeWrites())
      .filter((write) => write.path === '/Sessions/Playing/Stopped')
      .map((write) => (write.body as { ItemId?: string }).ItemId);
    expect(stopped).toContain('episode-bluey-s1e1');
  });
});

async function segmentRequests(): Promise<number> {
  const { fakeRequests } = await import('../fake-jellyfin/control');
  return (await fakeRequests()).filter((entry) => entry.path.startsWith('/MediaSegments/')).length;
}
