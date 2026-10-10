/**
 * The `Authorization: MediaBrowser …` header every request to the Server carries.
 *
 * The Server splits the header at the first space, then walks key/value pairs
 * with a quote-aware state machine, trims the keys, strips the quotes and
 * URL-decodes the values. So: the five key names are case-sensitive and spelled
 * exactly `Client`, `Device`, `DeviceId`, `Version`, `Token`; values are always
 * quoted, because an unquoted comma would end the pair early; and values are
 * URL-encoded, because the Server decodes them.
 */
export type ServerIdentity = {
  /** Application name the Server records for this client. */
  client: string;
  /** Human-readable device name, e.g. `Chrome`. */
  device: string;
  /** One per signed-in User: the Server allows a single token per DeviceId. */
  deviceId: string;
  appVersion: string;
  /** Absent until a User has signed in. */
  token?: string;
};

export function buildAuthorizationHeader(identity: ServerIdentity): string {
  const pairs: Array<[string, string]> = [
    ['Client', identity.client],
    ['Device', identity.device],
    ['DeviceId', identity.deviceId],
    ['Version', identity.appVersion],
  ];
  if (identity.token !== undefined && identity.token !== '') {
    pairs.push(['Token', identity.token]);
  }
  const parts = pairs.map(([key, value]) => `${key}="${encodeURIComponent(value)}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}
