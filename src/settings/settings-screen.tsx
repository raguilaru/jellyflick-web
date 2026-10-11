import type { DeviceLayer } from '../device/types';
import { useTranslate, type MessageKey } from '../i18n/index';
import { ACCENT_COLOURS, accentColourFor } from './accent-colours';
import { HOME_LAYOUT_PATH } from './home-layout-screen';
import { useSettings } from './settings-provider';
import { deviceLocaleFor, uiLocaleFor } from './ui-language';

/**
 * The settings screen: a User's Accent Colour and the language the app is in
 * (stories 112 and 113), with the way to their Home Layout beside them.
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
 * Story 114's other three settings — audio language, subtitle language and
 * next-episode autoplay, which really are Jellyfin `UserConfiguration` fields
 * — are #35's, and nothing is drawn for them here yet.
 */

/** The screen's own address. Not in `SECTIONS`; see the note above. */
export const SETTINGS_PATH = '/settings';

export type SettingsScreenProps = {
  /** For the device's own languages, which the language choice falls back to. */
  device: DeviceLayer;
};

/** A locale's name, written in that language, as a User reads it. */
const LANGUAGE_NAME_KEYS: Readonly<Record<'en' | 'es', MessageKey>> = {
  en: 'settings.language.en',
  es: 'settings.language.es',
};

export function SettingsScreen({ device }: SettingsScreenProps) {
  const t = useTranslate();
  const { settings, loaded, saveFailed, change } = useSettings();

  const accent = accentColourFor(settings.accentColour);
  const deviceLocale = deviceLocaleFor(device);
  /** Which language button is pressed: the device's, or the chosen one. */
  const chosenLanguage =
    settings.uiLanguage === undefined || settings.uiLanguage === ''
      ? undefined
      : uiLocaleFor(settings.uiLanguage, device);

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('settings.heading')}</h1>

      {saveFailed ? (
        <p class="notice notice--problem" role="alert">
          {t('settings.notSaved')}
        </p>
      ) : null}

      {loaded ? null : <p class="notice">{t('settings.loading')}</p>}

      {loaded ? (
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
