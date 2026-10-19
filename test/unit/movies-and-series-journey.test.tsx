import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { serialiseHomeLayout } from '../../src/home/home-layout';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Movies and Series sections through the real app and the real Server
 * (#23): what a User lands on, and that it is the same Rows as Home narrowed
 * to one kind rather than a second Home they can edit.
 */

afterEach(resetFakeState);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

async function signIn() {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
      messages={en}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('link', { name: 'Movies' });
}

/** Signs in and walks into one of the two sections the way a User would. */
async function openSection(name: 'Movies' | 'Series') {
  await signIn();
  fireEvent.click(screen.getByRole('link', { name }));
  // The section's own heading, which is the one thing only this screen draws:
  // the Billboard's heading is a Title's name and is on Home too.
  await screen.findByRole('heading', { name, level: 1 });
}

/** The names on one Row's cards, in the order they are shown. */
function cardNames(row: string): string[] {
  const strip = screen.getByRole('list', { name: row });
  return Array.from(strip.querySelectorAll('.card__name')).map((name) => name.textContent ?? '');
}

/**
 * The name of the Title on the Billboard. It is a logo where the Server has
 * one, so the name is the image's own text rather than the heading's.
 */
function featuredTitle(): string {
  const heading = document.querySelector('.billboard__title');
  return heading?.querySelector('img')?.getAttribute('alt') ?? heading?.textContent ?? '';
}

/** The headings over the Rows of the section, in the order they are drawn. */
function rowHeadings(): string[] {
  return Array.from(document.querySelectorAll('.row__heading')).map(
    (heading) => heading.textContent ?? '',
  );
}

describe('a User opening the Movies section', () => {
  it('is shown what is new among the Movies alone', async () => {
    await openSection('Movies');

    await waitFor(() =>
      expect(cardNames('New on Jellyflick')).toEqual([
        'Paddington',
        'Arrival',
        'Heat',
        'The Unfinished',
      ]),
    );
  });

  it('is shown the section’s own genre Rows, the library’s busiest first', async () => {
    await openSection('Movies');

    // Three of the four sample Movies are Drama; the rest are in one genre
    // each, so the two behind it are the first two by name.
    await waitFor(() =>
      expect(rowHeadings()).toEqual(['New on Jellyflick', 'Drama', 'Comedy', 'Crime']),
    );
    expect(cardNames('Drama')).toEqual(['Arrival', 'Heat', 'The Unfinished']);
  });

  it('features a Movie on the Billboard, never a Series', async () => {
    await openSection('Movies');

    // Arrival and Paddington are the sample Movies with a backdrop, and a
    // Billboard is a backdrop with words over it. Which of the two is
    // Spotlight's weighted draw.
    await waitFor(() => expect(['Arrival', 'Paddington']).toContain(featuredTitle()));
  });

  it('names itself at level 1 and the featured Title under it, not beside it', async () => {
    await openSection('Movies');

    await waitFor(() => expect(document.querySelector('.billboard__title')).toBeTruthy());
    // One answer to "what page is this": the section's. On Home it is the
    // other way round, because there the Billboard is what Home is about.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Movies',
    ]);
  });
});

describe('a User opening the Series section', () => {
  it('is shown the Series, by the Series rather than by the Episode added', async () => {
    await openSection('Series');

    await waitFor(() => expect(cardNames('New on Jellyflick')).toEqual(['Bluey', 'Severance']));
  });

  it('is shown the genres of the Series, which are not the genres of the Movies', async () => {
    await openSection('Series');

    // Bluey and Severance share no genre, so all five tie and the first three
    // by name win.
    await waitFor(() =>
      expect(rowHeadings()).toEqual(['New on Jellyflick', 'Comedy', 'Drama', 'Family']),
    );
  });

  it('is offered the Series they are in the middle of, by the Episode to watch', async () => {
    await setFakeState({
      playbackPositions: { 'user-rafael': { 'movie-heat': 3_000_000_000 } },
      played: { 'user-rafael': ['episode-severance-s2e3'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-heat': '2026-06-14T21:00:00Z',
          'episode-severance-s2e3': '2026-06-15T09:00:00Z',
        },
      },
    });

    await openSection('Series');

    // Heat is part-watched too, and is a Movie: this section is not about it.
    await waitFor(() => expect(cardNames('Continue Watching')).toEqual(['Severance']));
  });
});

describe('a section’s layout', () => {
  it('is not the User’s Home Layout, so hiding a Row on Home leaves it here', async () => {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': serialiseHomeLayout([{ kind: 'new-on-jellyflick', hidden: true }]),
        },
      },
    });

    await openSection('Movies');

    // The one Row this User has left on Home is hidden; the section draws it
    // anyway, because a section is a view of the library rather than a second
    // Home for them to arrange (#23, AC 1).
    await waitFor(() => expect(rowHeadings()[0]).toBe('New on Jellyflick'));
  });
});
