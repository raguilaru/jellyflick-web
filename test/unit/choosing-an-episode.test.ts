import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { episodeToPlay, seasonsOf } from '../../src/title/series';

/**
 * A Series' own rules on the title page (#18): which Episode one press of Play
 * starts, and which Seasons the picker offers.
 *
 * Both are pure functions of what the Server said, so they are pinned down
 * here. Reading the Server is the gateway's job and is covered against the fake
 * Jellyfin in `series-on-the-title-page.test.tsx`, along with the screen.
 */

const ticks = (minutes: number) => minutes * 60 * 10_000_000;

const episode = (
  id: string,
  options: {
    season?: number;
    number?: number;
    positionTicks?: number;
    played?: boolean;
    playedAt?: string;
  } = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Episode',
  SeriesId: 'series-bluey',
  SeriesName: 'Bluey',
  RunTimeTicks: ticks(30),
  ...(options.season === undefined ? {} : { ParentIndexNumber: options.season }),
  ...(options.number === undefined ? {} : { IndexNumber: options.number }),
  UserData: {
    Key: id,
    PlaybackPositionTicks: options.positionTicks ?? 0,
    Played: options.played ?? false,
    ...(options.playedAt === undefined ? {} : { LastPlayedDate: options.playedAt }),
  },
});

const season = (id: string, number?: number, name?: string): BaseItemDto => ({
  Id: id,
  Name: name ?? id,
  Type: 'Season',
  SeriesId: 'series-bluey',
  SeriesName: 'Bluey',
  ...(number === undefined ? {} : { IndexNumber: number }),
});

/** The id of the Episode one press of Play would start. */
const played = (episodes: readonly BaseItemDto[]): string | undefined =>
  episodeToPlay(episodes)?.episode.itemId;

describe('which Episode Play starts', () => {
  it('starts the first unwatched Episode of a Series nobody has touched', () => {
    expect(
      played([
        episode('s1e1', { season: 1, number: 1 }),
        episode('s1e2', { season: 1, number: 2 }),
      ]),
    ).toBe('s1e1');
  });

  it('starts the Episode after the ones already watched', () => {
    expect(
      played([
        episode('s1e1', { season: 1, number: 1, played: true }),
        episode('s1e2', { season: 1, number: 2, played: true }),
        episode('s2e1', { season: 2, number: 1 }),
      ]),
    ).toBe('s2e1');
  });

  it('resumes the part-watched Episode rather than the next unwatched one', () => {
    // The User is in the middle of s1e2, so that is what Play means — even
    // though s1e3 has never been played and sorts after it.
    expect(
      played([
        episode('s1e1', { season: 1, number: 1, played: true }),
        episode('s1e2', { season: 1, number: 2, positionTicks: ticks(10) }),
        episode('s1e3', { season: 1, number: 3 }),
      ]),
    ).toBe('s1e2');
  });

  it('resumes the part-watched Episode the User played most recently', () => {
    // Two abandoned Episodes: the one they were watching last night is where
    // they are, not the one they gave up on last month.
    expect(
      played([
        episode('s1e1', {
          season: 1,
          number: 1,
          positionTicks: ticks(5),
          playedAt: '2026-05-01T20:00:00Z',
        }),
        episode('s1e2', {
          season: 1,
          number: 2,
          positionTicks: ticks(9),
          playedAt: '2026-06-15T20:00:00Z',
        }),
      ]),
    ).toBe('s1e2');
  });

  it('ignores a resume point on an Episode the User has finished', () => {
    // A finished Episode keeps the position it ended at, which is not an
    // Episode anybody is in the middle of.
    expect(
      played([
        episode('s1e1', { season: 1, number: 1, played: true, positionTicks: ticks(29) }),
        episode('s1e2', { season: 1, number: 2 }),
      ]),
    ).toBe('s1e2');
  });

  it('starts the first Episode again once the whole Series has been watched', () => {
    expect(
      played([
        episode('s1e1', { season: 1, number: 1, played: true }),
        episode('s1e2', { season: 1, number: 2, played: true }),
      ]),
    ).toBe('s1e1');
  });

  it('has nothing to start for a Series the Server listed no Episodes for', () => {
    expect(episodeToPlay([])).toBeUndefined();
  });

  it('keeps the Server’s own order rather than sorting the Episodes itself', () => {
    // `/Shows/{id}/Episodes` answers in aired order, and that order is the
    // Server's answer: `Array.prototype.sort` is only stable from Chromium 70,
    // one above the floor ADR 0002 sets, so nothing here re-sorts it.
    expect(
      played([episode('special'), episode('s1e1', { season: 1, number: 1 })]),
    ).toBe('special');
  });
});

describe('the Seasons the picker offers', () => {
  it('groups the Episodes under the Seasons the Server listed', () => {
    const grouped = seasonsOf(
      [season('season-1', 1, 'Season 1'), season('season-2', 2, 'Season 2')],
      [
        episode('s1e1', { season: 1, number: 1 }),
        episode('s2e1', { season: 2, number: 1 }),
        episode('s2e2', { season: 2, number: 2 }),
      ],
    );

    expect(grouped.map((group) => [group.id, group.name, group.episodes.length])).toEqual([
      ['season-1', 'Season 1', 1],
      ['season-2', 'Season 2', 2],
    ]);
  });

  it('leaves out a Season the Server lists but holds no Episodes of', () => {
    // A Season nothing is in is a tab that shows nothing, which is worse than
    // not offering it at all.
    const grouped = seasonsOf(
      [season('season-1', 1, 'Season 1'), season('season-2', 2, 'Season 2')],
      [episode('s2e1', { season: 2, number: 1 })],
    );

    expect(grouped.map((group) => group.id)).toEqual(['season-2']);
  });

  it('makes a Season of its own for Episodes the Server listed no Season for', () => {
    // Jellyfin really does serve Episodes whose Season is not an item of its
    // own, so the numbers on the Episodes are the fallback.
    const grouped = seasonsOf(
      [],
      [
        episode('s1e1', { season: 1, number: 1 }),
        episode('s2e1', { season: 2, number: 1 }),
      ],
    );

    expect(grouped.map((group) => [group.seasonNumber, group.episodes.length])).toEqual([
      [1, 1],
      [2, 1],
    ]);
  });

  it('gathers the Episodes the Server placed nowhere into one last group', () => {
    const grouped = seasonsOf(
      [season('season-1', 1, 'Season 1')],
      [episode('s1e1', { season: 1, number: 1 }), episode('stray')],
    );

    expect(grouped.map((group) => [group.seasonNumber, group.episodes.length])).toEqual([
      [1, 1],
      [undefined, 1],
    ]);
  });

  it('has no Seasons at all for a Series the Server listed no Episodes for', () => {
    expect(seasonsOf([season('season-1', 1, 'Season 1')], [])).toEqual([]);
  });

  /**
   * A library really can hold two Season items carrying the same number — a
   * stray duplicate folder, or specials filed into Season 1. The Episodes are
   * matched by number, so both items would otherwise claim the same ones and
   * the picker would offer the same Season twice.
   */
  it('offers a Season once when the Server holds two items with its number', () => {
    const grouped = seasonsOf(
      [season('season-1', 1, 'Season 1'), season('season-1-again', 1, 'Season 1 (again)')],
      [episode('one', { season: 1, number: 1 }), episode('two', { season: 1, number: 2 })],
    );

    expect(grouped.map((group) => group.seasonNumber)).toEqual([1]);
    expect(grouped[0]?.id).toBe('season-1');
    expect(grouped[0]?.episodes.map((detail) => detail.episode.itemId)).toEqual(['one', 'two']);
  });
});
