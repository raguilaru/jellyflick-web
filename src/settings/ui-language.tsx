import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import {
  createTranslate,
  loadMessages,
  pickLocale,
  TranslateProvider,
  useTranslate,
  type Locale,
  type Messages,
} from '../i18n/index';
import { useSettings } from './settings-provider';

/**
 * The language the app itself is in (story 113).
 *
 * **This setting is Jellyflick's own.** Jellyfin 12.x has no per-user UI
 * language — the only one it has is the server-wide `UICulture` — so it lives
 * in the Client Settings store with everything else of ours (`decisions.md`
 * §2). Story 114's claim that the settings screen "edits my Jellyfin settings"
 * holds for audio language, subtitle language and next-episode autoplay, which
 * really are `UserConfiguration` fields (#35), and cannot hold for this one.
 * The screen says so in as many words rather than implying otherwise.
 *
 * It sits inside the settings provider and above the rest of the shell, and it
 * provides a *second* `TranslateProvider` under the one `src/app.tsx` installed
 * for the device's language. That nesting is what makes the switch free of a
 * blank screen: until the chosen dictionary has been fetched, the one already
 * on the screen stays up.
 */

export type UiLanguageProps = {
  /** Where the device's own languages come from, for the fallback. */
  device: DeviceLayer;
  children: ComponentChildren;
};

/** The locale a User's device asks for, which is the default (story 113). */
export function deviceLocaleFor(device: DeviceLayer): Locale {
  return pickLocale(device.preferredLanguages());
}

/**
 * The locale to show the app in: the User's choice if they made one, and their
 * device's languages if they did not. A chosen language this version does not
 * ship falls back to English, the same way an unknown device language does.
 */
export function uiLocaleFor(chosen: string | undefined, device: DeviceLayer): Locale {
  return chosen === undefined || chosen === ''
    ? deviceLocaleFor(device)
    : pickLocale([chosen]);
}

export function UiLanguage({ device, children }: UiLanguageProps) {
  const { settings } = useSettings();
  const locale = uiLocaleFor(settings.uiLanguage, device);
  /**
   * The dictionary already on the screen: the one `src/app.tsx` loaded for the
   * device's language. It stands in while a chosen one is being fetched, so
   * the switch is never a blank screen or a flash of message keys.
   */
  const showing = useTranslate();

  const [dictionary, setDictionary] = useState<
    { locale: Locale; messages: Messages } | undefined
  >(undefined);

  useEffect(() => {
    let abandoned = false;
    void loadMessages(locale).then((messages) => {
      if (!abandoned) setDictionary({ locale, messages });
    });
    return () => {
      // A User who changes their mind while a dictionary is in flight must not
      // be handed the one they moved away from.
      abandoned = true;
    };
  }, [locale]);

  const loaded = useMemo(
    () => (dictionary === undefined ? undefined : createTranslate(dictionary.messages)),
    [dictionary],
  );

  /**
   * The provider is always in the tree, even before there is a dictionary of
   * its own to put in it. Rendering the children bare and wrapping them later
   * changes the shape of the tree, which unmounts and remounts everything
   * below — the whole shell, losing a typed search term and every Row's state
   * with it. Only the *value* changes.
   */
  const translate = dictionary?.locale === locale && loaded !== undefined ? loaded : showing;

  return <TranslateProvider value={translate}>{children}</TranslateProvider>;
}
