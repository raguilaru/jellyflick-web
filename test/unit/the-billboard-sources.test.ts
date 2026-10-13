import { afterEach, describe, expect, it } from 'vitest';
import { loadBillboard } from '../../src/home/billboard-sources';
import { createTranslate } from '../../src/i18n/index';
import { en } from '../../src/i18n/en';
import { createJellyfinGateway, type JellyfinGateway } from '../../src/jellyfin/gateway';
import { resolvePlayTarget } from '../../src/title/play-target';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Billboard Sources other than Spotlight (#22): Resume, Newest Addition and
 * Because You Watched.
 *
 * The seam is `loadBillboard` over a real socket, as `the-billboard.test.ts` is
 * for Spotlight, because the question each Source answers is a **query** — and
 * the promise of this ticket is that each one selects what its Row selects. A
 * Source that asked the Server a different question than its Row would pass a
 * test against a stubbed gateway and fail against a Server.
 *
 * Spotlight's own pick is `spotlight.test.ts`, where it is a pure function of
 * one draw.
 */

const RAFAEL = 'user-rafael';
/** The fake derives a token from the user and the DeviceId, as the Server does. */
const RAFAEL_TOKEN = `token-${RAFAEL}-device-one`;

/** Jellyfin's 100-nanosecond ticks, from whole seconds. */
function ticks(seconds: number): number {
  return seconds * 10_000_000;
}

afterEach(resetFakeState);

function rafaelsGateway(): JellyfinGateway {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Vitest',
    deviceId: 'device-one',
    appVersion: 'test',
    token: RAFAEL_TOKEN,
  });
}

/** The Title one Source features, or what it came to instead. */
async function featured(source: 'resume' | 'newest-addition' | 'because-you-watched') {
  const result = await loadBillboard(rafaelsGateway(), { draw: 0, source });
  return result.outcome === 'feature' ? result.feature.title.name : result.outcome;
}

describe('the Newest Addition Billboard Source', () => {
  it('features the newest addition the Row would put first', async () => {
    // The sample library's additions, newest first, are Bluey, Severance,
    // Paddington, Arrival, Heat, The Unfinished — the order New on Jellyflick
    // draws. Bluey is the newest, and has no backdrop, so the newest addition
    // that can be *drawn* as a Billboard is Severance.
    expect(await featured('newest-addition')).toBe('Severance');
  });

  it('plays an Episode of the Series it features, not the Series', async () => {
    // Severance is a Series, and a Series holds no file: the third Source's
    // Play has to come to an Episode exactly as the other two do.
    const gateway = rafaelsGateway();

    const result = await loadBillboard(gateway, { draw: 0, source: 'newest-addition' });
    expect(result.outcome).toBe('feature');
    if (result.outcome !== 'feature') return;

    const target = await resolvePlayTarget(gateway, result.feature, createTranslate(en));

    expect(target?.itemId).toBe('episode-severance-s2e3');
  });
});

describe('the Resume Billboard Source', () => {
  /** A User who is part-way through an Episode of Severance. */
  async function partWatchingSeverance(): Promise<void> {
    await setFakeState({
      playbackPositions: { [RAFAEL]: { 'episode-severance-s2e3': ticks(600) } },
      lastPlayedDates: { [RAFAEL]: { 'episode-severance-s2e3': '2026-06-16T09:00:00Z' } },
    });
  }

  it('features the Series an Episode being watched belongs to', async () => {
    // Continue Watching offers the *Episode*, and the Billboard only ever
    // features a Title — so what it features is the Series the Row draws a
    // card for.
    await partWatchingSeverance();

    expect(await featured('resume')).toBe('Severance');
  });

  it('plays the Episode the User is up to, not the Series', async () => {
    // The rule #16 shipped without and #18 wrote down: a Series holds no file,
    // so asking the Server to play a Series id answers no `MediaSources` and
    // fails. Every Source can feature a Series, so every Source's Play has to
    // come to an Episode.
    await partWatchingSeverance();
    const gateway = rafaelsGateway();

    const result = await loadBillboard(gateway, { draw: 0, source: 'resume' });
    expect(result.outcome).toBe('feature');
    if (result.outcome !== 'feature') return;

    const target = await resolvePlayTarget(gateway, result.feature, createTranslate(en));

    expect(target?.itemId).toBe('episode-severance-s2e3');
    expect(target?.resumeTicks).toBe(ticks(600));
  });

  it('leaves out a Series the User took out of Continue Watching', async () => {
    // Story 38: a Series put away is the one thing that Row does not show, and
    // the Billboard is the same Row at four times the size. With nothing else
    // resumable there is nothing to show, so Spotlight answers — Arrival, at a
    // draw of 0.
    await partWatchingSeverance();

    const result = await loadBillboard(rafaelsGateway(), {
      draw: 0,
      source: 'resume',
      // Hidden *after* the Episode was watched. A record older than the
      // Series' activity is one hiding has already undone (story 39), which is
      // the Row's rule and so this Source's too — see the test below.
      hidden: [
        { seriesId: 'series-severance', hiddenAt: Date.parse('2026-06-17T09:00:00Z') },
      ],
    });

    expect(result.outcome === 'feature' && result.feature.title.name).toBe('Arrival');
  });

  it('features a hidden Series again once something of it has been watched since', async () => {
    // The other half of story 39: hiding undoes itself rather than lasting for
    // ever, and the Billboard must not be the one place a Series stayed buried.
    await partWatchingSeverance();

    const result = await loadBillboard(rafaelsGateway(), {
      draw: 0,
      source: 'resume',
      hidden: [
        { seriesId: 'series-severance', hiddenAt: Date.parse('2026-06-15T09:00:00Z') },
      ],
    });

    expect(result.outcome === 'feature' && result.feature.title.name).toBe('Severance');
  });
});

