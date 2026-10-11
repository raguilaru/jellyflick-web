import type { MessageKey } from '../i18n/index';

/**
 * The Accent Colour presets a User picks from (story 112).
 *
 * A fixed set rather than a colour picker, because the ticket's promise is that
 * **text stays readable**: an arbitrary colour cannot keep that promise, and a
 * picker is also no way to choose anything with a remote. Seven presets is
 * inside the six-to-eight the ticket asks for.
 *
 * Each preset carries its own `text`, the colour that goes *on* it, because
 * readability decides that rather than taste: white reads on the deep colours
 * and dark ink reads on the bright ones. Both are measured against the WCAG
 * formula in `test/unit/accent-colours.test.ts`, which also holds the two bars
 * and why they differ.
 *
 * Applying one is `use-accent-colour.ts`: these are the two `base.css` tokens
 * `--accent` and `--accent-text`, and nothing else in the app has to know a
 * colour was chosen.
 */

export type AccentColourId = 'red' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

export type AccentColour = {
  readonly id: AccentColourId;
  /** The `--accent` token: a hex literal, which is what CSS wants. */
  readonly colour: string;
  /** The `--accent-text` token: what reads on top of `colour`. */
  readonly text: string;
  /** The preset's name, as a User reads it. */
  readonly nameKey: MessageKey;
};

/** Dark ink for the bright presets. Of the surface family, not plain black. */
const INK = '#14141a';
const WHITE = '#ffffff';

export const ACCENT_COLOURS: readonly AccentColour[] = [
  { id: 'red', colour: '#d1121b', text: WHITE, nameKey: 'settings.accent.red' },
  { id: 'amber', colour: '#e8a300', text: INK, nameKey: 'settings.accent.amber' },
  { id: 'green', colour: '#2e9e4f', text: INK, nameKey: 'settings.accent.green' },
  { id: 'teal', colour: '#00a3a3', text: INK, nameKey: 'settings.accent.teal' },
  { id: 'blue', colour: '#1f6fe0', text: WHITE, nameKey: 'settings.accent.blue' },
  { id: 'violet', colour: '#7c4dff', text: WHITE, nameKey: 'settings.accent.violet' },
  { id: 'pink', colour: '#ec5ba8', text: INK, nameKey: 'settings.accent.pink' },
];

/** Red, as story 112 asks. It is also the literal `base.css` ships. */
export const DEFAULT_ACCENT_COLOUR_ID: AccentColourId = 'red';

/**
 * One preset by its stored id. Anything unrecognised is red: a User whose
 * settings were written by a newer Jellyflick, offering a preset this version
 * does not have, still gets a working app in a colour that reads. Their stored
 * choice is not touched — only what is shown here falls back.
 */
export function accentColourFor(id: string | undefined): AccentColour {
  return (
    ACCENT_COLOURS.find((accent) => accent.id === id) ??
    (ACCENT_COLOURS.find((accent) => accent.id === DEFAULT_ACCENT_COLOUR_ID) as AccentColour)
  );
}
