import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  resetFakeState,
  savesHaveSettled,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Editing Home, as a User does it: the whole app, signed in, with the editor
 * reached the way it is reached.
 *
 * The seam is the rendered screen — what a User can see and press. The rules
 * themselves are pinned down in `the-home-layout.test.ts`, so nothing here
 * re-checks them; these tests are about the editor pressing the right one, Home
 * following, and the change reaching the Server. Where focus goes cannot be
 * checked here at all, because happy-dom gives every element a zero-sized
 * rectangle: that is `test/e2e/editing-home.spec.ts`.
 */

afterEach(async () => {
  // A save is a round trip the editor does not wait for, so one can still be in
  // flight when a test ends. Put the sample data back before it lands and the
  // save arrives afterwards, leaking a hidden Row into whatever runs next —
  // which is a different *file*, because Vitest runs them one at a time against
  // one fake Jellyfin (#46).
  await savesHaveSettled();
  await resetFakeState();
  // The editor is a real address, and these tests really navigate to it, so
  // the next test would otherwise start on the screen the last one left.
  history.replaceState(null, '', '/');
});

async function signInAndLand() {
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
  await screen.findByText('Signed in as Rafael.');
}

/** Opens the editor from Home, the way a User does. */
async function openTheEditor() {
  fireEvent.click(await screen.findByRole('link', { name: 'Edit Home' }));
  await screen.findByRole('heading', { name: 'Edit Home', level: 1 });
  // The editor offers nothing to press until the Server has answered, so that
  // a press can never land on the default layout and save it over the User's
  // own (#11). Waiting for that is what a User does by looking at the screen.
  await waitFor(() => {
    expect(screen.queryByText('Looking for your settings…')).toBeNull();
  });
}

async function backToHome() {
  fireEvent.click(await screen.findByRole('link', { name: 'Done' }));
  await screen.findByText('Signed in as Rafael.');
}

/** The Rows the editor lists, in order, as a User reads them. */
function listedRows(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.layout-row__name')?.textContent ?? '');
}

