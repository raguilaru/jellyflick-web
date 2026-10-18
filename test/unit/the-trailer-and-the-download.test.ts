import { describe, expect, it } from 'vitest';
import { titleDetailsFrom, type TitleDetails } from '../../src/catalogue/catalogue';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { canDownloadFile, trailerOffer, youTubeEmbedUrl } from '../../src/title/trailer';

/**
 * The two rules behind the title page's Watch trailer and Download File
 * buttons (#19, stories 75–77), as pure functions of what the Server said.
 *
 * What a User actually sees is `test/unit/trailers-and-download-journey.test.tsx`
 * through the whole app, and `test/e2e/trailers-and-download.spec.ts` in a real
 * browser — this file is the arithmetic: which of the two kinds of trailer a
 * Title offers, what a YouTube link becomes, and when the download is offered
 * at all.
 */

/** One Title's detail as the Server sends it, with the fields #19 added. */
function detailsOf(dto: Record<string, unknown>): TitleDetails {
  const details = titleDetailsFrom({
    Id: 'movie-arrival',
    Name: 'Arrival',
    Type: 'Movie',
    DateCreated: '2026-06-10T09:00:00Z',
    ...dto,
  });
  if (details === undefined) throw new Error('That sample is not a Title.');
  return details;
}

describe('which trailer a Title offers', () => {
  it('prefers the file the Server holds, even when there is a YouTube link too', () => {
    const offer = trailerOffer(
      detailsOf({
        LocalTrailerCount: 1,
        RemoteTrailers: [{ Name: 'Arrival (Trailer)', Url: 'https://www.youtube.com/watch?v=tFMo3UJ4B4g' }],
      }),
    );

    expect(offer).toEqual({ kind: 'local' });
  });

  it('offers the YouTube trailer when the Server holds no file of its own', () => {
    const offer = trailerOffer(
      detailsOf({
        RemoteTrailers: [{ Name: 'Arrival (Trailer)', Url: 'https://www.youtube.com/watch?v=tFMo3UJ4B4g' }],
      }),
    );

    expect(offer).toEqual({
      kind: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/tFMo3UJ4B4g',
    });
  });

  it('offers nothing when the Title has neither', () => {
    expect(trailerOffer(detailsOf({}))).toBeUndefined();
  });

  it('offers nothing for a remote trailer that is not a YouTube one', () => {
    // Story 75 is about a YouTube embed, and an arbitrary page is not one: a
    // button that opened something this app cannot draw is worse than none.
    const offer = trailerOffer(
      detailsOf({ RemoteTrailers: [{ Url: 'https://example.com/a-trailer' }] }),
    );

    expect(offer).toBeUndefined();
  });
});

describe('a YouTube link as something to embed', () => {
  it('reads the three shapes of link Jellyfin holds', () => {
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?v=tFMo3UJ4B4g')).toBe(
      'https://www.youtube-nocookie.com/embed/tFMo3UJ4B4g',
    );
    expect(youTubeEmbedUrl('https://youtu.be/tFMo3UJ4B4g')).toBe(
      'https://www.youtube-nocookie.com/embed/tFMo3UJ4B4g',
    );
    expect(youTubeEmbedUrl('https://www.youtube.com/embed/tFMo3UJ4B4g')).toBe(
      'https://www.youtube-nocookie.com/embed/tFMo3UJ4B4g',
    );
  });

  it('keeps the start time a link asks for, and drops everything else', () => {
    // `t=` is the one parameter worth carrying: a trailer link that starts
    // part of the way in means it. A tracking parameter is not carried.
    expect(youTubeEmbedUrl('https://youtu.be/tFMo3UJ4B4g?t=42&si=abcdef')).toBe(
      'https://www.youtube-nocookie.com/embed/tFMo3UJ4B4g?start=42',
    );
  });

  it('refuses anything that is not a YouTube video link', () => {
    expect(youTubeEmbedUrl('https://example.com/watch?v=tFMo3UJ4B4g')).toBeUndefined();
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?list=PL123')).toBeUndefined();
    expect(youTubeEmbedUrl('not a url at all')).toBeUndefined();
  });

  it('refuses a link whose video id is not a video id', () => {
    // The id goes into a URL this app builds, so it is checked rather than
    // trusted: YouTube's own ids are eleven URL-safe characters.
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?v=../../evil')).toBeUndefined();
  });
});

describe('whether the Download File button is offered', () => {
  it('is offered to a User the Server allows, for a Title with a file', () => {
    expect(canDownloadFile(detailsOf({ CanDownload: true }), true)).toBe(true);
  });

  it('is not offered to a User whose policy forbids downloading (story 77)', () => {
    expect(canDownloadFile(detailsOf({ CanDownload: true }), false)).toBe(false);
  });

  it('is not offered for a Title the Server says cannot be downloaded', () => {
    // A Title with no file behind it — the Server answers the download
    // endpoint with a 404, so offering it would be offering a broken button.
    expect(canDownloadFile(detailsOf({ CanDownload: false }), true)).toBe(false);
  });

  it('is not offered when the Server did not say', () => {
    expect(canDownloadFile(detailsOf({}), true)).toBe(false);
  });
});

describe('the download URL', () => {
  it('is the Server download endpoint, carrying the token as the query key', () => {
    // A plain anchor cannot send an `Authorization` header, which is why the
    // Server accepts `ApiKey` here as it does for a `<video src>`.
    const gateway = createJellyfinGateway({
      serverAddress: 'https://jellyfin.example/',
      token: 'token-rafael-device',
      deviceId: 'device',
      client: 'Jellyflick',
      device: 'Test Device',
      appVersion: '0.1.0',
    });

    expect(gateway.downloadUrl('movie arrival')).toBe(
      'https://jellyfin.example/Items/movie%20arrival/Download?ApiKey=token-rafael-device',
    );
  });
});
