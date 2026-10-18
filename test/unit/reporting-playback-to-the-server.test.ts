import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import {
  createPlaybackReporter,
  PROGRESS_INTERVAL_MS,
  secondsOfTicks,
  ticksOfSeconds,
} from '../../src/playback/reporting';
import type { PlaybackPlan } from '../../src/playback/planning';
import { fakeWrites, forgetFakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * What the Server is told while something is playing: the start, the position
 * as it moves, a pause, the stop, and the ping that keeps a transcode alive.
 *
 * These are the reports the resume point, Continue Watching and the Server's own
 * session list are all built from, so what matters is that each one really
 * arrives and carries the play session — the fake refuses a report without one.
 *
 * The clock is injected, so the throttle is pinned rather than waited out.
 */

const RAFAEL = 'user-rafael';

const PLAN: PlaybackPlan = {
  itemId: 'movie-arrival',
  mediaSourceId: 'source-movie-arrival',
  playSessionId: 'play-session-movie-arrival',
  url: 'http://example.test/stream',
  playMethod: 'DirectPlay',
  delivery: 'file',
  startTicks: 0,
  // The reports carry the stream *indexes*, which are their own fields on the
  // plan; the track list the picker offers is not reported at all.
  tracks: { audio: [], subtitles: [] },
  fonts: [],
  // This Server's detection plugin found nothing: #31's flag, and the state
  // every Server with no intro-detection plugin is in.
  hasSegments: false,
};

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

/** A clock a test winds on by hand. */
function fixedClock(start = 1_000_000) {
  let at = start;
  return {
    now: () => at,
    advance: (milliseconds: number) => {
      at += milliseconds;
    },
  };
}

type Write = { method: string; path: string; body: unknown };

async function reportsTo(path: string): Promise<Write[]> {
  return (await fakeWrites()).filter((write) => write.path === path);
}

beforeEach(async () => {
  await resetFakeState();
  await forgetFakeWrites();
});

afterEach(resetFakeState);

describe('telling the Server what is playing', () => {
  it('reports the start, with the play session that ties everything to it', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('start'), PLAN, { now: clock.now });

    await reporter.started(0);

    const started = await reportsTo('/Sessions/Playing');
    expect(started).toHaveLength(1);
    expect(started[0]?.body).toMatchObject({
      ItemId: 'movie-arrival',
      PlaySessionId: 'play-session-movie-arrival',
      MediaSourceId: 'source-movie-arrival',
      PositionTicks: 0,
      PlayMethod: 'DirectPlay',
      IsPaused: false,
      CanSeek: true,
    });
  });

  it('reports the resume point as the position it started at', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(
      gatewayFor('resumed'),
      { ...PLAN, startTicks: ticksOfSeconds(540) },
      { now: clock.now },
    );

    await reporter.started(540);

    expect((await reportsTo('/Sessions/Playing'))[0]?.body).toMatchObject({
      PositionTicks: ticksOfSeconds(540),
    });
  });

  it('reports the position every ten seconds, and not on every frame', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('throttled'), PLAN, { now: clock.now });
    await reporter.started(0);

    // A `timeupdate` fires about four times a second; none of these is a report.
    for (let at = 0.25; at < 9; at += 0.25) {
      clock.advance(250);
      await reporter.moved(at, false);
    }
    expect(await reportsTo('/Sessions/Playing/Progress')).toHaveLength(0);

    clock.advance(PROGRESS_INTERVAL_MS);
    await reporter.moved(11, false);

    const progress = await reportsTo('/Sessions/Playing/Progress');
    expect(progress).toHaveLength(1);
    expect(progress[0]?.body).toMatchObject({
      PositionTicks: ticksOfSeconds(11),
      IsPaused: false,
    });
  });

  it('reports a pause at once, rather than waiting for the next tick', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('paused'), PLAN, { now: clock.now });
    await reporter.started(0);

    clock.advance(500);
    await reporter.moved(0.5, true);

    const progress = await reportsTo('/Sessions/Playing/Progress');
    expect(progress).toHaveLength(1);
    expect(progress[0]?.body).toMatchObject({ IsPaused: true });

    // And carrying on is news too: a Server left thinking it is paused shows
    // the wrong thing in every other Jellyfin app.
    clock.advance(500);
    await reporter.moved(1, false);
    expect(await reportsTo('/Sessions/Playing/Progress')).toHaveLength(2);
  });

  it('reports a seek at once, however recently it last reported', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('seeked'), PLAN, { now: clock.now });
    await reporter.started(0);

    clock.advance(250);
    await reporter.moved(300, false);

    expect(await reportsTo('/Sessions/Playing/Progress')).toHaveLength(1);
  });

  it('reports the stop, in the smaller shape that endpoint takes', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('stopped'), PLAN, { now: clock.now });
    await reporter.started(0);

    clock.advance(30_000);
    await reporter.stopped(42);

    const stopped = await reportsTo('/Sessions/Playing/Stopped');
    expect(stopped).toHaveLength(1);
    const body = stopped[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      ItemId: 'movie-arrival',
      PlaySessionId: 'play-session-movie-arrival',
      PositionTicks: ticksOfSeconds(42),
      Failed: false,
    });
    // PlaybackStopInfo has none of these, so sending them would be inventing
    // fields the endpoint does not have.
    expect(body).not.toHaveProperty('IsPaused');
    expect(body).not.toHaveProperty('PlayMethod');
  });

  it('stops a session once, however many things think they stopped it', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('stops-once'), PLAN, { now: clock.now });
    await reporter.started(0);

    // A Title running to its end both reports the stop and closes the player,
    // and closing the player reports the stop. Two stops for one session would
    // leave the Server's own idea of what happened wrong.
    await reporter.stopped(360);
    await reporter.stopped(360);

    expect(await reportsTo('/Sessions/Playing/Stopped')).toHaveLength(1);
  });

  it('pings with the play session in the query, which is where that one goes', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('pinged'), PLAN, { now: clock.now });

    await reporter.ping();

    const pings = (await fakeWrites()).filter((write) =>
      write.path.startsWith('/Sessions/Playing/Ping'),
    );
    expect(pings).toHaveLength(1);
    expect(pings[0]?.path).toBe(
      '/Sessions/Playing/Ping?playSessionId=play-session-movie-arrival',
    );
  });

  it('keeps playing when the Server will not take a report, and says it could not', async () => {
    await setFakeState({ failPlaybackReportsWith: 500 });
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('refused'), PLAN, { now: clock.now });

    // None of these throws: a Server that will not record progress is not a
    // reason to stop a User's film.
    await reporter.started(0);
    clock.advance(PROGRESS_INTERVAL_MS);
    await reporter.moved(10, false);
    await reporter.stopped(10);

    expect(reporter.unreported()).toBe(true);
  });

  it('leaves the Server the position it really stopped at, which is the resume point', async () => {
    const clock = fixedClock();
    const reporter = createPlaybackReporter(gatewayFor('leaves-position'), PLAN, {
      now: clock.now,
    });

    await reporter.started(0);
    clock.advance(PROGRESS_INTERVAL_MS);
    await reporter.moved(95, false);
    await reporter.stopped(95);

    const state = (await (await fetch(`${fakeJellyfinUrl()}/__fake/state`)).json()) as {
      playbackPositions: Record<string, Record<string, number>>;
    };
    expect(state.playbackPositions[RAFAEL]?.['movie-arrival']).toBe(ticksOfSeconds(95));
  });
});

describe('Jellyfin ticks', () => {
  it('are hundred-nanosecond units, so a second is ten million of them', () => {
    // A known-good literal from `jellyfin-playback.md` §10, not the same
    // arithmetic written twice.
    expect(ticksOfSeconds(1)).toBe(10_000_000);
    expect(secondsOfTicks(10_000_000)).toBe(1);
  });

  it('are whole numbers, because the Server takes a 64-bit integer', () => {
    expect(ticksOfSeconds(1.23456789)).toBe(12_345_679);
  });

  it('are never negative, however a player reports its position', () => {
    expect(ticksOfSeconds(-5)).toBe(0);
    expect(secondsOfTicks(-5)).toBe(0);
  });

  it('are zero for a position no player could have, so nothing invalid is sent', () => {
    expect(ticksOfSeconds(Number.NaN)).toBe(0);
    // `video.duration` is Infinity for a stream whose length is unknown, and a
    // position read from one has been seen to be Infinity too.
    expect(ticksOfSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
