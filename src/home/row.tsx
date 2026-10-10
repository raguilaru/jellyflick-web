/**
 * A Row: a horizontal strip of Titles on Home, smaller than the Billboard.
 *
 * Every Row shows the same card, so the card lives here and each Row's own
 * ticket brings only the Titles to put in it.
 *
 * The strip is a list, headed by the Row's name, and each card is one item in
 * it: that is what makes the Row navigable by a screen reader, and it is the
 * handle both the unit and the browser tests take hold of. Pressing a card goes
 * to its title page, which is its own ticket, so a card is not a button yet.
 *
 * It scrolls with `overflow-x`, and nothing here uses `scroll-snap-*`: ADR 0002
 * puts snapping at Chrome 69, one above the floor, and it ships raw.
 */
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
};

export function Row({ heading, cards }: RowProps) {
  const headingId = `row-${slugOf(heading)}`;
  return (
    <section class="row" aria-labelledby={headingId}>
      <h2 class="row__heading" id={headingId}>
        {heading}
      </h2>
      <ul class="row__strip" aria-labelledby={headingId}>
        {cards.map((card) => (
          <li class="card" key={card.titleId} aria-label={card.name}>
            <Artwork card={card} />
            <span class="card__name">{card.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
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
