import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { useBackClaim } from '../shell/back';
import { useIdleControls } from './controls-visibility';
import { PlayerControls, SEEK_BAR_ATTRIBUTE } from './player-controls';
import { planPlayback, type PlaybackAttempt, type PlaybackPlan } from './planning';
import {
  createPlaybackReporter,
  PING_INTERVAL_MS,
  secondsOfTicks,
  type PlaybackReporter,
} from './reporting';
import { clampPosition, SEEK_STEP_SECONDS } from './scrubbing';
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
  onClose: () => void;
};

export function Player({
  gateway,
  device,
  userId,
  itemId,
  titleName,
  resumeTicks,
  onClose,
}: PlayerProps) {
  const t = useTranslate();
  const video = useRef<HTMLVideoElement | null>(null);
  const [attempt, setAttempt] = useState<PlaybackAttempt | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unreported, setUnreported] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  /** Bumped by Retry: it is the whole of what asking again means. */
  const [attemptNumber, setAttemptNumber] = useState(0);

  // Back closes the player, through the one Back handler rather than a key
  // listener of this screen's own. A layout effect, which is why #8 made it one.
  useBackClaim(true, onClose);

  const plan = attempt?.outcome === 'play' ? attempt.plan : undefined;
  const problem = problemOf(attempt, failed);
  const playing = usePlayback({
    video,
    gateway,
    device,
    plan,
    duration,
    onPausedChange: setPaused,
    onPositionChange: setPosition,
    onDurationChange: setDuration,
    onFailure: () => setFailed(true),
    onUnreported: () => setUnreported(true),
    onEnded: onClose,
  });

  // Ask the Server how to play it. Once per (Title, Server, resume point), and
  // again whenever Retry asks.
  useEffect(() => {
    let abandoned = false;
    setAttempt(undefined);
    void planPlayback(gateway, { itemId, userId, device, ...ticksIf(resumeTicks) }).then(
      (planned) => {
        if (abandoned) return;
        setAttempt(planned);
        setPosition(planned.outcome === 'play' ? secondsOfTicks(planned.plan.startTicks) : 0);
        setDuration(
          planned.outcome === 'play' ? secondsOfTicks(planned.plan.runtimeTicks ?? 0) || undefined : undefined,
        );
      },
    );
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, itemId, userId, device, resumeTicks, attemptNumber]);

  const retry = useCallback(() => {
    setFailed(false);
    setUnreported(false);
    setAttemptNumber((number) => number + 1);
  }, []);

  // Controls stay up while there is nothing to watch behind them: a paused
  // player, one still negotiating, or one with something to say.
  const controls = useIdleControls({
    active: true,
    keepVisible: paused || plan === undefined || problem !== undefined,
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
        />
      ) : null}
    </section>
  );
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
  onPausedChange: (paused: boolean) => void;
  onPositionChange: (seconds: number) => void;
  onDurationChange: (seconds: number | undefined) => void;
  onFailure: () => void;
  onUnreported: () => void;
  onEnded: () => void;
}): { toggle: () => void; seekTo: (seconds: number) => void; seekBy: (seconds: number) => void } {
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
          if (!onSeekBar(event.target) || (key !== 'Left' && key !== 'Right')) return;
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
