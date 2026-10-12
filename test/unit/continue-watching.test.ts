import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import {
  mergeContinueWatching,
  parseHiddenSeries,
  serialiseHiddenSeries,
  withHiddenSeries,
  withoutHiddenSeries,
  type HiddenSeries,
} from '../../src/home/continue-watching';

/**
 * The Row's own rules: the merge of what is part-watched with what comes next,
 * the order, and the whole life of a hidden Series. Reading the Server is the
 * gateway's job and is covered against the fake Jellyfin in
 * `continue-watching-journey.test.tsx`.
 */

const AT = (iso: string) => Date.parse(iso);

const ticks = (minutes: number) => minutes * 60 * 10_000_000;

const movie = (
  id: string,
  options: { positionTicks?: number; playedAt?: string; runtime?: number; played?: boolean } = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Movie',
  RunTimeTicks: ticks(options.runtime ?? 100),
  UserData: {
    Key: id,
    PlaybackPositionTicks: options.positionTicks ?? 0,
    Played: options.played ?? false,
    ...(options.playedAt === undefined ? {} : { LastPlayedDate: options.playedAt }),
  },
});

const episode = (
  id: string,
  seriesId: string,
  options: { positionTicks?: number; playedAt?: string; runtime?: number; played?: boolean } = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Episode',
  SeriesId: seriesId,
  SeriesName: seriesId,
  SeriesPrimaryImageTag: `tag-${seriesId}`,
  RunTimeTicks: ticks(options.runtime ?? 40),
  UserData: {
    Key: id,
    PlaybackPositionTicks: options.positionTicks ?? 0,
    Played: options.played ?? false,
    ...(options.playedAt === undefined ? {} : { LastPlayedDate: options.playedAt }),
  },
});

const merge = (options: Parameters<typeof mergeContinueWatching>[0]) =>
  mergeContinueWatching(options);

const titleIds = (options: Parameters<typeof mergeContinueWatching>[0]) =>
  merge(options).items.map((item) => item.title.itemId);

