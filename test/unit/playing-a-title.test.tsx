import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { ticksOfSeconds } from '../../src/playback/reporting';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Pressing Play: the whole journey from a title page through the negotiation,
 * the player and back out again, including what the Server is told along the
 * way.
 *
 * What a browser is needed for — a real decode, a real `play()`, the overlay
 * covering the screen — is `test/e2e/playing-a-title.spec.ts`. happy-dom has no
 * layout and no codecs, but it does have a media element whose `play`, `pause`
 * and `currentTime` behave, which is enough to drive the player's own logic.
 */

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
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

/** Opens one Title's page from Home, the way a User reaches one. */
async function openTitle(name: string): Promise<void> {
  await signIn();
  await screen.findByRole('list', { name: 'New on Jellyflick' });
  pressCard('New on Jellyflick', name);
  await screen.findByRole('heading', { name, level: 1 });
}

/** The video the player is driving, once it has one. */
function video(): HTMLVideoElement {
  const found = document.querySelector('video');
  if (found === null) throw new Error('The player has no video element.');
  return found as HTMLVideoElement;
}

async function pressPlay(name = 'Arrival'): Promise<void> {
  await openTitle(name);
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
}

type Write = { method: string; path: string; body: unknown };

async function reportsTo(path: string): Promise<Write[]> {
  return (await fakeWrites()).filter((write) => write.path === path);
}

/** Waits for the Server to have been told playback started, and hands it back. */
async function startReport(): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> | undefined;
  await waitFor(async () => {
    const reports = await reportsTo('/Sessions/Playing');
    expect(reports).toHaveLength(1);
    body = reports[0]?.body as Record<string, unknown>;
  });
  return body as Record<string, unknown>;
}

describe('a User pressing Play', () => {
  it('opens the player over the title page and starts the Title', async () => {
    await pressPlay();

    await screen.findByRole('region', { name: 'Playing Arrival' });
    await waitFor(() => {
      // Direct play: the file itself, served untouched.
      expect(video().src).toContain('/Videos/movie-arrival/stream.webm');
      expect(video().src).toContain('static=true');
    });
    expect(video().paused).toBe(false);
  });

  it('tells the Server it is playing, and how', async () => {
    await pressPlay();

    expect(await startReport()).toMatchObject({
      ItemId: 'movie-arrival',
      PlaySessionId: 'play-session-movie-arrival',
      MediaSourceId: 'source-movie-arrival',
      PlayMethod: 'DirectPlay',
      IsPaused: false,
      PositionTicks: 0,
    });
  });

  it('resumes where the User left off, in the request as well as in the player', async () => {
    const resumeTicks = ticksOfSeconds(540);
    await setFakeState({ playbackPositions: { 'user-rafael': { 'movie-arrival': resumeTicks } } });

    await pressPlay();
    await startReport();

    // The Server is told to start there, because a transcode has to be cut from
    // that point — a client cannot seek into segments that do not exist.
    const asked = (await fakeRequests()).find((entry) =>
      entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
    );
    expect((asked?.body as Record<string, unknown>).StartTimeTicks).toBe(resumeTicks);
    // And the player is put there, because this one is a direct-played file.
    await waitFor(() => {
      expect(video().currentTime).toBe(540);
    });
    expect((await startReport()).PositionTicks).toBe(resumeTicks);
  });

  it('reports a pause when the User pauses, and carrying on when they go again', async () => {
    await pressPlay();
    await startReport();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause Arrival' }));

    await waitFor(async () => {
      const progress = await reportsTo('/Sessions/Playing/Progress');
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[progress.length - 1]?.body).toMatchObject({ IsPaused: true });
    });
    expect(video().paused).toBe(true);

    // Named with the Title, so the player's own Play is never the title page's
    // Play underneath it — the same call `MyListToggle` makes on a card.
    fireEvent.click(await screen.findByRole('button', { name: 'Play Arrival' }));

    await waitFor(async () => {
      const progress = await reportsTo('/Sessions/Playing/Progress');
      expect(progress[progress.length - 1]?.body).toMatchObject({ IsPaused: false });
    });
  });

  it('reports where it stopped when the player is closed, which is the resume point', async () => {
    await pressPlay();
    await startReport();

    video().currentTime = 95;
    fireEvent(video(), new Event('timeupdate'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(async () => {
      const stopped = await reportsTo('/Sessions/Playing/Stopped');
      expect(stopped).toHaveLength(1);
      expect(stopped[0]?.body).toMatchObject({
        PositionTicks: ticksOfSeconds(95),
        Failed: false,
      });
    });
    // And the title page is back, with the player gone.
    expect(screen.getByRole('heading', { name: 'Arrival', level: 1 })).toBeTruthy();
    expect(document.querySelector('video')).toBeNull();
  });

  it('closes on the Back key, through the one Back handler', async () => {
    await pressPlay();
    await screen.findByRole('region', { name: 'Playing Arrival' });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(document.querySelector('video')).toBeNull();
    });
    // Back closed the player rather than leaving the title page behind it.
    expect(screen.getByRole('heading', { name: 'Arrival', level: 1 })).toBeTruthy();
    expect(window.location.pathname).toBe('/title/movie-arrival');
  });

  it('plays and pauses from the remote’s own media keys', async () => {
    await pressPlay();
    await startReport();

    fireEvent.keyDown(window, { key: 'MediaPlayPause' });

    await waitFor(() => {
      expect(video().paused).toBe(true);
    });

    fireEvent.keyDown(window, { key: 'MediaPlay' });
    await waitFor(() => {
      expect(video().paused).toBe(false);
    });
  });

  it('closes itself and reports the stop when the Title ends', async () => {
    await pressPlay();
    await startReport();

    fireEvent(video(), new Event('ended'));

    await waitFor(async () => {
      expect(await reportsTo('/Sessions/Playing/Stopped')).toHaveLength(1);
    });
    expect(document.querySelector('video')).toBeNull();
  });

  it('says so when the Server has no way to play a Title, rather than showing a black screen', async () => {
    // The Unfinished has no file behind it on the Server at all.
    await pressPlay('The Unfinished');

    await screen.findByText(en['player.cannotPlay']);
    expect(await reportsTo('/Sessions/Playing')).toHaveLength(0);
  });

  it('tells a Server that would not answer apart from a Title that cannot be played', async () => {
    await setFakeState({ failPlaybackInfoWith: 503 });

    await pressPlay();

    await screen.findByText(en['player.unavailable']);
  });

  it('says when the Server would not record how far the User watched', async () => {
    await setFakeState({ failPlaybackReportsWith: 500 });

    await pressPlay();

    await screen.findByText(en['player.unreported']);
    // And the film is still playing, because that is not the User's problem.
    expect(video().paused).toBe(false);
  });
});
