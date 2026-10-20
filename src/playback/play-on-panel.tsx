import { useLayoutEffect, useRef } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import { useBackClaim } from '../shell/back';
import type { RemoteSession } from './play-on';

/**
 * Play On (#34): the other Jellyfin apps on this Server, and the remote
 * controls for the one that is playing.
 *
 * **This is the app's only picker of other devices, and that is the whole
 * difference from Cast.** Cast presses a button and the *browser* draws the
 * list — `decisions.md` §8 says there is no way to know what is out there
 * without loading an SDK and letting it discover. Play On asks `GET /Sessions`
 * and gets an answer, so the list is this app's to draw, and drawing it is
 * what makes the ticket's first and third acceptance criteria visible at once:
 * every row says what that app is playing now.
 *
 * It is `TrackPicker`'s and `PlaybackOptions`' shape in every other respect,
 * deliberately: a `<button>` per row and never a radio group, because
 * `src/navigation/` owns Left and Right for moving focus; a Back claim on top
 * of the player's, so Back closes the panel and leaves the Title where it is;
 * and `position: fixed` inside the player, which is also fixed, so focus stays
 * inside it with no focus-trapping code (#7, #40).
 *
 * **One panel does both jobs**, the list and the remote, for #32's width
 * reason: a second control in the options menu that is only ever useful when
 * the first one is not is a control the row has no space for. Once a Title is
 * playing elsewhere, the same press that opened the list opens the remote.
 */

/** What the Server has said so far about the other apps on it. */
export type PlayOnSessions = 'reading' | 'unavailable' | readonly RemoteSession[];

export type PlayOnPanelProps = {
  sessions: PlayOnSessions;
  /**
   * The app this Title was handed to, with the freshest thing known about it,
   * or absent for the ordinary case of playing here.
   *
   * It is passed in rather than looked up in `sessions` because the two can
   * disagree and the panel must not flicker between them: an app that has
   * been told to stop is still the app a User is looking at the controls for.
   */
  playingOn?: { readonly name: string; readonly nowPlaying: string | undefined; readonly paused: boolean };
  onPlayOn: (session: RemoteSession) => void;
  onPauseThere: () => void;
  onResumeThere: () => void;
  onStopThere: () => void;
  onClose: () => void;
};

export function PlayOnPanel({
  sessions,
  playingOn,
  onPlayOn,
  onPauseThere,
  onResumeThere,
  onStopThere,
  onClose,
}: PlayOnPanelProps) {
  const t = useTranslate();
  const panel = useRef<HTMLDivElement | null>(null);

  // Back closes the panel and nothing else, through the one Back handler.
  useBackClaim(true, onClose);

  /**
   * Focus comes in with the panel and goes back out with it — `#53`'s defect
   * and `playback-options.tsx`'s fix, which is written up there in full. The
   * short of it: the press that opened this was on a button this is drawn
   * over, and a choice in here closes the panel and takes the focused button
   * with it, so without the second half a remote ends up walking the title
   * page behind the picture.
   *
   * `sessions` is deliberately **not** a dependency. The list arrives one
   * round trip after the panel does, and re-running this on the answer would
   * drag focus off whatever a User had already reached.
   */
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      class="player__options"
      role="dialog"
      aria-modal="true"
      aria-label={t('player.playOnLabel')}
      ref={panel}
    >
      {playingOn === undefined ? (
        <div
          class="player__track-group"
          role="group"
          aria-label={t('player.playOnHeading')}
        >
          <h2 class="player__track-heading">{t('player.playOnHeading')}</h2>
          {sessions === 'reading' ? (
            <p class="notice">{t('player.playOnLooking')}</p>
          ) : sessions === 'unavailable' ? (
            /*
              A Server that would not answer is **not** the same as a Server
              with nothing on it, and the two must not share a message: one is
              a house with the television off, the other is something wrong.
            */
            <p class="notice notice--problem" role="alert">
              {t('player.playOnUnavailable')}
            </p>
          ) : sessions.length === 0 ? (
            <p class="notice">{t('player.playOnNowhere')}</p>
          ) : (
            <div class="player__track-choices">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  class="button button--quiet"
                  onClick={() => onPlayOn(session)}
                >
                  {/*
                    The row's own text is its accessible name, so what a screen
                    reader hears is the device, the app and what is playing
                    there — which is the third acceptance criterion read out
                    loud rather than only drawn.
                  */}
                  {session.deviceName}
                  {session.client === '' ? null : <> · {session.client}</>}
                  {' — '}
                  {session.nowPlaying === undefined
                    ? t('player.playOnIdle')
                    : t('player.playOnNowPlaying', { name: session.nowPlaying })}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div class="player__track-group" role="group" aria-label={playingOn.name}>
          <h2 class="player__track-heading">{playingOn.name}</h2>
          <p class="notice" role="status">
            {playingOn.nowPlaying === undefined
              ? t('player.playOnIdle')
              : t('player.playOnNowPlaying', { name: playingOn.nowPlaying })}
          </p>
          {/*
            The second acceptance criterion: play-state commands, from here.
            One button for pause and resume, saying the opposite thing — the
            player's own play/pause shape, and the same width argument.
          */}
          <div class="player__track-choices">
            <button
              type="button"
              class="button button--quiet"
              onClick={playingOn.paused ? onResumeThere : onPauseThere}
            >
              {playingOn.paused ? t('player.playOnResume') : t('player.playOnPause')}
            </button>
            <button type="button" class="button button--quiet" onClick={onStopThere}>
              {t('player.playOnStop')}
            </button>
          </div>
          {/*
            Why the picture here went quiet, said where the question arises.
            See `player.tsx`'s note on the handover: one Title has one place in
            it on the Server, and the other app is the one reporting now.
          */}
          <p class="notice">{t('player.playOnHandedOver')}</p>
        </div>
      )}

      <p class="player__buttons">
        <button type="button" class="button button--primary" onClick={onClose}>
          {t('player.playOnDone')}
        </button>
      </p>
    </div>
  );
}
