import { useEffect, useRef, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { useBackClaim } from '../shell/back';
import { planPlayback, type PlaybackAttempt, type PlaybackPlan } from './planning';
import {
  createPlaybackReporter,
  PING_INTERVAL_MS,
  secondsOfTicks,
  type PlaybackReporter,
} from './reporting';
import { attachPlaybackSource, type AttachedSource } from './video-source';

/**
 * The player (#25): what Play on a title page opens.
 *
 * It is **an overlay, not an address**, and that is the same call the User
 * Picker made. A player is not a place a User navigated to — it is something
 * over the Title they were looking at — and an address for it would put a
 * history entry between the two, so Back out of the player would have to mean
 * something different from Back everywhere else in this app. Instead it claims
 * Back through `useBackClaim`, which is the one Back handler's own extension
 * point: Back closes the player and the title page is still there behind it.
 *
 * Being `position: fixed` is load-bearing rather than a look. `src/navigation/`
 * tries the page's own flow before anything fixed, and *from* inside something
 * fixed the fixed thing is the flow, so the arrow keys stay among the player's
 * own controls with **no focus-trapping code here at all**. #7 arranged that
 * rule and #17's pop-up already relies on it.
 *
 * What is deliberately *not* here, because it is #26's: a seek bar, the times,
 * controls that auto-hide, retry, and anything that needs the arrow keys. This
 * is play, pause, close, and telling the Server — the smallest player that is
 * honestly usable, and the one every later playback ticket builds on.
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

  // Back closes the player, through the one Back handler rather than a key
  // listener of this screen's own. A layout effect, which is why #8 made it one.
  useBackClaim(true, onClose);

  const plan = attempt?.outcome === 'play' ? attempt.plan : undefined;
  const playing = usePlayback({
    video,
    gateway,
    device,
    plan,
    onPausedChange: setPaused,
    onFailure: () => setFailed(true),
    onUnreported: () => setUnreported(true),
    onEnded: onClose,
  });

  // Ask the Server how to play it. Once per (Title, Server, resume point).
  useEffect(() => {
    let abandoned = false;
    setAttempt(undefined);
    void planPlayback(gateway, { itemId, userId, device, ...ticksIf(resumeTicks) }).then(
      (planned) => {
        if (abandoned) return;
        setAttempt(planned);
      },
    );
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, itemId, userId, device, resumeTicks]);

  usePlaybackKeys(device, playing.toggle, onClose, attempt !== undefined);

  return (
    <section class="player" aria-label={t('player.label', { name: titleName })}>
      {/*
        `playsinline` so a phone does not take the video full-screen out of the
        app, and `preload="auto"` because the User has already said Play.
        No `controls`: the controls are ours, so one set serves a remote too.
      */}
      <video class="player__video" ref={video} playsinline preload="auto" />

      <p class="player__controls">
        <button
          type="button"
          class="button button--primary"
          disabled={plan === undefined}
          onClick={playing.toggle}
        >
          {paused ? t('player.play', { name: titleName }) : t('player.pause', { name: titleName })}
        </button>
        <button type="button" class="button button--quiet" onClick={onClose}>
          {t('player.close')}
        </button>
      </p>

      {attempt === undefined ? <p class="notice">{t('player.starting')}</p> : null}
      {attempt?.outcome === 'cannot-play' ? (
        <p class="notice notice--problem" role="alert">
          {t('player.cannotPlay')}
        </p>
      ) : null}
      {attempt?.outcome === 'unavailable' ? (
        <p class="notice notice--problem" role="alert">
          {t('player.unavailable')}
        </p>
      ) : null}
      {failed ? (
        <p class="notice notice--problem" role="alert">
          {t('player.failed')}
        </p>
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
    </section>
  );
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
  onPausedChange: (paused: boolean) => void;
  onFailure: () => void;
  onUnreported: () => void;
  onEnded: () => void;
}): { toggle: () => void } {
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
      report(sending.moved(element.currentTime, element.paused));
    };
    const onPlaybackState = (): void => {
      latest.current.onPausedChange(element.paused);
      report(sending.moved(element.currentTime, element.paused));
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
    element.addEventListener('play', onPlaybackState);
    element.addEventListener('pause', onPlaybackState);
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
    });

    return () => {
      detached = true;
      window.clearInterval(ping);
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('play', onPlaybackState);
      element.removeEventListener('pause', onPlaybackState);
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
  };
}

/**
 * The remote's media keys. Play, Pause, PlayPause and Stop are **not** keys the
 * navigator owns — it owns Up, Down, Left, Right and Enter — so this is a
 * listener of its own rather than something taken off it, and nothing about
 * moving around the player changes. The arrow keys are #26's, and that ticket
 * takes them *before* the navigator, as `architecture.md` says.
 *
 * #7's rule about leaving a focused control's own keys alone does **not** apply
 * here, and an earlier version of this that applied it anyway was broken: the
 * browser activates a focused button on Enter and Space, and on nothing else.
 * A remote's Play key is never a button activation, so skipping these keys
 * whenever focus happened to be on a control meant skipping them almost always
 * — focus is still on the title page's Play button when the player opens, and
 * every control the player offers is a button too. There is no double-press to
 * avoid, so there is nothing to guard against.
 */
function usePlaybackKeys(
  device: DeviceLayer,
  toggle: () => void,
  close: () => void,
  listening: boolean,
): void {
  const latest = useRef({ toggle, close });
  latest.current = { toggle, close };

  useEffect(() => {
    if (!listening) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      switch (device.keyFor(event)) {
        case 'Play':
        case 'Pause':
        case 'PlayPause':
          event.preventDefault();
          latest.current.toggle();
          return;
        case 'Stop':
          event.preventDefault();
          latest.current.close();
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [device, listening]);
}

function ticksIf(resumeTicks: number | undefined): { resumeTicks?: number } {
  return resumeTicks === undefined || resumeTicks <= 0 ? {} : { resumeTicks };
}
