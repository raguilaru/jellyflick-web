import type { MediaSourceInfo } from '../jellyfin/gateway';

/**
 * A media source's `MediaStreams` as the two lists a User chooses from (#27):
 * the sound, and the subtitles.
 *
 * One module, so "which streams are there and what are they" is answered in one
 * place rather than in the picker and again in the subtitle engine. It is a pure
 * function of what the Server said, which is what lets every rule in here be
 * held still by `test/unit/the-tracks-of-a-title.test.ts`.
 *
 * **The index is the stream's own `Index`, never its place in the list.** That
 * is what `AudioStreamIndex` and `SubtitleStreamIndex` mean on the wire, and an
 * external subtitle file is appended to `MediaStreams` with an index of its own,
 * so the two disagree on exactly the files that have separate subtitles.
 *
 * **`kind` is the seam #29 and #30 take over.** This ticket fetches and draws
 * `text`; ASS and SSA are text here and are drawn as plain text until #29 gives
 * them a renderer, and `image` (PGS, VobSub, DVB) is carried through so the
 * picker can say what it cannot draw rather than silently offering nothing —
 * #30 adds the renderer without this classification moving.
 */

export type SubtitleKind =
  /** SRT, VTT, ASS, SSA and friends: the app fetches and draws these itself. */
  | 'text'
  /** PGS, VobSub, DVB: bitmaps, which need a decoder this app does not have. */
  | 'image';

export type AudioTrack = {
  /** `MediaStream.Index`: what `AudioStreamIndex` is set to. */
  readonly index: number;
  /** A three-letter code, matched against the User's own preference. */
  readonly language?: string;
  /** `DisplayTitle`: the Server's own label, which names the codec and channels. */
  readonly label?: string;
  /** `IsDefault`: what the *file* was marked with, not what this User prefers. */
  readonly isDefault: boolean;
};

export type SubtitleTrack = {
  readonly index: number;
  readonly language?: string;
  readonly label?: string;
  readonly kind: SubtitleKind;
  /** The ffprobe codec name. #29 reads this to tell ASS from plain text. */
  readonly codec?: string;
  readonly isDefault: boolean;
  readonly isForced: boolean;
  /**
   * `DeliveryUrl`, when the Server populated it. `jellyfin-playback.md` §14
   * shows the one case where the URL is not ours to build — an external stream
   * already at an absolute address — so it is preferred where it exists.
   */
  readonly deliveryUrl?: string;
  /**
   * `Path`: the subtitle file itself on the Server, set for an external track
   * and absent for one muxed into the video. It is what the Subtitle Offset is
   * remembered per (#28, story 102) — `subtitleFileOf` in
   * `subtitle-offset.ts` — because it is the one field that can say two
   * Episodes are reading the same file.
   */
  readonly path?: string;
};

export type MediaTracks = {
  readonly audio: readonly AudioTrack[];
  readonly subtitles: readonly SubtitleTrack[];
};

/** What the Server said this source holds, in this app's own vocabulary. */
export function tracksOf(source: MediaSourceInfo): MediaTracks {
  const streams = source.MediaStreams ?? [];
  const audio: AudioTrack[] = [];
  const subtitles: SubtitleTrack[] = [];

  streams.forEach((stream, at) => {
    const index = typeof stream.Index === 'number' ? stream.Index : at;
    if (stream.Type === 'Audio') {
      audio.push({
        index,
        ...textOf('language', stream.Language),
        ...textOf('label', stream.DisplayTitle),
        isDefault: stream.IsDefault === true,
      });
      return;
    }
    if (stream.Type !== 'Subtitle') return;
    subtitles.push({
      index,
      ...textOf('language', stream.Language),
      ...textOf('label', stream.DisplayTitle),
      kind: subtitleKindOf(stream.Codec),
      ...textOf('codec', stream.Codec),
      isDefault: stream.IsDefault === true,
      isForced: stream.IsForced === true,
      ...textOf('deliveryUrl', stream.DeliveryUrl),
      ...textOf('path', stream.Path),
    });
  });

  return { audio, subtitles };
}

/**
 * Whether a subtitle codec is a bitmap or text.
 *
 * The starting point is the Server's **own** predicates
 * (`jellyfin-playback.md` §14, quoted out of `MediaStream.cs`).
 * `IsTextSubtitleStream` is serialised and could have been read off the DTO,
 * but its image-side siblings are `[JsonIgnore]` and never reach the wire, so
 * the predicate has to be reimplemented here anyway — and having one rule is
 * better than half a rule from the Server and half from here.
 *
 * Two traps are the reason this is not simply a list of known codecs:
 * **`microdvd` is text** despite its `.sub` extension, and a bare **`sub`** is
 * an image.
 *
 * **One deliberate widening, and it is the one thing in here that is not the
 * Server's rule.** §14 quotes `Contains("dvdsub")` and `Contains("dvbsub")`
 * and then lists `dvd_subtitle` and `dvb_subtitle` among the codec values
 * really seen — and those two names match neither predicate, so the Server's
 * own test reads them as *text*. They are ffprobe's names for DVD and DVB
 * bitmaps, which is what a library really carries, so the underscore is
 * allowed for here. The asymmetry is why: calling a bitmap text means fetching
 * it as `Stream.vtt`, which the Server answers with the **raw** file for
 * graphical formats (§14), so the subtitle engine would be handed binary and
 * draw nothing with no way to say why. Calling text an image only means the
 * picker says it cannot draw that track, which #30 then makes true.
 *
 * A codec the Server did not name at all is read as text, which is the common
 * case and the one this app can at least try to draw.
 */
export function subtitleKindOf(codec: unknown): SubtitleKind {
  if (typeof codec !== 'string' || codec === '') return 'text';
  const name = codec.toLowerCase();
  // Checked first: `microdvd` is text, and it would otherwise look like `sub`.
  if (name.includes('microdvd')) return 'text';
  const image =
    name.includes('pgs') ||
    // `dvdsub` and `dvd_subtitle` both, which is the widening noted above.
    /dvd_?sub/.test(name) ||
    /dvb_?sub/.test(name) ||
    name.includes('vobsub') ||
    name === 'sup' ||
    name === 'sub';
  return image ? 'image' : 'text';
}

function textOf<K extends string>(key: K, value: unknown): { [P in K]?: string } {
  if (typeof value !== 'string' || value === '') return {};
  return { [key]: value } as { [P in K]?: string };
}
