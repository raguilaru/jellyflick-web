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
  onClose: () => void;
};

export function PlaybackOptions({
  speed,
  onChooseSpeed,
  maxBitrate,
  onChooseQuality,
  onPictureInPicture,
  inPictureInPicture = false,
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
   */
  useLayoutEffect(() => {
    const first = panel.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
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
