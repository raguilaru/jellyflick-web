import { describe, expect, it } from 'vitest';
import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';
import { playOnTargets, SESSIONS_ACTIVE_WITHIN_SECONDS } from '../../src/playback/play-on';

/**
 * Which other Jellyfin apps Play On offers, and what each of them is playing
 * (#34).
 *
 * This file is the **arithmetic** of Play On: a `SessionInfoDto[]` from
 * `GET /Sessions` in, and the list a User is shown out. Everything else is
 * elsewhere — `test/unit/playing-on-another-app.test.tsx` is the journey
 * through the player and the one that watches the commands reach the Server,
 * and `test/e2e/play-on.spec.ts` is what only a browser can say.
 *
 * **Play On is not Cast.** `GLOSSARY.md` is explicit, and the difference shows
 * up right here: Cast cannot know whether there is anywhere to send a Title
 * without loading an SDK, so it draws a control and lets the press answer.
 * Play On has an endpoint that answers — which is why this app draws a **list
 * of its own**, and why this module exists at all.
 *
 * The expected values are Jellyfin's rather than this code's:
 * `jellyfin-playback.md` §11 traces `SupportsRemoteControl` to
 * `SessionInfo.cs` @ v12.2 and the `PlayableMediaTypes` requirement to
 * `GetSessions`, and the shapes below are written out by hand from that table.
 */

/** A session the Server would hand back for a controllable Jellyfin app. */
function session(over: Partial<SessionInfoDto> = {}): SessionInfoDto {
  return {
    Id: 'session-living-room',
    DeviceId: 'device-living-room',
    DeviceName: 'Living Room TV',
    Client: 'Jellyfin Android TV',
    UserId: 'user-rafael',
    UserName: 'Rafael',
    SupportsRemoteControl: true,
    SupportsMediaControl: true,
    PlayableMediaTypes: ['Video', 'Audio'],
    ...over,
  };
}

const THIS_DEVICE = 'device-this-browser';

describe('which other apps Play On offers', () => {
  /**
   * The ticket's first acceptance criterion: the list comes from the Sessions
   * API, and a controllable app on the Server is in it.
   */
  it('offers a controllable app on the Server', () => {
    const targets = playOnTargets([session()], { ownDeviceId: THIS_DEVICE });
    expect(targets).toEqual([
      {
        id: 'session-living-room',
        deviceName: 'Living Room TV',
        client: 'Jellyfin Android TV',
        nowPlaying: undefined,
        paused: false,
        positionTicks: undefined,
      },
    ]);
  });

  /**
   * **This device is never in its own list.** The Server has no idea which
   * session is asking, so it hands ours back along with the rest — and "play
   * this on this" is a Title handed to the app it is already playing in. The
   * DeviceId is what says which, because a session's `Id` belongs to the
   * token and the DeviceId is what the gateway was built with.
   */
  it('leaves this device out', () => {
    const targets = playOnTargets([session({ Id: 'session-here', DeviceId: THIS_DEVICE })], {
      ownDeviceId: THIS_DEVICE,
    });
    expect(targets).toEqual([]);
  });

  /**
   * `jellyfin-playback.md` §11: the query already filters to sessions this
   * User may control, and this is the belt to its braces — a Server that
   * answered with one anyway would otherwise get a row that cannot work.
   */
  it('leaves out an app that cannot be remotely controlled', () => {
    const targets = playOnTargets(
      [session({ SupportsRemoteControl: false, SupportsMediaControl: false })],
      { ownDeviceId: THIS_DEVICE },
    );
    expect(targets).toEqual([]);
  });

  /**
   * The other half of §11's filter, and the one the query cannot do: **a
   * Jellyfin app that plays no video is not somewhere to send a Title.** A
   * music-only client declares `Audio` and nothing else, and every Title this
   * app plays is a Movie or an Episode.
   */
  it('leaves out an app that cannot play video', () => {
    const targets = playOnTargets([session({ PlayableMediaTypes: ['Audio'] })], {
      ownDeviceId: THIS_DEVICE,
    });
    expect(targets).toEqual([]);
  });

  /**
   * Two apps in a house are told apart by their **own** names, in a stable
   * order, so a list a User read a moment ago has not reshuffled itself under
   * them between one read and the next.
   */
  it('names each app and keeps the order stable', () => {
    const targets = playOnTargets(
      [
        session({ Id: 'b', DeviceId: 'device-b', DeviceName: 'Kitchen' }),
        session({ Id: 'a', DeviceId: 'device-a', DeviceName: 'Bedroom' }),
      ],
      { ownDeviceId: THIS_DEVICE },
    );
    expect(targets.map((target) => target.deviceName)).toEqual(['Bedroom', 'Kitchen']);
  });

  /**
   * A Server that does not say what a device is called is still somewhere a
   * User can send a Title, and the client name is the better of the two
   * things left. A row with no label at all would be unpressable in any
   * useful sense.
   */
  it('falls back to the client name when the device has none', () => {
    const [target] = playOnTargets([session({ DeviceName: null, Client: 'Jellyfin Web' })], {
      ownDeviceId: THIS_DEVICE,
    });
    expect(target?.deviceName).toBe('Jellyfin Web');
    // And the client is not then said twice.
    expect(target?.client).toBe('');
  });

  /** A session with no `Id` cannot be the `{sessionId}` of any command. */
  it('leaves out a session the Server did not identify', () => {
    const targets = playOnTargets([session({ Id: null })], { ownDeviceId: THIS_DEVICE });
    expect(targets).toEqual([]);
  });
});

