import {
  createJellyfinGateway,
  JellyfinUnreachableError,
  normaliseServerAddress,
} from '../jellyfin/gateway';

/** ADR 0001: Jellyfin 12.0 or later only, with no legacy endpoints. */
export const MINIMUM_SERVER_MAJOR_VERSION = 12;

export type ConnectionResult =
  | { outcome: 'connected'; serverAddress: string; serverName: string; version: string }
  | { outcome: 'server-too-old'; serverAddress: string; version: string }
  | { outcome: 'unreachable'; serverAddress: string }
  | { outcome: 'not-a-jellyfin-server'; serverAddress: string }
  | { outcome: 'address-invalid' };

export type ConnectToServerOptions = {
  client: string;
  device: string;
  deviceId: string;
  appVersion: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Finds out whether an address is a Jellyfin Server this app can use, and
 * returns one of a closed set of outcomes. Every outcome has a translated
 * message on the server-address screen; none of them throws, because "that
 * address does not work" is an answer, not a failure.
 */
export async function connectToServer(
  address: string,
  options: ConnectToServerOptions,
): Promise<ConnectionResult> {
  const serverAddress = toServerAddress(address);
  if (serverAddress === undefined) return { outcome: 'address-invalid' };

  const gateway = createJellyfinGateway({
    serverAddress,
    client: options.client,
    device: options.device,
    deviceId: options.deviceId,
    appVersion: options.appVersion,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });

  let version: string | null | undefined;
  let serverName: string | null | undefined;
  try {
    const info = await gateway.getPublicSystemInfo();
    version = info.Version;
    serverName = info.ServerName;
  } catch (error) {
    if (error instanceof JellyfinUnreachableError) {
      return { outcome: 'unreachable', serverAddress };
    }
    // Something answered, but not a Jellyfin Server: another web server on the
    // home network, a reverse proxy error page, an address with a typo in it.
    return { outcome: 'not-a-jellyfin-server', serverAddress };
  }

  const major = majorVersionOf(version);
  if (major === undefined) return { outcome: 'not-a-jellyfin-server', serverAddress };
  if (major < MINIMUM_SERVER_MAJOR_VERSION) {
    return { outcome: 'server-too-old', serverAddress, version: version as string };
  }

  return {
    outcome: 'connected',
    serverAddress,
    serverName: serverName ?? serverAddress,
    version: version as string,
  };
}

/**
 * Normalises what a User typed into an address the gateway can use, or
 * `undefined` when it is not usable at all. An address with no scheme is
 * assumed to be `http`, because a Server on the home network usually is.
 */
export function toServerAddress(typed: string): string | undefined {
  const trimmed = typed.trim();
  if (trimmed.length === 0) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.hostname.length === 0) return undefined;

  return normaliseServerAddress(url.toString());
}

/**
 * The leading integer of a Jellyfin version string, e.g. `12` from `12.2.0`.
 * Versions are never compared as text: `"9.9.9" > "12.0.0"` lexically.
 */
export function majorVersionOf(version: string | null | undefined): number | undefined {
  if (version === null || version === undefined) return undefined;
  const match = /^\s*(\d+)/.exec(version);
  if (match === null) return undefined;
  return Number(match[1]);
}
