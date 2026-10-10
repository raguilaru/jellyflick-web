import type { FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `DisplayPreferencesController`.
 *
 * This is the one endpoint the Client Settings store uses, and the fake copies
 * the three behaviours that shape how the store has to be written:
 *
 * 1. **`client` is required** on both the GET and the POST — it is
 *    `[FromQuery, Required]` in the controller, and it partitions storage, so
 *    Jellyflick's settings never land in the official web client's.
 * 2. **The Server injects its own keys** into `CustomPrefs` when it answers:
 *    one `homesection<n>` per stored Home Section, plus six literals. They are
 *    not ours and they reappear however often they are removed.
 * 3. **The Server consumes those keys on the way in** and stores what is left
 *    as the *whole* custom set — so a client that does not read-modify-write
 *    silently drops its other settings. A `homesection` key whose suffix is not
 *    a number makes the real Server throw, and so does this one: that is the
 *    reason every Jellyflick key is prefixed `jf.`.
 */

/** The keys the Server adds when it answers, which are never a client's to send. */
const INJECTED_PREFS: Readonly<Record<string, string>> = {
  homesection0: 'smalllibrarytiles',
  homesection1: 'resume',
  chromecastVersion: 'stable',
  skipForwardLength: '30000',
  skipBackLength: '10000',
  enableNextVideoInfoOverlay: 'true',
  tvhome: 'false',
  dashboardTheme: 'dark',
};

/** The six literal keys the Server reads out and removes on the way in. */
const CONSUMED_LITERALS = [
  'chromecastVersion',
  'enableNextVideoInfoOverlay',
  'skipBackLength',
  'skipForwardLength',
  'dashboardTheme',
  'tvhome',
];

export const displayPreferencesRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/DisplayPreferences/:displayPreferencesId',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state.users);
      if (user === undefined) return { status: 401, body: { error: 'No valid token.' } };
      if (state.failDisplayPreferencesWith !== null) {
        return {
          status: state.failDisplayPreferencesWith,
          body: { error: 'The fake Jellyfin was told to fail display preferences.' },
        };
      }

      const client = request.query.get('client');
      if (client === null || client === '') {
        return { status: 400, body: { error: '`client` is a required query parameter.' } };
      }

      const id = params.displayPreferencesId as string;
      const userId = request.query.get('userId') ?? user.Id;
      const stored = state.displayPreferences[storageKey(id, client, userId)] ?? {};

      return {
        status: 200,
        body: {
          Id: id,
          Client: client,
          CustomPrefs: { ...stored, ...INJECTED_PREFS },
        },
      };
    },
  },

  {
    method: 'POST',
    path: '/DisplayPreferences/:displayPreferencesId',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state.users);
      if (user === undefined) return { status: 401, body: { error: 'No valid token.' } };
      if (state.failDisplayPreferencesWith !== null) {
        return {
          status: state.failDisplayPreferencesWith,
          body: { error: 'The fake Jellyfin was told to fail display preferences.' },
        };
      }

      const client = request.query.get('client');
      if (client === null || client === '') {
        return { status: 400, body: { error: '`client` is a required query parameter.' } };
      }

      const body = (request.body ?? {}) as { CustomPrefs?: Record<string, string | null> };
      const sent = body.CustomPrefs ?? {};

      const kept: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(sent)) {
        if (/^homesection/i.test(key)) {
          // `int.Parse(key["homesection".Length..])` — a non-numeric suffix is
          // an unhandled exception on the real Server, not a 400.
          if (!/^\d+$/.test(key.slice('homesection'.length))) {
            return {
              status: 500,
              body: {
                error: `The Server parses the suffix of ${key} as a number and threw. Never name a client key homesection….`,
              },
            };
          }
          continue;
        }
        if (CONSUMED_LITERALS.indexOf(key) !== -1) continue;
        // `landing-*` is validated against the `ViewType` enum and dropped when
        // it does not match. Nothing in Jellyflick sends one, so the fake drops
        // them all rather than carrying Jellyfin's enum around.
        if (key.startsWith('landing-')) continue;
        kept[key] = value;
      }

      const id = params.displayPreferencesId as string;
      const userId = request.query.get('userId') ?? user.Id;
      // The Server replaces the whole custom set, which is what forces a client
      // to read-modify-write.
      state.displayPreferences[storageKey(id, client, userId)] = kept;

      return { status: 204 };
    },
  },
];

/**
 * How stored preferences are keyed. The real Server stores them per user, per
 * item and per client; `client` is what keeps Jellyflick's settings out of the
 * official web client's.
 */
function storageKey(id: string, client: string, userId: string): string {
  return `${id}|${client}|${userId}`;
}
