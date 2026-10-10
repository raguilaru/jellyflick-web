/**
 * English is the source of truth for the key set: every other locale is typed
 * against `Messages`, so a missing or stale key fails the typecheck.
 *
 * A message is either a string or a function of a parameters object. Use
 * `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.PluralRules` inside the
 * function for anything formatted — all three are native on Chromium 68.
 */
export const en = {
  'app.name': 'Jellyflick',

  'connect.heading': 'Connect to your Server',
  'connect.explanation': 'Jellyflick needs the address of your Jellyfin server.',
  'connect.addressLabel': 'Server address',
  'connect.addressHint': 'For example 192.168.1.10:8096 or https://jellyfin.example.com',
  'connect.submit': 'Connect',
  'connect.checking': 'Checking the Server…',
  'connect.connected': (p: { serverName: string }) => `Connected to ${p.serverName}.`,

  'connect.error.addressInvalid': 'That is not an address Jellyflick can use. Check it and try again.',
  'connect.error.unreachable': (p: { serverAddress: string }) =>
    `Nothing answered at ${p.serverAddress}. Check the address and that the Server is switched on.`,
  'connect.error.notAJellyfinServer': (p: { serverAddress: string }) =>
    `Something answered at ${p.serverAddress}, but it is not a Jellyfin server.`,
  'connect.error.serverTooOld': (p: { version: string; minimumVersion: string }) =>
    `That server runs Jellyfin ${p.version}. Jellyflick needs ${p.minimumVersion} or later, so it cannot connect to it.`,
} as const;

/**
 * The key set, with plain strings widened from their English literals so other
 * locales can hold different text, and parameter objects kept exactly.
 */
export type Messages = {
  readonly [K in keyof typeof en]: (typeof en)[K] extends (params: infer P) => string
    ? (params: P) => string
    : string;
};

export type MessageKey = keyof Messages;
