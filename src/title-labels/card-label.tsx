import { useTranslate, type MessageKey } from '../i18n/index';
import type { TitleLabel } from './title-labels';
import { useTitleLabel } from './use-title-labels';

/**
 * The Title Label on a card's art, or nothing at all when the Title has none
 * (#14, story 42).
 *
 * It is drawn across the bottom of the artwork in the Accent Colour, which is
 * the User's own (#11) — and in `--accent-text` on it, because the presets
 * carry the two together precisely so that text on a filled block stays
 * readable.
 *
 * It is **not** `aria-hidden`. The card's own name is the Title's, so a label
 * cannot be part of it without changing what every card is called; left in the
 * document it is text beside that name rather than a decoration a screen reader
 * is told to ignore.
 */
export type CardLabelProps = {
  /** The Title the card is for, which is what a label belongs to. */
  titleId: string;
};

const LABEL_KEYS: Readonly<Record<TitleLabel, MessageKey>> = {
  'recently-added': 'titleLabel.recentlyAdded',
  'new-season': 'titleLabel.newSeason',
  'new-episodes': 'titleLabel.newEpisodes',
};

export function CardLabel({ titleId }: CardLabelProps) {
  const t = useTranslate();
  const label = useTitleLabel(titleId);
  if (label === undefined) return null;
  return <span class="card__label">{t(LABEL_KEYS[label])}</span>;
}
