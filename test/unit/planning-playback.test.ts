import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { planPlayback } from '../../src/playback/planning';
import { testDeviceLayer } from '../device/profiles';
import { fakeRequests, forgetFakeRequests, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Asking the Server how to play a Title, and what the app does with the answer:
 * the file untouched where the device can take it, the Server's own transcode
 * where it cannot, and a resume point carried into the request rather than only
 * applied afterwards.
 *
 * The decisions are made against the real fake Jellyfin, which runs the same
 * negotiation the real Server does — it matches the posted DeviceProfile against
 * the source it holds — so a profile that claims the wrong thing fails here.
 */

const RAFAEL = 'user-rafael';

function gatewayFor(deviceId: string) {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Test Device',
    appVersion: '0.1.0',
    deviceId,
    token: `token-${RAFAEL}-${deviceId}`,
  });
}

beforeEach(async () => {
  await resetFakeState();
  await forgetFakeRequests();
});

afterEach(resetFakeState);

describe('planning how to play a Title', () => {
  it('plays the file as it is when the device can take it', async () => {
    const plan = await planPlayback(gatewayFor('direct-play'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer({ profile: 'modern-desktop-browser' }),
    });

    expect(plan.outcome).toBe('play');
    if (plan.outcome !== 'play') return;
    expect(plan.plan.playMethod).toBe('DirectPlay');
    // `static=true` is what tells the Server to send the file untouched.
    expect(plan.plan.url).toContain('/Videos/movie-arrival/stream');
    expect(plan.plan.url).toContain('static=true');
    // The token goes in the URL, because a <video src> cannot send a header.
    expect(plan.plan.url).toContain(`ApiKey=token-${RAFAEL}-direct-play`);
    expect(plan.plan.delivery).toBe('file');
  });

  it("uses the Server's own transcoding URL, verbatim, when it cannot", async () => {
    // Heat is 4K HEVC in a Matroska container: a phone plays none of that.
    const plan = await planPlayback(gatewayFor('transcode'), {
      itemId: 'movie-heat',
      userId: RAFAEL,
      device: testDeviceLayer({ profile: 'phone-safari' }),
    });

    expect(plan.outcome).toBe('play');
    if (plan.outcome !== 'play') return;
    expect(plan.plan.playMethod).toBe('Transcode');
    // The Server hands back a server-relative URL already carrying its own
    // parameters and its own ApiKey. It is used as it is, never rebuilt.
    expect(plan.plan.url.startsWith(`${fakeJellyfinUrl()}/`)).toBe(true);
    expect(plan.plan.url).toContain('master.m3u8');
    expect(plan.plan.delivery).toBe('hls');
  });

  it('transcodes a picture taller than the device will decode', async () => {
    // Paddington is a 4K h264 mp4, which a phone plays except for the height.
    const plan = await planPlayback(gatewayFor('too-tall'), {
      itemId: 'movie-paddington',
      userId: RAFAEL,
      device: testDeviceLayer({ profile: 'phone-safari' }),
    });

    expect(plan.outcome === 'play' && plan.plan.playMethod).toBe('Transcode');
  });

  it('asks in the body only, never with the deprecated query parameters', async () => {
    await planPlayback(gatewayFor('body-only'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer(),
    });

    const asked = (await fakeRequests()).find((entry) =>
      entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
    );
    expect(asked?.method).toBe('POST');
    // The fake refuses a query parameter outright, so this is belt and braces:
    // what matters is that everything is in the body.
    expect(asked?.path).toBe('/Items/movie-arrival/PlaybackInfo');
    const body = asked?.body as Record<string, unknown>;
    expect(body.UserId).toBe(RAFAEL);
    expect(body.DeviceProfile).toBeTruthy();
    expect(body.EnableDirectPlay).toBe(true);
    expect(body.EnableTranscoding).toBe(true);
  });

  it('tells the Server where the User left off, rather than only seeking afterwards', async () => {
    // Nine minutes in, in Jellyfin's 100-nanosecond ticks.
    const resumeTicks = 9 * 60 * 10_000_000;

    const plan = await planPlayback(gatewayFor('resuming'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer(),
      resumeTicks,
    });

    const asked = (await fakeRequests()).find((entry) =>
      entry.path.startsWith('/Items/movie-arrival/PlaybackInfo'),
    );
    expect((asked?.body as Record<string, unknown>).StartTimeTicks).toBe(resumeTicks);
    // And the plan carries it, because a direct-played file is seeked by the
    // player itself: the Server only trims a transcode.
    expect(plan.outcome === 'play' && plan.plan.startTicks).toBe(resumeTicks);
  });

  it('says a Title cannot be played rather than failing, when the Server has no source', async () => {
    const plan = await planPlayback(gatewayFor('no-source'), {
      itemId: 'movie-unfinished',
      userId: RAFAEL,
      device: testDeviceLayer(),
    });

    expect(plan.outcome).toBe('cannot-play');
  });

  it('tells "the Server would not answer" apart from "this cannot be played"', async () => {
    await setFakeState({ failPlaybackInfoWith: 503 });

    const plan = await planPlayback(gatewayFor('unavailable'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer(),
    });

    expect(plan.outcome).toBe('unavailable');
  });

  it("passes on the Server's own reason when it refuses to play something", async () => {
    await setFakeState({ playbackErrorCode: 'NoCompatibleStream' });

    const plan = await planPlayback(gatewayFor('refused'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer(),
    });

    expect(plan).toEqual({ outcome: 'cannot-play', errorCode: 'NoCompatibleStream' });
  });

  it('carries the play session the Server opened, which ties every later report to it', async () => {
    const plan = await planPlayback(gatewayFor('play-session'), {
      itemId: 'movie-arrival',
      userId: RAFAEL,
      device: testDeviceLayer(),
    });

    expect(plan.outcome === 'play' && plan.plan.playSessionId).toBe('play-session-movie-arrival');
    expect(plan.outcome === 'play' && plan.plan.mediaSourceId).toBe('source-movie-arrival');
  });

  /**
   * Which tracks a Title starts with (#27).
   *
   * **The Server decides, not this app.** `UserConfiguration` holds the User's
   * audio and subtitle language and their `SubtitleMode`, and a Jellyfin
   * server applies all three when it answers `PlaybackInfo` with
   * `DefaultAudioStreamIndex` and `DefaultSubtitleStreamIndex`. Matching
   * languages again here would be a second implementation of a rule that lives
   * on the Server and that every other Jellyfin app already follows, and it
   * would disagree with them the moment a `SubtitleMode` was involved.
   *
   * So what is tested is that the plan **carries** the Server's answer and that
   * the answer really moves with the User's account. Arrival's streams are
   * English audio at index 1, French at 2, English subtitles at 3 and Spanish
   * at 4.
   */
  describe('the tracks a Title starts with, which are the Server’s choice', () => {
    it('starts with the file’s own default tracks for a User who has chosen nothing', async () => {
      const plan = await planPlayback(gatewayFor('default-tracks'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
      });

      expect(plan.outcome === 'play' && plan.plan.audioStreamIndex).toBe(1);
      // `SubtitleMode` defaults to `Default`, which is "whatever the file was
      // marked with" — and neither of Arrival's subtitle tracks is.
      expect(plan.outcome === 'play' && plan.plan.subtitleStreamIndex).toBeUndefined();
    });

    it('starts with the audio language the User’s Jellyfin account asks for', async () => {
      await setFakeState({
        userConfiguration: { [RAFAEL]: { AudioLanguagePreference: 'fra' } },
      });

      const plan = await planPlayback(gatewayFor('french-audio'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
      });

      expect(plan.outcome === 'play' && plan.plan.audioStreamIndex).toBe(2);
    });

    it('starts with subtitles in the User’s language when their account says always', async () => {
      await setFakeState({
        userConfiguration: {
          [RAFAEL]: { SubtitleLanguagePreference: 'spa', SubtitleMode: 'Always' },
        },
      });

      const plan = await planPlayback(gatewayFor('spanish-subs'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
      });

      expect(plan.outcome === 'play' && plan.plan.subtitleStreamIndex).toBe(4);
    });

    it('starts with no subtitles at all when the User’s account says never', async () => {
      await setFakeState({
        userConfiguration: {
          [RAFAEL]: { SubtitleLanguagePreference: 'spa', SubtitleMode: 'None' },
        },
      });

      const plan = await planPlayback(gatewayFor('no-subs'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
      });

      expect(plan.outcome === 'play' && plan.plan.subtitleStreamIndex).toBeUndefined();
    });

    it('offers every track the Server said the file holds, so a User can change its mind', async () => {
      const plan = await planPlayback(gatewayFor('every-track'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
      });

      expect(plan.outcome).toBe('play');
      if (plan.outcome !== 'play') return;
      expect(plan.plan.tracks.audio.map((track) => track.index)).toEqual([1, 2]);
      expect(plan.plan.tracks.subtitles.map((track) => track.language)).toEqual(['eng', 'spa']);
    });

    /**
     * A track the Server chose has to be asked for, or a direct-played file is
     * served with every track in it and the browser picks the first — which is
     * not what the User's account said.
     */
    it('asks the Server for the tracks it was told to use', async () => {
      await planPlayback(gatewayFor('asks-for-tracks'), {
        itemId: 'movie-arrival',
        userId: RAFAEL,
        device: testDeviceLayer(),
        audioStreamIndex: 2,
        subtitleStreamIndex: 4,
      });

      const asked = (await fakeRequests()).find(
        (entry) =>
          entry.path.startsWith('/Items/movie-arrival/PlaybackInfo') &&
          (entry.headers.authorization ?? '').includes('asks-for-tracks'),
      );
      expect(asked?.body).toMatchObject({ AudioStreamIndex: 2, SubtitleStreamIndex: 4 });
    });
  });
});
