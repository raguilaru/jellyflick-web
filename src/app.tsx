import { useEffect, useMemo, useState } from 'preact/hooks';
import { connectToServer } from './connect/connect-to-server';
import { ServerAddressScreen, type ConnectionFailure } from './connect/server-address-screen';
import type { DeviceLayer } from './device/types';
import { createTranslate, TranslateProvider, type Messages } from './i18n/index';
import { useInputModality } from './navigation/input-modality';
import { useSpatialNavigation } from './navigation/spatial-navigation';
import type { RuntimeConfig } from './runtime-config';
import { createSession, type Session, type SignedInUser } from './session/session';
import { SignInScreen } from './session/sign-in-screen';
import {
  pickableUsersOf,
  UserPicker,
  type PickableUser,
  type UsersOnThisDevice,
} from './session/user-picker';
import { AppShell } from './shell/app-shell';

/** The application name the Server records for this client. */
export const CLIENT_NAME = 'Jellyflick';

export type AppProps = {
  config: RuntimeConfig;
  device: DeviceLayer;
  messages: Messages;
};

type Connection =
  | { status: 'asking'; lastFailure?: ConnectionFailure }
  | { status: 'connecting' }
  | { status: 'connected'; serverName: string; serverAddress: string };

/** Who of the household is watching, and what has to happen before they can. */
type Who =
  /** Checking a stored token with the Server, which has to answer first. */
  | { state: 'resuming' }
  /**
   * Users are signed in on this device but none of them is watching, so the
   * User Picker asks which. This is also where the app opens when more than
   * one User is signed in (story 15).
   */
  | { state: 'picking' }
  /** Another household member is signing in, with the others all kept. */
  | { state: 'adding' }
  /** Nobody is signed in on this device at all. */
  | { state: 'signed-out' }
  | { state: 'signed-in'; user: SignedInUser };

/**
 * Finds the Server, then finds out who is watching.
 *
 * A preset Server address skips the address screen; an empty one shows it. An
 * attempt that does not work comes back to the screen with the reason. Once
 * there is a Server, a User already signed in on this device goes straight to
 * Home, and anyone else signs in with a password.
 *
 * A signed-in User gets the app shell, which owns the look, the navigation and
 * every section's address from then on.
 */
