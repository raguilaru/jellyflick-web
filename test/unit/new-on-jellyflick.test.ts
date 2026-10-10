import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { loadNewOnJellyflick, mergeNewOnJellyflick } from '../../src/home/new-on-jellyflick';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Row's own logic, over what each library's `/Items/Latest` came back with.
 * Reading the Server is the gateway's job and is covered against the fake
 * Jellyfin; this is the merging and the Series de-duplication on their own.
 */

const movie = (id: string, name: string, dateCreated: string): BaseItemDto => ({
  Id: id,
  Name: name,
  Type: 'Movie',
  DateCreated: dateCreated,
  ImageTags: { Primary: `tag-${id}` },
});

const episode = (
  id: string,
  series: { id: string; name: string },
  dateCreated: string,
): BaseItemDto => ({
  Id: id,
  Name: `Episode ${id}`,
  Type: 'Episode',
  DateCreated: dateCreated,
  SeriesId: series.id,
  SeriesName: series.name,
  SeriesPrimaryImageTag: `tag-${series.id}`,
});

const names = (titles: readonly { name: string }[]) => titles.map((title) => title.name);

describe('the New on Jellyflick Row', () => {
  it('merges what each library came back with, newest addition first', () => {
    const row = mergeNewOnJellyflick([
      [movie('heat', 'Heat', '2026-06-01T09:00:00Z'), movie('arrival', 'Arrival', '2026-06-10T09:00:00Z')],
      [movie('paddington', 'Paddington', '2026-06-12T09:00:00Z')],
    ]);

    expect(names(row)).toEqual(['Paddington', 'Arrival', 'Heat']);
  });

  it('shows a Series once however many Episodes were added', () => {
    const row = mergeNewOnJellyflick([
      [
        episode('bluey-s2e2', { id: 'series-bluey', name: 'Bluey' }, '2026-06-14T19:00:00Z'),
        episode('bluey-s2e3', { id: 'series-bluey', name: 'Bluey' }, '2026-06-14T20:00:00Z'),
        movie('paddington', 'Paddington', '2026-06-12T09:00:00Z'),
      ],
    ]);

    expect(names(row)).toEqual(['Bluey', 'Paddington']);
  });

  it('places a Series by its newest Episode, not its oldest', () => {
    const row = mergeNewOnJellyflick([
      [
        // Severance's oldest Episode here is older than Arrival, its newest newer.
        episode('sev-s2e3', { id: 'series-severance', name: 'Severance' }, '2026-06-11T08:00:00Z'),
        episode('sev-s2e4', { id: 'series-severance', name: 'Severance' }, '2026-06-13T18:00:00Z'),
        movie('arrival', 'Arrival', '2026-06-12T09:00:00Z'),
      ],
    ]);

    expect(names(row)).toEqual(['Severance', 'Arrival']);
  });

  it('shows a Series once when two libraries both reached it', () => {
    const row = mergeNewOnJellyflick([
      [episode('bluey-s2e2', { id: 'series-bluey', name: 'Bluey' }, '2026-06-14T19:00:00Z')],
      [
        {
          Id: 'season-bluey-s2',
          Name: 'Season 2',
          Type: 'Season' as const,
          DateCreated: '2026-06-13T10:00:00Z',
          SeriesId: 'series-bluey',
          SeriesName: 'Bluey',
          SeriesPrimaryImageTag: 'tag-series-bluey',
        },
      ],
    ]);

    expect(names(row)).toEqual(['Bluey']);
  });

  it('shows a Series under its own name, with its own artwork', () => {
    const row = mergeNewOnJellyflick([
      [episode('sev-s2e4', { id: 'series-severance', name: 'Severance' }, '2026-06-13T18:00:00Z')],
    ]);

    expect(row[0]).toEqual({
      kind: 'Series',
      itemId: 'series-severance',
      name: 'Severance',
      artwork: { itemId: 'series-severance', imageTag: 'tag-series-severance' },
    });
  });

  it('leaves out everything that is not a Movie or a Series', () => {
    const row = mergeNewOnJellyflick([
      [
        {
          Id: 'boxset-heat',
          Name: 'Heat Collection',
          Type: 'BoxSet' as const,
          DateCreated: '2026-06-20T09:00:00Z',
        },
        {
          Id: 'album',
          Name: 'An Album',
          Type: 'MusicAlbum' as const,
          DateCreated: '2026-06-19T09:00:00Z',
        },
        movie('heat', 'Heat', '2026-06-01T09:00:00Z'),
      ],
    ]);

    expect(names(row)).toEqual(['Heat']);
  });

  it('shows no more Titles than the Row holds, keeping the newest', () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      movie(`movie-${String(index)}`, `Movie ${String(index)}`, `2026-06-${String(index + 1).padStart(2, '0')}T09:00:00Z`),
    );

    const row = mergeNewOnJellyflick([many], 3);

    expect(names(row)).toEqual(['Movie 29', 'Movie 28', 'Movie 27']);
  });

  it('is empty when the libraries came back with nothing', () => {
    expect(mergeNewOnJellyflick([[], []])).toEqual([]);
  });
});

/** A gateway signed in as Rafael, against the fake Jellyfin's sample library. */
function gatewayForRafael(deviceId: string) {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Test Device',
    deviceId,
    appVersion: 'test',
    token: `token-user-rafael-${deviceId}`,
  });
}

describe('reading New on Jellyflick from the Server', () => {
  it('merges every library that holds Titles, newest addition first', async () => {
    const row = await loadNewOnJellyflick(gatewayForRafael('reads-the-row'));

    // Each Series once, in the place of its newest Episode, and nothing from
    // the music library — whose newest album is newer than all of these.
    expect(row.outcome === 'row' && row.titles.map((title) => title.name)).toEqual([
      'Bluey',
      'Severance',
      'Paddington',
      'Arrival',
      'Heat',
      'The Unfinished',
    ]);
  });

  it('points each card at the Title’s own artwork', async () => {
    const row = await loadNewOnJellyflick(gatewayForRafael('reads-artwork'));
    const titles = row.outcome === 'row' ? row.titles : [];

    // A Series' artwork is the Series', not the Episode's that was added.
    expect(titles[0]?.artworkUrl).toBe(
      `${fakeJellyfinUrl()}/Items/series-bluey/Images/Primary?tag=tag-bluey&maxWidth=400`,
    );
    expect(titles[3]?.artworkUrl).toBe(
      `${fakeJellyfinUrl()}/Items/movie-arrival/Images/Primary?tag=tag-arrival&maxWidth=400`,
    );
    // The Unfinished has no images on the Server at all.
    expect(titles[5]?.artworkUrl).toBeUndefined();
  });

  it('says it is unavailable when the Server will not answer', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      client: 'Jellyflick',
      device: 'Test Device',
      deviceId: 'no-token',
      appVersion: 'test',
    });

    expect(await loadNewOnJellyflick(gateway)).toEqual({ outcome: 'unavailable' });
  });
});
