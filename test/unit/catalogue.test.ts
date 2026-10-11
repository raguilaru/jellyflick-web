import { describe, expect, it } from 'vitest';
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { catalogueItemFrom, titleDetailsFrom } from '../../src/catalogue/catalogue';

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

describe('a Title’s details', () => {
  it('reads everything the title page shows off one item', () => {
    const details = titleDetailsFrom({
      Id: 'movie-arrival',
      Name: 'Arrival',
      Type: 'Movie',
      ProductionYear: 2016,
      OfficialRating: 'PG-13',
      // Two hours and a minute, in Jellyfin's 100-nanosecond ticks.
      RunTimeTicks: 121 * 60 * 10_000_000,
      Genres: ['Science Fiction', 'Drama'],
      Overview: 'A linguist is asked to talk to the visitors.',
      CriticRating: 94,
      CommunityRating: 7.9,
      ImageTags: { Primary: 'tag-arrival', Logo: 'tag-arrival-logo' },
      BackdropImageTags: ['tag-arrival-backdrop', 'tag-arrival-backdrop-2'],
      People: [
        { Name: 'Amy Adams', Type: 'Actor', Role: 'Louise Banks' },
        { Name: 'Jeremy Renner', Type: 'Actor', Role: 'Ian Donnelly' },
        // Not cast, so not on the title page's cast list.
        { Name: 'Denis Villeneuve', Type: 'Director' },
      ],
      MediaStreams: [
        { Type: 'Audio', Language: 'eng', DisplayTitle: 'English' },
        { Type: 'Audio', Language: 'fra', DisplayTitle: 'French' },
        { Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English' },
        { Type: 'Video', Language: 'und' },
      ],
      UserData: { Key: 'movie-arrival', Played: true },
    });

    expect(details).toEqual({
      title: {
        kind: 'Movie',
        itemId: 'movie-arrival',
        name: 'Arrival',
        artwork: { itemId: 'movie-arrival', imageTag: 'tag-arrival' },
      },
      year: 2016,
      ageRating: 'PG-13',
      runtimeMinutes: 121,
      genres: ['Science Fiction', 'Drama'],
      overview: 'A linguist is asked to talk to the visitors.',
      criticRating: 94,
      communityRating: 7.9,
      cast: [
        { name: 'Amy Adams', role: 'Louise Banks' },
        { name: 'Jeremy Renner', role: 'Ian Donnelly' },
      ],
      logo: { itemId: 'movie-arrival', imageTag: 'tag-arrival-logo' },
      backdrop: { itemId: 'movie-arrival', imageTag: 'tag-arrival-backdrop' },
      audioLanguages: ['eng', 'fra'],
      subtitleLanguages: ['eng'],
      watched: true,
    });
  });

  it('reads where this User got to, which is what Play resumes from', () => {
    // Nine minutes in, in Jellyfin's 100-nanosecond ticks (#25).
    const details = titleDetailsFrom({
      Id: 'movie-arrival',
      Name: 'Arrival',
      Type: 'Movie',
      UserData: { Key: 'movie-arrival', PlaybackPositionTicks: 5_400_000_000 },
    });

    expect(details?.resumePositionTicks).toBe(5_400_000_000);
  });

  it('leaves out a resume point of zero, which is every Title nobody has started', () => {
    // The Server sends 0 rather than nothing, and "start from zero" is not a
    // resume point: it is the absence of one, and Play says Play, not Resume.
    const details = titleDetailsFrom({
      Id: 'movie-arrival',
      Name: 'Arrival',
      Type: 'Movie',
      UserData: { Key: 'movie-arrival', PlaybackPositionTicks: 0 },
    });

    expect(details).not.toHaveProperty('resumePositionTicks');
  });

  it('leaves out every rating the Server did not send, rather than showing a zero', () => {
    // `CommunityRating` arrives absent when it is zero — the Server's own guard
    // — but `CriticRating` and `OfficialRating` are unguarded, so an empty age
    // rating has to be handled here.
    const details = titleDetailsFrom({
      Id: 'movie-unfinished',
      Name: 'The Unfinished',
      Type: 'Movie',
      OfficialRating: '',
      CriticRating: null,
    });

    expect(details).toEqual({
      title: { kind: 'Movie', itemId: 'movie-unfinished', name: 'The Unfinished' },
      genres: [],
      cast: [],
      audioLanguages: [],
      subtitleLanguages: [],
      watched: false,
    });
  });

  it('says each audio and subtitle language once, and skips the ones with no language', () => {
    const details = titleDetailsFrom({
      Id: 'series-severance',
      Name: 'Severance',
      Type: 'Series',
      MediaStreams: [
        { Type: 'Audio', Language: 'eng' },
        // The same language on a second stream — a commentary track, another
        // codec — is still one language to offer.
        { Type: 'Audio', Language: 'eng' },
        { Type: 'Audio' },
        { Type: 'Subtitle', Language: 'spa' },
        { Type: 'Subtitle', Language: 'und' },
      ],
    });

    expect(details?.audioLanguages).toEqual(['eng']);
    expect(details?.subtitleLanguages).toEqual(['spa']);
  });

  it('shows nothing for an item that is not a Title at all', () => {
    expect(
      titleDetailsFrom({ Id: 'album-nocturnes', Name: 'Nocturnes', Type: 'MusicAlbum' }),
    ).toBeUndefined();
  });
});