export function App({ config, device, messages }: AppProps) {
  const [address, setAddress] = useState(config.presetServerAddress ?? '');
  const [connection, setConnection] = useState<Connection>(
    config.presetServerAddress === undefined ? { status: 'asking' } : { status: 'connecting' },
  );
  const [who, setWho] = useState<Who>({ state: 'resuming' });

  // Every screen is driveable by arrows, Enter and Back (story 64), so the
  // arrow keys are installed here rather than in the shell: signing in comes
  // before the shell and has to work on a remote too. Back is the shell's,
  // because it is the browser's back button as much as it is a key.
  useSpatialNavigation(device);
  useInputModality();

  // One session per app: it owns the stored Users, so a second one would be a
  // second opinion about who is signed in.
  const session = useMemo(
    () => createSession({ device, client: CLIENT_NAME, appVersion: config.appVersion }),
    [device, config.appVersion],
  );

  useEffect(() => {
    if (connection.status !== 'connecting') return;
    let abandoned = false;
    void connectToServer(address, {
      client: CLIENT_NAME,
      device: device.deviceName(),
      deviceId: device.newDeviceId(),
      appVersion: config.appVersion,
    }).then((result) => {
      if (abandoned) return;
      if (result.outcome === 'connected') {
        setAddress(result.serverAddress);
        setConnection({
          status: 'connected',
          serverName: result.serverName,
          serverAddress: result.serverAddress,
        });
        return;
      }
      setConnection({ status: 'asking', lastFailure: result });
    });
    return () => {
      abandoned = true;
    };
    // The address is read once, when an attempt starts, and deliberately not
    // followed afterwards: typing during an attempt must not restart it.
  }, [connection.status]);

  const serverAddress = connection.status === 'connected' ? connection.serverAddress : undefined;

  useEffect(() => {
    if (serverAddress === undefined) return;
    let abandoned = false;
    // Pointing the session at the Server clears every User when the address
    // has changed, so Users from two Servers never mix.
    session.useServer(serverAddress);
    setWho({ state: 'resuming' });
    void session.resume().then((result) => {
      if (abandoned) return;
      // A Server that cannot be reached leaves the stored User in place, but
      // there is nothing to show until it answers, so the password is asked
      // for again rather than trusting a token nothing has confirmed.
      //
      // With more than one User signed in, the app opens on the User Picker
      // rather than on whoever watched last: a device several of a household
      // share has to ask (story 15). With exactly one it does not ask, because
      // there would be nothing to choose.
      if (result.outcome === 'signed-in' && session.signedInUsers().length === 1) {
        setWho({ state: 'signed-in', user: result.user });
        return;
      }
      setWho(session.signedInUsers().length === 0 ? { state: 'signed-out' } : { state: 'picking' });
    });
    return () => {
      abandoned = true;
    };
  }, [serverAddress, session]);

  /**
   * Makes a signed-in User the one watching, and confirms their token with the
   * Server on the way — exactly as opening the app does, because a token can
   * have been revoked since that User last watched. "Never asks for my
   * password again" (story 16) is a promise about passwords, not about a token
   * the Server has stopped accepting: one it has leaves that User to sign in
   * again, and the others on the device alone.
   */
  const pickUser = (userId: string): void => {
    if (!session.switchTo(userId)) return;
    setWho({ state: 'resuming' });
    void session.resume().then((result) => {
      setWho(
        result.outcome === 'signed-in' ? { state: 'signed-in', user: result.user } : whoFrom(session),
      );
    });
  };

  /** What the User Picker and both navigation bars act through. */
  const users: UsersOnThisDevice = {
    users: pickableUsersOf(session),
    ...(who.state === 'signed-in' ? { current: pickableUserOf(session, who.user) } : {}),

    pick: pickUser,

    addUser: () => {
      setWho({ state: 'adding' });
    },

    signOut: (userId) => {
      // Taken off the device at once and told to the Server behind it, so a
      // User leaving never waits for a round trip.
      void session.signOut(userId);
      const left = session.signedInUsers();
      const only = left[0];
      // One User left and nobody watching is not a choice worth asking about,
      // because picking them needs no password: the app simply does it.
      if (left.length === 1 && only !== undefined && session.activeUser() === undefined) {
        pickUser(only.userId);
        return;
      }
      setWho(whoFrom(session));
    },
  };

  return (
    <TranslateProvider value={createTranslate(messages)}>
      {serverAddress === undefined ? (
        <ServerAddressScreen
          address={address}
          onAddressChange={setAddress}
          busy={connection.status === 'connecting'}
          {...(connection.status === 'asking' && connection.lastFailure !== undefined
            ? { lastFailure: connection.lastFailure }
            : {})}
          onSubmit={() => {
            setConnection({ status: 'connecting' });
          }}
        />
      ) : who.state === 'signed-in' ? (
        /*
         * Keyed by the User, so switching User builds the shell again from
         * nothing rather than handing the next User the screens the last one
         * was looking at.
         *
         * Two things already happen to be true: #10's settings provider and
         * #13's My List store are both made per (Server, User) and so reset
         * themselves, and switching passes through `resuming`, which unmounts
         * the shell for the length of a round trip anyway. The key is here so
         * that neither has to stay true — a later ticket that switches User
         * without a round trip, or hangs per-User state below the shell
         * without keying it, gets the guarantee for free rather than finding
         * out the hard way. `switching-user-leaves-nothing-behind.test.tsx` is
         * what holds it.
         */
        <AppShell
          key={who.user.userId}
          user={who.user}
          session={session}
          device={device}
          users={users}
        />
      ) : who.state === 'picking' ? (
        <UserPicker users={users} />
      ) : who.state === 'resuming' ? null : (
        <SignInScreen
          session={session}
          device={device}
          serverAddress={serverAddress}
          onSignedIn={() => {
            const user = session.activeUser();
            if (user !== undefined) setWho({ state: 'signed-in', user });
          }}
          {...(who.state === 'adding'
            ? {
                onCancel: () => {
                  setWho(whoFrom(session));
                },
              }
            : {})}
        />
      )}
    </TranslateProvider>
  );
}

/**
 * Who is watching, read off the session rather than remembered: it is the
 * answer after anything that changes who is signed in — a User signed out, an
 * "add another User" given up on, a token the Server no longer accepts.
 *
 * It does not second-guess the launch rule above. Asking who is watching when
 * the app opens is about a shared device being opened; once the User is in the
 * app, a single User left on it is simply the User, with nothing to choose.
 */
function whoFrom(session: Session): Who {
  const active = session.activeUser();
  if (active !== undefined) return { state: 'signed-in', user: active };
  return session.signedInUsers().length === 0 ? { state: 'signed-out' } : { state: 'picking' };
}

/**
 * One signed-in User as the picker and the bars show them. `/UserImage` is
 * anonymous on the Server, so the URL is all the browser needs; a User with no
 * picture has no tag, and their initial stands in for one.
 */
function pickableUserOf(session: Session, user: SignedInUser): PickableUser {
  if (user.primaryImageTag === undefined) return { userId: user.userId, name: user.name };
  return {
    userId: user.userId,
    name: user.name,
    pictureUrl: session.gateway().userImageUrl(user.userId, user.primaryImageTag),
  };
}
