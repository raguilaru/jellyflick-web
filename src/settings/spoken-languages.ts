import type { MessageKey } from '../i18n/index';
import type { SubtitleMode } from './playback-preferences';

/**
 * The languages the settings screen offers for the sound and the subtitles,
 * and the ways it offers to show subtitles (#35, story 114).
 *
 * **These are not the languages Jellyflick is drawn in.** That is `en` and `es`
 * and lives in `src/i18n/`; this is the language of the audio and subtitle
 * tracks in a User's library, which has nothing to do with it. A User can read
 * the app in English and want to hear Japanese.
 *
 * **A fixed set, like the Accent Colour presets**, rather than a free field: a
 * language code is not something to type with a remote, and a list of every
 * language on earth is not something to drive with arrow keys. The stored value
 * is a plain `string` all the same, so a code chosen in another Jellyfin app is
 * carried through rather than overwritten — the screen simply presses none of
 * its buttons. See `playback-preferences.ts`.
 *
 * **The codes are ISO 639-2/T**, which is what the sample library's
 * `MediaStream.Language` carries (`fra`, not the 639-2/B `fre`) and what
 * ffprobe usually reports. `docs/research/jellyfin-api.md` left this open; the
 * fake Jellyfin's streams settle it for this app, and nothing breaks if a
 * Server disagrees — a preference that matches no track is simply not used, and
 * the stored code is never rewritten.
 */

export type SpokenLanguage = {
  /** What the Server stores, matched against `MediaStream.Language`. */
  readonly code: string;
  /** Its name, in the language the app is being read in. */
  readonly nameKey: MessageKey;
};

export const SPOKEN_LANGUAGES: readonly SpokenLanguage[] = [
  { code: 'eng', nameKey: 'settings.spoken.eng' },
  { code: 'spa', nameKey: 'settings.spoken.spa' },
  { code: 'fra', nameKey: 'settings.spoken.fra' },
  { code: 'deu', nameKey: 'settings.spoken.deu' },
  { code: 'ita', nameKey: 'settings.spoken.ita' },
  { code: 'por', nameKey: 'settings.spoken.por' },
  { code: 'jpn', nameKey: 'settings.spoken.jpn' },
  { code: 'kor', nameKey: 'settings.spoken.kor' },
];

/**
 * When subtitles are shown, in the order the screen offers them: from never to
 * always, so moving along the row with an arrow key is moving along one idea.
 *
 * `Default` sits where it does because it is the Server's own default and means
 * "whatever the file was marked with", which is between forced-only and Smart
 * in how much a User ends up reading.
 */
export const SUBTITLE_MODES: readonly { mode: SubtitleMode; nameKey: MessageKey }[] = [
  { mode: 'None', nameKey: 'settings.subtitleMode.none' },
  { mode: 'OnlyForced', nameKey: 'settings.subtitleMode.onlyForced' },
  { mode: 'Default', nameKey: 'settings.subtitleMode.default' },
  { mode: 'Smart', nameKey: 'settings.subtitleMode.smart' },
  { mode: 'Always', nameKey: 'settings.subtitleMode.always' },
];
