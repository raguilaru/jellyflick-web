/**
 * The subtitle engine (#27): a subtitle file turned into cues, and a cursor
 * that says which cues belong on the screen at a moment.
 *
 * ## Why this app parses rather than letting the browser do it
 *
 * `docs/research/player-subtitles.md` §6c recommends a native `<track>` in
 * `mode = 'hidden'`, which gets the platform's WebVTT parser for free while it
 * renders nothing. **This module deliberately does not do that**, and the
 * reasons are worth having written down because the research reads the other
 * way:
 *
 * - **The research's own design already gives up half of it.** `activeCues` is
 *   computed by the browser against `video.currentTime` with no offset hook, so
 *   §6c says to read the parsed list out once and do active-cue selection
 *   against a shifted clock yourself. The *timing* half is ours either way, and
 *   that is the half the Subtitle Offset (#28) needs.
 * - **It would be ours to test and untestable.** The ticket asks for Vitest
 *   over parsing and timing. happy-dom has no WebVTT parser, so a `<track>`
 *   would leave the parsing half with nothing to assert in the only suite that
 *   could assert it.
 * - **The CORS pitfall ends up here anyway.** §6c pitfall 4: a cross-origin
 *   `<track src>` fails silently, and the Server *is* another origin, so the
 *   way out is to fetch the text and hand the element a blob — at which point
 *   the text is already in hand and a parser is forty lines.
 * - **SubRip is not natively parseable at all** (§6c pitfall 7). `<track>`
 *   reads WebVTT only, so the SRT in this ticket's title needs its own path
 *   regardless.
 *
 * What is given up is the platform's handling of the whole WebVTT grammar:
 * positioning (`line`, `position`, `align`, `size`, `vertical`), regions and
 * inline markup. §6c says to decide that subset explicitly rather than find it
 * out, so: **the text of a cue, its line breaks, and nothing else.** Cue
 * settings are read and dropped. #29 (Styled subtitles) is where positioning
 * and a known tag set earn their way back in.
 *
 * ## The text is plain, and that is a security boundary
 *
 * A subtitle file is untrusted input out of a media library, and `cue.text` is
 * raw markup (§6c pitfall 2). Every tag is stripped **here**, so what comes out
 * of this module is plain text and no caller can turn it back into markup by
 * reaching for the wrong DOM property. The overlay still uses `textContent`;
 * this is the belt to that braces.
 */

export type SubtitleCue = {
  /** Seconds from the start of the Title. */
  readonly start: number;
  /** Seconds, exclusive: a cue is gone on the frame its end is reached. */
  readonly end: number;
  /** Plain text, with the cue's own line breaks kept and no markup at all. */
  readonly text: string;
};

/**
 * A cue list from a WebVTT or SubRip file.
 *
 * One parser for both, because they differ in two things only — SubRip
 * separates its milliseconds with a comma and numbers its cues, and WebVTT has
 * a header and allows cue settings — and both of those are already the
 * "anything that is not a timing line" case. A client cannot always be sure
 * which it asked for anyway: the Server converts on the fly by file extension
 * and answers a graphical track with the raw file whatever was asked for
 * (`jellyfin-playback.md` §14), so being told `vtt` is not being given one.
 *
 * Anything unreadable comes back as **no cues** rather than as an error. A
 * track that will not parse is a track with nothing to draw, which is what the
 * player already shows for a Title with no subtitles at all.
 */
