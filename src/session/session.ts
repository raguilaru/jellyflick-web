import type { DeviceLayer, DeviceStorage } from '../device/types';
import {
  createJellyfinGateway,
  JellyfinHttpError,
  JellyfinUnreachableError,
  normaliseServerAddress,
  type JellyfinGateway,
} from '../jellyfin/gateway';

/**
 * Session & Users: the Server address and the Users signed in on this device,
 * kept in device storage so they survive a reload.
 *
 * Each User owns a token, a DeviceId and enough profile to show who they are.
 * The DeviceId is minted once, when the User signs in, and then kept: the
 * Server allows a single token per DeviceId, so reusing one would knock the
 * other User's token out. That is what lets several Users of a household be
 * signed in on one device at the same time, which is the whole point of the
 * stored shape — a list of Users with at most one of them active.
 *
 * "Active" and "signed in" are deliberately different things. Switching User
 * only moves which stored User is active, so it needs no password (story 16);
 * signing out takes one User out of the list and leaves the rest alone (story
 * 18); and nobody active with Users still stored is the state the User Picker
 * exists for.
 *
 * Nothing here reads `localStorage` directly: device storage is the device
 * layer's, so a browser that refuses it degrades to "sign in again next time".
 */

/** The one key this module owns in device storage. */
export const SESSION_STORAGE_KEY = 'jellyflick.session';

/** The stored shape's version, so a later change can migrate or discard. */
const STORED_VERSION = 1;

export type SignedInUser = {
  readonly userId: string;
  readonly name: string;
  /** The Server's access token. One per DeviceId. */
  readonly token: string;
  readonly deviceId: string;
  /** Absent when the User has no picture: show their initials instead. */
  readonly primaryImageTag?: string;
};

export type Credentials = {
  username: string;
  password: string;
};

/**
 * Every way signing in can end. None of them throws: "that password is wrong"
 * is an answer, not a failure, and each outcome has its own translated message.
 */
export type SignInResult =
  | { outcome: 'signed-in'; user: SignedInUser }
  | { outcome: 'wrong-credentials' }
  | { outcome: 'username-missing' }
  | { outcome: 'password-missing' }
  | { outcome: 'unreachable' }
  | { outcome: 'server-problem'; status: number };

/** What came of checking the stored token with the Server. */
export type ResumeResult =
  | { outcome: 'signed-in'; user: SignedInUser }
  /** Nobody was stored, or the Server no longer accepts the stored token. */
  | { outcome: 'signed-out' }
  /** The Server could not be reached, so the stored User is kept as it is. */
  | { outcome: 'unreachable' };

export type Session = {
  /** The Server the stored Users belong to, if any has been stored. */
  storedServerAddress(): string | undefined;
  /**
   * Points the session at a Server. A different address clears every User, so
   * Users from two Servers never mix.
   */
  useServer(address: string): void;
  /** The User who is watching, if one of the signed-in Users is. */
  activeUser(): SignedInUser | undefined;
  /**
   * Every User signed in on this device, in the order they signed in. The
   * order holds still, because the User Picker shows them in it.
   */
  signedInUsers(): readonly SignedInUser[];
  signIn(credentials: Credentials): Promise<SignInResult>;
  /**
   * Makes an already signed-in User the one who is watching. Their token is
   * already here, so no password is asked for (story 16). False means that
   * User is not signed in on this device, and nothing changed.
   */
  switchTo(userId: string): boolean;
  /** Confirms the stored token still works and refreshes the stored profile. */
  resume(): Promise<ResumeResult>;
  /**
   * Takes one User off this device, leaving every other signed-in User alone,
   * and asks the Server to drop their token so nothing can use it again.
   *
   * The local sign-out happens whatever the Server says: a Server that is down
   * must not be able to keep a User on a device they are trying to leave.
   */
  signOut(userId: string): Promise<void>;
  /**
   * The gateway for the active User, carrying their token and DeviceId, or an
   * anonymous one when nobody is signed in. Every request goes through it, so
   * there is one place the authorization header is built.
   */
  gateway(): JellyfinGateway;
};

