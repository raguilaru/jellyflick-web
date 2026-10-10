import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { App } from '../../src/app';
import { en, type Messages } from '../../src/i18n/en';
import { es } from '../../src/i18n/es';
import { testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

afterEach(resetFakeState);

function renderApp(presetServerAddress?: string, messages: Messages = en) {
  return render(
    <App
      config={{ presetServerAddress, appVersion: 'test' }}
      device={testDeviceLayer()}
      messages={messages}
    />,
  );
}

describe('a User opening the app', () => {
  it('goes straight past the address screen when the host preset a Server address', async () => {
    renderApp(fakeJellyfinUrl());

    expect(await screen.findByText('Connected to Fake Jellyfin.')).toBeTruthy();
    expect(screen.queryByLabelText('Server address')).toBeNull();
  });

  it('is asked for an address when the host left the setting empty', () => {
    renderApp(undefined);

    expect(screen.getByLabelText('Server address')).toBeTruthy();
  });

  it('connects to the Server it is given', async () => {
    renderApp(undefined);

    fireEvent.input(screen.getByLabelText('Server address'), {
      target: { value: fakeJellyfinUrl() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('Connected to Fake Jellyfin.')).toBeTruthy();
  });

  it('refuses a Server older than 12.0 and says which version it found', async () => {
    await setFakeState({ systemInfo: { Version: '10.10.7' } });
    renderApp(undefined);

    fireEvent.input(screen.getByLabelText('Server address'), {
      target: { value: fakeJellyfinUrl() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(
      await screen.findByText(
        'That server runs Jellyfin 10.10.7. Jellyflick needs 12.0 or later, so it cannot connect to it.',
      ),
    ).toBeTruthy();
  });

  it('shows the address screen with the reason when a preset address is too old', async () => {
    await setFakeState({ systemInfo: { Version: '10.10.7' } });
    renderApp(fakeJellyfinUrl());

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Server address')).toBeTruthy();
  });

  it('explains an address nothing answers on', async () => {
    renderApp(undefined);

    fireEvent.input(screen.getByLabelText('Server address'), {
      target: { value: 'http://127.0.0.1:1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(
      await screen.findByText(
        'Nothing answered at http://127.0.0.1:1. Check the address and that the Server is switched on.',
      ),
    ).toBeTruthy();
  });

  it('will not submit an empty address', async () => {
    renderApp(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That is not an address Jellyflick can use. Check it and try again.',
    );
  });

  it('shows every message through translation, so Spanish needs no code change', async () => {
    renderApp(fakeJellyfinUrl(), es);

    expect(await screen.findByText('Conectado a Fake Jellyfin.')).toBeTruthy();
  });
});
