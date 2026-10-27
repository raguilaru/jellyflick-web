import type { SubtitlePlaybackMode } from '@jellyfin/sdk/lib/generated-client/models/subtitle-playback-mode';
import type { UserConfiguration } from '@jellyfin/sdk/lib/generated-client/models/user-configuration';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * The Playback Preferences store: the settings a User's **Jellyfin account**
 * carries, so every Jellyfin app they use follows them (#35, story 114).
 *
 * **This is a different store from Client Settings**, and the difference is the
 * whole point of the ticket:
 *
 * | | Client Settings (`client-settings.ts`) | Playback Preferences (here) |
 * | --- | --- | --- |
 * | Where | `DisplayPreferences.CustomPrefs` | `UserConfiguration` |
 * | Partitioned by | `client=jellyflick` — Jellyflick's alone | nothing: it is the User's Jellyfin account |
 * | Who else sees it | no other app | **every** Jellyfin app |
 * | What lives there | Home Layout, Accent Colour, UI language | audio language, subtitle language, when to show subtitles, next-Episode autoplay |
 *
 * So a change here reaches the official web client and every other Jellyfin
 * app, and a change one of *them* makes reaches Jellyflick. The settings screen
 * says so in words, because the UI language next to it is the opposite case —
 * Jellyfin 12.x has no per-user UI language at all (`decisions.md` §2).
 *
 * Two awkward properties, handled here and nowhere else:
 *
 * - **There is no read endpoint.** 12.x has no `GET /Users/Configuration`; a
 *   User's configuration is read from `UserDto.Configuration` through
 *   `GET /Users/Me`. That is why `read` goes through `getCurrentUser`.
 * - **A write replaces the whole `UserConfiguration`**, so every write is a
 *   read-modify-write — the same hazard `CustomPrefs` has, and worse here,
 *   because the fields this app never shows belong to *other* Jellyfin apps.
 *   Sending only the four it knows would reset a User's Cast receiver, their
 *   grouped folders and their "display missing episodes" to defaults.
 */

/**
 * When subtitles are shown, as the Server's `SubtitlePlaybackMode` has it.
 *
 * Typed as the SDK's union rather than a plain `string`, unlike the two
 * languages: this one is a closed enum of the Server's own, not a name, so a
 * value outside it is not something a newer Jellyflick could offer.
 */
export type SubtitleMode = SubtitlePlaybackMode;

export type PlaybackPreferences = {
  /**
   * The language a User wants to hear, as the Server stores it — absent for no
   * preference at all.
   *
   * A plain `string`, not a union of the codes this version offers, so a code
   * chosen in another Jellyfin app (or by a newer Jellyflick) survives this one
   * reading and saving over it. The screen falls back to pressing none of its
   * presets rather than rewriting what it did not recognise — the same
   * treatment the Accent Colour gets.
   *
   * It is matched against `MediaStream.Language`, which is what ffprobe
   * reports: usually a three-letter code.
   */
  readonly audioLanguage?: string;
  /** The language a User wants to read, on the same terms as `audioLanguage`. */
  readonly subtitleLanguage?: string;
  /** When subtitles are shown at all. */
  readonly subtitleMode: SubtitleMode;
  /** Whether the next Episode starts by itself when one ends. */
  readonly nextEpisodeAutoPlay: boolean;
  /**
   * Which Chromecast receiver application this User's account names (#33), or
   * absent for none — which is the common case, because the Server seeds the
   * list in a migration.
   *
   * **It is read here and never written**, which makes it the one asymmetric
   * field in this store. `decisions.md` §8 says Cast must read
   * `user.Configuration.CastReceiverId` at runtime rather than hardcoding an
   * id, and this provider is already the one copy of that configuration in the
   * app — so the player reads it from here rather than opening a second path
   * to the Server. Nothing in Jellyflick offers a way to change it: choosing a
   * receiver application is a thing a User does in Jellyfin's own dashboard,
   * and `configurationFor` below deliberately has no case for it, so a save
   * from this app carries the stored value through untouched.
   */
  readonly castReceiverId?: string;
};

/**
 * What a User who has configured nothing has.
 *
 * These are the **Server's** defaults, not this app's preference: a new
 * Jellyfin account has `SubtitleMode: 'Default'`, autoplay on and neither
 * language set. Drawing anything else would tell a User their account says
 * something it does not.
 */
export const DEFAULT_PLAYBACK_PREFERENCES: PlaybackPreferences = {
  subtitleMode: 'Default',
  nextEpisodeAutoPlay: true,
};

/**
 * What came of reading. As in the Client Settings store, a Server that will not
 * answer is an outcome rather than a throw: the defaults come back so a screen
 * still draws, and the caller can say so without inventing them.
 */
export type PlaybackPreferencesRead = {
  readonly outcome: 'read' | 'unavailable';
  readonly preferences: PlaybackPreferences;
};

export type PlaybackPreferencesSave = { readonly outcome: 'saved' | 'unavailable' };

export type PlaybackPreferencesStore = {
  read(): Promise<PlaybackPreferencesRead>;
  /**
   * Changes some preferences and leaves the rest as they are, on the Server as
   * well as in the argument. The configuration is read first, so every field
   * this app does not show is written back untouched.
   */
  save(changes: Partial<PlaybackPreferences>): Promise<PlaybackPreferencesSave>;
};

export type PlaybackPreferencesOptions = {
  gateway: JellyfinGateway;
  /** Whose configuration. The write takes it as a query parameter. */
  userId: string;
};

export function createPlaybackPreferences(
  options: PlaybackPreferencesOptions,
): PlaybackPreferencesStore {
  /** The stored configuration, or `undefined` for a Server that will not say. */
  async function readConfiguration(): Promise<UserConfiguration | undefined> {
    try {
      // No `GET /Users/Configuration` exists in 12.x: the configuration rides
      // on the `UserDto`. See the note at the top.
      return (await options.gateway.getCurrentUser()).Configuration ?? {};
    } catch {
      return undefined;
    }
  }

  return {
    read: async () => {
      const configuration = await readConfiguration();
      if (configuration === undefined) {
        return { outcome: 'unavailable', preferences: DEFAULT_PLAYBACK_PREFERENCES };
      }
      return { outcome: 'read', preferences: preferencesFrom(configuration) };
    },

    save: async (changes) => {
      // Read first: the write replaces the whole configuration, so anything not
      // read is anything lost — including every field that belongs to another
      // Jellyfin app.
      const configuration = await readConfiguration();
      if (configuration === undefined) return { outcome: 'unavailable' };

      try {
        await options.gateway.saveUserConfiguration({
          userId: options.userId,
          configuration: { ...configuration, ...configurationFor(changes) },
        });
        return { outcome: 'saved' };
      } catch {
        return { outcome: 'unavailable' };
      }
    },
  };
}

/** A stored configuration as typed preferences, with a default for each. */
export function preferencesFrom(configuration: UserConfiguration): PlaybackPreferences {
  return {
    // An empty string is how the Server stores "no preference", so it is not a
    // language — the same distinction the UI language draws between "match my
    // device" and "English".
    ...chosen('audioLanguage', configuration.AudioLanguagePreference),
    ...chosen('subtitleLanguage', configuration.SubtitleLanguagePreference),
    // Read-only, for Cast (#33). `chosen` is right for it for the same reason
    // it is right for the languages: a blank is "nothing chosen", not a value.
    ...chosen('castReceiverId', configuration.CastReceiverId),
    subtitleMode: configuration.SubtitleMode ?? DEFAULT_PLAYBACK_PREFERENCES.subtitleMode,
    nextEpisodeAutoPlay:
      configuration.EnableNextEpisodeAutoPlay ??
      DEFAULT_PLAYBACK_PREFERENCES.nextEpisodeAutoPlay,
  };
}

/** One stored string as a preference, or nothing at all when none was chosen. */
function chosen<K extends string>(
  key: K,
  value: string | null | undefined,
): Partial<Record<K, string>> {
  if (typeof value !== 'string' || value === '') return {};
  return { [key]: value } as Record<K, string>;
}

/** Typed preferences as the `UserConfiguration` fields they are stored in. */
function configurationFor(changes: Partial<PlaybackPreferences>): UserConfiguration {
  const configuration: UserConfiguration = {};
  // `in` rather than a value check, so clearing a preference is a change like
  // any other: "no preference" is the empty string the Server reads as none.
  if ('audioLanguage' in changes) {
    configuration.AudioLanguagePreference = changes.audioLanguage ?? '';
  }
  if ('subtitleLanguage' in changes) {
    configuration.SubtitleLanguagePreference = changes.subtitleLanguage ?? '';
  }
  if (changes.subtitleMode !== undefined) configuration.SubtitleMode = changes.subtitleMode;
  if (changes.nextEpisodeAutoPlay !== undefined) {
    configuration.EnableNextEpisodeAutoPlay = changes.nextEpisodeAutoPlay;
  }
  return configuration;
}
