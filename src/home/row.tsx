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
 *
 * The scroll focus starts is seen through by `settled-scroll.ts` (#64), and
 * the Row holds the way to abandon it: focus moving to another card, or the
 * Row going away, must end a correction that is still in flight.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Title } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { FOCUS_GROUP_ATTRIBUTE } from '../navigation/focusable';
import { scrollToReveal } from '../navigation/reveal';
import { scrollSidewaysTo } from '../navigation/settled-scroll';
import { CardLabel } from '../title-labels/card-label';

/** One Title as a card: what it is called, and the artwork to show it by. */
export type RowCard = {
  readonly titleId: string;
  readonly name: string;
  /**
   * Whether the card is a Movie's or a Series'. Nothing a Row draws reads it;
   * it is here for a Row of cards that already exist being narrowed to one
   * kind — the My List Row in the Movies or Series section (#23), which is a
   * filter over the store the shell holds rather than a question to the
   * Server.
   */
  readonly kind: Title['kind'];
  /** Absent when the Server has no artwork for the Title. */
  readonly artworkUrl?: string;
  /**
   * How far through this Title the User is, from 0 to 1, drawn as a bar across
   * the bottom of the artwork (#12, story 36).
   *
   * Absent means there is no progress to show, which is not the same as zero:
   * Continue Watching draws the bar on every one of its cards — a next-up
   * Episode at zero is honest about there being none of it watched — and no
   * other Row draws one at all.
   */
  readonly progress?: number;
};

export type RowProps = {
  /** Already translated: a Row's name is its own feature's string. */
  heading: string;
  cards: readonly RowCard[];
  /** What pressing a card does. A Row with no handler is browsable, not pressable. */
  onCardPress?: (card: RowCard) => void;
  /**
   * A control drawn over each card's artwork: the My List toggle (#13), and
   * on Home the enlarged hover card (#21), which carries that toggle beside
   * Play and More info. It is given per card rather than built here, because a
   * Row knows nothing about what can be done to a Title.
   */
  cardControl?: (card: RowCard) => ComponentChildren;
};

/**
 * How much of the strip is kept clear either side of the focused card, so a
 * card at the edge of the screen shows that there is more Row beyond it.
 */
const CARD_MARGIN = 24;

/**
 * How wide a card's artwork is asked for. Wide enough for a card on a 1080p TV
 * at twice the pixel density, and far narrower than the poster the Server holds.
 */
const ARTWORK_WIDTH = 400;

/**
 * One Title as a card. Every Row shows the same card, so turning a Title into
 * one is the card's own business rather than each Row's: the artwork URL is
 * built the same way, at the same width, wherever a card appears.
 */
export function cardForTitle(gateway: JellyfinGateway, title: Title): RowCard {
  return {
    titleId: title.itemId,
    name: title.name,
    kind: title.kind,
    ...(title.artwork === undefined
      ? {}
      : {
          artworkUrl: gateway.itemImageUrl(title.artwork.itemId, 'Primary', {
            tag: title.artwork.imageTag,
            maxWidth: ARTWORK_WIDTH,
          }),
        }),
  };
}

export function Row({ heading, cards, onCardPress, cardControl }: RowProps) {
  const headingId = `row-${slugOf(heading)}`;
  const strip = useRef<HTMLUListElement | null>(null);
  // Which card the Row remembers. Clamped rather than reset, so a Row that
  // comes back from the Server shorter than it was still has a tab stop.
  const [remembered, setRemembered] = useState(0);
  const tabStop = Math.min(remembered, Math.max(0, cards.length - 1));
  // How to abandon the scroll the last reveal is still seeing through.
  const settling = useRef<(() => void) | undefined>(undefined);

  useWheelScrollsSideways(strip);
  useEffect(
    () => () => {
      settling.current?.();
    },
    [],
  );

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
              revealCard(strip.current, index, settling);
            }}
            onClick={() => onCardPress?.(card)}
          >
            <CardArtwork card={card} />
            <span class="card__name">{card.name}</span>
            {cardControl?.(card)}
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
 *
 * Whatever the card before it was still scrolling towards is abandoned first,
 * and on every path out of here: a correction aimed at the card focus has left
 * would scroll the Row away from the card focus is on.
 */
function revealCard(
  strip: HTMLUListElement | null,
  index: number,
  settling: { current: (() => void) | undefined },
): void {
  settling.current?.();
  settling.current = undefined;
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
  settling.current = scrollSidewaysTo(strip, left);
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
 * The Title's artwork, or nothing at all when the Server has none: the card
 * already carries the name, so an empty box would say less than the name does.
 *
 * Exported because a card is not only a Row's: the My List page lays the same
 * cards out as a grid.
 */
export function CardArtwork({ card }: { card: RowCard }) {
  return (
    <>
      {card.artworkUrl === undefined ? (
        <span class="card__artwork card__artwork--none" aria-hidden="true" />
      ) : (
        // The name is on the card next to the artwork, so the artwork itself
        // adds nothing for a screen reader and is left out of the card's name.
        <img class="card__artwork" src={card.artworkUrl} alt="" loading="lazy" />
      )}
      {/* How far through it the User is (#12), where a Row says so. */}
      <CardProgress progress={card.progress} />
      {/* What is new about this Title (#14). It is drawn over the bottom of the
          artwork, so it belongs to the artwork rather than to each Row, and a
          Title with nothing new about it draws nothing. */}
      <CardLabel titleId={card.titleId} />
    </>
  );
}

/**
 * The progress bar across the bottom of a card's artwork (story 36), or nothing
 * at all on a card that has no progress to show.
 *
 * `role="progressbar"` with `aria-valuenow` rather than a bare `<div>`: how much
 * is left is the point of the bar, and a screen reader has nothing else to read
 * it from — the card's own name is the Title's. It is rounded to whole percent,
 * because "47.3% watched" is a number nobody wants read out.
 */
export function CardProgress({ progress }: { progress?: number }) {
  if (progress === undefined) return null;
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <span
      class="card__progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span class="card__progress-watched" style={{ width: `${String(percent)}%` }} />
    </span>
  );
}

/** A heading as an id fragment, so the strip can point at its own heading. */
function slugOf(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
