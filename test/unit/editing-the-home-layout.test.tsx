import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
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
    await signInAndLand();
    await openTheEditor();

    expect(screen.getByText('Every Row is already on Home.')).toBeTruthy();
  });
});

describe('a Home with no Rows on it', () => {
  it('says so, rather than looking like something that failed to load', async () => {
    await signInAndLand();

    await openTheEditor();
    // Every Row whose feature is built, or Home would still be drawing one of
    // them. The rest are in the layout but are not on Home yet.
    fireEvent.click(screen.getByRole('button', { name: 'Hide New on Jellyflick' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide My List' }));
    await backToHome();

    expect(
      await screen.findByText('No Rows are shown on Home. Edit Home to choose some.'),
    ).toBeTruthy();
  });
});
