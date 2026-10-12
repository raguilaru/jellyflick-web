import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, SESSION_STORAGE_KEY, type Session } from '../../src/session/session';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { fakeWrites, forgetFakeWrites, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import type { DeviceStorage } from '../../src/device/types';

const CREDENTIALS = { username: 'Rafael', password: SAMPLE_PASSWORD };

let storage: DeviceStorage;

beforeEach(async () => {
  await resetFakeState();
  await forgetFakeWrites();
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

  it('keeps the stored User when the Server answers with a fault of its own', async () => {
    const first = newSession();
    first.useServer(fakeJellyfinUrl());
    await first.signIn(CREDENTIALS);
    const user = first.activeUser();

    // A Server restarting, or a proxy in front of it: nothing at all is being
    // said about the token, so throwing the User away would cost them their
    // password for a hiccup — and, with several signed in, make one of them
    // vanish from the User Picker while the others stayed.
    await setFakeState({ failUserConfigurationWith: 503 });

    const afterReload = newSession();
    afterReload.useServer(fakeJellyfinUrl());

    expect(await afterReload.resume()).toEqual({ outcome: 'unreachable' });
    expect(afterReload.activeUser()?.userId).toBe(user?.userId);
    // And it survived a reload, so nothing was quietly dropped from storage.
    expect(newSession().activeUser()?.userId).toBe(user?.userId);
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

describe('several Users on one device', () => {
  it('keeps the first User signed in when a second one signs in', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    expect(session.signedInUsers().map((user) => user.name)).toEqual(['Rafael', 'Marina']);
    // The one who just signed in is the one watching.
    expect(session.activeUser()?.name).toBe('Marina');
  });

  it('gives each of them their own token and DeviceId', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    const [rafael, marina] = session.signedInUsers();

    expect(rafael?.deviceId).toBeTruthy();
    expect(marina?.deviceId).toBeTruthy();
    expect(marina?.deviceId).not.toBe(rafael?.deviceId);
    expect(marina?.token).not.toBe(rafael?.token);
  });

  it('switches to a stored User without asking for a password', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const rafael = session.activeUser();
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    expect(session.switchTo(rafael?.userId ?? '')).toBe(true);

    expect(session.activeUser()?.name).toBe('Rafael');
    // Their own token, so the Server knows which User is asking.
    expect(session.gateway().authorizationHeader()).toContain(`Token="${rafael?.token ?? ''}"`);
  });

  it('refuses to switch to a User who is not signed in on this device', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);

    expect(session.switchTo('user-nobody')).toBe(false);
    expect(session.activeUser()?.name).toBe('Rafael');
  });

  it('remembers who was watching across a reload', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const rafael = session.activeUser();
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });
    session.switchTo(rafael?.userId ?? '');

    expect(newSession().activeUser()?.name).toBe('Rafael');
  });

  /**
   * The picker shows these in order, so the order has to hold still: a resume
   * refreshes the active User's profile, and if that moved them the pictures
   * would shuffle on every launch.
   */
  it('keeps the Users in the order they signed in, whatever happens to them', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });
    await session.signIn({ username: 'Nico', password: SAMPLE_PASSWORD });

    session.switchTo(session.signedInUsers()[0]?.userId ?? '');
    await session.resume();

    expect(session.signedInUsers().map((user) => user.name)).toEqual([
      'Rafael',
      'Marina',
      'Nico',
    ]);
    expect(newSession().signedInUsers().map((user) => user.name)).toEqual([
      'Rafael',
      'Marina',
      'Nico',
    ]);
  });

  it('signs out of one User and leaves the others signed in', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const rafael = session.activeUser();
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    await session.signOut(rafael?.userId ?? '');

    expect(session.signedInUsers().map((user) => user.name)).toEqual(['Marina']);
    expect(session.activeUser()?.name).toBe('Marina');
  });

  /**
   * Signing out of the User who is watching leaves nobody watching rather than
   * guessing at the next one: the picker asks who it is.
   */
  it('leaves nobody watching when the User who was watching signs out', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });
    const marina = session.activeUser();

    await session.signOut(marina?.userId ?? '');

    expect(session.activeUser()).toBeUndefined();
    expect(session.signedInUsers().map((user) => user.name)).toEqual(['Rafael']);
  });

  it('tells the Server to drop the token it signed out, so nothing can use it again', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    const rafael = session.activeUser();
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    await session.signOut(rafael?.userId ?? '');

    // Signing in again on the same device has to be a fresh token, and the old
    // one is no longer one the Server will answer.
    await session.signIn(CREDENTIALS);
    expect(session.activeUser()?.token).not.toBe(rafael?.token);
    expect(await writesTo('/Sessions/Logout')).toBe(1);
  });

  /**
   * The Server having the last word on a sign-out would mean a User who cannot
   * leave the device while it is down, which is worse than a token that outlives
   * them by a while.
   */
  it('signs out locally even when the Server refuses to drop the token', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await setFakeState({ failSessionLogoutWith: 500 });

    await session.signOut(session.activeUser()?.userId ?? '');

    expect(session.signedInUsers()).toEqual([]);
    expect(newSession().signedInUsers()).toEqual([]);
  });

  it('clears every User when the Server address changes', async () => {
    const session = newSession();
    session.useServer(fakeJellyfinUrl());
    await session.signIn(CREDENTIALS);
    await session.signIn({ username: 'Marina', password: SAMPLE_PASSWORD });

    session.useServer('http://another.server.test');

    expect(session.signedInUsers()).toEqual([]);
    expect(session.activeUser()).toBeUndefined();
    expect(newSession().signedInUsers()).toEqual([]);
  });
});

/** How many non-GET requests the fake Jellyfin saw for one path. */
async function writesTo(path: string): Promise<number> {
  const writes = await fakeWrites();
  return writes.filter((write) => write.path === path).length;
}