export function parseSubtitles(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  // `\r\n` and a lone `\r` both: a file written on Windows carries the first.
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split('\n');
    // A cue identifier, a `NOTE`/`STYLE`/`REGION` block's name or the `WEBVTT`
    // header may sit above the times, so the timing line is looked for rather
    // than assumed to be first.
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at === -1) continue;

    const timing = TIMING.exec(lines[at] as string);
    if (timing === null) continue;
    const start = secondsOf(timing[1] as string);
    const end = secondsOf(timing[2] as string);
    // A cue that ends before it starts is a broken file, not a cue to show for
    // ever: the cursor below leans on `end` being the later of the two.
    if (start === undefined || end === undefined || end <= start) continue;

    const body = plainTextOf(lines.slice(at + 1).join('\n'));
    if (body === '') continue;

    cues.push({ start, end, text: body });
  }

  // Sorted, because the cursor walks the list in time order and a file is not
  // obliged to be. A plain comparator rather than a stable sort: ADR 0002 puts
  // `Array.prototype.sort`'s stability at Chromium 70, one above the floor, so
  // two cues starting at the same moment are tie-broken by their end instead.
  return cues.sort((one, other) => one.start - other.start || one.end - other.end);
}

/**
 * Where cues are read from while a film plays.
 *
 * A cursor rather than a filter over the whole list, because this is asked on
 * every animation frame and a two-hour film holds a couple of thousand cues
 * (§6c). It keeps one index and walks it, so playing forwards costs nothing;
 * a seek backwards — one arrow-key press in this player — is caught and the
 * index is simply moved back, which is why `at` is correct for *any* position
 * rather than only an increasing one.
 */
export function createCueCursor(cues: readonly SubtitleCue[]): {
  /**
   * The cues to draw at this position, in time order. Pass the position the
   * subtitles should be read at, which is where #28's offset will be applied —
   * this module deliberately knows nothing about an offset, so adding one is
   * subtracting it from the argument.
   */
  at(seconds: number): readonly SubtitleCue[];
} {
  /** The first cue that might still be on the screen. */
  let from = 0;

  return {
    at: (seconds) => {
      // A media element reports `NaN` before its metadata and `Infinity` for a
      // live source; `scrubbing.ts` holds the same line for the seek bar.
      if (!Number.isFinite(seconds)) return [];

      // Forwards past cues that have ended, which is the common case and the
      // whole point of keeping an index.
      while (from < cues.length && (cues[from] as SubtitleCue).end <= seconds) from += 1;
      // Backwards after a seek. `cues` is sorted by `start`, so a cue before
      // `from` can still be active — walking back to the first one that cannot
      // be is what makes a seek as correct as playing through.
      while (from > 0 && (cues[from - 1] as SubtitleCue).end > seconds) from -= 1;

      const active: SubtitleCue[] = [];
      // Cues are ordered by `start`, so the first one starting later than this
      // position ends the search: nothing after it can have started.
      for (let at = from; at < cues.length; at += 1) {
        const cue = cues[at] as SubtitleCue;
        if (cue.start > seconds) break;
        if (cue.end > seconds) active.push(cue);
      }
      return active;
    },
  };
}

/**
 * A timing line: `00:00:01.000 --> 00:00:04.000`, with the hours optional
 * (WebVTT's short form), a comma allowed for the decimal point (SubRip), and
 * any cue settings after it dropped.
 */
const TIMING = /^\s*((?:\d{1,3}:)?\d{1,2}:\d{1,2}[.,]\d{1,3})\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{1,2}[.,]\d{1,3})/;

/** `[HH:]MM:SS.mmm` as seconds. */
function secondsOf(stamp: string): number | undefined {
  const parts = stamp.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return undefined;
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  const minutes = Number(parts[parts.length - 2]);
  const seconds = Number(parts[parts.length - 1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * A cue's body as plain text: every tag gone, the character references WebVTT
 * allows turned back into characters, and the line breaks kept.
 *
 * The references are decoded **after** the tags are stripped, deliberately. The
 * other order would let `&lt;b&gt;` become a tag that then survives, which is
 * the shape of every markup-stripping bug there has ever been.
 */
function plainTextOf(body: string): string {
  const withoutTags = body.replace(/<[^>]*>/g, '');
  return withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lrm;/g, '‎')
    .replace(/&rlm;/g, '‏')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last, so `&amp;lt;` reads as the text `&lt;` rather than as `<`.
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}
