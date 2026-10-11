import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en, type Messages } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import {
  inMemoryDeviceStorage,
  testDeviceLayer,
  type CapabilityProfileName,
} from '../device/profiles';
import { fakeRequests, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Signing in with a code, as a User meets it (#9, story 12).
 *
 * What is *not* here is the full approve-and-land-on-Home journey: the app
 * polls every five seconds, which is the Server's patience rather than
 * anything about this screen, so making a spec sit through it would buy
 * nothing. `quick-connect.test.ts` drives that whole path in milliseconds, and
 * `test/e2e/quick-connect-sign-in.spec.ts` does it for real in a browser.
 * These tests are about what the screen offers, and in what order.
 */
afterEach(resetFakeState);

function renderApp(
  options: { profile?: CapabilityProfileName; messages?: Messages } = {},
) {
  return render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({
        storage: inMemoryDeviceStorage(),
        ...(options.profile === undefined ? {} : { profile: options.profile }),
      })}
      messages={options.messages ?? en}
    />,
  );
}

describe('signing in with a code', () => {
  /**
   * The acceptance criterion: on a TV the code comes first, because the thing
   * being avoided is typing a password with a remote. The decision is the
   * device layer's — `deviceForm()` — not a user agent read on this screen.
   */
  it('is what a TV offers first, before any password', async () => {
    renderApp({ profile: 'webos-5-like' });

    expect(await screen.findByText(/^\d{6}$/)).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    // The password is still reachable: a household member who would rather
    // type one is not stuck with the code.
    expect(screen.getByRole('button', { name: 'Use a password instead' })).toBeTruthy();
  });

  it('is one press away on a computer, which offers the Users first', async () => {
    renderApp({ profile: 'modern-desktop-browser' });

    // The public Users come first here, as they did before Quick Connect
    // existed.
    expect(await screen.findByRole('button', { name: 'Rafael' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a code instead' }));

    expect(await screen.findByText(/^\d{6}$/)).toBeTruthy();
  });

  it('goes back to the Users from the code', async () => {
    renderApp({ profile: 'webos-5-like' });
    await screen.findByText(/^\d{6}$/);

    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }));

    expect(await screen.findByRole('button', { name: 'Rafael' })).toBeTruthy();
  });

  /**
   * A Server whose admin has Quick Connect switched off must not be shown a
   * code that could never be approved — not even on a TV, where it would
   * otherwise be the first thing offered and so the only thing a User sees.
   */
  it('is not offered at all when the Server has it switched off', async () => {
    await setFakeState({ quickConnect: { enabled: false, requests: [], codesIssued: 0 } });

    renderApp({ profile: 'webos-5-like' });

    // Straight to the password path, with no mention of a code.
    expect(await screen.findByRole('button', { name: 'Rafael' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with a code instead' })).toBeNull();
  });

  it('explains a Server that will not hand out a code, and offers a new one', async () => {
    await setFakeState({
      quickConnect: { enabled: true, requests: [], codesIssued: 0, failInitiateWith: 500 },
    });

    renderApp({ profile: 'webos-5-like' });

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The Server could not sign you in just now (error 500). Try again in a moment.',
    );

    // The Server is having a better moment now.
    await setFakeState({
      quickConnect: { enabled: true, requests: [], codesIssued: 0, failInitiateWith: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));

    expect(await screen.findByText(/^\d{6}$/)).toBeTruthy();
  });

  /**
   * Leaving the screen has to stop the polling. A User who went off to type a
   * password instead, or closed the app, must not leave a loop asking their
   * Server about a code nobody is looking at.
   */
  it('stops asking the Server about a code once the screen is gone', async () => {
    const app = renderApp({ profile: 'webos-5-like' });
    const code = (await screen.findByText(/^\d{6}$/)).textContent ?? '';
    expect(code).not.toBe('');

    app.unmount();

    const before = await pollsFor(code);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await pollsFor(code)).toBe(before);
  });

  /**
   * The sign-in screen is reached two ways: as the first sign-in, and from the
   * picker's "Add another User" once somebody is already watching (#8). Quick
   * Connect has to be the way in on both, and the second attempt has to get a
   * code of its own — the first one's secret was spent signing the first User
   * in.
   */
  it('is offered again when another household member is added', async () => {
    renderApp({ profile: 'webos-5-like' });

    // The first User would rather type, which a TV still allows.
    const firstCode = (await screen.findByText(/^\d{6}$/)).textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: 'Use a password instead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
    fireEvent.input(await screen.findByLabelText('Password'), {
      target: { value: SAMPLE_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Switch User, currently Rafael' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add another User' }));

    const secondCode = (await screen.findByText(/^\d{6}$/)).textContent ?? '';
    expect(secondCode).toMatch(/^\d{6}$/);
    expect(secondCode).not.toBe(firstCode);
  });

  it('says everything through translation, so Spanish needs no code change', async () => {
    renderApp({ profile: 'webos-5-like', messages: es });

    expect(await screen.findByText(/^\d{6}$/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Usar una contraseña' })).toBeTruthy();
    });
  });
});

/** How many times the app has polled for one code: this test's own traffic. */
async function pollsFor(code: string): Promise<number> {
  const requests = await fakeRequests();
  return requests.filter(
    (request) =>
      request.path.startsWith('/QuickConnect/Connect') && request.path.includes(`secret-${code}`),
  ).length;
}
