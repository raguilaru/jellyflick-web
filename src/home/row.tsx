/**
 * A Row: a horizontal strip of Titles on Home, smaller than the Billboard.
 *
 * Every Row shows the same card, so the card lives here and each Row's own
 * ticket brings only the Titles to put in it.
 *
 * The strip is a list, headed by the Row's name, and each card is one item in
 * it: that is what makes the Row navigable by a screen reader, and it is the
 * handle both the unit and the browser tests take hold of.
 *
 * A card is a focus stop rather than a control, because what pressing one opens
 * — the title page — is its own ticket. Pressing is already wired, through
 * `onCardPress`, so that ticket only has to say where it goes.
 *
 * The Row has exactly one tab stop: the card focus was last on. That is what
 * makes Tab step from Row to Row rather than through twenty cards, and it is
 * how a Row remembers where focus was when the arrow keys come back to it
 * (story 65) — `spatial-navigation.ts` enters a Row at its tab stop.
 *
 * It scrolls three ways: by touch and by a sideways wheel or trackpad, which
 * `overflow-x` gives for nothing; by a plain downward wheel, which is turned
 * sideways here, because a mouse has no sideways wheel; and by focus moving to
 * a card, which `reveal.ts` works out. Nothing here uses `scroll-snap-*`: ADR
 * 0002 puts it at Chrome 69, one above the floor, and it ships raw.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { FOCUS_GROUP_ATTRIBUTE } from '../navigation/focusable';
import { scrollToReveal } from '../navigation/reveal';

/** One Title as a card: what it is called, and the artwork to show it by. */
export type RowCard = {
  readonly titleId: string;
  readonly name: string;
  /** Absent when the Server has no artwork for the Title. */
  readonly artworkUrl?: string;
};

export type RowProps = {
  /** Already translated: a Row's name is its own feature's string. */
  heading: string;
  cards: readonly RowCard[];
  /** What pressing a card does. A Row with no handler is browsable, not pressable. */
  onCardPress?: (card: RowCard) => void;
};

/**
 * How much of the strip is kept clear either side of the focused card, so a
 * card at the edge of the screen shows that there is more Row beyond it.
 */
const CARD_MARGIN = 24;

export function Row({ heading, cards, onCardPress }: RowProps) {
  const headingId = `row-${slugOf(heading)}`;
  const strip = useRef<HTMLUListElement | null>(null);
  // Which card the Row remembers. Clamped rather than reset, so a Row that
  // comes back from the Server shorter than it was still has a tab stop.
  const [remembered, setRemembered] = useState(0);
  const tabStop = Math.min(remembered, Math.max(0, cards.length - 1));

  useWheelScrollsSideways(strip);

  return (
    <section class="row" aria-labelledby={headingId}>
      <h2 class="row__heading" id={headingId}>
        {heading}
      </h2>
      <ul
        class="row__strip"
        aria-labelledby={headingId}
        ref={strip}
        {...{ [FOCUS_GROUP_ATTRIBUTE]: headingId }}
      >
        {cards.map((card, index) => (
          <li
            class="card"
            key={card.titleId}
            aria-label={card.name}
            tabIndex={index === tabStop ? 0 : -1}
            onFocus={() => {
              setRemembered(index);
              revealCard(strip.current, index);
            }}
            onClick={() => onCardPress?.(card)}
          >
            <Artwork card={card} />
            <span class="card__name">{card.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Scrolls the strip to the card that has just taken focus, with a margin either
 * side. The card's own offset inside the strip is measured from the two
 * rectangles rather than read from `offsetLeft`, which answers against whatever
 * the nearest positioned ancestor happens to be.
 */
function revealCard(strip: HTMLUListElement | null, index: number): void {
  if (strip === null) return;
  const card = strip.children[index];
  if (!(card instanceof HTMLElement)) return;

  const stripBox = strip.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const start = cardBox.left - stripBox.left + strip.scrollLeft;

  const left = scrollToReveal(
    {
      scroll: strip.scrollLeft,
      length: strip.clientWidth,
      maximumScroll: strip.scrollWidth - strip.clientWidth,
    },
    { start, end: start + cardBox.width },
    CARD_MARGIN,
  );
  if (left === undefined) return;
  scrollSmoothly(strip, left);
}

/**
 * Turns a plain downward wheel over a Row into a sideways scroll, because a
 * mouse has no sideways wheel and the Row is the only thing under the pointer
 * worth scrolling. A wheel that is already sideways — a trackpad, a tilt wheel
 * — is left to the browser, and so is one that arrives at either end of the
 * Row, which scrolls the page instead so a Row can never trap it.
 */
function useWheelScrollsSideways(strip: { current: HTMLUListElement | null }): void {
  useEffect(() => {
    const element = strip.current;
    if (element === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || event.deltaY === 0) return;
      const maximum = element.scrollWidth - element.clientWidth;
      if (maximum <= 0) return;
      const left = Math.max(0, Math.min(element.scrollLeft + event.deltaY, maximum));
      if (left === element.scrollLeft) return;
      // The page must not scroll as well, which means this listener cannot be
      // a passive one.
      event.preventDefault();
      element.scrollLeft = left;
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, [strip]);
}

/**
 * Scrolls smoothly where the device can, and jumps where it cannot.
 * `scroll-behavior` is Chrome 61, below the floor, but `scrollTo` with options
 * throws on an older engine rather than ignoring them.
 */
function scrollSmoothly(element: Element, left: number): void {
  try {
    element.scrollTo({ left, behavior: 'smooth' });
  } catch {
    element.scrollLeft = left;
  }
}

/**
 * The Title's artwork, or nothing at all when the Server has none: the card
 * already carries the name, so an empty box would say less than the name does.
 */
function Artwork({ card }: { card: RowCard }) {
  if (card.artworkUrl === undefined) {
    return <span class="card__artwork card__artwork--none" aria-hidden="true" />;
  }
  // The name is on the card next to the artwork, so the artwork itself adds
  // nothing for a screen reader and is left out of the card's name.
  return <img class="card__artwork" src={card.artworkUrl} alt="" loading="lazy" />;
}

/** A heading as an id fragment, so the strip can point at its own heading. */
function slugOf(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
