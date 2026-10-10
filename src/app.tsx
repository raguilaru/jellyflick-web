import { useEffect, useMemo, useState } from 'preact/hooks';
import { connectToServer } from './connect/connect-to-server';
import { ServerAddressScreen, type ConnectionFailure } from './connect/server-address-screen';
import type { DeviceLayer } from './device/types';
import { createTranslate, TranslateProvider, type Messages } from './i18n/index';
import type { RuntimeConfig } from './runtime-config';
import { createSession, type Session, type SignedInUser } from './session/session';
import { SignInScreen } from './session/sign-in-screen';
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

/** Whether the User on this device still has to sign in. */
type Who =
  /** Checking the stored token with the Server, which has to answer first. */
  | { state: 'resuming' }
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
      setWho(
        result.outcome === 'signed-in'
          ? { state: 'signed-in', user: result.user }
          : { state: 'signed-out' },
      );
    });
    return () => {
      abandoned = true;
    };
  }, [serverAddress, session]);

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
        <AppShell user={who.user} device={device} {...pictureOf(who.user, session)} />
      ) : who.state === 'resuming' ? null : (
        <SignInScreen
          session={session}
          serverAddress={serverAddress}
          onSignedIn={() => {
            const user = session.activeUser();
            if (user !== undefined) setWho({ state: 'signed-in', user });
          }}
        />
      )}
    </TranslateProvider>
  );
}

/**
 * The signed-in User's picture, for the bottom bar. `/UserImage` is anonymous
 * on the Server, so the URL is all the browser needs; a User with no picture
 * has no tag, and the bar shows their initial instead.
 */
function pictureOf(user: SignedInUser, session: Session): { pictureUrl?: string } {
  if (user.primaryImageTag === undefined) return {};
  return { pictureUrl: session.gateway().userImageUrl(user.userId, user.primaryImageTag) };
}
