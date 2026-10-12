import { describe, expect, it } from 'vitest';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import {
  loadTitleLabels,
  RECENTLY_ADDED_DAYS,
  titleLabelsFrom,
} from '../../src/title-labels/title-labels';
import { FIXED_NOW, testDeviceLayer } from '../device/profiles';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The label rules, against the device layer's fixed clock — a label is a
 * statement about a date, so a moving clock would make every one of these
 * assertions expire. `FIXED_NOW` is 2026-06-15T12:00:00Z, which is also what
 * the sample library is dated around.
 *
 * Reading the Server is the gateway's job and is covered against the fake
 * Jellyfin at the bottom of this file; these are the rules on their own.
 */

const daysBeforeNow = (days: number): string =>
  new Date(FIXED_NOW - days * 24 * 60 * 60 * 1000).toISOString();

const movie = (id: string, days: number): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Movie',
  DateCreated: daysBeforeNow(days),
});

const series = (id: string, days: number): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Series',
  DateCreated: daysBeforeNow(days),
});

const season = (id: string, seriesId: string, days: number): BaseItemDto => ({
  Id: id,
  Name: 'Season 2',
  Type: 'Season',
  DateCreated: daysBeforeNow(days),
  SeriesId: seriesId,
  SeriesName: seriesId,
  IndexNumber: 2,
});

const episode = (id: string, seriesId: string, days: number): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: 'Episode',
  DateCreated: daysBeforeNow(days),
  SeriesId: seriesId,
  SeriesName: seriesId,
  ParentIndexNumber: 2,
  IndexNumber: 3,
});

const labels = (additions: readonly BaseItemDto[]) =>
  Object.fromEntries(titleLabelsFrom(additions, FIXED_NOW));

describe('the Title Labels on card art', () => {
  it('calls a Movie or a Series added within the fortnight Recently Added', () => {
    expect(labels([movie('arrival', 3), series('severance', 13)])).toEqual({
      arrival: 'recently-added',
      severance: 'recently-added',
    });
  });

  it('says nothing about a Title added longer ago than that', () => {
    expect(labels([movie('heat', RECENTLY_ADDED_DAYS + 1)])).toEqual({});
  });

  it('counts a Title added exactly a fortnight ago as recent, and a moment older as not', () => {
    expect(labels([movie('just-inside', RECENTLY_ADDED_DAYS)])).toEqual({
      'just-inside': 'recently-added',
    });
    expect(labels([movie('just-outside', RECENTLY_ADDED_DAYS + 0.01)])).toEqual({});
  });

  it('says a Series has a New Season when a Season of it arrived', () => {
    // The Series itself is old: a Season is added to a show that was already
    // there, which is exactly the case this label is for.
    expect(labels([series('severance', 200), season('severance-s2', 'severance', 6)])).toEqual({
      severance: 'new-season',
    });
  });

  it('says a Series has New Episodes when Episodes of it arrived', () => {
    expect(labels([episode('bluey-s2e2', 'bluey', 1), episode('bluey-s2e3', 'bluey', 1)])).toEqual({
      bluey: 'new-episodes',
    });
  });

  it('shows one label per card, the strongest claim winning', () => {
    // A Season and its Episodes always arrive together, so this is the common
    // case rather than an edge one: a new Season is what happened.
    expect(
      labels([
        season('severance-s2', 'severance', 6),
        episode('severance-s2e3', 'severance', 6),
        episode('severance-s2e4', 'severance', 2),
      ]),
    ).toEqual({ severance: 'new-season' });

    // And a Series that is itself new is new, however much of it arrived.
    expect(
      labels([series('bluey', 2), season('bluey-s1', 'bluey', 2), episode('bluey-s1e1', 'bluey', 2)]),
    ).toEqual({ bluey: 'recently-added' });
  });

  it('is not swayed by the order the additions arrive in', () => {
    const newest = [episode('severance-s2e4', 'severance', 2), season('severance-s2', 'severance', 6)];
    const oldest = [season('severance-s2', 'severance', 6), episode('severance-s2e4', 'severance', 2)];

    expect(labels(newest)).toEqual({ severance: 'new-season' });
    expect(labels(oldest)).toEqual({ severance: 'new-season' });
  });

  it('says nothing about an addition the Server gave no date', () => {
    expect(labels([{ Id: 'undated', Name: 'Undated', Type: 'Movie' }])).toEqual({});
  });

  it('leaves out what is not a Title at all: an album, or a stray video file', () => {
    expect(
      labels([
        { Id: 'album', Name: 'Nocturnes', Type: 'MusicAlbum', DateCreated: daysBeforeNow(1) },
        { Id: 'clip', Name: 'Holiday 2019', Type: 'Video', DateCreated: daysBeforeNow(1) },
        // An Episode of a Series the Server did not name: there is no card for it.
        { Id: 'orphan', Name: 'Orphan', Type: 'Episode', DateCreated: daysBeforeNow(1) },
      ]),
    ).toEqual({});
  });

  it('keeps a date in the future, for a Server whose clock runs ahead', () => {
    expect(labels([movie('arrival', -1)])).toEqual({ arrival: 'recently-added' });
  });
});

describe('reading the labels from the Server', () => {
  const gatewayForRafael = () =>
    createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      client: 'Jellyflick',
      device: 'Test Device',
      deviceId: 'title-labels',
      appVersion: '0.1.0',
      token: 'token-user-rafael-title-labels',
    });

  it('labels the sample library the way its dates say', async () => {
    const read = await loadTitleLabels(gatewayForRafael(), testDeviceLayer().now());

    expect(Object.fromEntries(read)).toEqual({
      // Added three and five days ago.
      'movie-paddington': 'recently-added',
      'movie-arrival': 'recently-added',
      // Season 2 arrived six days ago; the Series itself in February.
      'series-severance': 'new-season',
      // Two Episodes yesterday, and no Season of its own in the sample data.
      'series-bluey': 'new-episodes',
      // Heat is a fortnight and three hours old, and The Unfinished a month:
      // neither is news. Nor is the album, which is the newest thing of all.
    });
  });

  it('is no labels at all when the Server will not say what is new', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: 'http://127.0.0.1:1/unreachable',
      client: 'Jellyflick',
      device: 'Test Device',
      deviceId: 'title-labels-unreachable',
      appVersion: '0.1.0',
    });

    expect((await loadTitleLabels(gateway, FIXED_NOW)).size).toBe(0);
  });
});
