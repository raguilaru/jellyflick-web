import { useLayoutEffect, useRef } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import { useBackClaim } from '../shell/back';
import { MAXIMUM_QUALITIES } from './max-quality';
import { PLAYBACK_SPEEDS } from './playback-speed';

/**
 * How a Title plays, chosen while it is playing (#32): the speed, the maximum
 * quality, and picture-in-picture where the device has it.
 *
 * **One menu rather than three controls**, and that is about the row it is
 * opened from. The controls already carry play/pause, the tracks and Close;
 * three more buttons beside them is a row wider than a phone, which is exactly
 * the failure #44 shipped and every e2e assertion passed through. So these
 * three share a panel, as the sound and the subtitles share theirs.
 *
 * It is `TrackPicker`'s shape in every other respect, deliberately: a
 * `<button>` with `aria-pressed` per choice and never a radio group, because
 * `src/navigation/` owns Left and Right for moving focus; a Back claim on top
 * of the player's, so Back closes the menu and leaves the Title playing; and
 * `position: fixed` inside the player, which is also fixed, so focus stays
 * inside it with no focus-trapping code (#7, #40).
 *
 * Picture-in-picture sits here rather than being a control of its own for the
 * same width reason — and it is a **press**, not a choice, so it is a plain
 * button below the two groups rather than another `aria-pressed` row.
 */

export type PlaybackOptionsProps = {
  /** The rate playing now. */
  speed: number;
  onChooseSpeed: (speed: number) => void;
  /** The ceiling in force, in bits per second, or absent for Auto. */
  maxBitrate?: number;
  /** `undefined` is Auto: the absence of a ceiling, not a value. */
  onChooseQuality: (maxBitrate: number | undefined) => void;
  /**
   * Picture-in-picture, **only where the device layer says this device has
   * it** (story 92). Absent is a device that does not — Chromium 68 is one,
   * which is this app's floor — and then there is no control at all rather
   * than one that cannot be pressed: a feature the browser does not have is
   * not something a User can be told about usefully.
   */
  onPictureInPicture?: () => void;
  /** Whether the picture is in its own window now, so the button can say so. */
  inPictureInPicture?: boolean;
  /**
   * Cast, **only where the device layer reports Cast support** (#33) — the
   * ticket's first acceptance criterion, and the same rule
   * `onPictureInPicture` above follows for the same reason: a browser with no
   * Cast implementation in it is not something a User can be told about
   * usefully, so there is no control rather than one that cannot work.
   *
   * It is a **press** and not a choice, because what it opens is the
   * *browser's* own picker — this app never draws a list of receivers.
   */
  onCast?: () => void;
  /**
   * The receiver this Title is playing on, so the one button can offer to stop
   * it. Absent is "not casting", which is the state nearly all of playback is
   * in.
   */
  castingTo?: string;
  /**
   * AirPlay, only where Safari has it **and the element says there is
   * somewhere to send it** (#33). Both halves are in the player; by the time
   * it is here, the answer is yes.
   */
  onAirPlay?: () => void;
  onClose: () => void;
};

