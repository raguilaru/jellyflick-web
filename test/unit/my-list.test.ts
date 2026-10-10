import { afterEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { createMyList, type MyList } from '../../src/my-list/my-list';
import { fakeWrites, forgetFakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * My List as a store: the one thing that knows what is in the list, so the Row
 * on Home, the My List page and every card's toggle all read the same answer
 * and all change together the moment it does.
 */

afterEach(async () => {
  await resetFakeState();
  await forgetFakeWrites();
});

function myListFor(deviceId: string): MyList {
  return createMyList(
    createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId,
      client: 'Jellyflick',
      device: 'Test Device',
      appVersion: '0.1.0',
      token: `token-user-rafael-${deviceId}`,
    }),
  );
}

/** The names in the list, in the order it holds them. */
function names(myList: MyList): readonly string[] {
  const state = myList.state();
  return state.outcome === 'list' ? state.titles.map((card) => card.name) : [];
}

/** A card for a Title the Server holds, as a Row would hand one over. */
const ARRIVAL = { titleId: 'movie-arrival', name: 'Arrival' };
const PADDINGTON = { titleId: 'movie-paddington', name: 'Paddington' };

describe('My List', () => {
  it('starts out as not yet read, so nothing claims the list is empty', () => {
    expect(myListFor('my-list-starts').state().outcome).toBe('loading');
  });

  it('reads what the User has put in it, by name', async () => {
    await setFakeState({ favourites: { 'user-rafael': ['movie-heat', 'movie-arrival'] } });
    const myList = myListFor('my-list-reads');

    await myList.load();

    expect(names(myList)).toEqual(['Arrival', 'Heat']);
    expect(myList.has('movie-heat')).toBe(true);
    expect(myList.has('movie-paddington')).toBe(false);
  });

  it('shows a Title the moment it is added, before the Server has answered', async () => {
    const myList = myListFor('my-list-adds');
    await myList.load();

    const saving = myList.add(PADDINGTON);

    // Not awaited yet: this is what "updates everywhere immediately" means.
    expect(names(myList)).toEqual(['Paddington']);
    expect(myList.has('movie-paddington')).toBe(true);
    await saving;

    expect(await favouriteWrites()).toEqual([['POST', '/UserFavoriteItems/movie-paddington']]);
  });

  it('takes a Title out the moment it is removed, before the Server has answered', async () => {
    await setFakeState({ favourites: { 'user-rafael': ['movie-heat', 'movie-arrival'] } });
    const myList = myListFor('my-list-removes');
    await myList.load();

    const saving = myList.remove('movie-heat');

    expect(names(myList)).toEqual(['Arrival']);
    await saving;

    expect(await favouriteWrites()).toEqual([['DELETE', '/UserFavoriteItems/movie-heat']]);
  });

  it('keeps the Server’s order when a Title is added, so the list does not jump', async () => {
    await setFakeState({ favourites: { 'user-rafael': ['movie-heat', 'series-bluey'] } });
    const myList = myListFor('my-list-orders');
    await myList.load();
    expect(names(myList)).toEqual(['Bluey', 'Heat']);

    await myList.add(ARRIVAL);

    // Where the Server would put it, so a reload shows the same thing.
    expect(names(myList)).toEqual(['Arrival', 'Bluey', 'Heat']);
    const reread = myListFor('my-list-orders-again');
    await reread.load();
    expect(names(reread)).toEqual(names(myList));
  });

  it('puts a Title back when the Server will not save it, and says so', async () => {
    await setFakeState({
      favourites: { 'user-rafael': ['movie-heat'] },
      failFavouriteWritesWith: 500,
    });
    const myList = myListFor('my-list-write-fails');
    await myList.load();

    await myList.remove('movie-heat');

    expect(names(myList)).toEqual(['Heat']);
    expect(myList.unsaved()).toBe(true);
  });

  it('says the list could not be read when the Server will not say what is in it', async () => {
    await setFakeState({ failFavouriteQueriesWith: 500 });
    const myList = myListFor('my-list-read-fails');

    await myList.load();

    expect(myList.state().outcome).toBe('unavailable');
  });

  it('tells whoever is showing it that it has changed', async () => {
    const myList = myListFor('my-list-notifies');
    let changes = 0;
    const stop = myList.subscribe(() => {
      changes += 1;
    });

    await myList.load();
    await myList.add(PADDINGTON);
    stop();
    await myList.remove('movie-paddington');

    // Once for the load and once for the add; nothing after the listener stopped.
    expect(changes).toBe(2);
  });
});

/** The favourite writes the fake has seen, as method and path pairs. */
async function favouriteWrites(): Promise<[string, string][]> {
  return (await fakeWrites())
    .filter((write) => write.path.startsWith('/UserFavoriteItems/'))
    .map((write) => [write.method, write.path]);
}
