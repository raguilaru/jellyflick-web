import type { DeviceLayer } from '../device/types';
import {
  BILLBOARD_SOURCE_IDS,
  DEFAULT_BILLBOARD_SOURCE,
  type BillboardSourceId,
} from '../home/billboard-sources';
import { useTranslate, type MessageKey } from '../i18n/index';
import { ACCENT_COLOURS, accentColourFor } from './accent-colours';
import { HOME_LAYOUT_PATH } from './home-layout-screen';
import { usePlaybackPreferences } from './playback-preferences-provider';
import { useSettings } from './settings-provider';
import { SPOKEN_LANGUAGES, SUBTITLE_MODES } from './spoken-languages';
import { deviceLocaleFor, uiLocaleFor } from './ui-language';

/**
 * The settings screen: a User's Accent Colour, the language the app is in and
 * whether the Billboard plays a trailer (stories 112, 113 and 27), with the way
 * to their Home Layout beside them.
 *
 * **Its address is not a section**, the same way the Home Layout editor's is
 * not: `src/shell/sections.ts` is the list of sections and this is not one of
 * them. Both navigation bars reach it — the top bar with a link of its own,
 * the phone's bottom bar through the User's picture, which is where a phone
 * User looks for it.
 *
 * **Every choice is a button with `aria-pressed`, not a radio group.** Native
 * radios take Left and Right for themselves to move the selection, and the
 * navigator (`src/navigation/`) owns the arrow keys for moving focus — two
 * meanings for one key press, on exactly the screen that has to work with a
 * remote. Buttons leave the arrows alone, say which one is chosen, and serve
 * touch, mouse and remote alike. #10 chose the same shape for the same reason.
 *
 * **There is no Save button.** A press is applied at once and saved behind the
 * screen, and the settings provider says so if the Server would not keep it.
 *
 * **Nothing is offered until the Server has answered.** The provider starts on
 * the defaults, so a control drawn before the read lands would show red and
 * "Match my device" to a User who has chosen neither — and a press then would
 * save those defaults over their real settings.
 *
 * **Two stores, said apart in words.** The Accent Colour, the UI language, the
 * Billboard trailer and the Home Layout are Jellyflick's own (Client Settings,
 * under the client `jellyflick`) — no other Jellyfin app has a Billboard, so
 * there is nothing of Jellyfin's that setting could be; the audio language,
 * the subtitle language, when to show
 * subtitles and next-Episode autoplay are the User's **Jellyfin account**
 * (`UserConfiguration`), so every Jellyfin app they use follows those four. The
 * screen says which is which rather than letting a User guess — the language
 * section says Jellyfin has no language setting of its own, because it has
 * none (`decisions.md` §2), and the "What plays" section says Jellyfin keeps
 * those settings, because it does (#35, story 114).
 */

/** The screen's own address. Not in `SECTIONS`; see the note above. */
export const SETTINGS_PATH = '/settings';

export type SettingsScreenProps = {
  /** For the device's own languages, which the language choice falls back to. */
  device: DeviceLayer;
};

/**
 * What a User calls each Billboard Source (#22).
 *
 * They are the **Sources'** own names, which are what `GLOSSARY.md` calls them
 * — and deliberately not their Rows': the Row that Resume features from is
 * called Continue Watching, and the glossary's "avoid" list says so. The
 * sentence under the heading is what joins the two up for a User.
 */
const BILLBOARD_SOURCE_NAME_KEYS: Readonly<Record<BillboardSourceId, MessageKey>> = {
  spotlight: 'settings.billboardSource.spotlight',
  resume: 'settings.billboardSource.resume',
  'newest-addition': 'settings.billboardSource.newestAddition',
  'because-you-watched': 'settings.billboardSource.becauseYouWatched',
};

/** A locale's name, written in that language, as a User reads it. */
const LANGUAGE_NAME_KEYS: Readonly<Record<'en' | 'es', MessageKey>> = {
  en: 'settings.language.en',
  es: 'settings.language.es',
};