describe('the Because You Watched Billboard Source', () => {
  it('features what is similar to a Series the User finished', async () => {
    // The Row's Series branch: `/Items/series-severance/Similar` is Arrival on
    // this Server. The draw is deliberately one that Spotlight would answer
    // *differently* — with Severance finished its pool is Arrival and
    // Paddington, and 0.9 is Paddington — so a Source that quietly fell back
    // would fail here rather than agree by coincidence.
    await setFakeState({
      played: { [RAFAEL]: ['series-severance'] },
      lastPlayedDates: { [RAFAEL]: { 'series-severance': '2026-06-16T09:00:00Z' } },
    });

    const result = await loadBillboard(rafaelsGateway(), {
      draw: 0.9,
      source: 'because-you-watched',
    });

    expect(result.outcome === 'feature' && result.feature.title.name).toBe('Arrival');
  });

  it('features a recommendation for a Movie the User finished, and can play it', async () => {
    // The Row's Movie branch: `/Movies/Recommendations`, which this Server has
    // nothing in until a household has watched something. The recommendation
    // is a **Series**, so this is the other Source whose Play has to come to an
    // Episode.
    await setFakeState({
      played: { [RAFAEL]: ['movie-arrival'] },
      lastPlayedDates: { [RAFAEL]: { 'movie-arrival': '2026-06-16T09:00:00Z' } },
      movieRecommendations: { 'movie-arrival': ['series-severance'] },
    });
    const gateway = rafaelsGateway();

    const result = await loadBillboard(gateway, { draw: 0, source: 'because-you-watched' });
    expect(result.outcome).toBe('feature');
    if (result.outcome !== 'feature') return;
    expect(result.feature.title.name).toBe('Severance');

    const target = await resolvePlayTarget(gateway, result.feature, createTranslate(en));

    // Nobody has watched any of it, so Play means the first Episode the Server
    // lists and there is no resume point to honour.
    expect(target?.itemId).toBe('episode-severance-s2e3');
    expect(target?.resumeTicks).toBeUndefined();
  });

  it('falls back to Spotlight for a User who has finished nothing', async () => {
    // Nothing is wrong: there is simply nothing to go on yet, which the Row
    // answers with an empty strip and the Billboard cannot — so Spotlight.
    expect(await featured('because-you-watched')).toBe('Arrival');
  });

  it('falls back to Spotlight when the Server will not answer the Row’s question', async () => {
    // `failRelatedQueriesWith` silences `/Similar` and `/Movies/Recommendations`
    // and leaves `/Items` alone — a Server that can still say what it holds but
    // not what it suggests. Home keeps a Billboard either way.
    await setFakeState({
      played: { [RAFAEL]: ['series-severance'] },
      lastPlayedDates: { [RAFAEL]: { 'series-severance': '2026-06-16T09:00:00Z' } },
      failRelatedQueriesWith: 500,
    });

    expect(await featured('because-you-watched')).toBe('Arrival');
  });
});

describe('every Billboard Source', () => {
  const SOURCES = ['resume', 'newest-addition', 'because-you-watched'] as const;

  it('falls back to Spotlight when its own Row has nothing to show', async () => {
    // A household that has watched nothing at all: no resume points, no
    // finished Titles. Newest Addition is the one of the three that always has
    // something, so it is left to its own test above. A draw of 0 is Arrival.
    for (const source of SOURCES.filter((candidate) => candidate !== 'newest-addition')) {
      expect(await featured(source)).toBe('Arrival');
    }
  });

  it('says so when the Server will not say what it holds', async () => {
    // The Billboard's own query is what cannot be answered here, so there is
    // nothing to draw by any rule — a problem worth showing rather than a
    // quiet fallback to a Spotlight that has no candidates either.
    await setFakeState({ failLibraryQueriesWith: 500 });

    for (const source of SOURCES) {
      expect(await featured(source)).toBe('unavailable');
    }
  });

  it('is Spotlight when the stored Source is one this version does not know', async () => {
    // A Source a newer Jellyflick offers, read back by this one. It is carried
    // unchanged on the Server and fallen back on only when it is *used*, the
    // treatment an Accent Colour preset and a Row parameter both get.
    const result = await loadBillboard(rafaelsGateway(), {
      draw: 0,
      source: 'what-the-next-one-added' as never,
    });

    expect(result.outcome === 'feature' && result.feature.title.name).toBe('Arrival');
  });
});
