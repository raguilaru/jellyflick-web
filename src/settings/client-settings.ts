import type { DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import {
  DEFAULT_HOME_LAYOUT,
  parseHomeLayout,
  serialiseHomeLayout,
  type HomeLayout,
} from '../home/home-layout';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * The Client Settings store: a User's own settings, kept on the Server so they
 * follow them to every device (story 49).
 *
 * They live in `DisplayPreferences.CustomPrefs`, which is a flat map of strings
 * with three awkward properties, all of them handled here and nowhere else:
 *
 * - **`client` is required** on the read and the write, and partitions the
 *   storage, so these settings are Jellyflick's alone.
 * - **The Server owns some of the keys.** It injects one `homesection<n>` per
 *   stored Home Section and six literals when it answers, and consumes them
 *   again on the way in. A key beginning `homesection` whose suffix is not a
 *   number makes the Server *throw*, and `landing-*` is reserved too — so every
 *   Jellyflick key is prefixed `jf.` and nothing else is ever sent back.
 * - **A write replaces the whole set**, so every write is a read-modify-write:
 *   saving the Home Layout must not drop the language, and a key a later
 *   Jellyflick wrote must survive this one saving over it.
 *
 * Per-device settings — maximum quality, and whatever else belongs to a screen
 * rather than a person — do **not** belong here. They go through
 * `device.storage()`.
 *
 * Adding a setting is three steps: a `jf.` key below, a field on
 * `ClientSettings` with a default, and a line each in `settingsFrom` and
 * `prefsFor`.
 */

/**
 * The `client` the Server partitions this storage by. Lower case, and
 * deliberately not `CLIENT_NAME` ("Jellyflick"), which is what the Server
 * records as the application a session belongs to: this one is a storage
 * partition and must never drift.
 */
export const CLIENT_SETTINGS_CLIENT = 'jellyflick';

/**
 * The preferences' id. The Server parses it as a GUID and MD5s it when it is
 * not one, so a plain name is legal and stable.
 */
export const CLIENT_SETTINGS_ID = 'jellyflick';

/** Every key this app owns starts here. See the note above on why. */
export const SETTINGS_KEY_PREFIX = 'jf.';

export const HOME_LAYOUT_KEY = `${SETTINGS_KEY_PREFIX}homeLayout`;
export const UI_LANGUAGE_KEY = `${SETTINGS_KEY_PREFIX}uiLanguage`;

/**
 * A User's settings, typed, with a default for every one of them — a new User
 * has nothing stored and must still get a working app.
 */
export type ClientSettings = {
  readonly homeLayout: HomeLayout;
  /**
   * The language the User chose for the app, or absent for their browser's.
   * Jellyfin 12.x has no per-user UI language of its own (`decisions.md` §2),
   * so this one is ours. Read by #11/#35; stored here from the start so the
   * settings screen is the only thing that ticket has to build.
   */
  readonly uiLanguage?: string;
};

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = { homeLayout: DEFAULT_HOME_LAYOUT };

/**
 * What came of reading. A Server that will not answer is an outcome rather than
 * a failure: the settings come back as the defaults so the app still draws, and
 * the caller can say so without having to invent them itself.
 */
export type SettingsRead = {
  readonly outcome: 'read' | 'unavailable';
  readonly settings: ClientSettings;
};

export type SettingsSave = { readonly outcome: 'saved' | 'unavailable' };

export type ClientSettingsStore = {
  read(): Promise<SettingsRead>;
  /**
   * Changes some settings and leaves the rest as they are, on the Server as
   * well as in the argument: the Server is read first, so a setting this app
   * version does not know about is written back untouched.
   */
  save(changes: Partial<ClientSettings>): Promise<SettingsSave>;
};

export type ClientSettingsOptions = {
  gateway: JellyfinGateway;
  /** Whose settings. The Server stores them per User. */
  userId: string;
};

export function createClientSettings(options: ClientSettingsOptions): ClientSettingsStore {
  const where = {
    id: CLIENT_SETTINGS_ID,
    client: CLIENT_SETTINGS_CLIENT,
    userId: options.userId,
  };

  async function readPrefs(): Promise<Record<string, string | null> | undefined> {
    try {
      const dto = await options.gateway.getDisplayPreferences(where);
      return ourKeysOf(dto.CustomPrefs);
    } catch {
      return undefined;
    }
  }

  return {
    read: async () => {
      const prefs = await readPrefs();
      if (prefs === undefined) {
        return { outcome: 'unavailable', settings: DEFAULT_CLIENT_SETTINGS };
      }
      return { outcome: 'read', settings: settingsFrom(prefs) };
    },

    save: async (changes) => {
      // Read first: the write replaces the whole set, so anything not read is
      // anything lost — including a key a newer Jellyflick wrote.
      const prefs = await readPrefs();
      if (prefs === undefined) return { outcome: 'unavailable' };

      const preferences: DisplayPreferencesDto = {
        Id: CLIENT_SETTINGS_ID,
        Client: CLIENT_SETTINGS_CLIENT,
        CustomPrefs: { ...prefs, ...prefsFor(changes) },
      };

      try {
        await options.gateway.saveDisplayPreferences({ ...where, preferences });
        return { outcome: 'saved' };
      } catch {
        return { outcome: 'unavailable' };
      }
    },
  };
}

/**
 * Only the keys that are ours.
 *
 * Everything the Server injected is dropped here, which is what makes handing
 * the rest straight back safe: the six literals, every `homesection<n>`, every
 * `landing-*`, and anything another client left behind under the same partition.
 */
function ourKeysOf(
  customPrefs: DisplayPreferencesDto['CustomPrefs'],
): Record<string, string | null> {
  const ours: Record<string, string | null> = {};
  if (customPrefs === null || customPrefs === undefined) return ours;
  for (const [key, value] of Object.entries(customPrefs as Record<string, unknown>)) {
    if (!key.startsWith(SETTINGS_KEY_PREFIX)) continue;
    ours[key] = typeof value === 'string' ? value : null;
  }
  return ours;
}

/** The stored strings as typed settings, with a default for each. */
function settingsFrom(prefs: Record<string, string | null>): ClientSettings {
  const language = prefs[UI_LANGUAGE_KEY];
  return {
    homeLayout: parseHomeLayout(prefs[HOME_LAYOUT_KEY]),
    ...(typeof language === 'string' && language !== '' ? { uiLanguage: language } : {}),
  };
}

/** Typed settings as the strings they are stored as. */
function prefsFor(changes: Partial<ClientSettings>): Record<string, string | null> {
  const prefs: Record<string, string | null> = {};
  if (changes.homeLayout !== undefined) {
    prefs[HOME_LAYOUT_KEY] = serialiseHomeLayout(changes.homeLayout);
  }
  if ('uiLanguage' in changes) {
    // Chosen, or back to the browser's: an empty string is how "no choice" is
    // stored, because `CustomPrefs` holds strings and nothing else.
    prefs[UI_LANGUAGE_KEY] = changes.uiLanguage ?? '';
  }
  return prefs;
}
