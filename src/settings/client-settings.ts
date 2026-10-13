import type { DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import {
  parseHiddenSeries,
  serialiseHiddenSeries,
  type HiddenSeries,
} from '../home/continue-watching';
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
 * Nor does a setting **Jellyfin itself** acts on. Audio language, subtitle
 * language, when to show subtitles and next-Episode autoplay are fields on the
 * User's `UserConfiguration`, shared with every other Jellyfin app, and they
 * live in `playback-preferences.ts` — a different store with a different
 * read-modify-write. The `client` partition above is exactly what this store
 * has and that one does not.
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
export const ACCENT_COLOUR_KEY = `${SETTINGS_KEY_PREFIX}accentColour`;
export const HIDDEN_SERIES_KEY = `${SETTINGS_KEY_PREFIX}hiddenSeries`;
export const BILLBOARD_TRAILER_AUTOPLAY_KEY = `${SETTINGS_KEY_PREFIX}billboardTrailerAutoplay`;
export const BILLBOARD_SOURCE_KEY = `${SETTINGS_KEY_PREFIX}billboardSource`;

/**
 * A User's settings, typed, with a default for every one of them — a new User
 * has nothing stored and must still get a working app.
 */
export type ClientSettings = {
  readonly homeLayout: HomeLayout;
  /**
   * The language the User chose for the app, or absent for their browser's.
   * Jellyfin 12.x has no per-user UI language of its own (`decisions.md` §2),
   * so this one is ours, and the settings screen says so rather than implying
   * otherwise. `src/settings/ui-language.tsx` is what reads it (#11).
   */
  readonly uiLanguage?: string;
  /**
   * The Accent Colour preset the User picked, or absent for the default (red).
   *
   * A plain string rather than `AccentColourId`, so a preset a newer Jellyflick
   * offers survives being read by this one: it is carried unchanged and
   * `accentColourFor` falls back to red only when showing it. The same
   * treatment `HomeRow.parameter` gets.
   */
  readonly accentColour?: string;
  /**
   * The Series the User has taken out of Continue Watching, and when (#12,
   * stories 38 and 39).
   *
   * It is here rather than in device storage because it is a statement about
   * what one *person* wants to see, not about one screen: a show dropped on the
   * laptop is dropped on the phone as well. Jellyfin has nowhere of its own to
   * put it — a hidden Series is not a fact about the account, and resetting a
   * resume point is what the Server *does* hold — so it is one of ours, under
   * `jf.`.
   */
  readonly hiddenSeries: readonly HiddenSeries[];
  /**
   * Whether the Billboard's local trailer starts by itself, muted, after a
   * short delay (#16, stories 24 and 27).
   *
   * **On unless the User has turned it off**, which is why it is a plain
   * `boolean` with a default rather than an optional one: story 24 is what Home
   * does out of the box. Stored as `'true'` or `'false'` — `CustomPrefs` holds
   * strings — and anything else reads as on, so a half-written value leaves
   * Home behaving the way it does for everybody else.
   *
   * It is Jellyflick's own rather than the User's Jellyfin account: no other
   * Jellyfin app has a Billboard, so there is nothing of Jellyfin's for it to
   * be. Story 27's reasons are data and memory, which are per *person* here
   * rather than per device, so it follows them between devices like the rest.
   */
  readonly billboardTrailerAutoplay: boolean;
  /**
   * Which Billboard Source picks the Title at the top of Home (#22), or absent
   * for Spotlight, which is what a User gets before they have chosen (story
   * 29).
   *
   * A plain `string` rather than `BillboardSourceId`, for the reason every
   * stored *name* here is one: a Source a newer Jellyflick offers has to
   * survive being read by this version rather than being quietly rewritten to
   * Spotlight the next time anything else is saved. `billboardSourceFor` is
   * what falls back when it is drawn and used — the same treatment
   * `accentColourFor` gives a preset and `HomeRow.parameter` gets in a layout.
   *
   * Absent rather than defaulted to `'spotlight'`, so "I have never chosen"
   * and "I chose Spotlight" are stored the same way and the default can move
   * without rewriting what Users have.
   */
  readonly billboardSource?: string;
};

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = {
  homeLayout: DEFAULT_HOME_LAYOUT,
  hiddenSeries: [],
  billboardTrailerAutoplay: true,
};

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
  return {
    homeLayout: parseHomeLayout(prefs[HOME_LAYOUT_KEY]),
    hiddenSeries: parseHiddenSeries(prefs[HIDDEN_SERIES_KEY]),
    // Off only when the User said so in as many words. Nothing stored, and
    // anything unreadable, is the default the rest of Home has.
    billboardTrailerAutoplay: prefs[BILLBOARD_TRAILER_AUTOPLAY_KEY] !== 'false',
    // An empty string is how "no choice" is stored, so it is not a choice.
    ...chosen('uiLanguage', prefs[UI_LANGUAGE_KEY]),
    ...chosen('accentColour', prefs[ACCENT_COLOUR_KEY]),
    ...chosen('billboardSource', prefs[BILLBOARD_SOURCE_KEY]),
  };
}

/** One stored string as a setting, or nothing at all when nothing was chosen. */
function chosen<K extends string>(
  key: K,
  value: string | null | undefined,
): Partial<Record<K, string>> {
  if (typeof value !== 'string' || value === '') return {};
  return { [key]: value } as Record<K, string>;
}

/** Typed settings as the strings they are stored as. */
function prefsFor(changes: Partial<ClientSettings>): Record<string, string | null> {
  const prefs: Record<string, string | null> = {};
  if (changes.homeLayout !== undefined) {
    prefs[HOME_LAYOUT_KEY] = serialiseHomeLayout(changes.homeLayout);
  }
  if (changes.hiddenSeries !== undefined) {
    prefs[HIDDEN_SERIES_KEY] = serialiseHiddenSeries(changes.hiddenSeries);
  }
  if ('uiLanguage' in changes) {
    // Chosen, or back to the browser's: an empty string is how "no choice" is
    // stored, because `CustomPrefs` holds strings and nothing else.
    prefs[UI_LANGUAGE_KEY] = changes.uiLanguage ?? '';
  }
  if ('accentColour' in changes) {
    prefs[ACCENT_COLOUR_KEY] = changes.accentColour ?? '';
  }
  if ('billboardSource' in changes) {
    // Back to Spotlight is the empty string, as "match my device" is for the
    // language: `CustomPrefs` holds strings and nothing else.
    prefs[BILLBOARD_SOURCE_KEY] = changes.billboardSource ?? '';
  }
  if (changes.billboardTrailerAutoplay !== undefined) {
    prefs[BILLBOARD_TRAILER_AUTOPLAY_KEY] = String(changes.billboardTrailerAutoplay);
  }
  return prefs;
}
