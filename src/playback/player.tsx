import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CastSession, DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { usePlaybackPreferences } from '../settings/playback-preferences-provider';
import { useSettings } from '../settings/settings-provider';
import { useBackClaim } from '../shell/back';
import type { PlayTarget } from '../title/play-target';
import { resolveNextEpisode } from '../title/play-target';
import { showAirPlayPicker, watchAirPlayTargets } from './air-play';
import { castReceiverId, JELLYFIN_CAST_NAMESPACE, playNowMessage } from './cast';
import { useIdleControls } from './controls-visibility';
import { readMediaSegments, skipOffered, type MediaMarker } from './media-segments';
import { NextEpisodeOffer } from './next-episode';
import { SkipButton } from './skip-button';
import { PlaybackOptions } from './playback-options';
import { clampSpeed, NORMAL_SPEED } from './playback-speed';
import { PlayerControls, SEEK_BAR_ATTRIBUTE } from './player-controls';
import { readMaxQuality, writeMaxQuality } from './max-quality';
import { trickplayFor, type TrickplayMap } from './trickplay';
import { PREVIEW_MAX_WIDTH } from './trickplay-preview';
import { planPlayback, type PlaybackAttempt, type PlaybackPlan } from './planning';
import {
  createPlaybackReporter,
  PING_INTERVAL_MS,
  secondsOfTicks,
  ticksOfSeconds,
  type PlaybackReporter,
} from './reporting';
import { clampPosition, SEEK_STEP_SECONDS } from './scrubbing';
import type { SubtitleCue } from './subtitle-cues';
import {
  offsetToSyncToLine,
  shiftSubtitleOffset,
  subtitleFileOf,
  subtitleOffsetFor,
  withSubtitleOffset,
} from './subtitle-offset';
import { subtitlePresentationFor, type SubtitlePresentation } from './subtitle-presentation';
import { ImageSubtitles } from './image-subtitles';
import { StyledSubtitles } from './styled-subtitles';
import { Subtitles } from './subtitles';
import { SubtitleTiming } from './subtitle-timing';
import { TrackPicker } from './track-picker';
import { attachPlaybackSource, type AttachedSource } from './video-source';

/**
 * The player (#25, grown up in #26): what Play on a title page opens.
 *
 * It is **an overlay, not an address**, and that is the same call the User
 * Picker made. A player is not a place a User navigated to — it is something
 * over the Title they were looking at — and an address for it would put a
 * history entry between the two, so Back out of the player would have to mean
 * something different from Back everywhere else in this app. Instead it claims
 * Back through `useBackClaim`, which is the one Back handler's own extension
 * point: Back closes the player and the title page is still there behind it,
 * and only the *next* Back is the navigation it always was. A menu inside the
 * player — the tracks (#27), the quality (#32) — claims Back on top of this
 * one, and the claim stack is innermost-last, so Back closes the menu first
 * without either of them knowing about the other.
 *
 * Being `position: fixed` is load-bearing rather than a look. `src/navigation/`
 * tries the page's own flow before anything fixed, and *from* inside something
 * fixed the fixed thing is the flow, so the arrow keys stay among the player's
 * own controls with **no focus-trapping code here at all**. #7 arranged that
 * rule and #17's pop-up already relies on it.
 *
 * The media element is touched in exactly one place — `usePlayback` — and
 * everything drawn over it is told what to draw. `PlayerControls` owns no
 * playback state, so a seek is one path whether it came from the bar, a key or
 * a remote.
 */

export type PlayerProps = {
  gateway: JellyfinGateway;
  device: DeviceLayer;
  /** The User watching: `PlaybackInfo` is asked on their behalf. */
  userId: string;
  itemId: string;
  /** For the controls' names and the region's, so a screen reader hears what. */
  titleName: string;
  /** Where this User left off, in ticks. Absent starts at the beginning. */
  resumeTicks?: number;
  /**
   * Which Series this is an Episode of, for an Episode and only for one (#31).
   * It is what lets the end of one Episode offer the next, and its absence is
   * how a Movie says there is nothing after it. It comes off the `PlayTarget`
   * the screen is playing, so the rule about what that means stays in
   * `src/title/play-target.ts`.
   */
  seriesId?: string;
  /**
   * Play this instead, which is the next Episode (#31).
   *
   * The player asks the screen to re-target rather than swapping the Episode
   * under itself, because the screen is where "what is playing" already lives
   * — the title page's own Play set it, and the Billboard's did. A screen that
   * does not offer this gets the old behaviour: the player closes at the end.
   */
  onPlayNext?: (target: PlayTarget) => void;
  onClose: () => void;
};