describe('what the other app is playing', () => {
  /**
   * The ticket's third acceptance criterion. It is read off the same answer
   * the list is read off — `SessionInfoDto` carries `NowPlayingItem` and
   * `PlayState` — so nothing asks the Server a second question to find out.
   */
  it('says what it is playing and whether it is paused', () => {
    const [target] = playOnTargets(
      [
        session({
          NowPlayingItem: { Id: 'movie-arrival', Name: 'Arrival' },
          PlayState: { IsPaused: true, PositionTicks: 420_000_000 },
        }),
      ],
      { ownDeviceId: THIS_DEVICE },
    );
    expect(target?.nowPlaying).toBe('Arrival');
    expect(target?.paused).toBe(true);
    expect(target?.positionTicks).toBe(420_000_000);
  });

  /**
   * An app sitting idle is the common case and is not a failure — it is the
   * one a User is most likely to be sending a Title to.
   */
  it('says nothing is playing when nothing is', () => {
    const [target] = playOnTargets([session()], { ownDeviceId: THIS_DEVICE });
    expect(target?.nowPlaying).toBe(undefined);
    expect(target?.paused).toBe(false);
  });

  /**
   * **A Server says "nothing" with `null`, not by leaving the field out**, and
   * that is not a style question: an app that has been told to stop comes back
   * with `NowPlayingItem: null` and `PlayState: null` set on purpose, where an
   * app that has never played anything simply has no field. Read as present,
   * the first of those throws on the way to its `Name` — which in the player
   * is a list that empties itself and a panel that reports the Server as
   * unreachable, one press after a Stop that worked.
   */
  it('reads a Server’s null as nothing playing', () => {
    /*
     * The cast is the point rather than a nuisance. `@jellyfin/sdk` generates
     * `NowPlayingItem?: BaseItemDto` and `PlayState?: PlayerStateInfo` —
     * **neither nullable** — so the compiler says this answer cannot happen
     * and the Server sends it anyway. That gap is exactly how the bug this
     * pins was reachable with `typecheck` green, and it is the same class of
     * thing `decisions.md` §3 records about `DisplayPreferences`.
     */
    const stopped = { NowPlayingItem: null, PlayState: null } as unknown as Partial<SessionInfoDto>;
    const [target] = playOnTargets([session(stopped)], { ownDeviceId: THIS_DEVICE });
    expect(target?.nowPlaying).toBe(undefined);
    expect(target?.paused).toBe(false);
    expect(target?.positionTicks).toBe(undefined);
  });

  /**
   * A Title playing with no name is still a Title playing, and the panel has
   * something to say about it; `undefined` would claim the app was idle.
   */
  it('still says something is playing when the Title has no name', () => {
    const [target] = playOnTargets([session({ NowPlayingItem: { Id: 'movie-arrival' } })], {
      ownDeviceId: THIS_DEVICE,
    });
    expect(target?.nowPlaying).toBe('');
  });
});

describe('how long a quiet session is still worth offering', () => {
  /**
   * The figure is **this app's**, not Jellyfin's — the API documents no
   * default for `activeWithinSeconds` — which is the footing `decisions.md`
   * §11 puts the Quick Connect interval on. It is pinned here so that
   * changing it is a decision somebody makes on purpose.
   */
  it('is five minutes', () => {
    expect(SESSIONS_ACTIVE_WITHIN_SECONDS).toBe(300);
  });
});
