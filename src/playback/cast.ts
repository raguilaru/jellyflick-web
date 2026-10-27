/**
 * Cast, the Jellyfin half (#33).
 *
 * **Cast is Chromecast or AirPlay** — `GLOSSARY.md` is explicit, and it is
 * explicit because the neighbouring feature is not this one: **Play On** (#34)
 * is telling another running Jellyfin app on the same Server to play
 * something, which goes through the Server's session endpoints and never
 * touches a receiver. This module is the Chromecast side of Cast; AirPlay is
 * `air-play.ts`, because the two share nothing but a User's intention.
 *
 * What is here is only what is **Jellyfin's**: which receiver application to
 * launch, which namespace its protocol speaks on, and the one message that
 * starts a Title on it. The Cast SDK itself — the `<script>` off gstatic,
 * `window.__onGCastApiAvailable`, `cast.framework` — is the device layer's, in
 * `src/device/cast-sender.ts`, for the same reason the subtitle renderers are:
 * nothing outside `src/device/` may read `window.chrome`, and the webOS port
 * will answer the seam differently or not at all.
 *
 * ## Why Jellyfin's receiver rather than the default one
 *
 * A bare `chrome.cast.media.MediaInfo` pointed at a stream URL would play, and
 * it would be **invisible to Jellyfin**: no session, no resume point, nothing
 * in Continue Watching. Jellyfin's receiver is a Jellyfin client in its own
 * right — handed a Server address, a User and a token it signs in, plays, and
 * **reports progress itself**, which is the ticket's fourth acceptance
 * criterion. So the message below is mostly credentials, and that is the point
 * of it rather than an oversight: every field is something the receiver cannot
 * report without.
 *
 * That also settles what the *sender* owes. Once the receiver has the session,
 * two Jellyfin clients reporting the same playback would leave the Server with
 * two of everything, so this device stops its own session rather than pausing
 * it — see `handOver` in `player.tsx`.
 */

/**
 * Jellyfin's published Stable receiver, from the Server's own
 * `20250420160000_AddDefaultCastReceivers` migration (`player-subtitles.md`
 * §7a, traced to the source; the Unstable one is `6F511C87`).
 *
 * **It is a fallback and never a default.** `decisions.md` §8 says the id is
 * read from the User's account at runtime, and this is what is left when the
 * account names nothing — which is not an edge case: the Server seeds that
 * list in a migration, so `CastReceiverApplications` is an empty array on
 * every install that has not run it, and the User's `CastReceiverId` is then
 * null. Without this, Cast would be dead on exactly those Servers.
 */
export const JELLYFIN_STABLE_RECEIVER_ID = 'F007D354';

/**
 * The namespace Jellyfin's receiver listens on. It is `connectsdk` for
 * historical reasons — the receiver grew out of an older project — and it is
 * **not** the default media namespace, which is the tell that the receiver is
 * driven by commands rather than handed a stream.
 */
export const JELLYFIN_CAST_NAMESPACE = 'urn:x-cast:com.connectsdk';

/**
 * Which receiver application to launch, from the User's Jellyfin account.
 *
 * Blank is "nothing chosen", because that is how a Jellyfin account stores it
 * — the same distinction `playback-preferences.ts` draws for the two language
 * preferences, where an empty string is not a language.
 */
export function castReceiverId(configured: string | null | undefined): string {
  const chosen = (configured ?? '').trim();
  return chosen === '' ? JELLYFIN_STABLE_RECEIVER_ID : chosen;
}

export type PlayNowOptions = {
  /** The Title to play, by its Jellyfin id. */
  readonly itemId: string;
  /** Who is watching, so the receiver reports against their account. */
  readonly userId: string;
  /** This device's id, which the receiver's session is identified by. */
  readonly deviceId: string;
  /** The token the receiver signs in to the Server with. */
  readonly accessToken: string;
  /**
   * The Server, as an address the **receiver** can reach — which is this
   * app's own Server address and is worth stating: a Chromecast is on the
   * same network as the browser but is not the browser, so a Server reachable
   * only through a tunnel or a `localhost` port on this machine is a Server
   * the receiver cannot see. Nothing here can detect that; the receiver
   * failing to connect is what says so.
   */
  readonly serverAddress: string;
  readonly serverId: string;
  /** Where the User had got to on this device, in Jellyfin's ticks. */
  readonly startPositionTicks: number;
};

/**
 * One `PlayNow`, which is the whole of starting a Title on the receiver.
 *
 * `items` is a list because the receiver takes a queue — Jellyfin's own apps
 * send a whole Season this way. This app sends the one Title it is playing,
 * and the next Episode is #31's business on whichever device is playing it.
 */
export type PlayNowCommand = {
  readonly command: 'PlayNow';
  readonly options: {
    readonly items: readonly { readonly Id: string }[];
    readonly startPositionTicks: number;
  };
  readonly serverAddress: string;
  readonly serverId: string;
  readonly userId: string;
  readonly accessToken: string;
  readonly deviceId: string;
};

export function playNowMessage(options: PlayNowOptions): PlayNowCommand {
  return {
    command: 'PlayNow',
    options: {
      items: [{ Id: options.itemId }],
      startPositionTicks: options.startPositionTicks,
    },
    serverAddress: options.serverAddress,
    serverId: options.serverId,
    userId: options.userId,
    accessToken: options.accessToken,
    deviceId: options.deviceId,
  };
}