describe('a User editing their Home', () => {
  it('is shown every Row they have, in the order Home draws them', async () => {
    await signInAndLand();

    await openTheEditor();

    expect(listedRows()).toEqual([
      'Continue Watching',
      'My List',
      'New on Jellyflick',
      'Watch Again',
      'Because You Watched',
    ]);
  });

  it('takes a Row off Home by hiding it', async () => {
    await signInAndLand();
    await screen.findByRole('list', { name: 'New on Jellyflick' });

    await openTheEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Hide New on Jellyflick' }));
    await backToHome();

    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'New on Jellyflick' })).toBeNull(),
    );
  });

  it('puts a hidden Row back where it was', async () => {
    await signInAndLand();

    await openTheEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Hide New on Jellyflick' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show New on Jellyflick' }));

    expect(listedRows()[2]).toBe('New on Jellyflick');
    await backToHome();
    expect(await screen.findByRole('list', { name: 'New on Jellyflick' })).toBeTruthy();
  });

  it('moves a Row up and down the order', async () => {
    await signInAndLand();
    await openTheEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Move New on Jellyflick up' }));
    expect(listedRows().slice(0, 3)).toEqual([
      'Continue Watching',
      'New on Jellyflick',
      'My List',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Move New on Jellyflick down' }));
    expect(listedRows().slice(0, 3)).toEqual([
      'Continue Watching',
      'My List',
      'New on Jellyflick',
    ]);
  });

  it('keeps the change when they come back to the editor', async () => {
    await signInAndLand();

    await openTheEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Move New on Jellyflick up' }));
    // The save is a round trip to the Server, so it has to have landed before
    // the screen is left.
    await waitFor(() => expect(listedRows()[1]).toBe('New on Jellyflick'));
    await backToHome();

    await openTheEditor();
    await waitFor(() => expect(listedRows()[1]).toBe('New on Jellyflick'));
  });

  it('is told when the Server would not keep a change', async () => {
    await signInAndLand();
    await openTheEditor();
    // The Server goes away between opening the editor and pressing something.
    await fetch(`${fakeJellyfinUrl()}/__fake/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failDisplayPreferencesWith: 500 }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide New on Jellyflick' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Jellyflick could not save that change to the Server.',
    );
  });
});

describe('a User adding a Row', () => {
  /** A User whose stored layout holds one Row, so the rest can be added. */
  async function withOneRowStored() {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': JSON.stringify([{ kind: 'new-on-jellyflick' }]),
        },
      },
    });
  }

  it('is offered the Rows they do not have', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();

    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));
    expect(screen.getByRole('button', { name: 'Add My List' })).toBeTruthy();
  });

  it('gets the new Row at the end of Home', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));

    fireEvent.click(screen.getByRole('button', { name: 'Add My List' }));

    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick', 'My List']));
    expect(screen.queryByRole('button', { name: 'Add My List' })).toBeNull();
  });

  it('is told plainly when there is nothing left to add', async () => {
    // Every fixed Row, every genre the sample library has, and its one
    // Collection: the only layout there is nothing to add to, now that a genre
    // and a Collection Row can be had more than once (#15).
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': JSON.stringify([
            { kind: 'continue-watching' },
            { kind: 'my-list' },
            { kind: 'new-on-jellyflick' },
            { kind: 'watch-again' },
            { kind: 'because-you-watched' },
            ...['Comedy', 'Crime', 'Drama', 'Family', 'Science Fiction', 'Thriller'].map(
              (genre) => ({ kind: 'genre', parameter: genre }),
            ),
            { kind: 'collection', parameter: 'boxset-crime-classics' },
          ]),
        },
      },
    });
    await signInAndLand();
    await openTheEditor();

    expect(await screen.findByText('Every Row is already on Home.')).toBeTruthy();
  });
});

/**
 * Genre and Collection Rows (#15, stories 44 and 45). A User can have several
 * of each, and picking which is part of adding one — so the editor is where
 * that choice is made, from what the Server says there is.
 */
describe('a User adding a Row that needs a choice', () => {
  /** A User whose stored layout holds one Row, so the screen is easy to read. */
  async function withOneRowStored() {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': JSON.stringify([{ kind: 'new-on-jellyflick' }]),
        },
      },
    });
  }

  it('picks the genre when they add a genre Row', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));

    fireEvent.click(screen.getByRole('button', { name: 'Add a genre Row' }));

    // The genres are the Server's own, so the User picks from what their
    // libraries really hold.
    fireEvent.click(await screen.findByRole('button', { name: 'Add Comedy' }));

    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick', 'Comedy']));
  });

  it('gets the genre’s Titles on Home, under the genre’s own name', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));

    fireEvent.click(screen.getByRole('button', { name: 'Add a genre Row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Comedy' }));
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick', 'Comedy']));
    await backToHome();

    const row = await screen.findByRole('list', { name: 'Comedy' });
    expect(
      Array.from(row.querySelectorAll('.card')).map((card) => card.getAttribute('aria-label')),
    ).toEqual(['Bluey', 'Paddington']);
  });

  it('can have a Row for each of several genres, and is not offered one twice', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));

    fireEvent.click(screen.getByRole('button', { name: 'Add a genre Row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Comedy' }));
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick', 'Comedy']));

    fireEvent.click(screen.getByRole('button', { name: 'Add a genre Row' }));
    // The genre they already have is not among the choices any more.
    expect(await screen.findByRole('button', { name: 'Add Drama' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Comedy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add Drama' }));
    await waitFor(() =>
      expect(listedRows()).toEqual(['New on Jellyflick', 'Comedy', 'Drama']),
    );
  });

  it('picks the Collection when they add a Collection Row', async () => {
    await withOneRowStored();
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick']));

    fireEvent.click(screen.getByRole('button', { name: 'Add a Collection Row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Crime Classics' }));

    // Named by the Collection, though what is stored is its id.
    await waitFor(() => expect(listedRows()).toEqual(['New on Jellyflick', 'Crime Classics']));
    await backToHome();

    const row = await screen.findByRole('list', { name: 'Crime Classics' });
    expect(
      Array.from(row.querySelectorAll('.card')).map((card) => card.getAttribute('aria-label')),
    ).toEqual(['Arrival', 'Heat']);
  });

  it('hides one genre Row without touching the other', async () => {
    await setFakeState({
      displayPreferences: {
        'jellyflick|jellyflick|user-rafael': {
          'jf.homeLayout': JSON.stringify([
            { kind: 'genre', parameter: 'Comedy' },
            { kind: 'genre', parameter: 'Drama' },
          ]),
        },
      },
    });
    await signInAndLand();
    await openTheEditor();
    await waitFor(() => expect(listedRows()).toEqual(['Comedy', 'Drama']));

    fireEvent.click(screen.getByRole('button', { name: 'Hide Comedy' }));

    // Both Rows are still listed — hiding keeps a Row's place — and only the
    // one they pressed is hidden.
    expect(listedRows()).toEqual(['Comedy', 'Drama']);
    expect(screen.getByRole('button', { name: 'Show Comedy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide Drama' })).toBeTruthy();
    await backToHome();

    await waitFor(() => expect(screen.queryByRole('list', { name: 'Comedy' })).toBeNull());
    expect(await screen.findByRole('list', { name: 'Drama' })).toBeTruthy();
  });
});

describe('a Home with no Rows on it', () => {
  it('says so, rather than looking like something that failed to load', async () => {
    await signInAndLand();

    await openTheEditor();
    // Every Row in the layout: since #15 every kind in the default layout has
    // a feature, so the message is about a Home with nothing on it at all
    // rather than about the Rows that were not built yet.
    fireEvent.click(screen.getByRole('button', { name: 'Hide Continue Watching' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide New on Jellyflick' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide My List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Watch Again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Because You Watched' }));
    await backToHome();

    expect(
      await screen.findByText('No Rows are shown on Home. Edit Home to choose some.'),
    ).toBeTruthy();
  });
});
