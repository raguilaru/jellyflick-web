import type { JellyfinGateway } from '../jellyfin/gateway';
import type { PlaybackPlan } from './planning';

/**
 * Telling the Server what is playing (story 84).
 *
 * Four endpoints, and between them they are the whole of what Jellyfin knows
 * about a session: the resume point every app shows in Continue Watching, the
 * "now playing" other apps can see and control, and keeping a transcode job
 * alive. `jellyfin-playback.md` §10 has the shapes; two things about them are
 * easy to get wrong and are handled here once.
 *
 * - **`PlaybackStopInfo` is a different, smaller shape** than the start and
 *   progress reports: no `IsPaused`, no `PlayMethod`, no stream indexes, and a
 *   `Failed` flag the others do not have.
 * - **The ping's argument is a query parameter**, alone among the four.
 *
 * There are **no timers in here.** The reporter is driven by the player, which
 * already has the two things that decide when to report — the video element's
 * own events, and one interval for the ping. A second schedule of its own would
 * be a second thing to keep in step with the video, and it would make every
 * test of the throttle a test of fake timers. The clock is injected instead, so
 * "every ten seconds" is a fact a test states rather than waits for.
 *
 * Nothing here can stop playback. A Server that will not record progress is not
 * a reason to take a User's film away, so every failure is swallowed and
 * `unreported()` is how a screen can say so (#26 shows it).
 */

/** How often the position is reported while nothing else happens. */
export const PROGRESS_INTERVAL_MS = 10_000;

/**
 * How often to ping. Shorter than the Server's own idea of a dead session, and
 * long enough that a paused player is not chattering.
 */
export const PING_INTERVAL_MS = 30_000;

/**
 * A jump this big is a seek rather than playback moving along, so it is reported
 * at once however recently the last report went. Generous enough that a
 * `timeupdate` arriving late is not mistaken for one.
 */
const SEEK_SECONDS = 3;

export type PlaybackReporter = {
  /** Playback has begun, at this position in seconds. */
  started(positionSeconds: number): Promise<void>;
  /**
   * The position, or whether it is paused, has changed. Call it freely — from
   * every `timeupdate` — and this decides what is worth telling the Server.
   */
  moved(positionSeconds: number, paused: boolean): Promise<void>;
  /** Playback has ended or the player has been closed. */
  stopped(positionSeconds: number, failed?: boolean): Promise<void>;
  /** Keeps a transcode alive without moving the position. */
  ping(): Promise<void>;
  /** Whether the Server has refused a report, so a screen can say so. */
  unreported(): boolean;
};

export type PlaybackReporterOptions = {
  /** Milliseconds since the epoch. The device layer's clock, or a fixed one. */
  now: () => number;
};

export function createPlaybackReporter(
  gateway: JellyfinGateway,
  plan: PlaybackPlan,
  options: PlaybackReporterOptions,
): PlaybackReporter {
  let lastReportedAt = 0;
  let lastPosition = secondsOfTicks(plan.startTicks);
  let lastPaused = false;
  let refused = false;

  /** Swallows a failure: see the note at the top of this module. */
  async function attempt(report: Promise<void>): Promise<void> {
    try {
      await report;
    } catch {
      refused = true;
    }
  }

  function progressReport(positionSeconds: number, paused: boolean) {
    return {
      ItemId: plan.itemId,
      PlaySessionId: plan.playSessionId,
      MediaSourceId: plan.mediaSourceId,
      PositionTicks: ticksOfSeconds(positionSeconds),
      PlayMethod: plan.playMethod,
      IsPaused: paused,
      // Everything this app plays is a file or a seekable transcode.
      CanSeek: true,
      ...(plan.audioStreamIndex === undefined
        ? {}
        : { AudioStreamIndex: plan.audioStreamIndex }),
      ...(plan.subtitleStreamIndex === undefined
        ? {}
        : { SubtitleStreamIndex: plan.subtitleStreamIndex }),
    };
  }

  return {
    started: async (positionSeconds) => {
      lastReportedAt = options.now();
      lastPosition = positionSeconds;
      lastPaused = false;
      await attempt(gateway.reportPlaybackStarted(progressReport(positionSeconds, false)));
    },

    moved: async (positionSeconds, paused) => {
      const at = options.now();
      const pausedChanged = paused !== lastPaused;
      const seeked = Math.abs(positionSeconds - lastPosition) >= SEEK_SECONDS;
      const due = at - lastReportedAt >= PROGRESS_INTERVAL_MS;

      lastPosition = positionSeconds;
      lastPaused = paused;
      // Pausing and seeking are news; the position creeping along is not, and a
      // `timeupdate` arrives four times a second.
      if (!pausedChanged && !seeked && !due) return;

      lastReportedAt = at;
      await attempt(
        gateway.reportPlaybackProgress(progressReport(positionSeconds, paused)),
      );
    },

    stopped: async (positionSeconds, failed = false) => {
      await attempt(
        gateway.reportPlaybackStopped({
          ItemId: plan.itemId,
          PlaySessionId: plan.playSessionId,
          MediaSourceId: plan.mediaSourceId,
          PositionTicks: ticksOfSeconds(positionSeconds),
          Failed: failed,
        }),
      );
    },

    ping: () => attempt(gateway.pingPlayback(plan.playSessionId)),

    unreported: () => refused,
  };
}

/**
 * Seconds as Jellyfin's 100-nanosecond ticks, which is what every position on
 * the wire is. A whole number, because the field is a 64-bit integer; never
 * negative, and zero for anything a player could not really be at —
 * `video.duration` is `Infinity` for a stream of unknown length and a position
 * read from one has been seen to follow.
 */
export function ticksOfSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** The same the other way, for a resume point that came from the Server. */
export function secondsOfTicks(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks <= 0) return 0;
  return ticks / TICKS_PER_SECOND;
}

const TICKS_PER_SECOND = 10_000_000;
