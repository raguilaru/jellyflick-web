import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIENT_SETTINGS_CLIENT,
  CLIENT_SETTINGS_ID,
  createClientSettings,
  HOME_LAYOUT_KEY,
  type ClientSettingsStore,
} from '../../src/settings/client-settings';
import { DEFAULT_HOME_LAYOUT, type HomeLayout } from '../../src/home/home-layout';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { fakeWrites, forgetFakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Client Settings store, over HTTP against the fake Jellyfin.
 *
 * The seam is the store's own interface — `read` and `save` — with a real
 * socket underneath, because what matters about this module is the shape of the
 * requests it makes: the `client` parameter the Server requires, the key names
 * it reserves, and the read-modify-write that POSTing the whole `CustomPrefs`
 * set forces. A fake at any shallower depth would assert our own assumptions
 * back at us.
 */

const RAFAEL = 'user-rafael';
/** The fake derives a token from the user and the DeviceId, as the Server does. */
const RAFAEL_TOKEN = `token-${RAFAEL}-device-one`;

afterEach(async () => {
  await resetFakeState();
  await forgetFakeWrites();
});

function storeFor(userId: string, token: string, deviceId: string): ClientSettingsStore {
  return createClientSettings({
    gateway: createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      client: 'Jellyflick',
      device: 'Vitest',
      deviceId,
      appVersion: 'test',
      token,
    }),
    userId,
  });
}

function rafaelsStore(): ClientSettingsStore {
  return storeFor(RAFAEL, RAFAEL_TOKEN, 'device-one');
}

/** What was POSTed to `/DisplayPreferences`, newest last. */
async function savedPreferences(): Promise<
  { path: string; customPrefs: Record<string, string | null> }[]
> {
  const writes = await fakeWrites();
  return writes
    .filter((write) => write.path.startsWith('/DisplayPreferences'))
    .map((write) => ({
      path: write.path,
      customPrefs: ((write.body as { CustomPrefs?: Record<string, string | null> } | undefined)
        ?.CustomPrefs ?? {}) as Record<string, string | null>,
    }));
}

