import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCENT_COLOURS,
  DEFAULT_ACCENT_COLOUR_ID,
  accentColourFor,
} from '../../src/settings/accent-colours';

/**
 * The Accent Colour presets (story 112), and the promise the ticket makes about
 * them: every one of them is readable.
 *
 * "Readable" is two measurements, because `base.css` uses the token two ways:
 *
 * - as a **fill behind text** — `.button--primary`, a pressed card control —
 *   where `--accent-text` sits on `--accent` as normal-sized body text. WCAG
 *   AA asks 4.5:1 for that.
 * - as **ink and edges on the page itself** — the wordmark, the current
 *   section's underline, the focus ring — where `--accent` sits on
 *   `--surface-base`. The wordmark is large text and the other two are non-text
 *   parts of the interface, so the bar there is 3:1 (WCAG AA large text, and
 *   1.4.11 for the rest).
 *
 * The ratio is computed here from the WCAG definition rather than read out of
 * the source: the formula is the independent source of truth, and the first
 * test pins the formula itself against values WCAG publishes.
 */

/** The page's own background, which the accent is read against. */
const SURFACE_BASE = '#0b0b0d';

function relativeLuminance(colour: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two opaque colours, lighter over darker. */
function contrastRatio(one: string, other: string): number {
  const a = relativeLuminance(one);
  const b = relativeLuminance(other);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('the contrast ratio this file measures with', () => {
  it('agrees with the values WCAG itself gives', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
    // #767676 on white is WCAG's own worked example of exactly passing 4.5:1.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
});

describe('the Accent Colour presets', () => {
  it('offers the six to eight the ticket asks for, each named once', () => {
    expect(ACCENT_COLOURS.length).toBeGreaterThanOrEqual(6);
    expect(ACCENT_COLOURS.length).toBeLessThanOrEqual(8);

    const ids = ACCENT_COLOURS.map((accent) => accent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads as body text where the accent is a fill behind text', () => {
    for (const accent of ACCENT_COLOURS) {
      expect(
        contrastRatio(accent.text, accent.colour),
        `${accent.id}: ${accent.text} on ${accent.colour}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads as the wordmark and the focus ring against the page', () => {
    for (const accent of ACCENT_COLOURS) {
      expect(
        contrastRatio(accent.colour, SURFACE_BASE),
        `${accent.id}: ${accent.colour} on the page`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('is red by default', () => {
    expect(DEFAULT_ACCENT_COLOUR_ID).toBe('red');
    expect(accentColourFor(undefined).id).toBe('red');
  });

  it('falls back to red for a colour this version does not know', () => {
    // A newer Jellyflick may have stored a preset this one has never heard of.
    expect(accentColourFor('ultraviolet').id).toBe('red');
  });

  /**
   * The stylesheet ships the default accent as a literal, so the app is the
   * right colour before any setting has been read. Two copies of one fact, so
   * this fails if they ever drift — the same guard #36 put on the manifest.
   */
  it('is the colour the stylesheet already ships as its default', () => {
    const tokens = readFileSync('src/styles/base.css', 'utf8');
    const accent = /--accent:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1];
    const accentText = /--accent-text:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1];

    const red = accentColourFor(DEFAULT_ACCENT_COLOUR_ID);
    expect(accent).toBe(red.colour);
    expect(accentText).toBe(red.text);
  });
});
