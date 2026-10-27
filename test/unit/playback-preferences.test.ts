import { afterEach, describe, expect, it } from 'vitest';
import {
  createPlaybackPreferences,
  DEFAULT_PLAYBACK_PREFERENCES,
  type PlaybackPreferencesStore,
} from '../../src/settings/playback-preferences';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import {
  fakeWrites,
  forgetFakeWrites,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Playback Preferences store, over HTTP against the fake Jellyfin.
 *
 * The seam is the store's own interface — `read` and `save` — with a real
 * socket underneath, exactly as `client-settings.test.ts` is shaped, because
 * what matters about this module is the shape of the requests it makes. This
 * store writes the **User's Jellyfin configuration**, which is a different
 * store from Client Settings and shared with every other Jellyfin app, so the
 * two things worth holding here are that it goes to `/Users/Configuration` and
 * that it never drops a field it does not know about: a POST hands the Server
 * the whole `UserConfiguration`, so anything not sent back is reset.
 */

const RAFAEL = 'user-rafael';
/** The fake derives a token from the user and the DeviceId, as the Server does. */
const RAFAEL_TOKEN = `token-${RAFAEL}-device-one`;

afterEach(async () => {
  await resetFakeState();
  await forgetFakeWrites();
});

function rafaelsStore(): PlaybackPreferencesStore {
  return createPlaybackPreferences({
    gateway: createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      client: 'Jellyflick',
      device: 'Vitest',
      deviceId: 'device-one',
      appVersion: 'test',
      token: RAFAEL_TOKEN,
    }),
    userId: RAFAEL,
  });
}

/** What was POSTed to `/Users/Configuration`, newest last. */
async function savedConfigurations(): Promise<{ path: string; body: Record<string, unknown> }[]> {
  const writes = await fakeWrites();
  return writes
    .filter((write) => write.path.startsWith('/Users/Configuration'))
    .map((write) => ({ path: write.path, body: (write.body ?? {}) as Record<string, unknown> }));
}

describe('reading a User’s Playback Preferences', () => {
  it('reads them from the User’s own Jellyfin configuration', async () => {
    await setFakeState({
      userConfiguration: {
        [RAFAEL]: {
          AudioLanguagePreference: 'spa',
          SubtitleLanguagePreference: 'eng',
          SubtitleMode: 'Always',
          EnableNextEpisodeAutoPlay: false,
        },
      },
    });

    const read = await rafaelsStore().read();

    expect(read.outcome).toBe('read');
    expect(read.preferences).toEqual({
      audioLanguage: 'spa',
      subtitleLanguage: 'eng',
      subtitleMode: 'Always',
      nextEpisodeAutoPlay: false,
    });
  });

  it('gives a User who has chosen nothing the Server’s own defaults', async () => {
    const read = await rafaelsStore().read();

    expect(read.outcome).toBe('read');
    expect(read.preferences).toEqual(DEFAULT_PLAYBACK_PREFERENCES);
  });

  it('hands back the defaults when the Server will not answer, as an outcome', async () => {
    await setFakeState({ failUserConfigurationWith: 500 });

    const read = await rafaelsStore().read();

    expect(read.outcome).toBe('unavailable');
    expect(read.preferences).toEqual(DEFAULT_PLAYBACK_PREFERENCES);
  });
});

describe('saving a User’s Playback Preferences', () => {
  it('POSTs the change to the User’s Jellyfin configuration', async () => {
    const saved = await rafaelsStore().save({ audioLanguage: 'fra' });

    expect(saved.outcome).toBe('saved');
    const configurations = await savedConfigurations();
    expect(configurations).toHaveLength(1);
    expect(configurations[0]?.path).toContain(`userId=${RAFAEL}`);
    expect(configurations[0]?.body.AudioLanguagePreference).toBe('fra');
  });

  it('leaves every field it does not understand exactly as the Server had it', async () => {
    // A POST replaces the whole `UserConfiguration`, so a field this app never
    // shows — another Jellyfin app's, or one a newer Server added — is reset to
    // its default unless the write carries it back untouched.
    await setFakeState({
      userConfiguration: {
        [RAFAEL]: {
          CastReceiverId: '6F511C87',
          GroupedFolders: ['library-movies'],
          DisplayMissingEpisodes: true,
          EnableNextEpisodeAutoPlay: true,
        },
      },
    });

    await rafaelsStore().save({ subtitleMode: 'OnlyForced' });

    const body = (await savedConfigurations())[0]?.body;
    expect(body?.SubtitleMode).toBe('OnlyForced');
    expect(body?.CastReceiverId).toBe('6F511C87');
    expect(body?.GroupedFolders).toEqual(['library-movies']);
    expect(body?.DisplayMissingEpisodes).toBe(true);
    // And the fields this app does own, which it did not change, stand too.
    expect(body?.EnableNextEpisodeAutoPlay).toBe(true);
  });

  it('stores “no preference” as the empty string the Server reads as none', async () => {
    await setFakeState({
      userConfiguration: { [RAFAEL]: { AudioLanguagePreference: 'spa' } },
    });

    await rafaelsStore().save({ audioLanguage: undefined });

    expect((await savedConfigurations())[0]?.body.AudioLanguagePreference).toBe('');
    // And reading it back is "no preference" rather than a language called "".
    expect((await rafaelsStore().read()).preferences.audioLanguage).toBeUndefined();
  });

  it('carries a language code this version does not offer straight through', async () => {
    // A name-valued setting is a plain `string`, so a code a newer Jellyflick
    // (or another Jellyfin app) chose survives this one saving over it.
    await setFakeState({
      userConfiguration: { [RAFAEL]: { AudioLanguagePreference: 'kor' } },
    });

    const read = await rafaelsStore().read();
    expect(read.preferences.audioLanguage).toBe('kor');

    await rafaelsStore().save({ nextEpisodeAutoPlay: false });

    expect((await savedConfigurations())[0]?.body.AudioLanguagePreference).toBe('kor');
  });

  it('says a save did not land rather than pretending it did', async () => {
    await setFakeState({ failUserConfigurationWith: 500 });

    expect((await rafaelsStore().save({ subtitleMode: 'None' })).outcome).toBe('unavailable');
  });
});
