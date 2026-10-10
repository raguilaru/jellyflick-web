import { describe, expect, it } from 'vitest';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { catalogueItemFrom } from '../../src/catalogue/catalogue';

describe('the catalogue mapping', () => {
  it('turns a Movie into a Movie Title', () => {
    const item = catalogueItemFrom({
      Id: 'movie-arrival',
      Name: 'Arrival',
      Type: 'Movie',
      DateCreated: '2026-06-10T09:00:00Z',
      ImageTags: { Primary: 'tag-arrival' },
    });

    expect(item).toEqual({
      kind: 'Movie',
      itemId: 'movie-arrival',
      name: 'Arrival',
      addedAt: Date.UTC(2026, 5, 10, 9, 0, 0),
      artwork: { itemId: 'movie-arrival', imageTag: 'tag-arrival' },
    });
  });

  it('turns an Episode into an Episode that names the Series it belongs to', () => {
    const item = catalogueItemFrom({
      Id: 'episode-severance-s2e4',
      Name: 'Chikhai Bardo',
      Type: 'Episode',
      DateCreated: '2026-06-13T18:00:00Z',
      SeriesId: 'series-severance',
      SeriesName: 'Severance',
      SeriesPrimaryImageTag: 'tag-severance',
      ParentIndexNumber: 2,
      IndexNumber: 4,
    });

    expect(item).toEqual({
      kind: 'Episode',
      itemId: 'episode-severance-s2e4',
      name: 'Chikhai Bardo',
      addedAt: Date.UTC(2026, 5, 13, 18, 0, 0),
      series: {
        kind: 'Series',
        itemId: 'series-severance',
        name: 'Severance',
        artwork: { itemId: 'series-severance', imageTag: 'tag-severance' },
      },
      seasonNumber: 2,
      episodeNumber: 4,
    });
  });

  it('turns a Season into a Season that names the Series it belongs to', () => {
    const item = catalogueItemFrom({
      Id: 'season-severance-s2',
      Name: 'Season 2',
      Type: 'Season',
      DateCreated: '2026-06-09T07:00:00Z',
      SeriesId: 'series-severance',
      SeriesName: 'Severance',
      SeriesPrimaryImageTag: 'tag-severance',
      IndexNumber: 2,
    });

    expect(item).toEqual({
      kind: 'Season',
      itemId: 'season-severance-s2',
      name: 'Season 2',
      addedAt: Date.UTC(2026, 5, 9, 7, 0, 0),
      series: {
        kind: 'Series',
        itemId: 'series-severance',
        name: 'Severance',
        artwork: { itemId: 'series-severance', imageTag: 'tag-severance' },
      },
      seasonNumber: 2,
    });
  });

  it('shows nothing for the kinds of item the app does not show', () => {
    // The Server serves music, photos, groupings and folders through the same
    // endpoints, and none of them is a Title.
    const types: BaseItemKind[] = ['BoxSet', 'MusicAlbum', 'Audio', 'Photo', 'Folder', 'Video'];
    for (const type of types) {
      expect(catalogueItemFrom({ Id: `item-${type}`, Name: type, Type: type })).toBeUndefined();
    }
  });

  it('shows nothing for an item the Server did not give an id', () => {
    expect(catalogueItemFrom({ Name: 'Nameless', Type: 'Movie' })).toBeUndefined();
  });
});