export function SettingsScreen({ device }: SettingsScreenProps) {
  const t = useTranslate();
  const { settings, loaded, saveFailed, change } = useSettings();
  const playback = usePlaybackPreferences();

  /**
   * Both stores have to have answered before anything is drawn, not just the
   * one a given control belongs to: a control drawn from defaults and pressed
   * in that gap saves the defaults over what the User really has, which is the
   * bug #13 found in #10's editor. One notice covers both reads, and they are
   * in flight together, so this costs nothing in practice.
   */
  const ready = loaded && playback.loaded;

  const accent = accentColourFor(settings.accentColour);
  /**
   * Whether one Billboard Source is the one in force (#22).
   *
   * Three cases, and the third is why this is not simply an equality:
   *
   * - **Nothing stored** is Spotlight, which is what Home really does, so that
   *   is the button that reads as pressed — as the language row presses "match
   *   my device" rather than nothing.
   * - **A Source this version offers** presses itself.
   * - **A Source it does not** — one a newer Jellyflick added — presses
   *   *none* of them, rather than pressing Spotlight and telling the User they
   *   chose something they did not. Their real choice is carried on the Server
   *   untouched, the treatment an unknown Accent Colour preset gets.
   */
  const sourceChosen = (source: BillboardSourceId): boolean =>
    settings.billboardSource === undefined
      ? source === DEFAULT_BILLBOARD_SOURCE
      : settings.billboardSource === source;
  const deviceLocale = deviceLocaleFor(device);
  /** Which language button is pressed: the device's, or the chosen one. */
  const chosenLanguage =
    settings.uiLanguage === undefined || settings.uiLanguage === ''
      ? undefined
      : uiLocaleFor(settings.uiLanguage, device);

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('settings.heading')}</h1>

      {saveFailed || playback.saveFailed ? (
        <p class="notice notice--problem" role="alert">
          {t('settings.notSaved')}
        </p>
      ) : null}

      {ready ? null : <p class="notice">{t('settings.loading')}</p>}

      {ready ? (
        <>
          <section class="settings-group">
            <h2 class="settings-group__heading">{t('settings.accentHeading')}</h2>
            <p class="notice">{t('settings.accentExplanation')}</p>
            <p class="accents" role="group" aria-label={t('settings.accentHeading')}>
              {ACCENT_COLOURS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  class="accent"
                  // The swatch *is* the colour, so the name has to be the word
                  // for it: a colour is no use to anyone who cannot see it.
                  aria-label={t(preset.nameKey)}
                  aria-pressed={preset.id === accent.id}
                  style={`background: ${preset.colour}; color: ${preset.text}`}
                  onClick={() => change({ accentColour: preset.id })}
                >
                  {/* The tick is decoration: `aria-pressed` already says it. */}
                  <span class="accent__tick" aria-hidden="true">
                    {preset.id === accent.id ? '✓' : ''}
                  </span>
                </button>
              ))}
            </p>
          </section>

          <section class="settings-group">
            <h2 class="settings-group__heading">{t('settings.languageHeading')}</h2>
            <p class="notice">{t('settings.languageExplanation')}</p>
            <p class="settings-choices" role="group" aria-label={t('settings.languageHeading')}>
              <button
                type="button"
                class="button button--quiet"
                aria-pressed={chosenLanguage === undefined}
                onClick={() => change({ uiLanguage: undefined })}
              >
                {t('settings.language.deviceIs', {
                  language: t(LANGUAGE_NAME_KEYS[deviceLocale]),
                })}
              </button>
              {(['en', 'es'] as const).map((locale) => (
                <button
                  key={locale}
                  type="button"
                  class="button button--quiet"
                  aria-pressed={chosenLanguage === locale}
                  onClick={() => change({ uiLanguage: locale })}
                >
                  {t(LANGUAGE_NAME_KEYS[locale])}
                </button>
              ))}
            </p>
          </section>

          <section class="settings-group">
            <h2 class="settings-group__heading">{t('settings.billboardTrailerHeading')}</h2>
            <p class="notice">{t('settings.billboardTrailerExplanation')}</p>
            {/* Two buttons with `aria-pressed`, as every choice on this screen
                is: a native checkbox would be a different shape for the same
                kind of decision, and the arrow keys are the navigator's. */}
            <p
              class="settings-choices"
              role="group"
              aria-label={t('settings.billboardTrailerHeading')}
            >
              {([true, false] as const).map((autoplay) => (
                <button
                  key={String(autoplay)}
                  type="button"
                  class="button button--quiet"
                  aria-pressed={settings.billboardTrailerAutoplay === autoplay}
                  onClick={() => change({ billboardTrailerAutoplay: autoplay })}
                >
                  {t(
                    autoplay
                      ? 'settings.billboardTrailer.autoPlay'
                      : 'settings.billboardTrailer.off',
                  )}
                </button>
              ))}
            </p>
          </section>

          <section class="settings-group">
            <h2 class="settings-group__heading">{t('settings.billboardSourceHeading')}</h2>
            <p class="notice">{t('settings.billboardSourceExplanation')}</p>
            {/* `--wrap`, because four Sources with names this long do not sit
                on a phone's line — and a choice that runs off the side of the
                screen is one the arrow keys can reach and a User cannot see. */}
            <p
              class="settings-choices settings-choices--wrap"
              role="group"
              aria-label={t('settings.billboardSourceHeading')}
            >
              {BILLBOARD_SOURCE_IDS.map((source) => (
                <button
                  key={source}
                  type="button"
                  class="button button--quiet"
                  aria-pressed={sourceChosen(source)}
                  onClick={() => change({ billboardSource: source })}
                >
                  {t(BILLBOARD_SOURCE_NAME_KEYS[source])}
                </button>
              ))}
            </p>
          </section>

          {/* The settings the User's Jellyfin account carries, not
              Jellyflick's own. The heading and the sentence under it are what
              keep the language section above honest: that one says Jellyfin has
              no language setting, and this one says Jellyfin keeps these. */}
          <h2 class="screen__subheading">{t('settings.playbackHeading')}</h2>
          <p class="notice">{t('settings.playbackExplanation')}</p>

          <section class="settings-group">
            <h3 class="settings-group__heading">{t('settings.audioHeading')}</h3>
            <p class="notice">{t('settings.audioExplanation')}</p>
            <LanguageChoice
              label={t('settings.audioHeading')}
              chosen={playback.preferences.audioLanguage}
              onChoose={(audioLanguage) => playback.change({ audioLanguage })}
            />
          </section>

          <section class="settings-group">
            <h3 class="settings-group__heading">{t('settings.subtitleLanguageHeading')}</h3>
            <p class="notice">{t('settings.subtitleLanguageExplanation')}</p>
            <LanguageChoice
              label={t('settings.subtitleLanguageHeading')}
              chosen={playback.preferences.subtitleLanguage}
              onChoose={(subtitleLanguage) => playback.change({ subtitleLanguage })}
            />
          </section>

          <section class="settings-group">
            <h3 class="settings-group__heading">{t('settings.subtitleModeHeading')}</h3>
            <p class="notice">{t('settings.subtitleModeExplanation')}</p>
            <p
              class="settings-choices settings-choices--stacked"
              role="group"
              aria-label={t('settings.subtitleModeHeading')}
            >
              {SUBTITLE_MODES.map((option) => (
                <button
                  key={option.mode}
                  type="button"
                  class="button button--quiet"
                  aria-pressed={playback.preferences.subtitleMode === option.mode}
                  onClick={() => playback.change({ subtitleMode: option.mode })}
                >
                  {t(option.nameKey)}
                </button>
              ))}
            </p>
          </section>

          <section class="settings-group">
            <h3 class="settings-group__heading">{t('settings.nextEpisodeHeading')}</h3>
            <p class="notice">{t('settings.nextEpisodeExplanation')}</p>
            {/* Two buttons rather than a checkbox, so it is the same shape as
                every other choice on the screen and says which one is chosen
                instead of leaving a User to read a tick. */}
            <p
              class="settings-choices"
              role="group"
              aria-label={t('settings.nextEpisodeHeading')}
            >
              {([true, false] as const).map((autoPlay) => (
                <button
                  key={String(autoPlay)}
                  type="button"
                  class="button button--quiet"
                  aria-pressed={playback.preferences.nextEpisodeAutoPlay === autoPlay}
                  onClick={() => playback.change({ nextEpisodeAutoPlay: autoPlay })}
                >
                  {t(autoPlay ? 'settings.nextEpisode.autoPlay' : 'settings.nextEpisode.ask')}
                </button>
              ))}
            </p>
          </section>

          <section class="settings-group">
            <h2 class="settings-group__heading">{t('settings.homeHeading')}</h2>
            <p class="notice">{t('settings.homeExplanation')}</p>
            {/* A real link, so Back and the browser's own navigation work. */}
            <p class="settings-choices">
              <a class="button button--quiet" href={HOME_LAYOUT_PATH}>
                {t('homeLayout.heading')}
              </a>
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}

