/**
 * In-memory sample data for the fake Jellyfin.
 *
 * Every later ticket grows this: add a field to `FakeJellyfinState`, seed it in
 * `createSampleData()`, and read it from a route module. `POST /__fake/state`
 * shallow-merges a patch over the whole object, so a test can change any of it
 * without a code change here.
 */

export type FakeSystemInfo = {
  LocalAddress: string;
  ServerName: string;
  Version: string;
  ProductName: string;
  Id: string;
  StartupWizardCompleted: boolean;
};

/**
 * A Jellyfin user account on the Server. `UserDto`-shaped, with the password the
 * fake checks kept alongside it — the real Server never returns one, so it is
 * stripped before a user is served.
 */
export type FakeUser = {
  Id: string;
  Name: string;
  ServerId: string;
  /** Null means the user has no picture, so the app shows initials instead. */
  PrimaryImageTag: string | null;
  HasPassword: boolean;
  HasConfiguredPassword: boolean;
  /** `UserPolicy.IsHidden`: a hidden user is left out of `/Users/Public`. */
  Policy: { IsHidden: boolean; EnableContentDownloading: boolean };
  /** The fake's own field: what `AuthenticateByName` accepts for this user. */
  password: string;
};

export type FakeJellyfinState = {
  systemInfo: FakeSystemInfo;
  users: FakeUser[];
};

const SERVER_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

export function createSampleData(): FakeJellyfinState {
  return {
    users: [
      fakeUser({ Id: 'user-rafael', Name: 'Rafael', PrimaryImageTag: 'tag-rafael' }),
      fakeUser({ Id: 'user-marina', Name: 'Marina', PrimaryImageTag: 'tag-marina' }),
      // No picture, so the app has to fall back to initials.
      fakeUser({ Id: 'user-nico', Name: 'Nico', PrimaryImageTag: null }),
      // Hidden from the public list: the only way in is to type the username.
      fakeUser({ Id: 'user-ghost', Name: 'Ghost', hidden: true }),
    ],
    systemInfo: {
      LocalAddress: 'http://127.0.0.1:8096',
      ServerName: 'Fake Jellyfin',
      Version: '12.2.0',
      ProductName: 'Jellyfin Server',
      Id: SERVER_ID,
      StartupWizardCompleted: true,
    },
  };
}

/** The password every sample user has, unless a test patches one. */
export const SAMPLE_PASSWORD = 'correct horse';

function fakeUser(
  user: Pick<FakeUser, 'Id' | 'Name'> & {
    PrimaryImageTag?: string | null;
    hidden?: boolean;
    password?: string;
  },
): FakeUser {
  return {
    Id: user.Id,
    Name: user.Name,
    ServerId: SERVER_ID,
    PrimaryImageTag: user.PrimaryImageTag ?? null,
    HasPassword: true,
    HasConfiguredPassword: true,
    Policy: { IsHidden: user.hidden ?? false, EnableContentDownloading: true },
    password: user.password ?? SAMPLE_PASSWORD,
  };
}

/** A user as the Server serves it: `UserDto` has no password field. */
export function publicViewOf(user: FakeUser): Omit<FakeUser, 'password'> {
  const dto: Record<string, unknown> = { ...user };
  delete dto.password;
  return dto as Omit<FakeUser, 'password'>;
}
