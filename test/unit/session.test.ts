import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, SESSION_STORAGE_KEY, type Session } from '../../src/session/session';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import type { DeviceStorage } from '../../src/device/types';

const CREDENTIALS = { username: 'Rafael', password: SAMPLE_PASSWORD };

let storage: DeviceStorage;

beforeEach(async () => {
  await resetFakeState();
  storage = inMemoryDeviceStorage();
});

/** A session as the app builds one: its own storage, its own device layer. */
function newSession(sharedStorage: DeviceStorage = storage): Session {
  return createSession({
    device: testDeviceLayer({ storage: sharedStorage }),
    client: 'Jellyflick',
    appVersion: 'test',
  });
}

describe('signing in', () => {
  it('returns the User who signed in', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());

    const result = await session.signIn(CREDENTIALS);

    expect(result).toMatchObject({ outcome: 'signed-in' });
    expect(session.activeUser()?.name).toBe('Rafael');
  });

  it('gives each User their own DeviceId, because the Server allows one token per DeviceId', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const first = session.activeUser();

    const other = newSession(inMemoryDeviceStorage());
    other.useServer(fakeJellyfinUrl());
    await other.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    expect(first?.deviceId).toBeTruthy();
    expect(other.activeUser()?.deviceId).not.toBe(first?.deviceId);
  });

  it('signs in a User the public list hides', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());

    const result = await session.signIn({ username: 'Ghost', password: SAMPLE_PASSWORD });

    expect(result).toMatchObject({ outcome: 'signed-in' });
    expect(session.activeUser()?.name).toBe('Ghost');
  });

  it('calls a wrong password wrong, and signs nobody in', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());

    const result = await session.signIn({ username: 'Rafael', password: 'nope' });

    expect(result).toEqual({ outcome: 'wrong-credentials' });
    expect(session.activeUser()).toBeUndefined();
  });

  it('separates a Server that cannot be reached from a password that is wrong', async () => {
    const session = newSession();
    session.useServer('http://127.0.0.1:1');

    const result = await session.signIn(CREDENTIALS);

    expect(result).toEqual({ outcome: 'unreachable' });
  });

  it('asks for a username before it asks the Server', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());

    expect(await session.signIn({ username: '   ', password: SAMPLE_PASSWORD })).toEqual({
      outcome: 'username-missing',
    });
  });
});

describe('a signed-in User on this device', () => {
  it('is still signed in after a reload', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);

    // A reload is a new session reading the same device storage.
    const afterReload = newSession();

    expect(afterReload.storedServerAddress()).toBe(fakeJellyfinUrl());
    expect(afterReload.activeUser()?.name).toBe('Rafael');
    expect(afterReload.activeUser()?.token).toBe(first.activeUser()?.token);
    expect(afterReload.activeUser()?.deviceId).toBe(first.activeUser()?.deviceId);
  });

  it('keeps the same DeviceId across a reload, so the Server keeps the token', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);

    const afterReload = newSession();
    afterReload.useServer(fakeJellyfinUrl());

    expect(afterReload.activeUser()?.deviceId).toBe(first.activeUser()?.deviceId);
  });

  it('proves the stored token still works, and refreshes the name', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);

    const afterReload = newSession();
    afterReload.useServer(fakeJellyfinUrl());

    expect(await afterReload.resume()).toMatchObject({ outcome: 'signed-in' });
    expect(afterReload.activeUser()?.name).toBe('Rafael');
  });

  it('sends the stored token in the authorization header of its own requests', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);

    const afterReload = newSession();
    afterReload.useServer(fakeJellyfinUrl());
    const user = afterReload.activeUser();

    expect(afterReload.gateway().authorizationHeader()).toContain(`Token="${user?.token ?? ''}"`);
    expect(afterReload.gateway().authorizationHeader()).toContain(
      `DeviceId="${user?.deviceId ?? ''}"`,
    );
  });

  it('is signed out again when the stored token no longer works', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);

    // The Server no longer knows the token: it was revoked, or the account went.
    await setFakeState({ users: [] });

    const afterReload = newSession();
    afterReload.useServer(fakeJellyfinUrl());

    expect(await afterReload.resume()).toEqual({ outcome: 'signed-out' });
    expect(afterReload.activeUser()).toBeUndefined();
    expect(newSession().activeUser()).toBeUndefined();
  });

  it('signs out of one User without forgetting the Server', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const userId = session.activeUser()?.userId ?? '';

    session.signOut(userId);

    expect(session.activeUser()).toBeUndefined();
    expect(newSession().activeUser()).toBeUndefined();
    expect(session.storedServerAddress()).toBe(fakeJellyfinUrl());
  });

  it('is cleared when the Server address changes, so Users never mix', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);

    session.useServer('http://another.server.test');

    expect(session.activeUser()).toBeUndefined();
    expect(newSession().activeUser()).toBeUndefined();
  });

  it('survives device storage holding something it cannot read', () => {
    storage.write(SESSION_STORAGE_KEY, 'not json at all');

    expect(newSession().activeUser()).toBeUndefined();
  });
});
