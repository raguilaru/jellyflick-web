import { useTranslate } from '../i18n/index';
import type { SkipOffer } from './media-segments';

/**
 * Skip Intro and Skip Credits (#31, story 87).
 *
 * It is drawn **whenever the Server says there is a marker here**, and so
 * deliberately not inside `PlayerControls`: the controls get out of the way
 * after a few seconds of nothing being pressed, and an offer that is only good
 * for the length of an intro cannot be one a User has to summon the controls to
 * find. It is still a real `<button>` inside the player, so the arrow keys
 * reach it by the same rule everything else in there is reached by — from
 * inside something `position: fixed`, the fixed thing is the flow (#7) — and a
 * screen reader reads it with the Episode's name on it, as every other control
 * in the player carries the Title's.
 *
 * The press is a **seek, through the player's one seek path**, which is what
 * makes it report to the Server and be clamped like any other: `scrubbing.ts`
 * stops a second short of the end, so a Skip Credits on a marker that runs to
 * the last frame lands at the end of the Episode rather than firing `ended`
 * from under the User's finger.
 */

export type SkipButtonProps = {
  offer: SkipOffer;
  /** For the name, so a screen reader hears what is being skipped. */
  titleName: string;
  /** Where to seek to: the player clamps it, as it does every other seek. */
  onSkip: (seconds: number) => void;
};

export function SkipButton({ offer, titleName, onSkip }: SkipButtonProps) {
  const t = useTranslate();
  const intro = offer.kind === 'Intro';

  return (
    <div class="player__skip">
      <button
        type="button"
        class="button button--primary"
        /*
          The *name* carries the Episode, as every control in the player does;
          the visible text does not, because "Skip the intro of Bluey: The
          Magic Xylophone" on a button is wider than a phone.
        */
        aria-label={t(intro ? 'player.skipIntroFor' : 'player.skipCreditsFor', {
          name: titleName,
        })}
        onClick={() => onSkip(offer.toSeconds)}
      >
        {t(intro ? 'player.skipIntro' : 'player.skipCredits')}
      </button>
    </div>
  );
}