describe('the Continue Watching Row', () => {
  it('merges what is part-watched with the next Episode of each Series', () => {
    const row = merge({
      resume: [movie('heat', { positionTicks: ticks(40), playedAt: '2026-06-14T20:00:00Z' })],
      nextUp: [episode('bluey-s2e3', 'series-bluey')],
      playedEpisodes: [episode('bluey-s2e2', 'series-bluey', { played: true, playedAt: '2026-06-15T09:00:00Z' })],
    });

    // Bluey first: an Episode of it was watched this morning, and Heat was
    // yesterday. The next-up Episode has never been played, so its *Series'*
    // activity is what places it.
    expect(row.items.map((item) => item.title.itemId)).toEqual(['series-bluey', 'heat']);
    // The entry is the Episode, while the card is the Series.
    expect(row.items[0]?.itemId).toBe('bluey-s2e3');
    expect(row.items[0]?.title.name).toBe('series-bluey');
  });

  it('orders by most recent activity, newest first', () => {
    expect(
      titleIds({
        resume: [
          movie('old', { positionTicks: 1, playedAt: '2026-06-01T09:00:00Z' }),
          movie('newest', { positionTicks: 1, playedAt: '2026-06-15T09:00:00Z' }),
          movie('middle', { positionTicks: 1, playedAt: '2026-06-10T09:00:00Z' }),
        ],
        nextUp: [],
      }),
    ).toEqual(['newest', 'middle', 'old']);
  });

  it('places a Series by when it was last watched, not by its next Episode', () => {
    // The point of the third read: a show finished an hour ago comes above a
    // film abandoned a fortnight back, even though the Episode offered has
    // never been played at all.
    expect(
      titleIds({
        resume: [movie('heat', { positionTicks: 1, playedAt: '2026-06-01T09:00:00Z' })],
        nextUp: [episode('sev-s2e5', 'series-severance')],
        playedEpisodes: [
          episode('sev-s2e4', 'series-severance', {
            played: true,
            playedAt: '2026-06-15T11:00:00Z',
          }),
        ],
      }),
    ).toEqual(['series-severance', 'heat']);
  });

  it('puts a Series nothing says anything about last, in the order the Server answered', () => {
    const row = titleIds({
      resume: [movie('heat', { positionTicks: 1, playedAt: '2026-06-01T09:00:00Z' })],
      nextUp: [episode('a-s1e1', 'series-a'), episode('b-s1e1', 'series-b')],
      playedEpisodes: [],
    });

    expect(row).toEqual(['heat', 'series-a', 'series-b']);
  });

  it('shows a Series once, part-watched Episode first', () => {
    const row = merge({
      // The Server can mention the same Series in both answers: `NextUp`
      // includes a resumable Episode, which is the one being watched.
      resume: [
        episode('sev-s2e4', 'series-severance', {
          positionTicks: ticks(10),
          playedAt: '2026-06-15T09:00:00Z',
        }),
      ],
      nextUp: [episode('sev-s2e4', 'series-severance')],
      playedEpisodes: [],
    });

    expect(row.items).toHaveLength(1);
    expect(row.items[0]?.itemId).toBe('sev-s2e4');
    expect(row.items[0]?.resumable).toBe(true);
  });

  it('keeps the newer of two part-watched Episodes of one Series', () => {
    const row = merge({
      resume: [
        episode('sev-s2e3', 'series-severance', {
          positionTicks: ticks(5),
          playedAt: '2026-06-10T09:00:00Z',
        }),
        episode('sev-s2e4', 'series-severance', {
          positionTicks: ticks(5),
          playedAt: '2026-06-15T09:00:00Z',
        }),
      ],
      nextUp: [],
    });

    expect(row.items).toHaveLength(1);
    expect(row.items[0]?.itemId).toBe('sev-s2e4');
  });

  it('says how far through each entry the User is', () => {
    const row = merge({
      resume: [movie('heat', { positionTicks: ticks(25), runtime: 100, playedAt: '2026-06-15T09:00:00Z' })],
      // A next-up Episode has none of it watched, and says so rather than
      // leaving the card without a bar.
      nextUp: [episode('bluey-s2e3', 'series-bluey')],
      playedEpisodes: [],
    });

    expect(row.items.map((item) => item.progress)).toEqual([0.25, 0]);
    expect(row.items.map((item) => item.resumable)).toEqual([true, false]);
  });

  it('leaves out something the Server says is finished', () => {
    expect(
      titleIds({
        resume: [movie('heat', { positionTicks: ticks(99), played: true, playedAt: '2026-06-15T09:00:00Z' })],
        nextUp: [],
      }),
    ).toEqual([]);
  });

  it('leaves out anything that is not a Movie or an Episode', () => {
    expect(
      titleIds({
        resume: [
          { Id: 'album', Name: 'Nocturnes', Type: 'MusicAlbum' },
          { Id: 'season', Name: 'Season 2', Type: 'Season', SeriesId: 'series-severance' },
          // An Episode whose Series the Server did not name: no card to draw.
          { Id: 'orphan', Name: 'Orphan', Type: 'Episode', UserData: { Key: 'orphan', PlaybackPositionTicks: 1 } },
        ],
        nextUp: [],
      }),
    ).toEqual([]);
  });

  it('shows no more than the Row holds', () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      movie(`film-${String(index)}`, { positionTicks: 1, playedAt: '2026-06-15T09:00:00Z' }),
    );

    expect(merge({ resume: many, nextUp: [], limit: 20 }).items).toHaveLength(20);
  });
});

