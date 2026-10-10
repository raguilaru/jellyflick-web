import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en, type Messages } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import type { DeviceStorage } from '../../src/device/types';

afterEach(resetFakeState);

/**
 * The app as a User meets it, with the Server address already preset. Pass the
 * same storage twice to model a reload: a new app on the same device.
 */
function renderApp(options: { storage?: DeviceStorage; messages?: Messages } = {}) {
  return render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: options.storage ?? inMemoryDeviceStorage() })}
      messages={options.messages ?? en}
    />,
  );
}

async function signInAs(name: string, password: string = SAMPLE_PASSWORD) {
  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.input(await screen.findByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('a User signing in with a password', () => {
  it('is offered the Server’s public Users once it has connected', async () => {
    renderApp();

    expect(await screen.findByRole('button', { name: 'Rafael' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nico' })).toBeTruthy();
    // Hidden accounts are not listed: that is what the typed username is for.
    expect(screen.queryByRole('button', { name: 'Ghost' })).toBeNull();
  });

  it('shows each public User’s picture, and initials for one without', async () => {
    renderApp();

    const rafael = await screen.findByRole('button', { name: 'Rafael' });
    expect(rafael.querySelector('img')?.getAttribute('src')).toBe(
      `${fakeJellyfinUrl()}/UserImage?userId=user-rafael&tag=tag-rafael`,
    );

    // Nico has no picture, so their initial stands in for one.
    const nico = screen.getByRole('button', { name: 'Nico' });
    expect(nico.querySelector('img')).toBeNull();
    expect(screen.getByText('N')).toBeTruthy();
  });

  it('lands on Home showing their name once the password is right', async () => {
    renderApp();

    await signInAs('Rafael');

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });

  it('says plainly when the password is wrong, and stays on the password step', async () => {
    renderApp();

    await signInAs('Rafael', 'nope');

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That username and password do not match an account on this Server.',
    );
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('lets a User whose account is hidden type their username', async () => {
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Type a username instead' }));
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'Ghost' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: SAMPLE_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Signed in as Ghost.')).toBeTruthy();
  });

  it('asks for the username when the typed one is blank', async () => {
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Type a username instead' }));
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: SAMPLE_PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Type your username.');
  });

  it('explains a Server problem rather than blaming the password', async () => {
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Type a username instead' }));
    fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'Rafael' } });
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: SAMPLE_PASSWORD } });
    await setFakeState({ failAuthenticationWith: 500 });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The Server could not sign you in just now (error 500). Try again in a moment.',
    );
  });

  it('offers the typed-username path when the Server lists no public Users at all', async () => {
    await setFakeState({ users: [] });
    renderApp();

    expect(await screen.findByLabelText('Username')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  it('goes back to the Users from the password step', async () => {
    renderApp();

    fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
    expect(await screen.findByLabelText('Password')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: 'Marina' })).toBeTruthy();
  });

  it('is still signed in after a reload, without asking again', async () => {
    const storage = inMemoryDeviceStorage();
    const first = renderApp({ storage });
    await signInAs('Rafael');
    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    first.unmount();

    renderApp({ storage });

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText('Password')).toBeNull();
    });
  });

  it('asks for the password again when the Server no longer accepts the token', async () => {
    const storage = inMemoryDeviceStorage();
    const first = renderApp({ storage });
    await signInAs('Rafael');
    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    first.unmount();

    // The token was revoked, or the account is gone.
    await setFakeState({ users: [] });
    renderApp({ storage });

    expect(await screen.findByLabelText('Username')).toBeTruthy();
  });

  it('says everything through translation, so Spanish needs no code change', async () => {
    renderApp({ messages: es });

    fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
    fireEvent.input(await screen.findByLabelText('Contraseña'), {
      target: { value: SAMPLE_PASSWORD },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Sesión iniciada como Rafael.')).toBeTruthy();
  });
});
