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