describe('a Series the User has taken out of Continue Watching', () => {
  const hiddenSeverance: readonly HiddenSeries[] = [
    { seriesId: 'series-severance', hiddenAt: AT('2026-06-15T09:00:00Z') },
  ];

  it('is left out while nothing of it has been played since', () => {
    const row = merge({
      resume: [],
      nextUp: [episode('sev-s2e5', 'series-severance')],
      playedEpisodes: [
        episode('sev-s2e4', 'series-severance', {
          played: true,
          // Exactly the moment it was hidden: nothing has happened since.
          playedAt: '2026-06-15T09:00:00Z',
        }),
      ],
      hidden: hiddenSeverance,
    });

    expect(row.items).toEqual([]);
    // The record is still doing its job, so it is kept.
    expect(row.hiddenToForget).toEqual([]);
  });

  it('comes back on its own once another Episode is played', () => {
    const row = merge({
      resume: [],
      nextUp: [episode('sev-s2e6', 'series-severance')],
      playedEpisodes: [
        episode('sev-s2e5', 'series-severance', {
          played: true,
          playedAt: '2026-06-16T20:00:00Z',
        }),
      ],
      hidden: hiddenSeverance,
    });

    expect(row.items.map((item) => item.title.itemId)).toEqual(['series-severance']);
    // And the record that hid it is spent, so it cannot hide the Series again
    // the next time its next Episode comes round.
    expect(row.hiddenToForget).toEqual(['series-severance']);
  });

  it('comes back when the User starts watching one of its Episodes again', () => {
    const row = merge({
      resume: [
        episode('sev-s2e5', 'series-severance', {
          positionTicks: ticks(3),
          playedAt: '2026-06-16T20:00:00Z',
        }),
      ],
      nextUp: [],
      hidden: hiddenSeverance,
    });

    expect(row.items.map((item) => item.itemId)).toEqual(['sev-s2e5']);
    expect(row.hiddenToForget).toEqual(['series-severance']);
  });

  it('stays out of the way of every other Series', () => {
    expect(
      titleIds({
        resume: [movie('heat', { positionTicks: 1, playedAt: '2026-06-15T09:00:00Z' })],
        nextUp: [episode('sev-s2e5', 'series-severance'), episode('bluey-s2e3', 'series-bluey')],
        playedEpisodes: [],
        hidden: hiddenSeverance,
      }),
    ).toEqual(['heat', 'series-bluey']);
  });

  it('is hidden at zero when nothing says when it was last watched, so the next play brings it back', () => {
    const neverSaid: readonly HiddenSeries[] = [{ seriesId: 'series-bluey', hiddenAt: 0 }];

    expect(
      titleIds({
        resume: [],
        nextUp: [episode('bluey-s2e3', 'series-bluey')],
        playedEpisodes: [],
        hidden: neverSaid,
      }),
    ).toEqual([]);

    expect(
      titleIds({
        resume: [],
        nextUp: [episode('bluey-s2e4', 'series-bluey')],
        playedEpisodes: [
          episode('bluey-s2e3', 'series-bluey', { played: true, playedAt: '2026-06-16T09:00:00Z' }),
        ],
        hidden: neverSaid,
      }),
    ).toEqual(['series-bluey']);
  });
});

describe('the stored list of hidden Series', () => {
  it('survives being written and read back', () => {
    const hidden: readonly HiddenSeries[] = [
      { seriesId: 'series-severance', hiddenAt: AT('2026-06-15T09:00:00Z') },
    ];

    expect(parseHiddenSeries(serialiseHiddenSeries(hidden))).toEqual(hidden);
  });

  it('is empty for a User who has never hidden anything', () => {
    expect(parseHiddenSeries(undefined)).toEqual([]);
    expect(parseHiddenSeries(null)).toEqual([]);
    expect(parseHiddenSeries('')).toEqual([]);
  });

  it('is empty rather than trusted when it cannot be read', () => {
    // A half-written value, or a hand-edited pref. Trusting a broken record
    // would hide a Series for good, which is the worse way to be wrong.
    expect(parseHiddenSeries('{ not json')).toEqual([]);
    expect(parseHiddenSeries('"series-severance"')).toEqual([]);
  });

  it('drops a record that says nothing, and reads a dateless one as hidden at zero', () => {
    expect(
      parseHiddenSeries(
        JSON.stringify([{ hiddenAt: 1 }, { seriesId: '' }, { seriesId: 'series-bluey' }]),
      ),
    ).toEqual([{ seriesId: 'series-bluey', hiddenAt: 0 }]);
  });

  it('holds one record per Series', () => {
    const hidden = withHiddenSeries(
      [{ seriesId: 'series-bluey', hiddenAt: 1 }],
      { seriesId: 'series-bluey', hiddenAt: 2 },
    );

    expect(hidden).toEqual([{ seriesId: 'series-bluey', hiddenAt: 2 }]);
  });

  it('forgets the records the Row has finished with, and only those', () => {
    const hidden: readonly HiddenSeries[] = [
      { seriesId: 'series-bluey', hiddenAt: 1 },
      { seriesId: 'series-severance', hiddenAt: 2 },
    ];

    expect(withoutHiddenSeries(hidden, ['series-bluey'])).toEqual([
      { seriesId: 'series-severance', hiddenAt: 2 },
    ]);
  });
});
