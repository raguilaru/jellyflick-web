import type { SessionInfoDto } from '@jellyfin/sdk/lib/generated-client/models/session-info-dto';

/**
 * Play On, the arithmetic (#34): which other Jellyfin app on this Server a
 * Title can be sent to, and what each one is playing.
 *
 * **Play On is not Cast.** `GLOSSARY.md` fixes the two apart and this module
 * is where the difference stops being a wording question: Play On is telling
 * **another running Jellyfin app on the same Server** to play something, which
 * is `GET /Sessions` and `POST /Sessions/{id}/Playing` and touches no receiver,
 * no SDK and no credentials in a message — the Server is already
 * authenticated. `cast.ts` is the other feature and nothing here reuses it.
 *
 * One consequence is worth stating because it shapes the whole of the UI:
 * **there is an endpoint that answers "is there anywhere to send this".**
 * `decisions.md` §8 says Cast has none, so Cast draws a control and lets the
 * press be the answer; Play On can ask, so this app draws **a list of its
 * own** — the only picker of other devices in the app — and this module is
 * what turns the Server's answer into it.
 *
 * Nothing here talks to the Server and nothing here renders: the gateway asks
 * and `play-on-panel.tsx` draws, so every rule below is a pure function of one
 * `GET /Sessions` answer.
 */

/**
 * How long a session may have been quiet and still be worth offering, as
 * `activeWithinSeconds` on `GET /Sessions`.
 *
 * **The figure is this app's own**, like the Quick Connect interval in
 * `decisions.md` §11: Jellyfin documents no default for the parameter, and
 * leaving it off entirely would offer a television that was switched off an
 * hour ago. Five minutes is short enough that what is listed is a device
 * somebody is near, and long enough to survive an app that has been sitting
 * on a paused Title.
 */
export const SESSIONS_ACTIVE_WITHIN_SECONDS = 300;

/**
 * One other Jellyfin app, as a User meets it: something to press, with what
 * it is doing now said beside it.
 */
export type RemoteSession = {
  /** The `{sessionId}` every command goes to. */
  readonly id: string;
  /** What to call it: the device's own name, or the client's. */
  readonly deviceName: string;
  /**
   * Which Jellyfin app it is, for the second line — `''` when the Server did
   * not say, or when the client name is already doing duty as the device name
   * and would otherwise be said twice.
   */
  readonly client: string;
  /**
   * The Title playing there, or `undefined` for an app sitting idle — which
   * is the common case and the one a User is most likely sending a Title to.
   * `''` is a Title playing whose name the Server did not give, which is a
   * different thing from nothing playing.
   */
  readonly nowPlaying: string | undefined;
  /** Whether what is playing there is paused, so one button can say which. */
  readonly paused: boolean;
  /** Where it has got to, in Jellyfin's ticks, when it is playing something. */
  readonly positionTicks: number | undefined;
};

/**
 * The other Jellyfin apps a Title can be sent to, out of one `GET /Sessions`.
 *
 * Three things are dropped, and each for its own reason:
 *
 * - **This device.** The Server does not know which session is asking, so it
 *   answers with ours among the rest, and "play this here" is a Title handed
 *   to the app already playing it. The DeviceId is what identifies us rather
 *   than the session id, because a session belongs to a token and the DeviceId
 *   is what the gateway was built with and survives a new one.
 * - **An app that cannot be controlled.** `jellyfin-playback.md` §11 traces
 *   both flags to one getter: a client that declared `SupportsMediaControl`
 *   *and* has a live controller — in practice an open WebSocket. The query
 *   already filters on it, so this is the belt to its braces.
 * - **An app that cannot play video**, which the query cannot do. A music-only
 *   client declares `Audio` alone, and every Title this app plays is a Movie
 *   or an Episode.
 *
 * The order is by name, so a list a User was reading has not reshuffled itself
 * between one read and the next — the Server's own order is whatever its
 * session dictionary happens to yield.
 */
export function playOnTargets(
  sessions: readonly SessionInfoDto[],
  options: { readonly ownDeviceId: string },
): readonly RemoteSession[] {
  return sessions
    .filter((session) => {
      if ((session.Id ?? '') === '') return false;
      if (session.DeviceId === options.ownDeviceId) return false;
      if (session.SupportsRemoteControl !== true && session.SupportsMediaControl !== true) {
        return false;
      }
      return (session.PlayableMediaTypes ?? []).includes('Video');
    })
    .map((session) => remoteSession(session))
    .sort((one, other) => one.deviceName.localeCompare(other.deviceName) || one.id.localeCompare(other.id));
}

function remoteSession(session: SessionInfoDto): RemoteSession {
  const deviceName = (session.DeviceName ?? '').trim();
  const client = (session.Client ?? '').trim();
  /*
   * `?? undefined` and not a bare read: a Server says "nothing is playing
   * there" with an explicit **null** once an app has been told to stop, where
   * an app that never played anything leaves the field out altogether. The two
   * have to mean the same thing here, and a `null` read as present throws on
   * the way to its `Name` — which in the player is a list that empties itself
   * one press after a Stop that worked.
   */
  const playing = session.NowPlayingItem ?? undefined;
  return {
    id: session.Id ?? '',
    // A device with no name of its own is still somewhere to send a Title, so
    // the client name stands in — and is then not repeated underneath itself.
    deviceName: deviceName === '' ? client : deviceName,
    client: deviceName === '' ? '' : client,
    nowPlaying: playing === undefined ? undefined : (playing.Name ?? ''),
    paused: session.PlayState?.IsPaused === true,
    ...(playing === undefined || typeof session.PlayState?.PositionTicks !== 'number'
      ? { positionTicks: undefined }
      : { positionTicks: session.PlayState.PositionTicks }),
  };
}
