import { afterEach, describe, expect, it } from 'vitest';
import { loadBillboard, loadBillboardTrailer } from '../../src/home/billboard';
import { createJellyfinGateway, type JellyfinGateway } from '../../src/jellyfin/gateway';
import {
  fakeRequests,
  forgetFakeRequests,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Loading the Billboard, over HTTP against the fake Jellyfin (#16).
 *
 * The seam is `loadBillboard` with a real socket underneath, because what
 * matters here is the **query**: the fake gates `fields` and
 * `enableImageTypes` the way `DtoService` does, so a Billboard that forgot to
 * ask for the overview or the backdrop fails here rather than only against a
 * real Server. Which Title is picked out of the answer is `spotlight.test.ts`,
 * where it is a pure function of one draw.
 */

const RAFAEL = 'user-rafael';
/** The fake derives a token from the user and the DeviceId, as the Server does. */
const RAFAEL_TOKEN = `token-${RAFAEL}-device-one`;

afterEach(resetFakeState);

function rafaelsGateway(): JellyfinGateway {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Vitest',
    deviceId: 'device-one',
    appVersion: 'test',
    token: RAFAEL_TOKEN,
  });
}

describe('the Billboard on Home', () => {
  it('features a Title with everything it draws', async () => {
    // A draw of 0 takes the first of the eligible Titles in the Server's own
    // order, which is Arrival — the richest Title in the sample library.
    const result = await loadBillboard(rafaelsGateway(), { draw: 0 });

    expect(result.outcome).toBe('feature');
    if (result.outcome !== 'feature') return;

    const { feature } = result;
    expect(feature.title.name).toBe('Arrival');
    // Everything the Billboard puts on the screen has to have been asked for.
    expect(feature.backdrop).toEqual({
      itemId: 'movie-arrival',
      imageTag: 'tag-arrival-backdrop',
    });
    expect(feature.logo).toEqual({ itemId: 'movie-arrival', imageTag: 'tag-arrival-logo' });
    expect(feature.overview).toBe('A linguist is asked to talk to the visitors.');
    expect(feature.ageRating).toBe('PG-13');
  });

  it('features a different Title for a different draw', async () => {
    // Arrival, Paddington and Severance are the Titles with a backdrop, in the
    // Server's name order; the top of the range is the last of them.
    const result = await loadBillboard(rafaelsGateway(), { draw: 0.9 });

    expect(result.outcome === 'feature' && result.feature.title.name).toBe('Severance');
  });

  it('features a Title the Server has no logo for, so Home can fall back to its name', async () => {
    // Paddington has a backdrop and no logo, which is the case story 32's
    // preference is only a preference about.
    const result = await loadBillboard(rafaelsGateway(), { draw: 0.5 });

    expect(result.outcome).toBe('feature');
    if (result.outcome !== 'feature') return;
    expect(result.feature.title.name).toBe('Paddington');
    expect(result.feature.logo).toBeUndefined();
    expect(result.feature.backdrop).toBeDefined();
  });

  it('knows where the User left off, so Play can resume', async () => {
    await setFakeState({
      playbackPositions: { [RAFAEL]: { 'movie-arrival': 3_000_000_000 } },
    });

    const result = await loadBillboard(rafaelsGateway(), { draw: 0 });

    expect(result.outcome === 'feature' && result.feature.resumePositionTicks).toBe(
      3_000_000_000,
    );
  });

  it('has nothing to feature when no Title has a backdrop', async () => {
    // A Server whose library holds Titles, none of them with a picture big
    // enough to be a Billboard.
    await setFakeState({
      items: [
        {
          Id: 'movie-plain',
          Name: 'A Plain Film',
          Type: 'Movie',
          DateCreated: '2026-06-01T09:00:00Z',
          libraryId: 'lib-movies',
        },
      ],
    });

    expect((await loadBillboard(rafaelsGateway(), { draw: 0 })).outcome).toBe('empty');
  });

  it('says so when the Server will not say what it holds', async () => {
    await setFakeState({ failLibraryQueriesWith: 500 });

    expect((await loadBillboard(rafaelsGateway(), { draw: 0 })).outcome).toBe('unavailable');
  });

  it('is Spotlight unless another Source is asked for', async () => {
    // Spotlight is the default Billboard Source (story 29). The others are #22,
    // which adds them beside it rather than instead of it.
    const byDefault = await loadBillboard(rafaelsGateway(), { draw: 0 });
    const asked = await loadBillboard(rafaelsGateway(), { draw: 0, source: 'spotlight' });

    expect(byDefault.outcome === 'feature' && byDefault.feature.title.name).toBe('Arrival');
    expect(asked.outcome === 'feature' && asked.feature.title.name).toBe('Arrival');
  });
});

describe('the Billboard’s trailer', () => {
  it('is the Title’s own local trailer file', async () => {
    const trailer = await loadBillboardTrailer(rafaelsGateway(), 'movie-arrival');

    expect(trailer).toEqual({ outcome: 'trailer', itemId: 'trailer-arrival' });
  });

  it('is the first of them when the Server holds several', async () => {
    // The Server lists them in its own order and the Billboard shows one, so it
    // takes the first rather than making a choice it has nothing to make it on.
    await setFakeState({
      localTrailers: { 'movie-arrival': ['trailer-arrival', 'trailer-heat'] },
    });

    const trailer = await loadBillboardTrailer(rafaelsGateway(), 'movie-arrival');

    expect(trailer).toEqual({ outcome: 'trailer', itemId: 'trailer-arrival' });
  });

  it('is nothing at all for a Title with no trailer beside it', async () => {
    // An ordinary state, not a failure: story 25 says the Billboard shows the
    // backdrop instead.
    expect(await loadBillboardTrailer(rafaelsGateway(), 'movie-heat')).toEqual({
      outcome: 'none',
    });
  });

  it('is nothing at all when the Server will not answer', async () => {
    // The Billboard still has its backdrop, so a Server that will not say is
    // not worth a message of its own here.
    await setFakeState({ failRelatedQueriesWith: 500 });

    expect(await loadBillboardTrailer(rafaelsGateway(), 'movie-arrival')).toEqual({
      outcome: 'none',
    });
  });

  it('never asks the Server for a remote trailer, which would be YouTube', async () => {
    await forgetFakeRequests();

    await loadBillboardTrailer(rafaelsGateway(), 'movie-arrival');

    // The Billboard is local trailers only. `RemoteTrailers` is a `fields`
    // value, so asking for one would show up here as a query parameter.
    const asked = (await fakeRequests()).map((request) => request.path);
    expect(asked.some((path) => path.includes('/Items/movie-arrival/LocalTrailers'))).toBe(
      true,
    );
    expect(asked.some((path) => path.includes('RemoteTrailers'))).toBe(false);
  });
});