describe('a User who has never saved a setting', () => {
  it('reads the default Home Layout', async () => {
    const read = await rafaelsStore().read();

    expect(read.outcome).toBe('read');
    expect(read.settings.homeLayout).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('has no language of their own, so their browser’s is used', async () => {
    const read = await rafaelsStore().read();

    expect(read.settings.uiLanguage).toBeUndefined();
  });
});

describe('saving a setting', () => {
  const layout: HomeLayout = [{ kind: 'new-on-jellyflick' }, { kind: 'my-list', hidden: true }];

  it('is read back by the same User', async () => {
    const store = rafaelsStore();

    expect((await store.save({ homeLayout: layout })).outcome).toBe('saved');

    expect((await store.read()).settings.homeLayout).toEqual(layout);
  });

  it('follows the User to another device', async () => {
    // The same User signed in twice is two DeviceIds and two tokens, which is
    // exactly what makes this a different device as far as the Server is
    // concerned. The setting is the User's, not the device's.
    await rafaelsStore().save({ homeLayout: layout });

    const elsewhere = storeFor(RAFAEL, `token-${RAFAEL}-device-two`, 'device-two');
    expect((await elsewhere.read()).settings.homeLayout).toEqual(layout);
  });

  it('is not read by a different User', async () => {
    await rafaelsStore().save({ homeLayout: layout });

    const marina = storeFor('user-marina', 'token-user-marina-device-three', 'device-three');
    expect((await marina.read()).settings.homeLayout).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('names the client on both the read and the write, which the Server requires', async () => {
    await rafaelsStore().save({ homeLayout: layout });

    const [write] = await savedPreferences();
    const written = new URL(write?.path ?? '', fakeJellyfinUrl());
    expect(written.pathname).toBe(`/DisplayPreferences/${CLIENT_SETTINGS_ID}`);
    expect(written.searchParams.get('client')).toBe(CLIENT_SETTINGS_CLIENT);
    expect(written.searchParams.get('userId')).toBe(RAFAEL);
  });

  it('stores it under a key of our own, and never one the Server reserves', async () => {
    await rafaelsStore().save({ homeLayout: layout });

    const [write] = await savedPreferences();
    const keys = Object.keys(write?.customPrefs ?? {});
    expect(keys).toContain(HOME_LAYOUT_KEY);
    expect(HOME_LAYOUT_KEY.startsWith('jf.')).toBe(true);
    for (const key of keys) {
      // `homesection…` is parsed by the Server and throws on a non-numeric
      // suffix; `landing-*` and six literals are consumed as well.
      expect(key.toLowerCase().startsWith('homesection')).toBe(false);
      expect(key.startsWith('landing-')).toBe(false);
      expect(key.startsWith('jf.')).toBe(true);
    }
  });

  it('does not hand back the keys the Server injected when it answered', async () => {
    // A GET comes back with the Server's own keys mixed into `CustomPrefs`.
    // POSTing them again is at best pointless and at worst a 500.
    await rafaelsStore().save({ homeLayout: layout });

    const [write] = await savedPreferences();
    expect(Object.keys(write?.customPrefs ?? {})).not.toContain('chromecastVersion');
    expect(Object.keys(write?.customPrefs ?? {})).not.toContain('homesection0');
  });

  it('leaves every other setting of ours alone, because the whole set is written at once', async () => {
    await setFakeState({
      displayPreferences: {
        [`${CLIENT_SETTINGS_ID}|${CLIENT_SETTINGS_CLIENT}|${RAFAEL}`]: {
          'jf.somethingElse': 'kept',
        },
      },
    });

    await rafaelsStore().save({ homeLayout: layout });

    const [write] = await savedPreferences();
    expect(write?.customPrefs['jf.somethingElse']).toBe('kept');
  });
});

describe('the settings the settings screen saves', () => {
  const layout: HomeLayout = [{ kind: 'new-on-jellyflick' }, { kind: 'my-list', hidden: true }];

  it('reads back the Accent Colour and the language the User chose', async () => {
    await rafaelsStore().save({ accentColour: 'teal', uiLanguage: 'es' });

    const read = await rafaelsStore().read();
    expect(read.settings.accentColour).toBe('teal');
    expect(read.settings.uiLanguage).toBe('es');
  });

  it('stores going back to the device’s language as a choice of its own', async () => {
    await rafaelsStore().save({ uiLanguage: 'es' });

    // `CustomPrefs` holds strings, so "no choice" is the empty string rather
    // than a missing key — and it has to come back as no choice at all.
    await rafaelsStore().save({ uiLanguage: undefined });

    const read = await rafaelsStore().read();
    expect(read.settings.uiLanguage).toBeUndefined();
  });

  it('reads back the Series the User has taken out of Continue Watching', async () => {
    // A per-User list of ours (#12): Jellyfin has nowhere of its own to keep
    // "do not offer me this show", so it lives under `jf.` with the rest.
    await rafaelsStore().save({
      hiddenSeries: [{ seriesId: 'series-severance', hiddenAt: 1_781_514_000_000 }],
    });

    const read = await rafaelsStore().read();
    expect(read.settings.hiddenSeries).toEqual([
      { seriesId: 'series-severance', hiddenAt: 1_781_514_000_000 },
    ]);
  });

  it('is an empty list for a User who has never hidden a Series', async () => {
    expect((await rafaelsStore().read()).settings.hiddenSeries).toEqual([]);
  });

  it('autoplays the Billboard trailer for a User who has never said otherwise', async () => {
    // On by default: story 24 is what Home does out of the box, and story 27 is
    // a User turning it off (#16).
    expect((await rafaelsStore().read()).settings.billboardTrailerAutoplay).toBe(true);
  });

  it('reads back the Billboard trailer autoplay being turned off', async () => {
    await rafaelsStore().save({ billboardTrailerAutoplay: false });

    expect((await rafaelsStore().read()).settings.billboardTrailerAutoplay).toBe(false);
  });

  it('reads back the Billboard trailer autoplay being turned on again', async () => {
    await rafaelsStore().save({ billboardTrailerAutoplay: false });

    await rafaelsStore().save({ billboardTrailerAutoplay: true });

    expect((await rafaelsStore().read()).settings.billboardTrailerAutoplay).toBe(true);
  });

  it('keeps the Home Layout when only the trailer setting changes', async () => {
    await rafaelsStore().save({ homeLayout: layout });

    await rafaelsStore().save({ billboardTrailerAutoplay: false });

    const read = await rafaelsStore().read();
    expect(read.settings.homeLayout).toEqual(layout);
    expect(read.settings.billboardTrailerAutoplay).toBe(false);
  });

  it('keeps the Home Layout when only the colour changes', async () => {
    await rafaelsStore().save({ homeLayout: layout });

    await rafaelsStore().save({ accentColour: 'blue' });

    const read = await rafaelsStore().read();
    expect(read.settings.homeLayout).toEqual(layout);
    expect(read.settings.accentColour).toBe('blue');
  });
});

describe('a Server that will not answer', () => {
  it('leaves the User with the defaults rather than no Home at all', async () => {
    await setFakeState({ failDisplayPreferencesWith: 500 });

    const read = await rafaelsStore().read();

    expect(read.outcome).toBe('unavailable');
    expect(read.settings.homeLayout).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it('says plainly that a change was not saved', async () => {
    await setFakeState({ failDisplayPreferencesWith: 500 });

    expect((await rafaelsStore().save({ homeLayout: [] })).outcome).toBe('unavailable');
  });
});
