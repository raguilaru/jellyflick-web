import { useEffect } from 'preact/hooks';
import { accentColourFor } from './accent-colours';
import { useSettings } from './settings-provider';

/**
 * Paints the whole app in the User's Accent Colour (story 112).
 *
 * The two `base.css` tokens are written on the root element, so every rule
 * that already reads `--accent` — the wordmark, a primary button, the focus
 * ring, the current section's underline — follows at once and nothing else in
 * the app has to know a colour was chosen. The stylesheet still ships red as
 * its literal default, so the app is never unpainted while the Server is
 * being asked.
 *
 * Deliberately **not** the manifest's `theme_color`: that is one file for the
 * whole household and the Accent Colour is one User's (#36), which is why it
 * is `--surface-base` there and a unit test holds the two together.
 *
 * Called once, in the shell, under the settings provider.
 */
export function useAccentColour(): void {
  const { settings } = useSettings();
  const accent = accentColourFor(settings.accentColour);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', accent.colour);
    root.style.setProperty('--accent-text', accent.text);
    // Nothing is removed on the way out: the app is the page, and taking the
    // colour off while a User is still looking at it would be a flash of red.
  }, [accent.colour, accent.text]);
}
