import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { loadSeries } from '../../src/title/series';
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
 * A Series on its title page (#18), against the fake Jellyfin: what the Server
 * is asked for the Seasons and the Episodes, and the screen a User drives.
 *
 * The rules themselves — which Episode Play starts, and how the Seasons are
 * grouped — are pure functions and are pinned down in
 * `choosing-an-episode.test.ts`.
 */

const identity = {
  client: 'Jellyflick',
  device: 'Test Device',
  appVersion: '0.1.0',
};

/** A token the fake accepts for Rafael: the Server issues one per DeviceId. */
const tokenFor = (deviceId: string) => `token-user-rafael-${deviceId}`;

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
});

function gatewayFor(deviceId: string) {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    deviceId,
    ...identity,
    token: tokenFor(deviceId),
  });
}

describe('reading a Series off the Server', () => {
  it('reads its Seasons and its Episodes in the Server’s aired order', async () => {
    const series = await loadSeries(gatewayFor('reads-a-series'), 'series-bluey');

    expect(series.episodes.map((detail) => detail.episode.itemId)).toEqual([
      'episode-bluey-s1e1',
      'episode-bluey-s1e2',
      'episode-bluey-s2e2',
      'episode-bluey-s2e3',
    ]);
    expect(series.seasons.map((season) => [season.name, season.episodes.length])).toEqual([
      ['Season 1', 2],
      ['Season 2', 2],
    ]);
  });

  it('asks for the description, the still and the length the list draws', async () => {
    const series = await loadSeries(gatewayFor('reads-episode-detail'), 'series-bluey');
    const first = series.episodes[0];

    expect(first?.episode.name).toBe('The Magic Xylophone');
    expect(first?.overview).toBe('Bandit is frozen by a magic xylophone.');
    expect(first?.runtimeMinutes).toBe(7);
    expect(first?.thumbnail?.imageTag).toBe('tag-bluey-s1e1');
  });

  it('reads this User’s own progress through each Episode', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-bluey-s1e1'] },
      playbackPositions: { 'user-rafael': { 'episode-bluey-s2e2': 3.5 * 60 * 10_000_000 } },
    });

    const series = await loadSeries(gatewayFor('reads-episode-progress'), 'series-bluey');
    const byId = new Map(series.episodes.map((detail) => [detail.episode.itemId, detail]));

    expect(byId.get('episode-bluey-s1e1')?.playback.played).toBe(true);
    // Half of a seven-minute Episode, which is the Server's own percentage.
    expect(byId.get('episode-bluey-s2e2')?.playback.progress).toBeCloseTo(0.5, 2);
    // Nobody has started this one, so there is no progress to show at all —
    // not a bar at zero, which is what the Server sending a zero position
    // would come to if it were taken at face value.
    expect(byId.get('episode-bluey-s2e3')?.playback.progress).toBeUndefined();
    expect(byId.get('episode-bluey-s2e3')?.playback.played).toBe(false);
  });

  it('is an empty Series when the Server will not say what is in it', async () => {
    await setFakeState({ failLibraryQueriesWith: 503 });

    const series = await loadSeries(gatewayFor('series-unavailable'), 'series-bluey');

    expect(series).toEqual({ seasons: [], episodes: [] });
  });
});

/** Signs Rafael in and opens one Title's page from Home, as a User does. */
async function openTitle(name: string): Promise<void> {
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

  const row = await screen.findByRole('list', { name: 'New on Jellyflick' });
  const card = Array.from(row.querySelectorAll('.card')).find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  );
  if (card === undefined) throw new Error(`No card for ${name}.`);
  fireEvent.click(card);
  await screen.findByRole('heading', { name, level: 1 });
}

/** Bluey's title page, once the Episodes under it have arrived. */
async function openBluey(): Promise<void> {
  await openTitle('Bluey');
  await screen.findByRole('list', { name: en['title.episodes'] });
}

/**
 * Waits for the player to be over the page playing one thing, then closes it.
 *
 * Closing matters: a player left open goes on reporting progress to the Server,
 * and a report that landed after the next test had reseeded the sample data
 * would make that test depend on this one.
 */
async function playingThenClose(name: string): Promise<void> {
  const player = await screen.findByRole('region', { name: en['player.label']({ name }) });
  fireEvent.click(screen.getByRole('button', { name: en['player.close'] }));
  await waitFor(() => {
    expect(player.isConnected).toBe(false);
  });
}

/** The Episodes the list is showing, by the name each one is pressed by. */
function episodeNames(): string[] {
  const list = screen.getByRole('list', { name: en['title.episodes'] });
  return Array.from(list.querySelectorAll('.episode__name')).map(
    (name) => name.textContent ?? '',
  );
}

/** Which Season the picker has chosen. */
function chosenSeason(): string | undefined {
  const picker = screen.getByRole('group', { name: en['title.seasons'] });
  return (
    Array.from(picker.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-pressed') === 'true',
    )?.textContent ?? undefined
  );
}

