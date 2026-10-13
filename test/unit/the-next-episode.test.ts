import { afterEach, describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { episodeDetailsFrom, type EpisodeDetails } from '../../src/catalogue/catalogue';
import { en } from '../../src/i18n/en';
import { createTranslate } from '../../src/i18n/index';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { episodePlayTarget, nextEpisodeIn, resolveNextEpisode } from '../../src/title/play-target';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * What comes after the Episode now playing (#31, stories 88 and 89).
 *
 * It lives beside `resolvePlayTarget` rather than in the player for the reason
 * `play-target.ts`'s own header gives: "what pressing Play means" is one rule
 * about the domain, and "what plays next" is the same class of rule. #16
 * shipped a Billboard that featured a Series and could not play it precisely
 * because that kind of rule had been written inside one screen.
 */

const t = createTranslate(en);

const episode = (
  id: string,
  options: { season?: number; number?: number; positionTicks?: number; played?: boolean } = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Episode',
  SeriesId: 'series-bluey',
  SeriesName: 'Bluey',
  RunTimeTicks: 30 * 60 * 10_000_000,
  ...(options.season === undefined ? {} : { ParentIndexNumber: options.season }),
  ...(options.number === undefined ? {} : { IndexNumber: options.number }),
  UserData: {
    Key: id,
    PlaybackPositionTicks: options.positionTicks ?? 0,
    Played: options.played ?? false,
  },
});

const details = (...dtos: BaseItemDto[]): readonly EpisodeDetails[] =>
  dtos
    .map((dto) => episodeDetailsFrom(dto))
    .filter((detail): detail is EpisodeDetails => detail !== undefined);

/** The id of whatever follows one Episode in the Server's aired order. */
const after = (playing: string, episodes: readonly EpisodeDetails[]): string | undefined =>
  nextEpisodeIn(episodes, playing)?.episode.itemId;

describe('which Episode follows the one playing', () => {
  const series = details(
    episode('s1e1', { season: 1, number: 1 }),
    episode('s1e2', { season: 1, number: 2 }),
    episode('s2e1', { season: 2, number: 1 }),
  );

  it('is the next one in the Server’s own aired order', () => {
    expect(after('s1e1', series)).toBe('s1e2');
  });

  /**
   * The aired order spans Seasons, which is the whole reason this is a
   * position in `SeriesPage.episodes` rather than in one Season's list: a
   * household that has just finished a Season finale wants the next Season's
   * first Episode, not nothing.
   */
  it('crosses from the end of one Season into the start of the next', () => {
    expect(after('s1e2', series)).toBe('s2e1');
  });

  it('is nothing after the last Episode the Server holds', () => {
    expect(after('s2e1', series)).toBeUndefined();
  });

  /**
   * A Movie, or an Episode of some other Series: there is nothing to go on,
   * and guessing the first Episode of this list would start a household on a
   * programme nobody asked for.
   */
  it('is nothing for an item that is not in this list at all', () => {
    expect(after('movie-arrival', series)).toBeUndefined();
  });

  /**
   * An already-watched next Episode is still the next Episode. Skipping over
   * it would be this app deciding what a household has finished with, and the
   * Server's order is the order a Series is watched in.
   */
  it('is the next one even when the User has already watched it', () => {
    const watched = details(
      episode('s1e1', { season: 1, number: 1 }),
      episode('s1e2', { season: 1, number: 2, played: true }),
    );

    expect(after('s1e1', watched)).toBe('s1e2');
  });
});

describe('the next Episode as something to play', () => {
  it('is headed with the Series and the Episode, as the player needs', () => {
    const series = details(
      episode('s1e1', { season: 1, number: 1 }),
      episode('s1e2', { season: 1, number: 2 }),
    );
    const next = nextEpisodeIn(series, 's1e1');

    expect(next).toBeDefined();
    expect(episodePlayTarget('Bluey', next as EpisodeDetails, t)).toMatchObject({
      itemId: 's1e2',
      name: 'Bluey: s1e2',
      // Carried so the Episode after *this* one can be found in turn: a
      // household bingeing a Season never leaves the player.
      seriesId: 'series-bluey',
    });
  });

  /**
   * The same rule a press of Play follows (#18): the Server keeps the position
   * playback ended at, so a finished Episode starts over rather than resuming
   * a second before its own credits.
   */
  it('starts a finished next Episode from the beginning, not from where it ended', () => {
    const series = details(
      episode('s1e1', { season: 1, number: 1 }),
      episode('s1e2', { season: 1, number: 2, played: true, positionTicks: 29 * 60 * 10_000_000 }),
    );
    const next = nextEpisodeIn(series, 's1e1') as EpisodeDetails;

    expect(episodePlayTarget('Bluey', next, t).resumeTicks).toBeUndefined();
  });

  it('resumes a next Episode the User had part-watched', () => {
    const series = details(
      episode('s1e1', { season: 1, number: 1 }),
      episode('s1e2', { season: 1, number: 2, positionTicks: 5 * 60 * 10_000_000 }),
    );
    const next = nextEpisodeIn(series, 's1e1') as EpisodeDetails;

    expect(episodePlayTarget('Bluey', next, t).resumeTicks).toBe(5 * 60 * 10_000_000);
  });
});

/**
 * Reading it off the Server, against the fake Jellyfin's HTTP boundary.
 *
 * Bluey's aired order is `s1e1` The Magic Xylophone, `s1e2` Hotel, `s2e2` The
 * Pool, `s2e3` Sleepytime, which is what `/Shows/{id}/Episodes` answers.
 */
describe('reading what comes next off the Server', () => {
  afterEach(resetFakeState);

  const gateway = () =>
    createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      client: 'Jellyflick',
      device: 'Test Device',
      appVersion: '0.1.0',
      deviceId: 'reads-the-next-episode',
      token: 'token-user-rafael-reads-the-next-episode',
    });

  it('answers the Episode after the one playing, ready for the player', async () => {
    expect(
      await resolveNextEpisode(gateway(), 'series-bluey', 'episode-bluey-s1e1', t),
    ).toMatchObject({
      itemId: 'episode-bluey-s1e2',
      name: 'Bluey: Hotel',
      seriesId: 'series-bluey',
    });
  });

  it('answers nothing after the last Episode of the Series', async () => {
    expect(
      await resolveNextEpisode(gateway(), 'series-bluey', 'episode-bluey-s2e3', t),
    ).toBeUndefined();
  });

  /**
   * A Server that will not say what the Series holds leaves the player with
   * nothing to offer, which is the same thing to a User as an Episode with
   * nothing after it. It is not worth a message of its own: the Episode they
   * were watching has finished either way.
   */
  it('answers nothing when the Server will not list the Episodes', async () => {
    await setFakeState({ failLibraryQueriesWith: 503 });

    expect(
      await resolveNextEpisode(gateway(), 'series-bluey', 'episode-bluey-s1e1', t),
    ).toBeUndefined();
  });
});
