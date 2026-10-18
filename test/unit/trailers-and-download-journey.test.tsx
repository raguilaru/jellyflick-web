import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Watch trailer and Download File on a title page (#19, stories 75–77),
 * through the whole app against the fake Jellyfin.
 *
 * The journey is the seam: a card press, a title page, a button, and what the
 * Server is asked for as a result. What needs a real browser — that no request
 * reaches YouTube until the button is pressed, and that the download link
 * really downloads — is `test/e2e/trailers-and-download.spec.ts`.
 *
 * Three sample Titles carry the three cases between them. **Arrival** has a
 * trailer file beside it *and* a YouTube link, so it is where "the local one
 * is preferred" is visible; **Paddington** has the YouTube link alone;
 * **Heat** has neither, so it is where the button is absent.
 */

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
});

async function signInAs(name: string): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
      messages={en}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText(`Signed in as ${name}.`);
}

/**
 * Opens one Title's page by pressing its card on Home, as a User does.
 *
 * The address is checked as well as the heading: Home's Billboard draws the
 * featured Title's name as an `h1` too, and the sample Server features
 * Arrival — so the heading alone can be satisfied by a screen that never
 * changed.
 */
async function openTitle(name: string, titleId: string): Promise<void> {
  const row = await screen.findByRole('list', { name: 'New on Jellyflick' });
  const card = Array.from(row.querySelectorAll('.card')).find(
    (candidate) => candidate.getAttribute('aria-label') === name,
  );
  if (card === undefined) throw new Error(`No card for ${name} on Home.`);
  fireEvent.click(card);
  await screen.findByRole('heading', { name, level: 1 });
  expect(window.location.pathname).toBe(`/title/${titleId}`);
}

/** The trailer `<iframe>`, if the page has drawn one at all. */
function trailerFrame(): HTMLIFrameElement | null {
  return document.querySelector('iframe');
}

describe('Watch trailer', () => {
  it('plays the Server’s own trailer file, not the YouTube one (story 75)', async () => {
    await signInAs('Rafael');
    await openTitle('Arrival', 'movie-arrival');

    fireEvent.click(screen.getByRole('button', { name: en['title.watchTrailer'] }));

    // The app's own player, on the trailer item beside Arrival — and no
    // embed, although Arrival carries a YouTube link too.
    await screen.findByRole('region', {
      name: en['player.label']({ name: en['title.trailerPlaying']({ name: 'Arrival' }) }),
    });
    expect(trailerFrame()).toBeNull();
  });

  it('loads the YouTube embed when the Server holds no trailer of its own', async () => {
    await signInAs('Rafael');
    await openTitle('Paddington', 'movie-paddington');

    // Nothing is loaded until the User asks for it, which is the whole point
    // of story 75: a heavy third-party embed on every title page is what this
    // avoids.
    expect(trailerFrame()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: en['title.watchTrailer'] }));

    const frame = trailerFrame();
    expect(frame?.getAttribute('src')).toBe(
      'https://www.youtube-nocookie.com/embed/8sTR9vgnJ4s',
    );
  });

  it('takes the embed away again when the User closes it', async () => {
    await signInAs('Rafael');
    await openTitle('Paddington', 'movie-paddington');
    fireEvent.click(screen.getByRole('button', { name: en['title.watchTrailer'] }));

    fireEvent.click(screen.getByRole('button', { name: en['title.closeTrailer'] }));

    // Gone from the document, not merely hidden: an iframe left in the page
    // goes on being a third party's page running in it.
    expect(trailerFrame()).toBeNull();
  });

  it('is not offered for a Title with no trailer at all', async () => {
    await signInAs('Rafael');
    await openTitle('Heat', 'movie-heat');

    expect(screen.queryByRole('button', { name: en['title.watchTrailer'] })).toBeNull();
  });
});

describe('Download File', () => {
  it('offers the Server’s download endpoint, carrying the token (story 76)', async () => {
    await signInAs('Rafael');
    await openTitle('Arrival', 'movie-arrival');

    const link = screen.getByRole('link', { name: en['title.downloadFile'] });
    const href = new URL(link.getAttribute('href') ?? '');

    expect(href.origin + href.pathname).toBe(
      `${fakeJellyfinUrl()}/Items/movie-arrival/Download`,
    );
    // `download` is what makes the browser save the file rather than navigate
    // away from the app into it.
    expect(link.hasAttribute('download')).toBe(true);
    // And the token it carries is really one the Server accepts, which is the
    // half of story 76 that a shape assertion cannot reach: the Server is the
    // judge of "the current auth method", not this test.
    const response = await fetch(href);
    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('is hidden from a User the Server does not allow to download (story 77)', async () => {
    // Nico is that User on the fake: the Server's own `Policy` says no.
    await signInAs('Nico');
    await openTitle('Arrival', 'movie-arrival');

    expect(screen.queryByRole('link', { name: en['title.downloadFile'] })).toBeNull();
  });

  it('is hidden for a Title the Server holds no file for', async () => {
    await signInAs('Rafael');
    await openTitle('The Unfinished', 'movie-unfinished');

    expect(screen.queryByRole('link', { name: en['title.downloadFile'] })).toBeNull();
  });
});
