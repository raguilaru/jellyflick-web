import { useEffect, useState } from 'preact/hooks';
import { connectToServer } from './connect/connect-to-server';
import { ServerAddressScreen, type ConnectionFailure } from './connect/server-address-screen';
import type { DeviceLayer } from './device/types';
import { createTranslate, TranslateProvider, useTranslate, type Messages } from './i18n/index';
import type { RuntimeConfig } from './runtime-config';

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

/**
 * Finds the Server and checks it is one this app can use, then hands over.
 *
 * A preset Server address skips the address screen; an empty one shows it. An
 * attempt that does not work comes back to the screen with the reason.
 *
 * Signing in, the User Picker and the app shell are later tickets, so for now a
 * connected Server is as far as the app goes.
 */
export function App({ config, device, messages }: AppProps) {
  const [address, setAddress] = useState(config.presetServerAddress ?? '');
  const [connection, setConnection] = useState<Connection>(
    config.presetServerAddress === undefined ? { status: 'asking' } : { status: 'connecting' },
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

  return (
    <TranslateProvider value={createTranslate(messages)}>
      {connection.status === 'connected' ? (
        <ConnectedScreen serverName={connection.serverName} />
      ) : (
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
      )}
    </TranslateProvider>
  );
}

function ConnectedScreen({ serverName }: { serverName: string }) {
  const t = useTranslate();
  return (
    <main class="screen screen--centred">
      <h1 class="wordmark">{t('app.name')}</h1>
      <p class="notice">{t('connect.connected', { serverName })}</p>
    </main>
  );
}