export function Player({
  gateway,
  device,
  userId,
  itemId,
  titleName,
  resumeTicks,
  seriesId,
  onPlayNext,
  onClose,
}: PlayerProps) {
  const t = useTranslate();
  /**
   * This User's Jellyfin account (#35), which is where `EnableNextEpisodeAutoPlay`
   * lives. The provider is above the router, so it is already in the player's
   * tree and no second path to the Server is needed — `playback-preferences-provider.tsx`
   * says so in as many words, and #31 is the reader it was waiting for.
   */
  const { preferences } = usePlaybackPreferences();
  /**
   * This User's own Client Settings (#10), which is where a Subtitle Offset is
   * kept (#28, story 102). The provider sits above the router, so the player is
   * already inside it and there is no second path to the Server — the same
   * argument `usePlaybackPreferences` above makes for the Jellyfin account.
   */
  const settings = useSettings();
  const video = useRef<HTMLVideoElement | null>(null);
  const [attempt, setAttempt] = useState<PlaybackAttempt | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unreported, setUnreported] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  /** Bumped by Retry: it is the whole of what asking again means. */
  const [attemptNumber, setAttemptNumber] = useState(0);
  /**
   * The tracks (#27). Each is a `MediaStream.Index` the **User** chose, as
   * against the one the Server chose, which is on the plan: absent means
   * "whatever the Server decided from this User's own Jellyfin account", so
   * nothing here has to know the account's preferences at all.
   *
   * They are kept apart because the two switch completely differently. The
   * sound is the Server's — a direct-played file carries every track and the
   * browser picks one with no API to choose — so choosing one re-negotiates.
   * The subtitles are a separate file this app fetches and draws, so choosing
   * one never touches the media element. See `usePlayback` below.
   *
   * **#30 puts one kind of subtitle track on the sound's side of that line.**
   * A burned-in track is not a file at all: the Server draws the words into
   * the picture, which is a different transcode of the same source, so
   * choosing one has to be negotiated exactly like a change of sound. That is
   * `burnedInIndex` below rather than a third case in here, because the two
   * answer different questions — this one is what the User asked for, that
   * one is what the Server was asked to bake in.
   */
  const [chosenAudio, setChosenAudio] = useState<number | undefined>(undefined);
  const [chosenSubtitle, setChosenSubtitle] = useState<ChosenSubtitle>('from-the-server');
  /**
   * The subtitle track the **Server** was asked to burn into the picture
   * (#30), or none — which is the common case, and was the only one before
   * this ticket.
   *
   * It is sent as `SubtitleStreamIndex` on the next `PlaybackInfo`, where the
   * DeviceProfile's silence about that codec turns it into
   * `SubtitleDeliveryMethod.Encode`: there is no flag that asks for burn-in,
   * and `device-profile.ts` explains at length why the omission is the
   * request.
   *
   * **Leaving a burned-in track also re-negotiates**, which is the half that
   * is easy to forget. The words are *in the picture* until a new stream
   * replaces it, so going back to a drawable track with this still set would
   * leave them there underneath whatever was chosen next.
   */
  const [burnedInIndex, setBurnedInIndex] = useState<number | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subtitlesUnavailable, setSubtitlesUnavailable] = useState(false);
  /** Whether the Subtitle timing panel is open (#28). */
  const [timingOpen, setTimingOpen] = useState(false);
  /**
   * The cues of the track being drawn, which the overlay hands up when it has
   * parsed them. The player keeps them because "Sync to this line" has to know
   * which line is on the screen, and the offset lives here.
   */
  const [cues, setCues] = useState<readonly SubtitleCue[]>([]);
  /**
   * The Subtitle Offset in force, in seconds.
   *
   * It is the player's own state rather than read straight out of the settings,
   * and that is about **saving** rather than about drawing: a Client Settings
   * write is a read-modify-write against the Server, and a held button is forty
   * steps. So the offset moves here at once and is written when the panel says
   * an adjustment has finished.
   */
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  /**
   * Where to start the *next* negotiation, which a change of sound track
   * needs: the Title has to be asked for again, and the User has not asked to
   * go back to the beginning or to the resume point they came in at. Absent
   * means this is the first attempt, so the resume point stands.
   */
  const [restartTicks, setRestartTicks] = useState<number | undefined>(undefined);
  /**
   * The intro and credits markers this source has (#31), empty until the read
   * answers and for every Server with no segment provider at all.
   */
  const [markers, setMarkers] = useState<readonly MediaMarker[]>([]);
  /**
   * What is offered now that the Episode has run out: the next Episode, or
   * `'nothing'` once it is known there is none. `undefined` is "it has not
   * run out", which is the state nearly all of playback is in.
   */
  const [atTheEnd, setAtTheEnd] = useState<PlayTarget | 'nothing' | undefined>(undefined);
  /** Whether the playback options are open (#32). */
  const [optionsOpen, setOptionsOpen] = useState(false);
  /**
   * How fast the Title is playing (#32, story 91), which starts at its own
   * speed and stays where a User put it **for this playback** — a change of
   * sound track or of quality re-negotiates and re-attaches the source, and
   * the rate is re-applied each time rather than quietly going back to one.
   */
  const [speed, setSpeed] = useState(NORMAL_SPEED);
  /**
   * The maximum quality **this device** has been told to stop at (story 93),
   * read out of device storage once when the player opens. It is a device
   * setting rather than a Client Setting, which is the spec's own split: a
   * phone and the television beside it belong to the same User and want
   * opposite answers.
   */
  const [maxBitrate, setMaxBitrate] = useState<number | undefined>(() =>
    readMaxQuality(device.storage()),
  );
  /**
   * The scrubbing thumbnails this source has (story 90), or nothing — which
   * is the common case and not a failure.
   */
  const [trickplay, setTrickplay] = useState<TrickplayMap | undefined>(undefined);
  /** Whether the picture is in its own window, and whether one was refused. */
  const [inPictureInPicture, setInPictureInPicture] = useState(false);
  const [pictureInPictureRefused, setPictureInPictureRefused] = useState(false);
  /**
   * The Chromecast this Title is playing on, by its own name, or `undefined`
   * for the ordinary case of playing here (#33).
   *
   * It is a **name rather than a flag** because it is what the notice beside
   * the picture says, and the live session is held in a ref beside it: a
   * session is not state a render reads, and re-rendering because one exists
   * would be a render for something nothing draws.
   */
  const [castingTo, setCastingTo] = useState<string | undefined>(undefined);
  const castSession = useRef<CastSession | undefined>(undefined);
  /** Whether a press could not reach a receiver, so it can be said once. */
  const [castUnavailable, setCastUnavailable] = useState(false);
  /**
   * Whether the element says there is somewhere to AirPlay to (#33).
   *
   * The capability can only say Safari has the API, which is why this is
   * watched rather than assumed: a house with no Apple TV in it would
   * otherwise get a control that opens an empty picker. See `air-play.ts`.
   */
  const [airPlayAvailable, setAirPlayAvailable] = useState(false);

  // Back closes the player, through the one Back handler rather than a key
  // listener of this screen's own. A layout effect, which is why #8 made it one.
  useBackClaim(true, onClose);

  const plan = attempt?.outcome === 'play' ? attempt.plan : undefined;
  const problem = problemOf(attempt, failed);

  /**
   * Which subtitles are being drawn: the User's choice where they have made
   * one, and the Server's otherwise — which is how a Title starts with the
   * subtitles this User's Jellyfin account asks for without the player reading
   * that account at all.
   */
  const subtitleIndex =
    chosenSubtitle === 'from-the-server'
      ? plan?.subtitleStreamIndex
      : chosenSubtitle === 'off'
        ? undefined
        : chosenSubtitle.index;
  const subtitleTrack = plan?.tracks.subtitles.find((track) => track.index === subtitleIndex);
  /** Which sound is playing, the same way round. */
  const audioIndex = chosenAudio ?? plan?.audioStreamIndex;

  /**
   * **How** that track is going to be drawn on this device (#29): with its own
   * styling, or flattened to the words and the timing. It is asked here rather
   * than inside the overlay because the answer picks *which* thing draws it,
   * and the file to fetch comes with it.
   */
  const presentation =
    subtitleTrack === undefined
      ? undefined
      : subtitlePresentationFor({
          track: subtitleTrack,
          capabilities: device.subtitleCapabilities(),
        });

  /**
   * Whether the styled renderer turned out not to be loadable on this device
   * after all (#29). The capability can only say whether it is worth asking;
   * a dropped chunk or a WASM binary the browser refused is only known once
   * the asking has happened, so the fallback is a state the renderer reports
   * and this is it. Reset per subtitle file, because the next track deserves
   * its own attempt — and because a User who switched away and back has done
   * the one thing that most looks like asking again.
   */
  const [styledUnsupported, setStyledUnsupported] = useState(false);

  /**
   * What is really going to draw, once that is taken into account. Falling
   * back lands on `cues`: the same overlay, the same flattened file and the
   * same offset the Chromium 68 floor gets.
   */
  const draw: SubtitlePresentation['draw'] =
    presentation === undefined
      ? 'none'
      : presentation.draw !== 'styled'
        ? presentation.draw
        : styledUnsupported
          ? 'cues'
          : 'styled';

  /**
   * Which **subtitle file** is being drawn, which is what an offset belongs to
   * (#28, story 102). Absent while subtitles are off, which is also when there
   * is nothing to time.
   */
  const subtitleFile =
    subtitleTrack === undefined || plan === undefined
      ? undefined
      : subtitleFileOf(subtitleTrack, plan.mediaSourceId);
  /**
   * A new subtitle file gets its own attempt at the styled renderer: the last
   * one failing says nothing about this one, and switching away and back is
   * the one thing a User does that most looks like asking again.
   */
  useEffect(() => {
    setStyledUnsupported(false);
  }, [subtitleFile]);

  /** The offset stored for it, read on every render so the ref below is fresh. */
  const storedOffset = subtitleOffsetFor(settings.settings.subtitleOffsets, subtitleFile ?? '');
  const stored = useRef(storedOffset);
  stored.current = storedOffset;

  /**
   * The stored offset is adopted **once per subtitle file**, which is story
   * 102's "applied automatically next time, on any device": a track chosen on
   * a device that has never shifted anything comes up already shifted.
   *
   * Once per file rather than whenever the settings change, because the second
   * would undo a User's adjustment with the value they had just replaced — the
   * same hazard `settings-provider.tsx` guards its first read against. It waits
   * for `loaded`, or a slow Server would hand every file an offset of nothing
   * and then adopt it.
   */
  const adopted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (subtitleFile === undefined) {
      adopted.current = undefined;
      setOffsetSeconds(0);
      return;
    }
    if (!settings.loaded || adopted.current === subtitleFile) return;
    adopted.current = subtitleFile;
    setOffsetSeconds(stored.current);
  }, [subtitleFile, settings.loaded]);

  const playing = usePlayback({
    video,
    gateway,
    device,
    plan,
    duration,
    audioIndex,
    subtitleIndex,
    onPausedChange: setPaused,
    onPositionChange: setPosition,
    onDurationChange: setDuration,
    onFailure: () => setFailed(true),
    onUnreported: () => setUnreported(true),
    onEnded: () => {
      void reachedTheEnd();
    },
  });

  /**
   * What the end of a file means (#31).
   *
   * A Movie, or an Episode with nothing after it, closes the player exactly as
   * #25 did: the Title is over and the title page is where a User belongs. An
   * Episode in the middle of a Series is the new case — the next one is read
   * off the Server **here rather than beside every playback**, so an Episode
   * somebody abandons half way through never costs the two calls.
   *
   * The read is awaited before anything is drawn, so a household never sees an
   * empty panel fill in; until it answers the controls are up over a still
   * frame, which is what a paused player looks like anyway.
   */
  const reachedTheEnd = async (): Promise<void> => {
    if (seriesId === undefined || onPlayNext === undefined) {
      onClose();
      return;
    }
    const next = await resolveNextEpisode(gateway, seriesId, itemId, t);
    if (next === undefined) {
      onClose();
      return;
    }
    setAtTheEnd(next);
  };

  // Ask the Server how to play it. Once per (Title, Server, resume point), and
  // again whenever Retry asks or the User chooses a different sound track.
  useEffect(() => {
    let abandoned = false;
    setAttempt(undefined);
    void planPlayback(gateway, {
      itemId,
      userId,
      device,
      ...ticksIf(restartTicks ?? resumeTicks),
      // Left out until the User has chosen one, which is what leaves the choice
      // to the Server and so to this User's own Jellyfin account.
      ...(chosenAudio === undefined ? {} : { audioStreamIndex: chosenAudio }),
      // The ceiling this device was told to stop at (#32, story 93). Absent
      // is Auto, which is the absence of a ceiling rather than a value, so
      // nothing is sent and the Server answers with the best the profile can
      // take — exactly what it did before this ticket.
      ...(maxBitrate === undefined ? {} : { maxBitrate }),
      // The one track the Server is asked to draw into the picture (#30).
      // Left out otherwise, so the Server keeps choosing from this User's own
      // account exactly as it did before this ticket.
      ...(burnedInIndex === undefined ? {} : { subtitleStreamIndex: burnedInIndex }),
    }).then((planned) => {
      if (abandoned) return;
      setAttempt(planned);
      setPosition(planned.outcome === 'play' ? secondsOfTicks(planned.plan.startTicks) : 0);
      setDuration(
        planned.outcome === 'play' ? secondsOfTicks(planned.plan.runtimeTicks ?? 0) || undefined : undefined,
      );
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [
    gateway.serverAddress,
    itemId,
    userId,
    device,
    resumeTicks,
    attemptNumber,
    chosenAudio,
    burnedInIndex,
    maxBitrate,
    restartTicks,
  ]);

  const retry = useCallback(() => {
    setFailed(false);
    setUnreported(false);
    setAttemptNumber((number) => number + 1);
  }, []);

  /**
   * The markers, read once per plan (#31).
   *
   * **Only where the Server said there are some.** `MediaSourceInfo.HasSegments`
   * exists precisely to save this request (`jellyfin-playback.md` §12), and
   * most households run a Server with no intro-detection plugin at all — so
   * the common case is one boolean rather than a round trip per playback.
   *
   * It hangs off the plan rather than off the Title because a change of sound
   * track is a new plan, and the markers belong to the source that plan names.
   */
  useEffect(() => {
    setMarkers([]);
    if (plan === undefined || !plan.hasSegments) return;
    let abandoned = false;
    void readMediaSegments(gateway, plan.itemId).then((read) => {
      if (!abandoned) setMarkers(read);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, plan]);

  /**
   * The scrubbing thumbnails, read once per plan (#32, story 90).
   *
   * **Unlike the markers above there is no flag to save the request.**
   * `HasSegments` exists precisely so #31 can skip its read on a Server with
   * no intro-detection plugin; `PlaybackInfo` carries nothing equivalent for
   * trickplay, and the manifest is a gated `fields=Trickplay` property of the
   * item rather than anything on the source. So this is one read per
   * playback on every Server, and the empty answer is the common one.
   *
   * It hangs off the plan for the same reason the markers do: the thumbnails
   * belong to the media source that plan names, and a change of sound track
   * or of quality is a new plan.
   *
   * A Server that will not answer is a Server with no thumbnails, as far as a
   * User is concerned. There is nothing to retry and nothing to say: the bar
   * works, and a scrubbing aid that did not load is not worth a notice over
   * the picture.
   */
  useEffect(() => {
    setTrickplay(undefined);
    if (plan === undefined) return;
    let abandoned = false;
    void gateway.getTrickplay(plan.itemId).then(
      (read) => {
        if (!abandoned) setTrickplay(read);
      },
      () => undefined,
    );
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, plan]);

  /**
   * Which set of thumbnails to draw with, at the size the preview is drawn.
   * Nothing at all whenever the Server generated none for this source, which
   * is what takes the whole feature off the bar.
   */
  const previewResolution =
    plan === undefined ? undefined : trickplayFor(trickplay, plan.mediaSourceId, PREVIEW_MAX_WIDTH);

  /**
   * The speed (story 91), applied to the element rather than held as a number
   * nothing reads.
   *
   * **Both properties, and that is the point.** `playbackRate` is what is
   * playing now; `defaultPlaybackRate` is what the element goes back to when
   * a new source is attached to it — which happens on every re-negotiation,
   * so without it a User who slowed a Title down and then changed the sound
   * track would be jolted back to full speed with nothing to explain it.
   *
   * Keyed on the plan as well as the speed, so it is re-applied after the
   * source the re-negotiation attached.
   */
  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    element.defaultPlaybackRate = speed;
    element.playbackRate = speed;
  }, [speed, plan]);

  /**
   * Choosing a maximum quality asks the Server again, exactly as choosing a
   * sound track does and for the same kind of reason: the ceiling is part of
   * the DeviceProfile, and the profile is the negotiation. So what is owed
   * the User is their **place** — the next `PlaybackInfo` starts from where
   * they are rather than from the beginning.
   *
   * It is written to device storage at the press rather than when the player
   * closes, because the press is the whole of the decision and a User who
   * shuts the lid of a laptop has still chosen.
   */
  const chooseQuality = useCallback(
    (bitrate: number | undefined) => {
      if (bitrate === maxBitrate) return;
      setRestartTicks(ticksOfSeconds(video.current?.currentTime ?? position));
      writeMaxQuality(device.storage(), bitrate);
      setMaxBitrate(bitrate);
      setOptionsOpen(false);
    },
    [device, maxBitrate, position],
  );

  /**
   * Picture-in-picture (story 92), which is a **press on the element** rather
   * than anything the Server knows about: the same stream keeps playing in a
   * window of the browser's own.
   *
   * The device layer says whether to offer it at all — `pictureInPicture` is
   * `document.pictureInPictureEnabled`, which is false on Chromium 68 and
   * false again on a browser whose policy forbids it. What is left here is the
   * press, which the browser requires to be a User's: `requestPictureInPicture`
   * rejects without a gesture, so it is called straight out of the click and
   * never out of an effect.
   *
   * A refusal is said beside the picture, like every other player failure: the
   * Title is still playing, and a window that would not open has cost nothing
   * else.
   */
  const pictureInPictureOffered = device.playbackTargets().pictureInPicture;
  const togglePictureInPicture = useCallback(() => {
    const element = video.current;
    if (element === null) return;
    setPictureInPictureRefused(false);
    setOptionsOpen(false);

    /*
     * `document.pictureInPictureElement` and the two methods are Chrome 69,
     * one version above this app's floor, so each is reached for only after
     * checking it is really there — the capability above says the device has
     * them, and this says so again where it would otherwise be a crash.
     */
    const leaving = 'pictureInPictureElement' in document
      && document.pictureInPictureElement !== null;
    const asked: unknown = leaving
      ? document.exitPictureInPicture()
      : element.requestPictureInPicture();

    if (!(asked instanceof Promise)) return;
    asked.then(
      () => setInPictureInPicture(!leaving),
      () => {
        if (!leaving) setPictureInPictureRefused(true);
      },
    );
  }, []);

  /**
   * The window can also be closed by the browser's own control, which is not
   * a press of ours — so the element's own events are what the button is kept
   * honest by rather than the promise above.
   */
  useEffect(() => {
    const element = video.current;
    if (element === null || !pictureInPictureOffered) return;
    const entered = (): void => setInPictureInPicture(true);
    const left = (): void => setInPictureInPicture(false);
    element.addEventListener('enterpictureinpicture', entered);
    element.addEventListener('leavepictureinpicture', left);
    return () => {
      element.removeEventListener('enterpictureinpicture', entered);
      element.removeEventListener('leavepictureinpicture', left);
    };
  }, [pictureInPictureOffered, plan]);

  /**
   * Cast (#33): sending the Title to a Chromecast, with this app as the
   * remote.
   *
   * **The press is the whole of the feature's cost.** `decisions.md` §8 says
   * Cast availability cannot be known without loading the SDK, so
   * `playbackTargets().cast` is the cheap gate that decides whether to draw a
   * control and this is the only thing that ever fetches anything — which
   * matters more here than for any other lazy load in the app, because the
   * script comes off `gstatic.com` and most Jellyfin Servers are on a LAN.
   *
   * The receiver application is the User's **own account's**, read through the
   * Playback Preferences provider that is already above the player, and
   * `castReceiverId` falls back to Jellyfin's published Stable id — which is
   * the ordinary case rather than an edge, because the Server seeds that list
   * in a migration most installs have not run.
   *
   * That account is read once at sign-in by a provider above the router, so it
   * has long since answered by the time a player exists and has a plan — this
   * never waits on it. A press that somehow beat the read would reach the
   * published receiver rather than the account's, which is what every
   * pre-migration Server gets anyway.
   *
   * **Then it hands over rather than playing in both places**, and that is the
   * half that keeps the fourth acceptance criterion honest. Jellyfin's
   * receiver is a Jellyfin client in its own right: handed the address, the
   * User and the token it signs in and reports progress itself. Two clients
   * reporting the same playback would leave the Server with two sessions and a
   * resume point belonging to whichever stopped last, so this device closes
   * its own session at the position the User reached and that position is
   * where the receiver picks the Title up.
   */
  const castOffered = device.playbackTargets().cast;
  const startCast = useCallback(async (): Promise<void> => {
    setOptionsOpen(false);
    setCastUnavailable(false);
    if (plan === undefined) return;

    const at = video.current?.currentTime ?? position;
    try {
      const sender = await device.loadCastSender({
        receiverId: castReceiverId(preferences.castReceiverId),
        namespace: JELLYFIN_CAST_NAMESPACE,
      });
      const session = await sender.connect();
      /*
       * **No session is a User who dismissed the picker**, which is a decision
       * and not a failure: nothing is said, because telling them something
       * went wrong would be telling them their own choice was an error.
       */
      if (session === undefined) return;

      /*
       * The Server's own id, asked for here rather than beside every playback:
       * it is one anonymous call, and only a User who presses Cast ever pays
       * for it. A Server that will not say leaves it empty — the receiver
       * signs in with the address and the token, which are the two it cannot
       * do without.
       */
      let serverId = '';
      try {
        serverId = (await gateway.getPublicSystemInfo()).Id ?? '';
      } catch {
        serverId = '';
      }

      await session.send(
        playNowMessage({
          itemId: plan.itemId,
          userId,
          deviceId: gateway.identity.deviceId,
          accessToken: gateway.identity.accessToken,
          serverAddress: gateway.serverAddress,
          serverId,
          startPositionTicks: ticksOfSeconds(at),
        }),
      );

      castSession.current = session;
      setCastingTo(session.receiverName);
      // The handover, after the receiver has taken it and never before: a
      // message that was refused leaves the Title playing here.
      playing.handOver();
    } catch {
      /*
       * One message for every cause — an SDK that would not load, a
       * `gstatic.com` the LAN cannot reach, a receiver that would not start,
       * a message it refused. It is said beside the picture, like every other
       * player failure: the Title is still playing here, and the press that
       * failed also closed the menu, so a message only the menu showed would
       * be a message nobody saw.
       */
      setCastUnavailable(true);
    }
  }, [device, gateway, plan, position, preferences.castReceiverId, userId]);

  /**
   * Stopping brings the Title back to this device, where it is paused and
   * where the User left it. Ending a cast is **not** closing the player, the
   * same way leaving a picture-in-picture window is not: the Title is still
   * what they are watching, and the controls are still theirs.
   */
  const stopCast = useCallback((): void => {
    setOptionsOpen(false);
    castSession.current?.end();
    castSession.current = undefined;
    setCastingTo(undefined);
  }, []);

  /**
   * **One button for both**, saying the opposite thing while a cast is
   * running — which is `enterPip`'s shape from #32 and is the same width
   * argument: the controls row and this menu have no space for a second
   * control that is only ever useful when the first one is not.
   */
  const toggleCast = useCallback((): void => {
    if (castingTo === undefined) void startCast();
    else stopCast();
  }, [castingTo, startCast, stopCast]);

  /**
   * A player that goes away while a cast is running ends the session with it.
   * Without this, Back out of the player would leave a receiver playing with
   * nothing driving it and no control anywhere in the app to stop it.
   */
  useEffect(
    () => () => {
      castSession.current?.end();
      castSession.current = undefined;
    },
    [],
  );

  /**
   * AirPlay (#33), which is the opposite shape to Cast in every respect worth
   * noting: no SDK, no protocol, no handover. Safari routes the element it is
   * already decoding, so this session keeps playing and keeps reporting — and
   * the app's only parts are knowing whether there is a target and asking for
   * the picker.
   */
  const airPlayOffered = device.playbackTargets().airPlay;
  useEffect(() => {
    const element = video.current;
    if (element === null || !airPlayOffered) return;
    const stop = watchAirPlayTargets(element, setAirPlayAvailable);
    return () => {
      stop();
    };
    // `plan` is in here for the reason the picture-in-picture listeners have
    // it: a re-negotiation attaches a new source, and a watch on the old one
    // is Safari holding a callback into a player that has moved on.
  }, [airPlayOffered, plan]);

  const showAirPlay = useCallback((): void => {
    setOptionsOpen(false);
    const element = video.current;
    if (element === null) return;
    showAirPlayPicker(element);
  }, []);

  /** Which skip is on the screen, if any: one reading of one moment. */
  const skip = skipOffered(markers, position);

  /**
   * Choosing the sound means asking the Server again, and that is not a
   * shortcut: a direct-played file is served with every track in it and a
   * browser gives no way to pick one, and a transcode carries only the track
   * the Server was told to use. So what is owed the User is their place, not
   * that nothing happened — the next negotiation starts from where they are.
   */
  const chooseAudio = useCallback(
    (index: number) => {
      if (index === audioIndex) return;
      setRestartTicks(ticksOfSeconds(video.current?.currentTime ?? position));
      setChosenAudio(index);
      setPickerOpen(false);
    },
    [audioIndex, position],
  );

  /**
   * Choosing the subtitles touches nothing but this app: a separate file, read
   * and drawn here, so the picture does not so much as flicker.
   *
   * **Except for the one track the Server has to draw** (#30). A VobSub or DVB
   * track — and a PGS one on a device that cannot decode it — is burned into
   * the picture, which is a different transcode, so that choice re-negotiates
   * like a change of sound and is owed the User's place in the same way.
   *
   * It is a **comparison of two burn-in states**, not a test of the new track
   * alone, because leaving one matters as much as entering it: the words stay
   * in the picture until a new stream replaces it, so turning subtitles off
   * while a track is baked in has to ask the Server again just as much as
   * turning them on did. Where neither the old nor the new choice is burned
   * in, nothing is negotiated and the picture does not move — which is still
   * every case this app had before this ticket.
   */
  const chooseSubtitle = useCallback(
    (index: number | undefined) => {
      setSubtitlesUnavailable(false);

      const chosenTrack =
        index === undefined
          ? undefined
          : plan?.tracks.subtitles.find((track) => track.index === index);
      const wantsBurnIn =
        chosenTrack !== undefined &&
        subtitlePresentationFor({
          track: chosenTrack,
          capabilities: device.subtitleCapabilities(),
        }).draw === 'burned-in';
      const nextBurnedIn = wantsBurnIn && index !== undefined ? index : undefined;

      if (nextBurnedIn !== burnedInIndex) {
        setRestartTicks(ticksOfSeconds(video.current?.currentTime ?? position));
        setBurnedInIndex(nextBurnedIn);
      }

      setChosenSubtitle(index === undefined ? 'off' : { index });
      setPickerOpen(false);
    },
    [plan, device, burnedInIndex, position],
  );

  /**
   * Shifting the subtitles (#28). It touches nothing but this state: the offset
   * is subtracted as a cue is chosen, so the picture does not move and the
   * Server is not asked anything.
   */
  const shiftSubtitles = (steps: number): void => {
    setOffsetSeconds((held) => shiftSubtitleOffset(held, steps));
  };

  /**
   * "Sync to this line" (story 100), worked out from the **element's** own
   * position rather than from `position`, which is the four-times-a-second
   * reading the seek bar draws with. A User presses this on hearing a line, so
   * a quarter of a second of staleness would be a quarter of a second of error
   * in the one number being measured.
   */
  const syncToLine = (): void => {
    const at = video.current?.currentTime ?? position;
    const synced = offsetToSyncToLine({ cues, position: at, offset: offsetSeconds });
    if (synced !== undefined) setOffsetSeconds(synced);
  };

  /**
   * Whether there is a line on the screen to sync to, which decides whether the
   * button can be pressed. It is read against `position` rather than the
   * element, because it is drawn and so can only be as fresh as a render.
   */
  const lineOnScreen =
    offsetToSyncToLine({ cues, position, offset: offsetSeconds }) !== undefined;

  /**
   * How many adjustments have finished. The panel reports each one — a button
   * or key let go, one press of Reset or Sync — and this is what the save
   * hangs off.
   *
   * A counter and an effect rather than saving inside the panel's callback,
   * and that is load-bearing rather than roundabout: a press that both shifts
   * the offset *and* finishes the adjustment sets two pieces of state in one
   * tick, so a callback reading `offsetSeconds` would read the value from
   * before its own press. The effect runs after the render that applied both,
   * so it sees the offset the User is looking at.
   */
  const [adjustments, setAdjustments] = useState(0);

  useEffect(() => {
    if (adjustments === 0 || subtitleFile === undefined) return;
    // `settings.change` shows it at once and writes behind it, one write at a
    // time; a write that will not land says so beside the settings screen
    // rather than costing the User their film.
    settings.change({
      subtitleOffsets: withSubtitleOffset(
        settings.settings.subtitleOffsets,
        subtitleFile,
        offsetSeconds,
      ),
    });
    // Only the count: the offset and the file are read as they are at that
    // moment, and a save is one adjustment finishing rather than a value
    // changing.
  }, [adjustments]);

  // Controls stay up while there is nothing to watch behind them: a paused
  // player, one still negotiating, or one with something to say.
  const controls = useIdleControls({
    active: true,
    // The picker keeps them up too: it is opened from a control, so the
    // controls hiding under it would take away the way back out.
    // So does an Episode that has run out (#31): there is nothing playing
    // behind them, and whether the next Episode was offered or cancelled, a
    // still frame with nothing to press and no sign there was anything is
    // exactly what this rule exists to prevent.
    keepVisible:
      paused ||
      plan === undefined ||
      problem !== undefined ||
      pickerOpen ||
      optionsOpen ||
      atTheEnd !== undefined,
  });

  usePlayerKeys({
    device,
    controlsVisible: controls.visible,
    reveal: controls.reveal,
    toggle: playing.toggle,
    seekBy: playing.seekBy,
    close: onClose,
    listening: attempt !== undefined,
  });

  return (
    <section class="player" aria-label={t('player.label', { name: titleName })}>
      {/*
        `playsinline` so a phone does not take the video full-screen out of the
        app, and `preload="auto"` because the User has already said Play.
        No `controls`: the controls are ours, so one set serves a remote too.
      */}
      <video class="player__video" ref={video} playsinline preload="auto" />

      {/*
        The subtitles the app draws itself (#27), as a sibling of the `<video>`
        inside the player rather than inside the element: the player is what
        goes full-screen, and an overlay outside it would vanish the moment it
        did (`player-subtitles.md` §6c pitfall 3).
      */}
      {plan !== undefined && draw === 'styled' && subtitleTrack !== undefined ? (
        /*
          Styled subtitles (#29), drawn by libass on its own canvas in the same
          grid cell. It is the alternative to the overlay below rather than an
          addition to it: both drawing at once would be every line twice.
        */
        <StyledSubtitles
          device={device}
          gateway={gateway}
          itemId={plan.itemId}
          mediaSourceId={plan.mediaSourceId}
          track={subtitleTrack}
          fonts={plan.fonts}
          offsetSeconds={offsetSeconds}
          onCues={setCues}
          video={video}
          onUnavailable={() => setSubtitlesUnavailable(true)}
          onUnsupported={() => setStyledUnsupported(true)}
        />
      ) : plan !== undefined && draw === 'image' && subtitleTrack !== undefined ? (
        /*
          Image subtitles (#30), decoded by libpgs onto its own canvas in the
          same grid cell. Like the styled one it is the alternative to the
          overlay below rather than an addition to it — and unlike it, there
          is no `onCues`: a bitmap has no line for "Sync to this line" to find.
        */
        <ImageSubtitles
          device={device}
          gateway={gateway}
          itemId={plan.itemId}
          mediaSourceId={plan.mediaSourceId}
          track={subtitleTrack}
          offsetSeconds={offsetSeconds}
          video={video}
          onUnavailable={() => setSubtitlesUnavailable(true)}
        />
      ) : plan !== undefined ? (
        /*
          The overlay this app draws itself (#27), and the fallback for
          everything the two canvases above do not take. No track reaches it
          unless it is the thing drawing that track: `burned-in` joins `none`
          in being left out (#30), because the words are already in the picture
          and fetching anything would ask the Server for a file that does not
          exist — and draw a second copy of the subtitles if it did.
        */
        <Subtitles
          gateway={gateway}
          itemId={plan.itemId}
          mediaSourceId={plan.mediaSourceId}
          {...(subtitleTrack === undefined || draw === 'none' || draw === 'burned-in'
            ? {}
            : { track: subtitleTrack })}
          {...(presentation === undefined ? {} : { format: presentation.format })}
          offsetSeconds={offsetSeconds}
          onCues={setCues}
          video={video}
          onUnavailable={() => setSubtitlesUnavailable(true)}
        />
      ) : null}

      {attempt === undefined && !failed ? <p class="notice">{t('player.starting')}</p> : null}

      {/*
        What went wrong, and what to do about it. A Server that would not answer
        is worth asking again; a Server that answered "there is no way to play
        this" is a healthy Server saying no, and asking it twice would get the
        same answer, so Back is the only honest offer.
      */}
      {problem !== undefined ? (
        <div class="player__problem">
          <p class="notice notice--problem" role="alert">
            {t(problem.message)}
          </p>
          {problem.retryable ? (
            <p class="player__buttons">
              <button type="button" class="button button--primary" onClick={retry}>
                {t('player.retry')}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {/*
        A Server that will not record progress has not cost the User their film,
        so this is said beside the picture rather than instead of it.
      */}
      {unreported ? (
        <p class="notice notice--problem" role="alert">
          {t('player.unreported')}
        </p>
      ) : null}

      {/*
        Subtitles the Server would not hand over, said the same way and for the
        same reason: the Title is still playing, so this goes beside the picture
        rather than instead of it. It is **here** rather than only in the picker
        because the press that failed also closes the picker — a message only
        the menu showed would be a message nobody ever saw.
      */}
      {subtitlesUnavailable ? (
        <p class="notice notice--problem" role="alert">
          {t('player.subtitlesUnavailable')}
        </p>
      ) : null}

      {/*
        A picture-in-picture window the browser would not open (#32,
        story 92), said beside the picture for the same reason: the Title is
        still playing, and the press that failed also closed the menu, so a
        message only the menu showed would be a message nobody saw.
      */}
      {pictureInPictureRefused ? (
        <p class="notice notice--problem" role="alert">
          {t('player.pictureInPictureRefused')}
        </p>
      ) : null}

      {/*
        Where the Title went (#33). The press that started the cast was inside
        a menu that closed behind it, so this is the only thing on the screen
        that says a Chromecast is playing — and it is a plain notice rather
        than a problem, because nothing has gone wrong.
      */}
      {castingTo === undefined ? null : (
        <p class="notice" role="status">
          {t('player.castingTo', { name: castingTo })}
        </p>
      )}

      {/*
        A cast that could not happen, said beside the picture for the reason
        every other player failure is: the Title is still playing here, and
        the press that failed also closed the menu.
      */}
      {castUnavailable ? (
        <p class="notice notice--problem" role="alert">
          {t('player.castUnavailable')}
        </p>
      ) : null}

      {/*
        Skip Intro and Skip Credits (#31). Deliberately **outside** the controls
        and drawn whenever the Server says there is a marker here: the controls
        get out of the way after a few seconds, and an offer good only for the
        length of an intro cannot be one a User has to summon them to find. It
        is gone once the Episode has run out, because the offer below is what
        that moment is for.
      */}
      {skip === undefined || atTheEnd !== undefined ? null : (
        <SkipButton offer={skip} titleName={titleName} onSkip={playing.seekTo} />
      )}

      {/*
        The next Episode (#31). Its countdown follows this User's own Jellyfin
        account, and cancelling leaves the player where it is — see
        `next-episode.tsx`.
      */}
      {atTheEnd === undefined || atTheEnd === 'nothing' ? null : (
        <NextEpisodeOffer
          name={atTheEnd.name}
          autoPlay={preferences.nextEpisodeAutoPlay}
          onPlay={() => {
            onPlayNext?.(atTheEnd);
          }}
          onCancel={() => setAtTheEnd('nothing')}
        />
      )}

      {/*
        Hidden rather than faded: a control a User cannot see is a control the
        arrow keys must not reach and a screen reader must not read, and both of
        those are true of nothing at all and not true of something transparent.
      */}
      {controls.visible ? (
        <PlayerControls
          titleName={titleName}
          paused={paused}
          position={position}
          {...(duration === undefined ? {} : { duration })}
          ready={plan !== undefined}
          onToggle={playing.toggle}
          onSeek={playing.seekTo}
          onClose={onClose}
          {...(plan === undefined || !hasAnyTrack(plan)
            ? {}
            : { onOpenTracks: () => setPickerOpen(true) })}
          onOpenOptions={() => setOptionsOpen(true)}
          {...(previewResolution === undefined || plan === undefined
            ? {}
            : {
                preview: {
                  resolution: previewResolution,
                  tileUrl: (tileIndex: number) =>
                    gateway.trickplayTileUrl({
                      itemId: plan.itemId,
                      mediaSourceId: plan.mediaSourceId,
                      width: previewResolution.width,
                      tileIndex,
                    }),
                },
              })}
        />
      ) : null}

      {/*
        The menu, over the controls. It claims Back on top of the player's own
        claim, so Back closes it and leaves the Title playing — see the note at
        the top of this file about the claim stack.
      */}
      {pickerOpen && plan !== undefined ? (
        <TrackPicker
          tracks={plan.tracks}
          {...(audioIndex === undefined ? {} : { audioIndex })}
          {...(subtitleIndex === undefined ? {} : { subtitleIndex })}
          subtitlesUnavailable={subtitlesUnavailable}
          onChooseAudio={chooseAudio}
          onChooseSubtitle={chooseSubtitle}
          {...(subtitleFile === undefined
            ? {}
            : {
                onOpenTiming: () => {
                  setPickerOpen(false);
                  setTimingOpen(true);
                },
              })}
          /*
            #30. The panel is disabled rather than hidden, and this is the one
            place that knows: the picker is handed how the chosen track is
            being drawn, not asked to work it out from the track itself, since
            the same PGS track is shiftable on one device and baked in on the
            next.
          */
          subtitlesBurnedIn={draw === 'burned-in'}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      {/*
        The speed, the quality and picture-in-picture (#32). Like the track
        picker it claims Back on top of the player's own claim, so Back closes
        it and leaves the Title playing.
      */}
      {optionsOpen ? (
        <PlaybackOptions
          speed={speed}
          onChooseSpeed={(rate) => {
            setSpeed(clampSpeed(rate));
            setOptionsOpen(false);
          }}
          {...(maxBitrate === undefined ? {} : { maxBitrate })}
          onChooseQuality={chooseQuality}
          {...(pictureInPictureOffered
            ? { onPictureInPicture: togglePictureInPicture, inPictureInPicture }
            : {})}
          {...(castOffered ? { onCast: toggleCast, ...(castingTo === undefined ? {} : { castingTo }) } : {})}
          {...(airPlayOffered && airPlayAvailable ? { onAirPlay: showAirPlay } : {})}
          onClose={() => setOptionsOpen(false)}
        />
      ) : null}

      {/*
        The Subtitle timing panel (#28). It is drawn over the picture rather
        than over the controls, anchored to the top so it covers neither the
        subtitle line nor the controls (story 101) — and nothing in it touches
        the media element, so the Title keeps playing (story 96).
      */}
      {timingOpen && subtitleFile !== undefined ? (
        <SubtitleTiming
          offsetSeconds={offsetSeconds}
          device={device}
          onShift={shiftSubtitles}
          onReset={() => setOffsetSeconds(0)}
          {...(lineOnScreen ? { onSyncToLine: syncToLine } : {})}
          onSettled={() => setAdjustments((made) => made + 1)}
          onClose={() => setTimingOpen(false)}
        />
      ) : null}
    </section>
  );
}

/**
 * Which subtitles are being drawn, which is three states rather than two: the
 * User has not chosen, so the Server's choice stands; the User has turned them
 * off, which is a choice and not the absence of one; or the User picked a
 * track. Collapsing the first two would make a Title whose account says
 * "always" un-turn-off-able, because the Server's choice would come back.
 */
type ChosenSubtitle = 'from-the-server' | 'off' | { index: number };

/** Whether there is anything to choose between, which decides if the control is drawn. */
function hasAnyTrack(plan: PlaybackPlan): boolean {
  return plan.tracks.audio.length > 1 || plan.tracks.subtitles.length > 0;
}

/** Which message to show, and whether asking again could change the answer. */
function problemOf(
  attempt: PlaybackAttempt | undefined,
  failed: boolean,
): { message: 'player.cannotPlay' | 'player.unavailable' | 'player.failed'; retryable: boolean } | undefined {
  if (failed) return { message: 'player.failed', retryable: true };
  if (attempt?.outcome === 'cannot-play') return { message: 'player.cannotPlay', retryable: false };
  if (attempt?.outcome === 'unavailable') return { message: 'player.unavailable', retryable: true };
  return undefined;
}

/**
 * The media element and the Server, kept in step: the source attached, the
 * resume point seeked to, the reports sent, and everything let go of on the way
 * out.
 *
 * One effect, deliberately. Attaching a source, opening a play session and
 * starting a ping are one thing with one undoing — a second effect could tear
 * one half down while the other half was still running, and the thing left
 * running would be a transcode on the Server with nobody watching it.
 */
function usePlayback(options: {
  video: { current: HTMLVideoElement | null };
  gateway: JellyfinGateway;
  device: DeviceLayer;
  plan: PlaybackPlan | undefined;
  /** The length the controls are drawing against, so a seek can be clamped. */
  duration: number | undefined;
  /**
   * The tracks playing now (#27), which the reports carry. The sound cannot
   * change without a new plan; the subtitles can, and do so without one.
   */
  audioIndex: number | undefined;
  subtitleIndex: number | undefined;
  onPausedChange: (paused: boolean) => void;
  onPositionChange: (seconds: number) => void;
  onDurationChange: (seconds: number | undefined) => void;
  onFailure: () => void;
  onUnreported: () => void;
  onEnded: () => void;
}): {
  toggle: () => void;
  seekTo: (seconds: number) => void;
  seekBy: (seconds: number) => void;
  handOver: () => void;
} {
  const { plan } = options;
  // The newest callbacks, so nothing below calls a stale one and the effect
  // does not re-run because a parent re-rendered.
  const latest = useRef(options);
  latest.current = options;

  const reporter = useRef<PlaybackReporter | undefined>(undefined);
  /** The last position seen, so the stop report is where it really stopped. */
  const position = useRef(0);

  useEffect(() => {
    const element = latest.current.video.current;
    if (plan === undefined || element === null) return;

    let detached = false;
    let attached: AttachedSource | undefined;
    const sending = createPlaybackReporter(latest.current.gateway, plan, {
      now: () => latest.current.device.now(),
      // Read through `latest` on every report, so a subtitle the User switched
      // to a moment ago is what the Server is told about.
      tracks: () => ({
        ...(latest.current.audioIndex === undefined
          ? {}
          : { audioStreamIndex: latest.current.audioIndex }),
        ...(latest.current.subtitleIndex === undefined
          ? {}
          : { subtitleStreamIndex: latest.current.subtitleIndex }),
      }),
    });
    reporter.current = sending;
    position.current = secondsOfTicks(plan.startTicks);

    /** Reports, then says so if the Server would not take it. */
    const report = (sent: Promise<void>): void => {
      void sent.then(() => {
        if (sending.unreported()) latest.current.onUnreported();
      });
    };

    const onTimeUpdate = (): void => {
      position.current = element.currentTime;
      latest.current.onPositionChange(element.currentTime);
      report(sending.moved(element.currentTime, element.paused));
    };
    const onPlaybackState = (): void => {
      latest.current.onPausedChange(element.paused);
      report(sending.moved(element.currentTime, element.paused));
    };
    // The element's own length wins once it has one: it is the file in front of
    // the User, where the Server's `RunTimeTicks` is what its library says.
    const onDurationChange = (): void => {
      const length = element.duration;
      if (Number.isFinite(length) && length > 0) latest.current.onDurationChange(length);
    };
    const onEnded = (): void => {
      report(sending.stopped(element.currentTime));
      latest.current.onEnded();
    };
    const onError = (): void => {
      report(sending.stopped(position.current, true));
      latest.current.onFailure();
    };

    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('seeked', onTimeUpdate);
    element.addEventListener('play', onPlaybackState);
    element.addEventListener('pause', onPlaybackState);
    element.addEventListener('durationchange', onDurationChange);
    element.addEventListener('loadedmetadata', onDurationChange);
    element.addEventListener('ended', onEnded);
    element.addEventListener('error', onError);

    // Keeps a transcode alive while a paused player sends no progress at all.
    const ping = window.setInterval(() => {
      report(sending.ping());
    }, PING_INTERVAL_MS);

    void attachPlaybackSource(element, plan, {
      capabilities: latest.current.device.videoCapabilities(),
    }).then((source) => {
      if (detached) {
        source.detach();
        return;
      }
      attached = source;
      // A direct-played file is seeked by the player; a transcode was already
      // cut from the resume point by the Server, so seeking it again would ask
      // for segments before the start of the stream.
      if (plan.delivery === 'file' && plan.startTicks > 0) {
        element.currentTime = secondsOfTicks(plan.startTicks);
      }
      report(sending.started(element.currentTime));
      // A browser may refuse to start without a gesture; the User pressed Play,
      // so this is a refusal worth showing rather than swallowing.
      const started: unknown = element.play();
      if (started instanceof Promise) {
        started.then(
          () => undefined,
          () => {
            latest.current.onPausedChange(true);
          },
        );
      }
      latest.current.onPausedChange(element.paused);
      latest.current.onPositionChange(element.currentTime);
    });

    return () => {
      detached = true;
      window.clearInterval(ping);
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('seeked', onTimeUpdate);
      element.removeEventListener('play', onPlaybackState);
      element.removeEventListener('pause', onPlaybackState);
      element.removeEventListener('durationchange', onDurationChange);
      element.removeEventListener('loadedmetadata', onDurationChange);
      element.removeEventListener('ended', onEnded);
      element.removeEventListener('error', onError);
      // The stop report goes before the source is let go of, so the Server has
      // the position the User really reached — this is the resume point.
      void sending.stopped(position.current);
      element.pause();
      attached?.detach();
      reporter.current = undefined;
    };
    // `plan` is the whole of what this effect is about; the callbacks are read
    // through `latest` so a parent re-render never tears a session down.
  }, [plan]);

  /**
   * Where a seek ends up, and the one path every seek takes — the bar, the
   * arrow keys and a remote's Fast Forward alike. The element fires `seeked`
   * for this in a browser, and the position is pushed on here as well because
   * happy-dom does not and because a seek should be on the screen before the
   * next frame rather than after the next event.
   */
  const seekTo = (seconds: number): void => {
    const element = options.video.current;
    if (element === null || options.plan === undefined) return;
    const to = clampPosition(seconds, options.duration);
    element.currentTime = to;
    position.current = to;
    options.onPositionChange(to);
    const sending = reporter.current;
    if (sending === undefined) return;
    void sending.moved(to, element.paused).then(() => {
      if (sending.unreported()) options.onUnreported();
    });
  };

  return {
    toggle: () => {
      const element = options.video.current;
      if (element === null) return;
      if (element.paused) {
        const started: unknown = element.play();
        if (started instanceof Promise) started.then(() => undefined, () => undefined);
      } else {
        element.pause();
      }
      // happy-dom and every browser fire `play`/`pause` for this, which is what
      // reports it; this only keeps the button honest if one of them does not.
      options.onPausedChange(element.paused);
    },
    seekTo,
    seekBy: (seconds: number) => {
      const element = options.video.current;
      if (element === null) return;
      seekTo(element.currentTime + seconds);
    },

    /**
     * Give this playback up to something else that will report it (#33).
     *
     * **The one case is Cast**, and it is a stop rather than a pause because
     * of what is on the other end: Jellyfin's Chromecast receiver signs in to
     * the Server and opens a session of its own, so leaving this one alive
     * would give the Server two sessions for one Title and a resume point
     * belonging to whichever stopped last.
     *
     * The picture is paused as well, because a User watching a television is
     * not also watching their laptop — and because a `<video>` left running
     * would go on decoding a stream nobody is looking at.
     *
     * `stopped` is once-only by design (see `reporting.ts`), so the effect
     * cleanup that reports the stop when the player closes becomes a no-op
     * after this: handing over cannot be reported twice.
     */
    handOver: () => {
      const element = options.video.current;
      const at = element?.currentTime ?? position.current;
      element?.pause();
      const sending = reporter.current;
      if (sending === undefined) return;
      void sending.stopped(at).then(() => {
        if (sending.unreported()) options.onUnreported();
      });
    },
  };
}

/**
 * The keys the player answers, and the only listener in the app taken **before**
 * the navigator's: it is on `window` in the capture phase, so an arrow key can
 * be a seek or a "show me the controls" rather than a move of focus.
 *
 * Which it is depends on one thing, and that is what makes it predictable:
 *
 * - **With the controls hidden**, the picture is all there is, so the first
 *   press of anything is "show me the controls" and nothing else. A User
 *   reaching for a remote in the dark has not asked to seek, and focus moving
 *   under hidden controls would leave them pressing something they cannot see.
 * - **With the controls up**, the arrow keys are the navigator's and move
 *   between the controls, except on the seek bar itself, where they are what a
 *   slider's arrow keys are everywhere: a step along it.
 * - **A remote's own Rewind and Fast Forward are always a seek**, wherever
 *   focus is. They mean one thing and there is nothing else they could mean.
 *
 * The media keys are a listener of this app's rather than something taken off
 * the navigator, because Play, Pause, PlayPause and Stop are not keys it owns.
 * #7's rule about leaving a focused control's own keys alone does **not** apply
 * to them, and an earlier version of this that applied it anyway was broken:
 * the browser activates a focused button on Enter and Space and on nothing
 * else, so a remote's Play key is never a button activation. There is no
 * double-press to avoid, so there is nothing to guard against.
 */
function usePlayerKeys(options: {
  device: DeviceLayer;
  controlsVisible: boolean;
  reveal: () => void;
  toggle: () => void;
  seekBy: (seconds: number) => void;
  close: () => void;
  listening: boolean;
}): void {
  const { device, listening } = options;
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const { controlsVisible, reveal, toggle, seekBy, close } = latest.current;
      const key = device.keyFor(event);
      // Any key at all says the User is there, and this is the only place a
      // key reveals the controls — see the note in `controls-visibility.ts`.
      // `controlsVisible` is still what it was *before* this press, which is
      // what the arrow keys below are decided against.
      reveal();
      /**
       * Takes the key off the navigator, which listens on the way back up and
       * leaves a key whose default has been prevented alone. Capture plus
       * `preventDefault` rather than `stopPropagation`, which does not reach a
       * listener on `window` itself: that is what the navigator's guard is for.
       */
      const take = (): void => {
        event.preventDefault();
      };

      switch (key) {
        case 'Play':
        case 'Pause':
        case 'PlayPause':
          take();
          toggle();
          return;
        case 'Stop':
          take();
          close();
          return;
        case 'FastForward':
          take();
          seekBy(SEEK_STEP_SECONDS);
          return;
        case 'Rewind':
          take();
          seekBy(-SEEK_STEP_SECONDS);
          return;
        case 'Left':
        case 'Right':
        case 'Up':
        case 'Down':
        case 'Enter': {
          if (!controlsVisible) {
            // The press was "show me the controls" — which the `reveal` above
            // has done — and nothing else. Taking it is what stops it also
            // being a move of focus, or a press of something hidden.
            take();
            return;
          }
          if (!onSeekBar(event.target)) return;
          // The bar is a focus stop rather than a button, so Enter on it is
          // the navigator's `pressFocusedItem` — which would click it, and a
          // click that came from a key is at (0, 0): the very start of the
          // bar. Enter here is play/pause, which is what OK on a scrubber is
          // everywhere, and taking it is what stops it being that click.
          if (key === 'Enter') {
            take();
            toggle();
            return;
          }
          if (key !== 'Left' && key !== 'Right') return;
          take();
          seekBy(key === 'Right' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
          return;
        }
        default:
          return;
      }
    };
    // Capture, so the navigator's own listener never sees a key this takes.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [device, listening]);
}

/** Whether the key arrived on the seek bar, which owns Left and Right. */
function onSeekBar(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.hasAttribute(SEEK_BAR_ATTRIBUTE);
}

function ticksIf(resumeTicks: number | undefined): { resumeTicks?: number } {
  return resumeTicks === undefined || resumeTicks <= 0 ? {} : { resumeTicks };
}
