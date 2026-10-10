import { useTranslate } from '../i18n/index';
import type { RowCard } from '../home/row';
import { useMyList } from './use-my-list';

/**
 * The My List control on a card: one button that adds the Title or takes it out
 * again, depending on which the list says it is.
 *
 * It is a real button with its own name — "Add Arrival to My List" — rather
 * than an icon with a tooltip, so a screen reader and a test both say what it
 * does. `aria-pressed` carries the other half: whether the Title is in the list
 * already.
 *
 * On a card in a Row it is shown while the pointer is over the card and is
 * deliberately *not* a focus stop (see `base.css`): the arrow keys read a Row
 * as a line of cards, and a second stop inside each card would break that.
 * The keyboard and the remote reach My List from the title page instead
 * (story 70, ticket #17), and the enlarged hover card (#21) is where this
 * button finally belongs beside Play and More info.
 */
export type MyListToggleProps = {
  card: RowCard;
};

export function MyListToggle({ card }: MyListToggleProps) {
  const t = useTranslate();
  const myList = useMyList();
  const held = myList.has(card.titleId);

  return (
    <button
      type="button"
      class="card__control"
      aria-pressed={held}
      aria-label={
        held ? t('myList.remove', { name: card.name }) : t('myList.add', { name: card.name })
      }
      onClick={(event) => {
        // The card around this button is a focus stop that opens the title
        // page, and this press is not a press of that.
        event.stopPropagation();
        void (held ? myList.remove(card.titleId) : myList.add(card));
      }}
    >
      <span aria-hidden="true">{held ? '✓' : '+'}</span>
    </button>
  );
}
