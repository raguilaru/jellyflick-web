import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from '../../src/app';
import { en, type Messages } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * How a phone reaches the Movies and Series sections (#51).
 *
 * The bottom bar carries four items — Home, Search, My List and the User's
 * picture — and story 61 says so, so neither section is in it. Home carries the
 * pair of links instead, which is what makes the comment beside
 * `BOTTOM_BAR_SECTION_IDS` true: before this, nothing on Home linked to either
 * and a phone User could only type the address.
 *
 * The links are **Home's at phone width alone**: on a wide screen the top bar
 * already carries both, and one copy of a link at a time is the shell's
 * standing rule — a second copy is a second stop for a screen reader and a
 * second target for every test.
 */

afterEach(resetFakeState);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

/**
 * Runs a test on a screen of a given width, by answering the one media query
 * the shell asks about it (`WIDE_SCREEN_QUERY` in `src/shell/layout.ts`). The
 * real `matchMedia` is put back whatever the test did, so a stub cannot leak
 * into the next test or the next file.
 */
async function atWidth(wide: boolean, body: () => Promise<void>): Promise<void> {
  const realMatchMedia = window.matchMedia;
  const define = (value: unknown) => {
    Object.defineProperty(window, 'matchMedia', { value, configurable: true, writable: true });
  };

  define((query: string) => ({
    matches: query.includes('min-width: 768px') ? wide : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

  try {
    await body();
  } finally {
    define(realMatchMedia);
  }
}

/**
 * Signs a User in and waits for Home. Home's own greeting is what says they
 * are there, rather than the navigation: which bar that is depends on the
 * width, and these tests run at both.
 */
async function signIn(messages: Messages = en): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
      messages={messages}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText(messages['signIn.passwordLabel']), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: messages['signIn.submit'] }));
  await screen.findByText(messages['home.signedInAs']({ name: 'Rafael' }));
}

describe('a phone User reaching the Movies and Series sections', () => {
  it('is given a link to each of them on Home', async () => {
    await atWidth(false, async () => {
      await signIn();

      expect(screen.getByRole('link', { name: 'Movies' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Series' })).toBeTruthy();
    });
  });

  it('opens the Movies section by following its link, and the address follows', async () => {
    await atWidth(false, async () => {
      await signIn();

      fireEvent.click(screen.getByRole('link', { name: 'Movies' }));

      expect(await screen.findByRole('heading', { name: 'Movies', level: 1 })).toBeTruthy();
      expect(window.location.pathname).toBe('/movies');
    });
  });

  it('opens the Series section by following its link', async () => {
    await atWidth(false, async () => {
      await signIn();

      fireEvent.click(screen.getByRole('link', { name: 'Series' }));

      expect(await screen.findByRole('heading', { name: 'Series', level: 1 })).toBeTruthy();
      expect(window.location.pathname).toBe('/series');
    });
  });

  /**
   * Why the links are on Home rather than in the bar: story 61's four items,
   * which `moving-around-the-app` asserts in both suites. The pair must not
   * have become a fifth and a sixth.
   */
  it('still has a bottom bar of four items, with neither section among them', async () => {
    await atWidth(false, async () => {
      await signIn();

      const bar = screen.getByRole('navigation', { name: 'Sections' });
      expect(Array.from(bar.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
        'Home',
        'Search',
        'My List',
      ]);
      expect(bar.querySelector('button')?.textContent).toContain('Rafael');
    });
  });

  it('is told what they are in the User’s own language', async () => {
    await atWidth(false, async () => {
      await signIn(es);

      expect(screen.getByRole('link', { name: 'Películas' })).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Series' })).toBeTruthy();
    });
  });

  /**
   * On a wide screen the top bar carries both already, so Home adds nothing.
   */
  it('is not given a second copy of either link on a wide screen', async () => {
    await atWidth(true, async () => {
      await signIn();

      expect(screen.getAllByRole('link', { name: 'Movies' })).toHaveLength(1);
      expect(screen.getAllByRole('link', { name: 'Series' })).toHaveLength(1);
      expect(
        screen.getByRole('link', { name: 'Movies' }).closest('.top-bar__sections'),
      ).toBeTruthy();
    });
  });
});