export function PlaybackOptions({
  speed,
  onChooseSpeed,
  maxBitrate,
  onChooseQuality,
  onPictureInPicture,
  inPictureInPicture = false,
  onCast,
  castingTo,
  onAirPlay,
  onClose,
}: PlaybackOptionsProps) {
  const t = useTranslate();
  const panel = useRef<HTMLDivElement | null>(null);

  // Back closes the menu and nothing else, through the one Back handler.
  useBackClaim(true, onClose);

  /**
   * Focus comes in with the menu, for the reason `track-picker.tsx` gives: the
   * press that opened it was on a button this is now drawn over, and the
   * arrow keys' flow rule only applies to focus that is already inside the
   * fixed thing.
   *
   * **And it goes back out with it**, which is the half that is not optional
   * here. Every choice in this menu closes it, and the button that was
   * focused goes with it — so a browser hands focus to the document, and from
   * there the arrow keys are not inside the player at all. That is #40's bug
   * arriving by a different road: the next press walks the **title page
   * behind the picture**, because the flow rule can only keep focus in an
   * overlay focus is already in. The player's own rule is that controls which
   * appear take focus unless focus is already inside it (#26); this is its
   * mirror, and without it picture-in-picture, a speed and a quality each end
   * with a User's remote somewhere they cannot see. #32's e2e found it on a
   * 390px screen, with every unit assertion green before and after.
   *
   * The opener is only focused again if it is **still there**. A quality
   * choice re-negotiates and the whole control row is rebuilt, so the button
   * this was opened from is gone by then — and the controls' own effect,
   * which takes focus when they come back, is the right thing to leave it to.
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
      aria-label={t('player.optionsLabel')}
      ref={panel}
    >
      <div class="player__track-group" role="group" aria-label={t('player.speedHeading')}>
        <h2 class="player__track-heading">{t('player.speedHeading')}</h2>
        <div class="player__track-choices">
          {PLAYBACK_SPEEDS.map((rate) => (
            <button
              key={rate}
              type="button"
              class="button button--quiet"
              aria-pressed={rate === speed}
              onClick={() => onChooseSpeed(rate)}
            >
              {t('player.speedChoice', { speed: rate })}
            </button>
          ))}
        </div>
      </div>

      <div class="player__track-group" role="group" aria-label={t('player.qualityHeading')}>
        <h2 class="player__track-heading">{t('player.qualityHeading')}</h2>
        <div class="player__track-choices">
          {/*
            Auto is first and is a choice like any other, the way Off is in the
            subtitle menu: it is the absence of a ceiling rather than a
            bitrate, and a User choosing it has pressed something.
          */}
          <button
            type="button"
            class="button button--quiet"
            aria-pressed={maxBitrate === undefined}
            onClick={() => onChooseQuality(undefined)}
          >
            {t('player.qualityAuto')}
          </button>
          {MAXIMUM_QUALITIES.map((bitrate) => (
            <button
              key={bitrate}
              type="button"
              class="button button--quiet"
              aria-pressed={bitrate === maxBitrate}
              onClick={() => onChooseQuality(bitrate)}
            >
              {t('player.qualityChoice', { bitrate })}
            </button>
          ))}
        </div>
        {/*
          Said once, here, rather than per choice: a ceiling is remembered on
          this device and nowhere else, which is the one thing about it that
          surprises a household sharing a Jellyfin account.
        */}
        <p class="notice">{t('player.qualityPerDevice')}</p>
      </div>

      <p class="player__buttons">
        {/*
          Cast and AirPlay (#33) sit with picture-in-picture rather than in a
          group of their own, and that is the same width argument the top of
          this file makes: these are **presses**, not choices, and a row of
          `aria-pressed` buttons would claim a User had chosen a receiver when
          all they have done is open the browser's picker.

          Neither is ever drawn on a device that has none — and on this app's
          Chromium 68 floor that is all three of them, so a television gets
          the two groups above and Done. There is no disabled state here on
          purpose: a feature the browser does not have is not something a
          User can be told about usefully.
        */}
        {onCast === undefined ? null : (
          <button type="button" class="button button--quiet" onClick={onCast}>
            {castingTo === undefined ? t('player.cast') : t('player.stopCasting')}
          </button>
        )}
        {onAirPlay === undefined ? null : (
          <button type="button" class="button button--quiet" onClick={onAirPlay}>
            {t('player.airPlay')}
          </button>
        )}
        {onPictureInPicture === undefined ? null : (
          <button type="button" class="button button--quiet" onClick={onPictureInPicture}>
            {inPictureInPicture ? t('player.leavePip') : t('player.enterPip')}
          </button>
        )}
        <button type="button" class="button button--primary" onClick={onClose}>
          {t('player.optionsDone')}
        </button>
      </p>
    </div>
  );
}
