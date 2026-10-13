import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';

/**
 * What the player offers when an Episode runs out (#31, stories 88 and 89).
 *
 * **Which Episode** that is belongs to `src/title/play-target.ts`, beside what
 * pressing Play means: a Series holds no file, and "what comes after this
 * Episode" is the same class of rule as "which Episode does Play start". This
 * file is only what a User sees of it, and the second between each tick.
 *
 * Two offers rather than one, and which they get follows their **Jellyfin
 * account** — `EnableNextEpisodeAutoPlay`, read through
 * `usePlaybackPreferences()`, which #35 already wired to the Server and left
 * waiting for exactly this. The two readings are the two the settings screen
 * already promised:
 *
 * - **"Start the next one"**: a countdown, which a press can cut short and a
 *   press can cancel.
 * - **"Ask me each time"**: the same offer with nothing counting. A User who
 *   asked to be asked is asked, and a countdown would be this app deciding on
 *   their behalf after they had said not to.
 *
 * **Cancelling stays at the end** rather than closing the player. They said
 * "not the next one", which is not "take me out of here" — the Episode is over,
 * the controls are up because there is nothing playing behind them, and the
 * title page is one press of Close or Back away.
 */

/**
 * How long the countdown runs.
 *
 * Ten seconds is the figure every big streaming app lands near, and the reason
 * is the same one here: long enough to read whose Episode is next and reach for
 * a remote, short enough that a household not watching any more is not sat in
 * front of a countdown. Nothing on the Server says anything about it — Jellyfin
 * stores whether to autoplay and not how long to wait — so this is Jellyflick's
 * own, like Quick Connect's deadline (`decisions.md` §11).
 */
export const NEXT_EPISODE_COUNTDOWN_SECONDS = 10;

export type NextEpisodeOfferProps = {
  /** What the next Episode is called, which names both buttons. */
  name: string;
  /**
   * Whether to count down, from the User's Jellyfin account. False asks and
   * waits instead.
   */
  autoPlay: boolean;
  /** Start it now: the countdown running out, or the User pressing. */
  onPlay: () => void;
  /** Story 89: stop offering, and stay at the end of what just finished. */
  onCancel: () => void;
};

export function NextEpisodeOffer({ name, autoPlay, onPlay, onCancel }: NextEpisodeOfferProps) {
  const t = useTranslate();
  const panel = useRef<HTMLDivElement | null>(null);
  const remaining = useCountdown(autoPlay, onPlay);

  /**
   * Focus comes in with the offer, for the reason the track picker's own note
   * gives: the controls this is drawn over may be where focus is, and a User
   * with a remote has about ten seconds to reach two new buttons. A layout
   * effect, so no frame goes by with the offer drawn and focus behind it.
   */
  useLayoutEffect(() => {
    const first = panel.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
  }, []);

  return (
    <div
      class="player__next"
      role="region"
      aria-label={t('player.nextUpLabel')}
      ref={panel}
    >
      <p class="player__next-name">{t('player.nextUp', { name })}</p>
      {/*
        The readout is `aria-live` so a remote User hears it change without
        having to find it, and `polite` so it waits for whatever is being read
        rather than cutting across the Episode's name above it.
      */}
      {remaining === undefined ? null : (
        <p class="player__next-countdown" aria-live="polite">
          {t('player.nextUpCountdown', { seconds: remaining })}
        </p>
      )}
      <p class="player__buttons">
        <button
          type="button"
          class="button button--primary"
          aria-label={t('player.playNowFor', { name })}
          onClick={onPlay}
        >
          {t('player.playNow')}
        </button>
        <button
          type="button"
          class="button button--quiet"
          aria-label={t('player.cancelNextFor', { name })}
          onClick={onCancel}
        >
          {t('player.cancelNext')}
        </button>
      </p>
    </div>
  );
}

/**
 * The seconds left, or `undefined` where nothing is counting.
 *
 * One interval, and it is the player's second: the reporter deliberately has
 * none (`architecture.md`) because it has the video's own events to go on, and
 * a countdown has nothing else — there is no picture moving to read a clock
 * off. It ticks a whole second at a time, which is what the readout says, so
 * there is no sub-second state nobody can see.
 *
 * `onPlay` is read through a ref rather than being a dependency: a parent
 * re-render must not start the ten seconds again.
 */
function useCountdown(running: boolean, onPlay: () => void): number | undefined {
  const [remaining, setRemaining] = useState(NEXT_EPISODE_COUNTDOWN_SECONDS);
  const play = useRef(onPlay);
  play.current = onPlay;

  useEffect(() => {
    if (!running) return;
    const ticking = window.setInterval(() => {
      setRemaining((left) => {
        if (left > 1) return left - 1;
        // The last tick: stop, and start the Episode. Clearing here rather
        // than waiting for the next render is what stops a second call.
        window.clearInterval(ticking);
        play.current();
        return 0;
      });
    }, 1000);
    return () => {
      window.clearInterval(ticking);
    };
  }, [running]);

  return running ? remaining : undefined;
}
