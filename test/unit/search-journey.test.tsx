import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  forgetFakeRequests,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

afterEach(resetFakeState);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

/** Signs Rafael in and opens Search, which is where every test starts. */
async function openSearch() {
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

  fireEvent.click(await screen.findByRole('link', { name: 'Search' }));
  return await screen.findByLabelText('Search for a Movie or Series');
}

/**
 * Types a term the way a User does: one input event per keystroke, with a gap
 * between them. The gap has to be real — keystrokes fired in one synchronous
 * burst would be collapsed by any implementation at all, debounced or not, and
 * the test would pass without meaning anything.
 */
async function type(field: HTMLElement, term: string): Promise<void> {
  for (let i = 1; i <= term.length; i += 1) {
    fireEvent.input(field, { target: { value: term.slice(0, i) } });
    await pause(KEYSTROKE_GAP_MS);
  }
}

/** Fast typing: well inside the debounce, so a settled term is the whole word. */
const KEYSTROKE_GAP_MS = 30;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The names on one strip, in the order they are shown. */
function cardNames(heading: string): string[] {
  const strip = screen.getByRole('list', { name: heading });
  return Array.from(strip.querySelectorAll('.card__name')).map((name) => name.textContent ?? '');
}

/**
 * Records what the screen said at every change until it is stopped.
 *
 * Polling cannot see a flicker: the gap between an emptied strip and the next
 * answer is shorter than any interval worth waiting. Every mutation is sampled
 * instead, so a strip that disappeared for a single frame is still on the
 * record afterwards.
 */
function watchTheScreen(): () => string[] {
  const samples: string[] = [];
  const record = (): void => {
    samples.push(document.body.textContent ?? '');
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  record();
  return () => {
    observer.disconnect();
    return samples;
  };
}

/**
 * The search terms the fake Jellyfin was actually asked about, in order. This
 * is what says the typing was debounced: the Server is asked once, not once a
 * keystroke.
 */
async function termsAsked(): Promise<string[]> {
  const requests = await fakeRequests();
  const terms: string[] = [];
  for (const request of requests) {
    const url = new URL(request.path, 'http://fake.test');
    if (url.pathname !== '/Items') continue;
    const term = url.searchParams.get('searchTerm');
    if (term !== null) terms.push(term);
  }
  return terms;
}

describe('a User searching for something to watch', () => {
  it('is shown the Titles that match as they type', async () => {
    const field = await openSearch();

    await type(field, 'he');

    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));
  });

  it('is not asked after every keystroke: the Server hears the term once', async () => {
    const field = await openSearch();
    await forgetFakeRequests();

    await type(field, 'arr');

    await waitFor(() => expect(cardNames('Results')).toEqual(['Arrival']));
    // Not "a", not "ar": the typing settles first, so three keystrokes are one
    // question rather than three.
    expect(await termsAsked()).toEqual(['arr']);
  });

  it('keeps the matches on the screen while the next ones are being found', async () => {
    const field = await openSearch();

    await type(field, 'he');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));

    // Carrying on typing narrows the term, so a second question goes out. From
    // the keystroke to the new answer the strip must never empty, disappear or
    // turn back into "Searching…" — that is the whole of "no flicker".
    const screenSaid = watchTheScreen();
    await type(field, 'heat');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat']));

    const samples = screenSaid();
    expect(samples.filter((said) => said.includes('Searching…'))).toEqual([]);
    // Heat matches both terms, so it was on the screen the whole way through.
    expect(samples.filter((said) => !said.includes('Heat'))).toEqual([]);
  });
});

describe('a User driving Search with arrow keys only', () => {
  it('starts with the typing, so the first key goes into the field', async () => {
    const field = await openSearch();

    expect(document.activeElement).toBe(field);
  });

  it('leaves the field for the results by pressing Down', async () => {
    const field = await openSearch();

    await type(field, 'he');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));

    fireEvent.keyDown(field, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(screen.getByRole('listitem', { name: 'Heat' }));
  });

  it('leaves the field for the results by pressing Enter, as a remote does', async () => {
    const field = await openSearch();

    await type(field, 'he');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));

    fireEvent.keyDown(field, { key: 'Enter' });

    expect(document.activeElement).toBe(screen.getByRole('listitem', { name: 'Heat' }));
  });

  it('keeps Left and Right for the caret, so a term can still be edited', async () => {
    const field = await openSearch();

    await type(field, 'he');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));

    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    fireEvent.keyDown(field, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(field);
  });

  it('stays in the field when there are no results to go to', async () => {
    const field = await openSearch();

    await type(field, 'zzz');
    await screen.findByText('Nothing on this Server matches “zzz”.');

    fireEvent.keyDown(field, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(field);
  });

  // Backspace is Back on a remote and an edit in a field, and the field has to
  // win. `src/shell/back.ts` already leaves a field alone; this is the guard
  // that says so, because Search is the screen where it would be noticed.
  it('edits the term rather than leaving Search when Backspace is pressed', async () => {
    const field = await openSearch();

    await type(field, 'he');
    await waitFor(() => expect(cardNames('Results')).toEqual(['Heat', 'The Unfinished']));

    fireEvent.keyDown(field, { key: 'Backspace' });

    expect(window.location.pathname).toBe('/search');
    expect(document.activeElement).toBe(field);
  });

  it('goes down from the field into the genres when nothing is typed', async () => {
    const field = await openSearch();
    const comedy = await screen.findByRole('button', { name: 'Comedy' });

    fireEvent.keyDown(field, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(comedy);
  });
});

describe('a User who does not know what they want', () => {
  it('is offered the genres the Server’s Movies and Series are in', async () => {
    await openSearch();

    const genres = await screen.findByRole('list', { name: 'Browse by genre' });
    expect(
      Array.from(genres.querySelectorAll('button')).map((button) => button.textContent),
    ).toEqual(['Comedy', 'Crime', 'Drama', 'Family', 'Science Fiction', 'Thriller']);
  });

  it('browses one genre, and sees the Movies and Series in it together', async () => {
    await openSearch();

    fireEvent.click(await screen.findByRole('button', { name: 'Family' }));

    await waitFor(() => expect(cardNames('Family')).toEqual(['Bluey', 'Paddington']));
  });

  it('can leave a genre and be offered all of them again', async () => {
    await openSearch();

    fireEvent.click(await screen.findByRole('button', { name: 'Crime' }));
    await waitFor(() => expect(cardNames('Crime')).toEqual(['Heat']));

    fireEvent.click(screen.getByRole('button', { name: 'All genres' }));

    expect(await screen.findByRole('list', { name: 'Browse by genre' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Crime' })).toBeNull();
  });

  it('is told plainly when the Server will not say what it holds', async () => {
    await setFakeState({ failLibraryQueriesWith: 500 });

    await openSearch();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not read the genres from the Server.',
    );
  });
});