export type SessionOptions = {
  device: DeviceLayer;
  /** The application name the Server records for this client. */
  client: string;
  appVersion: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
};

type StoredSession = {
  version: number;
  serverAddress: string;
  users: SignedInUser[];
  activeUserId: string | null;
};

export function createSession(options: SessionOptions): Session {
  const storage = options.device.storage();
  let stored = readStored(storage);

  function save(): void {
    if (stored === undefined) {
      storage.remove(SESSION_STORAGE_KEY);
      return;
    }
    storage.write(SESSION_STORAGE_KEY, JSON.stringify(stored));
  }

  function activeUser(): SignedInUser | undefined {
    if (stored === undefined || stored.activeUserId === null) return undefined;
    return stored.users.find((user) => user.userId === stored?.activeUserId);
  }

  function gatewayFor(user: SignedInUser | undefined): JellyfinGateway {
    const serverAddress = stored?.serverAddress ?? '';
    return createJellyfinGateway({
      serverAddress,
      client: options.client,
      device: options.device.deviceName(),
      // An anonymous gateway still has to name a device: the Server reads the
      // DeviceId on `AuthenticateByName` to record which device the new token
      // belongs to.
      deviceId: user?.deviceId ?? anonymousDeviceId(),
      appVersion: options.appVersion,
      ...(user === undefined ? {} : { token: user.token }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  /**
   * The DeviceId an anonymous gateway uses. Minted once per page, not per
   * request, so the sign-in attempt and the token it produces agree.
   */
  let anonymous: string | undefined;
  function anonymousDeviceId(): string {
    anonymous ??= options.device.newDeviceId();
    return anonymous;
  }

  return {
    storedServerAddress: () => stored?.serverAddress,

    useServer: (address) => {
      const serverAddress = normaliseServerAddress(address);
      if (stored !== undefined && stored.serverAddress === serverAddress) return;
      stored = { version: STORED_VERSION, serverAddress, users: [], activeUserId: null };
      anonymous = undefined;
      save();
    },

    activeUser,
    signedInUsers: () => stored?.users ?? [],

    signIn: async (credentials) => {
      const username = credentials.username.trim();
      if (username === '') return { outcome: 'username-missing' };
      if (credentials.password === '') return { outcome: 'password-missing' };

      // A fresh DeviceId per User, minted before the request, because the
      // Server ties the token it issues to the DeviceId it was asked with.
      const deviceId = options.device.newDeviceId();
      // The attempt carries this DeviceId and no token, which is how the Server
      // records which device the token it issues belongs to.
      const gateway = createJellyfinGateway({
        serverAddress: stored?.serverAddress ?? '',
        client: options.client,
        device: options.device.deviceName(),
        deviceId,
        appVersion: options.appVersion,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });

      try {
        const result = await gateway.authenticateByName(username, credentials.password);
        const user = toSignedInUser(result, deviceId);
        if (user === undefined) return { outcome: 'server-problem', status: 200 };
        remember(user);
        return { outcome: 'signed-in', user };
      } catch (error) {
        if (error instanceof JellyfinUnreachableError) return { outcome: 'unreachable' };
        if (error instanceof JellyfinHttpError) {
          // The Server answers 401 for both a wrong password and a username it
          // does not have, and says no more than that on purpose.
          if (error.status === 401 || error.status === 403) {
            return { outcome: 'wrong-credentials' };
          }
          return { outcome: 'server-problem', status: error.status };
        }
        return { outcome: 'server-problem', status: 0 };
      }
    },

    resume: async () => {
      const user = activeUser();
      if (user === undefined) return { outcome: 'signed-out' };

      try {
        const dto = await gatewayFor(user).getCurrentUser();
        const refreshed: SignedInUser = {
          ...user,
          name: dto.Name ?? user.name,
          ...(typeof dto.PrimaryImageTag === 'string' && dto.PrimaryImageTag !== ''
            ? { primaryImageTag: dto.PrimaryImageTag }
            : {}),
        };
        remember(refreshed);
        return { outcome: 'signed-in', user: refreshed };
      } catch (error) {
        if (error instanceof JellyfinUnreachableError) return { outcome: 'unreachable' };
        // Anything else means the Server will not act on this token any more,
        // so the only honest thing is to ask for the password again.
        forget(user.userId);
        return { outcome: 'signed-out' };
      }
    },

    switchTo: (userId) => {
      if (stored === undefined) return false;
      if (!stored.users.some((candidate) => candidate.userId === userId)) return false;
      stored = { ...stored, activeUserId: userId };
      save();
      return true;
    },

    signOut: async (userId) => {
      const leaving = stored?.users.find((candidate) => candidate.userId === userId);
      // Taken off the device first, and told to the Server afterwards. The
      // other way round would leave a User stuck on a device whenever the
      // Server is slow or down, and the token it is about to drop is this
      // User's alone — every other User is on their own DeviceId.
      forget(userId);
      if (leaving === undefined) return;
      try {
        await gatewayFor(leaving).signOut();
      } catch {
        // A token the Server would not drop outlives the User on this device
        // by a while. That is the lesser of the two problems, and there is
        // nothing to tell them: they are already signed out.
      }
    },

    gateway: () => gatewayFor(activeUser()),
  };

  /**
   * Stores a User and makes them the one watching. A User already in the list
   * keeps their place in it rather than moving to the end: the User Picker
   * shows them in this order, and `resume` goes through here on every launch,
   * so moving them would reshuffle the pictures every time the app opened.
   */
  function remember(user: SignedInUser): void {
    if (stored === undefined) return;
    const known = stored.users.some((candidate) => candidate.userId === user.userId);
    const users = known
      ? stored.users.map((candidate) => (candidate.userId === user.userId ? user : candidate))
      : [...stored.users, user];
    stored = { ...stored, users, activeUserId: user.userId };
    save();
  }

  function forget(userId: string): void {
    if (stored === undefined) return;
    const users = stored.users.filter((candidate) => candidate.userId !== userId);
    stored = {
      ...stored,
      users,
      activeUserId: stored.activeUserId === userId ? null : stored.activeUserId,
    };
    save();
  }
}

/**
 * Reads what was stored, or nothing when it cannot be read. Storage can hold
 * anything — a half-written value, or something an older version wrote — and a
 * User who cannot be restored should simply be asked to sign in.
 */
function readStored(storage: DeviceStorage): StoredSession | undefined {
  const raw = storage.read(SESSION_STORAGE_KEY);
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;

  const candidate = parsed as Partial<StoredSession>;
  if (candidate.version !== STORED_VERSION) return undefined;
  if (typeof candidate.serverAddress !== 'string') return undefined;
  if (!Array.isArray(candidate.users)) return undefined;

  const users = candidate.users.filter(isSignedInUser);
  const activeUserId =
    typeof candidate.activeUserId === 'string' &&
    users.some((user) => user.userId === candidate.activeUserId)
      ? candidate.activeUserId
      : null;

  return { version: STORED_VERSION, serverAddress: candidate.serverAddress, users, activeUserId };
}

function isSignedInUser(value: unknown): value is SignedInUser {
  if (value === null || typeof value !== 'object') return false;
  const user = value as Partial<SignedInUser>;
  return (
    typeof user.userId === 'string' &&
    user.userId !== '' &&
    typeof user.name === 'string' &&
    typeof user.token === 'string' &&
    user.token !== '' &&
    typeof user.deviceId === 'string' &&
    user.deviceId !== ''
  );
}

/** The parts of an `AuthenticationResult` a signed-in User is made of. */
function toSignedInUser(
  result: {
    AccessToken?: string | null;
    User?: { Id?: string | null; Name?: string | null; PrimaryImageTag?: string | null } | null;
  },
  deviceId: string,
): SignedInUser | undefined {
  const token = result.AccessToken;
  const userId = result.User?.Id;
  if (typeof token !== 'string' || token === '') return undefined;
  if (typeof userId !== 'string' || userId === '') return undefined;

  const tag = result.User?.PrimaryImageTag;
  return {
    userId,
    name: result.User?.Name ?? userId,
    token,
    deviceId,
    ...(typeof tag === 'string' && tag !== '' ? { primaryImageTag: tag } : {}),
  };
}
