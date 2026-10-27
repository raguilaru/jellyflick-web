import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import type { DeviceStorage } from '../../src/device/types';

/**
 * Several Users on one device: adding a second one, picking who is watching,
 * switching from the bars, and signing one of them out.
 *
 * This spec drives the whole app, because the question it answers is about the
 * seam between the session, the picker and the shell — who is watching decides
 * what every screen reads.
 */

let storage: DeviceStorage;

beforeEach(() => {
  storage = inMemoryDeviceStorage();
});

afterEach(resetFakeState);

/** The app on one device. Called twice with the same storage, it is a reload. */
function renderApp() {
  return render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage })}
      messages={en}
    />,
  );
}

/**
 * A reload: the app unmounted and started again on the same device storage,
 * which is all a reload is from the session's point of view.
 */
function reload(app: { unmount(): void }) {
  app.unmount();
  return renderApp();
}

/** Signs in from whichever sign-in screen is on the screen. */
async function signInAs(name: string, password: string = SAMPLE_PASSWORD) {
  fireEvent.click(await screen.findByRole('button', { name }));
  fireEvent.input(await screen.findByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText(`Signed in as ${name}.`)).toBeTruthy();
}

/** Opens the picker from the control in whichever navigation bar is showing. */
async function openThePicker(currentName: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: `Switch User, currently ${currentName}` }),
  );
  expect(await screen.findByRole('heading', { name: 'Who is watching?' })).toBeTruthy();
}

describe('adding a second User', () => {
  it('is offered on the User Picker, and keeps the first User signed in', async () => {
    renderApp();
    await signInAs('Rafael');

    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    // Both are on the device now, so the picker lists both.
    await openThePicker('Marina');
    expect(screen.getByRole('button', { name: 'Rafael' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marina' })).toBeTruthy();
  });

  it('can be given up on, which leaves the User who was watching watching', async () => {
    renderApp();
    await signInAs('Rafael');

    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });
});

describe('the User Picker', () => {
  it('asks who is watching when the app opens with more than one User signed in', async () => {
    const app = renderApp();
    await signInAs('Rafael');
    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    // A reload: the same device, with two Users on it.
    reload(app);

    expect(await screen.findByRole('heading', { name: 'Who is watching?' })).toBeTruthy();
    // Nobody is watching yet, so no screen of either User's is showing.
    expect(screen.queryByText('Signed in as Marina.')).toBeNull();
  });

  it('does not ask when only one User is signed in', async () => {
    const app = renderApp();
    await signInAs('Rafael');

    reload(app);

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Who is watching?' })).toBeNull();
  });

  it('never asks a picked User for their password again', async () => {
    const app = renderApp();
    await signInAs('Rafael');
    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    reload(app);

    fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});

describe('switching User from the bars', () => {
  it('switches to the other User and puts their screens in front of them', async () => {
    renderApp();
    await signInAs('Rafael');
    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    await openThePicker('Marina');
    fireEvent.click(screen.getByRole('button', { name: 'Rafael' }));

    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
  });

  it('can be closed again without switching anyone', async () => {
    renderApp();
    await signInAs('Rafael');

    await openThePicker('Rafael');
    expect(screen.getByRole('heading', { name: 'Who is watching?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep watching as Rafael' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Who is watching?' })).toBeNull();
    });
    expect(screen.getByText('Signed in as Rafael.')).toBeTruthy();
  });
});

describe('signing out', () => {
  it('takes only that User off the device', async () => {
    renderApp();
    await signInAs('Rafael');
    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    await openThePicker('Marina');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Marina' }));

    // Marina is gone, so the one User left is the one watching: there is
    // nobody to choose between any more.
    expect(await screen.findByText('Signed in as Rafael.')).toBeTruthy();
    await openThePicker('Rafael');
    expect(screen.queryByRole('button', { name: 'Marina' })).toBeNull();
  });

  it('asks for a password again when the last User signs out', async () => {
    renderApp();
    await signInAs('Rafael');

    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Rafael' }));

    expect(await screen.findByRole('heading', { name: 'Choose your User' })).toBeTruthy();
  });
});

describe('the Server address', () => {
  it('signs every User out when it changes, so Users from two Servers never mix', async () => {
    const app = renderApp();
    await signInAs('Rafael');
    await openThePicker('Rafael');
    fireEvent.click(screen.getByRole('button', { name: 'Add another User' }));
    await signInAs('Marina');

    // The host repointed the app at another address. A different address is a
    // different Server as far as this app can tell, so none of the Users
    // stored against the old one may survive — even here, where the two
    // addresses happen to reach the same machine.
    app.unmount();
    render(
      <App
        config={{ presetServerAddress: otherAddressOfTheFake(), appVersion: 'test' }}
        device={testDeviceLayer({ storage })}
        messages={en}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Choose your User' })).toBeTruthy();
  });
});

/**
 * The fake Jellyfin under a second address. The app compares addresses as
 * written, because that is all it can do: two names for one machine are two
 * Servers until something proves otherwise.
 */
function otherAddressOfTheFake(): string {
  return fakeJellyfinUrl().replace('127.0.0.1', 'localhost');
}