type LanguageChoiceProps = {
  /** Names the group, so a screen reader says which language is being chosen. */
  label: string;
  /** The stored code, which may be one no preset here offers. */
  chosen: string | undefined;
  /** `undefined` is "no preference", which is a choice of its own. */
  onChoose(code: string | undefined): void;
};

/**
 * One row of languages for the sound or the subtitles, with "No preference"
 * first.
 *
 * A code the Server holds that is not one of the presets presses **nothing**,
 * and is left alone until the User chooses something else: a preference set in
 * another Jellyfin app is theirs, not this screen's to overwrite. That is the
 * same treatment `accentColourFor` gives a preset it does not know.
 */
function LanguageChoice({ label, chosen, onChoose }: LanguageChoiceProps) {
  const t = useTranslate();
  return (
    <p class="settings-choices settings-choices--wrap" role="group" aria-label={label}>
      <button
        type="button"
        class="button button--quiet"
        aria-pressed={chosen === undefined}
        onClick={() => onChoose(undefined)}
      >
        {t('settings.spoken.none')}
      </button>
      {SPOKEN_LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          class="button button--quiet"
          aria-pressed={chosen === language.code}
          onClick={() => onChoose(language.code)}
        >
          {t(language.nameKey)}
        </button>
      ))}
    </p>
  );
}
