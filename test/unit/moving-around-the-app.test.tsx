import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from '../../src/app';
import { en, type Messages } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

afterEach(resetFakeState);

/**
 * The address is part of what the shell shows, so each test starts at the root
 * the way a browser opening Jellyflick does.
 */
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

function renderApp(messages: Messages = en) {
  return render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
      messages={messages}
    />,
  );
}

/** The shell only exists for a signed-in User, so every test signs one in. */
async function signIn(name = 'Rafael') {
  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.input(await screen.findByLabelText('Password'), { target: { value: SAMPLE_PASSWORD } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  // The navigation is the shell's own, so its arrival is what says the User is
  // inside the app rather than still signing in.
  return await screen.findByRole('link', { name: 'Movies' });
}

/**
 * The Back key. `Escape` is how a keyboard sends it and 461 is how a webOS
 * remote does; the shell treats them as the same key.
 */
async function pressBack(event: { key?: string; keyCode?: number } = { key: 'Escape' }) {
  // The shell puts its listener on the window in an effect, and Preact runs
  // effects a frame after the render, so the frame has to pass before a key can
  // reach it. Only this harness waits: a real browser paints on its own.
  await afterPaint();
  fireEvent.keyDown(window, event);
}

/** Longer than Preact's own after-paint timeout, which is 100ms. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 150);
  });
}

describe('a User moving around the app', () => {
  it('lands on Home, with Home marked as the section they are on', async () => {
    renderApp();
    await signIn();

    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(window.location.pathname).toBe('/');
  });

  it('has a link to every section', async () => {
    renderApp();
    await signIn();

    for (const name of ['Home', 'Movies', 'Series', 'My List', 'Search']) {
      expect(screen.getByRole('link', { name }), name).toBeTruthy();
    }
  });

  it('opens the section whose link it follows, and the address follows too', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Movies' }));

    expect(await screen.findByRole('heading', { name: 'Movies' })).toBeTruthy();
    expect(window.location.pathname).toBe('/movies');
    expect(screen.getByRole('link', { name: 'Movies' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens the section the address names on a fresh load', async () => {
    window.history.replaceState(null, '', '/my-list');
    renderApp();
    await signIn();

    expect(await screen.findByRole('heading', { name: 'My List' })).toBeTruthy();
  });

  it('goes back to the section it came from when Back is pressed', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Movies' }));
    expect(await screen.findByRole('heading', { name: 'Movies' })).toBeTruthy();

    await pressBack();

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('answers a remote’s Back key, not only the keyboard’s', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Series' }));
    expect(await screen.findByRole('heading', { name: 'Series' })).toBeTruthy();

    // webOS remotes send Back as keyCode 461 with no useful `key`.
    await pressBack({ key: '', keyCode: 461 });

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });

  /**
   * Search is the one section that gives a field focus by itself as it opens
   * (#24), and a field owns the keys that edit text. It does **not** own Back:
   * a TV has no back button of its own, so a Back the field swallowed left a
   * User with no way out of the section at all.
   */
  it('leaves Search on Back even though the field has the focus', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    const field = await screen.findByLabelText('Search for a Movie or Series');
    field.focus();
    expect(document.activeElement).toBe(field);

    await afterPaint();
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('answers a remote’s Back key in Search too, where the field has the focus', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    const field = await screen.findByLabelText('Search for a Movie or Series');
    field.focus();

    await afterPaint();
    fireEvent.keyDown(field, { key: '', keyCode: 461 });

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });

  /**
   * The other half of the same rule, and the reason the guard exists at all:
   * Backspace is a Back key on a remote and a deleted character in a field, and
   * there the field has to win or a User could not correct a typo.
   */
  it('leaves Backspace to the field a User is typing in', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    const field = await screen.findByLabelText('Search for a Movie or Series');
    field.focus();

    await afterPaint();
    fireEvent.keyDown(field, { key: 'Backspace' });

    expect(await screen.findByRole('heading', { name: 'Search' })).toBeTruthy();
    expect(window.location.pathname).toBe('/search');
  });

  it('goes to Home when Back is pressed in a section that was opened directly', async () => {
    window.history.replaceState(null, '', '/series');
    renderApp();
    await signIn();
    expect(await screen.findByRole('heading', { name: 'Series' })).toBeTruthy();

    await pressBack();

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('stays in the app when Back is pressed on Home', async () => {
    // What the browser was showing before Jellyflick was opened.
    window.history.replaceState(null, '', '/elsewhere');
    window.history.pushState(null, '', '/');
    renderApp();
    await signIn();

    await pressBack();

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });

  it('leaves a section by the browser’s back button too', async () => {
    renderApp();
    await signIn();

    fireEvent.click(screen.getByRole('link', { name: 'My List' }));
    expect(await screen.findByRole('heading', { name: 'My List' })).toBeTruthy();

    window.history.back();

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });

  it('shows the navigation in the User’s language', async () => {
    renderApp(es);

    fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
    fireEvent.input(await screen.findByLabelText('Contraseña'), {
      target: { value: SAMPLE_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('link', { name: 'Películas' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mi lista' })).toBeTruthy();
  });
});
