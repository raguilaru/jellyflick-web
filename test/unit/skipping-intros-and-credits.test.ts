import { describe, expect, it } from 'vitest';
import {
  readMediaSegments,
  SKIPPABLE_SEGMENT_TYPES,
  skipOffered,
  segmentsOf,
  type MediaMarker,
} from '../../src/playback/media-segments';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { afterEach } from 'vitest';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Skip Intro and Skip Credits (#31, story 87): which marker the Server holds,
 * and which one a User is inside right now.
 *
 * Every rule here is a pure function of what the Server said, so the player
 * draws these answers and decides nothing itself — the same bargain
 * `src/title/series.ts` and `src/home/continue-watching.ts` make.
 *
 * The tick figures are written out as literals rather than computed, because a
 * test that divided by `10_000_000` the way the code does would pass by
 * construction. 100 ns per tick is `jellyfin-playback.md` §12.
 */

afterEach(resetFakeState);

describe('the markers the Server holds', () => {
  it('reads a marker’s start and end as seconds, from ticks', () => {
    // Thirty seconds to ninety: 300 million ticks to 900 million.
    const markers = segmentsOf([
      { Type: 'Intro', StartTicks: 300_000_000, EndTicks: 900_000_000 },
    ]);

    expect(markers).toEqual([{ kind: 'Intro', startSeconds: 30, endSeconds: 90 }]);
  });

  /**
   * `decisions.md` §5: `MediaSegmentType` is `Unknown, Commercial, Preview,
   * Recap, Outro, Intro` and holds **no `Credits`** value at all. The credits
   * marker is `Outro`, so that is the one the Skip Credits button is driven by.
   */
  it('reads a credits marker, which the Server calls an Outro', () => {
    const markers = segmentsOf([
      { Type: 'Outro', StartTicks: 0, EndTicks: 10_000_000 },
    ]);

    expect(markers[0]?.kind).toBe('Outro');
  });

  /**
   * A marker this app draws no button for is left out here rather than guarded
   * against at every call site. `Commercial` is a Live TV concern, and `Recap`
   * and `Preview` are real segments on a Server with a detection plugin that
   * #31 deliberately offers nothing for.
   */
  it('leaves out a kind of marker there is no button for', () => {
    const markers = segmentsOf([
      { Type: 'Recap', StartTicks: 0, EndTicks: 10_000_000 },
      { Type: 'Commercial', StartTicks: 10_000_000, EndTicks: 20_000_000 },
      { Type: 'Intro', StartTicks: 20_000_000, EndTicks: 30_000_000 },
    ]);

    expect(markers).toEqual([{ kind: 'Intro', startSeconds: 2, endSeconds: 3 }]);
  });

  /**
   * A Server can answer a marker with a field missing or a nonsense span, and
   * a button that seeks nowhere is worse than no button: a User presses it,
   * the picture does not move, and nothing says why.
   */
  it('leaves out a marker the Server did not say a usable span for', () => {
    expect(
      segmentsOf([
        { Type: 'Intro', StartTicks: null, EndTicks: 100 },
        { Type: 'Intro', StartTicks: 100, EndTicks: null },
        // Ends before it starts, and ends exactly where it starts: neither is
        // somewhere to skip to.
        { Type: 'Intro', StartTicks: 900_000_000, EndTicks: 300_000_000 },
        { Type: 'Outro', StartTicks: 300_000_000, EndTicks: 300_000_000 },
        { Type: null, StartTicks: 0, EndTicks: 300_000_000 },
      ]),
    ).toEqual([]);
  });
});

describe('which skip a User is offered', () => {
  const intro: MediaMarker = { kind: 'Intro', startSeconds: 10, endSeconds: 40 };
  const credits: MediaMarker = { kind: 'Outro', startSeconds: 300, endSeconds: 360 };
  const markers = [intro, credits];

  it('offers nothing before the intro has started', () => {
    expect(skipOffered(markers, 9.9)).toBeUndefined();
  });

  it('offers Skip Intro from the moment the intro starts', () => {
    expect(skipOffered(markers, 10)).toEqual({ kind: 'Intro', toSeconds: 40 });
  });

  it('offers Skip Intro all the way through it', () => {
    expect(skipOffered(markers, 39.9)).toEqual({ kind: 'Intro', toSeconds: 40 });
  });

  /**
   * The offer goes away at the marker's end rather than lingering. A button
   * still on the screen once the programme has started is a button that would
   * throw a User forward out of what they are watching.
   */
  it('takes the offer away once the intro is over', () => {
    expect(skipOffered(markers, 40)).toBeUndefined();
    expect(skipOffered(markers, 120)).toBeUndefined();
  });

  it('offers Skip Credits inside the credits', () => {
    expect(skipOffered(markers, 310)).toEqual({ kind: 'Outro', toSeconds: 360 });
  });

  it('offers nothing when the Server holds no markers', () => {
    expect(skipOffered([], 10)).toBeUndefined();
  });

  /**
   * Two markers over the same moment is a Server with a confused detection
   * plugin, and the answer has to be one button rather than two: the one that
   * **started last** is the one the User is in the middle of.
   */
  it('offers one skip where two markers overlap, the later-starting one', () => {
    const overlapping: MediaMarker[] = [
      { kind: 'Intro', startSeconds: 0, endSeconds: 60 },
      { kind: 'Outro', startSeconds: 30, endSeconds: 90 },
    ];

    expect(skipOffered(overlapping, 45)).toEqual({ kind: 'Outro', toSeconds: 90 });
  });

  /** A position a media element has not worked out yet is not inside anything. */
  it('offers nothing for a position the element could not report', () => {
    expect(skipOffered(markers, Number.NaN)).toBeUndefined();
  });
});

/**
 * The read itself, against the fake Jellyfin's own HTTP boundary — the one
 * place a 404 and an empty answer are made the same thing. §12 leaves which a
 * Server with no segment provider gives open, so both have to mean "nothing to
 * skip" rather than one of them meaning an error a User is shown.
 */
describe('reading the markers off the Server', () => {
  const gateway = () =>
    createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-markers',
      client: 'Jellyflick',
      device: 'Test Device',
      appVersion: '0.1.0',
      token: 'token-user-rafael-reads-markers',
    });

  it('reads the markers an item has, as seconds', async () => {
    await setFakeState({
      mediaSegments: {
        'episode-bluey-s1e1': [{ Type: 'Intro', StartTicks: 0, EndTicks: 20_000_000 }],
      },
    });

    expect(await readMediaSegments(gateway(), 'episode-bluey-s1e1')).toEqual([
      { kind: 'Intro', startSeconds: 0, endSeconds: 2 },
    ]);
  });

  it('asks for the two types it draws a button for, and no others', () => {
    expect(SKIPPABLE_SEGMENT_TYPES).toEqual(['Intro', 'Outro']);
  });

  it('comes to nothing for an item the Server answers 404 for', async () => {
    expect(await readMediaSegments(gateway(), 'movie-heat')).toEqual([]);
  });

  it('comes to nothing for an item whose provider found nothing', async () => {
    await setFakeState({ mediaSegments: { 'movie-arrival': [] } });

    expect(await readMediaSegments(gateway(), 'movie-arrival')).toEqual([]);
  });
});