describe('a User choosing an Episode on a Series’ title page', () => {
  it('offers the Seasons and lists the chosen one’s Episodes', async () => {
    await openBluey();

    const picker = screen.getByRole('group', { name: en['title.seasons'] });
    expect(
      Array.from(picker.querySelectorAll('button')).map((button) => button.textContent),
    ).toEqual(['Season 1', 'Season 2']);
    // Season 1 is where this User is: nobody has watched anything, so the
    // Episode Play would start is its first, and that is the Season shown.
    expect(chosenSeason()).toBe('Season 1');
    expect(episodeNames()).toEqual(['1. The Magic Xylophone', '2. Hotel']);
  });

  it('shows another Season’s Episodes when the User picks it', async () => {
    await openBluey();

    fireEvent.click(screen.getByRole('button', { name: 'Season 2' }));

    await waitFor(() => {
      expect(episodeNames()).toEqual(['2. The Pool', '3. Sleepytime']);
    });
    expect(chosenSeason()).toBe('Season 2');
  });

  it('opens on the Season holding the Episode the User is up to', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-bluey-s1e1', 'episode-bluey-s1e2'] },
    });

    await openBluey();

    expect(chosenSeason()).toBe('Season 2');
    expect(episodeNames()).toEqual(['2. The Pool', '3. Sleepytime']);
  });

  it('shows each Episode’s still, description, length and progress', async () => {
    await setFakeState({
      playbackPositions: { 'user-rafael': { 'episode-bluey-s1e1': 3.5 * 60 * 10_000_000 } },
    });

    await openBluey();
    const list = screen.getByRole('list', { name: en['title.episodes'] });
    const [first, second] = Array.from(list.querySelectorAll('li'));

    expect(first?.textContent).toContain('Bandit is frozen by a magic xylophone.');
    expect(first?.textContent).toContain('7m');
    expect(first?.querySelector('img')?.getAttribute('src')).toContain(
      '/Items/episode-bluey-s1e1/Images/Primary',
    );
    // Half way through, which is `role="progressbar"` rather than a styled bar:
    // how much is left is the whole point of it.
    expect(first?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '50',
    );

    // And the Episode the Server said almost nothing about is still listed,
    // with everything it has nothing for simply absent.
    expect(second?.textContent).toContain('Hotel');
    expect(second?.querySelector('[role="progressbar"]')).toBeNull();
    expect(second?.querySelector('img')).toBeNull();
  });

  it('starts the next unwatched Episode when Play is pressed', async () => {
    await openBluey();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await playingThenClose('Bluey: The Magic Xylophone');
  });

  it('resumes the Episode the User is in the middle of when Play is pressed', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-bluey-s1e1'] },
      playbackPositions: { 'user-rafael': { 'episode-bluey-s2e2': 3 * 60 * 10_000_000 } },
    });

    await openBluey();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // The Pool, not Hotel: a part-watched Episode beats the next unwatched one,
    // because that is where the User actually is.
    await playingThenClose('Bluey: The Pool');
  });

  it('plays the Episode the User presses in the list', async () => {
    await openBluey();

    fireEvent.click(screen.getByRole('button', { name: /2\. Hotel/ }));

    await playingThenClose('Bluey: Hotel');
  });

  it('marks one Episode watched and unwatched, and tells the Server', async () => {
    await openBluey();

    fireEvent.click(
      screen.getByRole('button', { name: en['title.markWatched']({ name: 'Hotel' }) }),
    );
    await screen.findByRole('button', {
      name: en['title.markNotWatched']({ name: 'Hotel' }),
    });

    fireEvent.click(
      screen.getByRole('button', { name: en['title.markNotWatched']({ name: 'Hotel' }) }),
    );
    await screen.findByRole('button', { name: en['title.markWatched']({ name: 'Hotel' }) });

    await waitFor(async () => {
      const writes = await fakeWrites();
      expect(
        writes
          .filter((write) => write.path.startsWith('/UserPlayedItems/'))
          .map((write) => [write.method, write.path]),
      ).toEqual([
        ['POST', '/UserPlayedItems/episode-bluey-s1e2'],
        ['DELETE', '/UserPlayedItems/episode-bluey-s1e2'],
      ]);
    });
  });

  it('takes the watched mark back when the Server refuses it', async () => {
    await openBluey();
    await setFakeState({ failPlayedWritesWith: 503 });

    fireEvent.click(
      screen.getByRole('button', { name: en['title.markWatched']({ name: 'Hotel' }) }),
    );

    await screen.findByText(en['title.watchedUnsaved']);
    expect(
      screen.getByRole('button', { name: en['title.markWatched']({ name: 'Hotel' }) }),
    ).toBeTruthy();
  });

  it('has no Seasons and no Episode list on a Movie’s title page', async () => {
    await openTitle('Arrival');

    expect(screen.queryByRole('group', { name: en['title.seasons'] })).toBeNull();
    expect(screen.queryByRole('list', { name: en['title.episodes'] })).toBeNull();
  });
});
