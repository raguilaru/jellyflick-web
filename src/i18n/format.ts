/**
 * Formatting a dictionary shares, so two locales cannot drift apart on how a
 * number is written.
 *
 * `Intl.NumberFormat` is native on the Chromium 68 floor, which is why there is
 * nothing to polyfill here — `Intl.RelativeTimeFormat`, `ListFormat` and
 * `Locale` are the three that are not, and `architecture.md` says to write
 * those three lines by hand instead.
 */

/** One formatter per locale, because a readout is drawn while a button is held. */
const formatters = new Map<string, Intl.NumberFormat>();

/**
 * A number of seconds to one decimal place, in the locale's own notation:
 * `0.8` in English and `0,8` in Spanish.
 *
 * It is always one decimal place rather than "as many as it takes", so a
 * readout being stepped a tenth at a time does not change width under the
 * User's thumb — the same reason the clock beside the seek bar is tabular.
 */
export function formatSeconds(seconds: number, locale: string): string {
  let formatter = formatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    formatters.set(locale, formatter);
  }
  return formatter.format(Number.isFinite(seconds) ? seconds : 0);
}

/** One formatter per (locale, precision), for the same reason as above. */
const decimalFormatters = new Map<string, Intl.NumberFormat>();

function decimal(value: number, locale: string, maximumFractionDigits: number): string {
  const key = `${locale}|${String(maximumFractionDigits)}`;
  let formatter = decimalFormatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits });
    decimalFormatters.set(key, formatter);
  }
  return formatter.format(Number.isFinite(value) ? value : 0);
}

/**
 * A playback rate as a multiple: `1`, `1.25` in English and `1,25` in Spanish
 * (#32, story 91).
 *
 * Trailing zeros are dropped rather than padded, unlike the Subtitle Offset
 * above, because these are a fixed row of choices that never change under a
 * User's thumb — so `1` reads better than `1.0`.
 */
export function formatSpeed(rate: number, locale: string): string {
  return decimal(rate, locale, 2);
}

/**
 * A bitrate as a person would say it: `8 Mbps`, `720 kbps` (#32, story 93).
 *
 * The branch between the two units lives here rather than in each dictionary,
 * which is the whole reason this module exists: two locales that each decided
 * where megabits start would eventually disagree. `Mbps` and `kbps` are the
 * international abbreviations and are not translated.
 */
export function formatBitrate(bitsPerSecond: number, locale: string): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${decimal(bitsPerSecond / 1_000_000, locale, 1)} Mbps`;
  }
  return `${decimal(bitsPerSecond / 1000, locale, 0)} kbps`;
}
