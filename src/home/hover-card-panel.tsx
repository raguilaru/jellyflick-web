import { useEffect, useRef, useState } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import { useTranslate } from '../i18n/index';
import { MyListToggle } from '../my-list/my-list-toggle';
import { ExtraRatings } from '../ratings/extra-ratings-badges';
import { useHoverPointer } from '../shell/layout';
import { useCardActions } from './card-actions';
import {
  hoverCardFactsOf,
  hoverCardsAvailable,
  HOVER_CARD_DELAY_MS,
  readCardDetails,
} from './hover-card';
import { useOpenTitle } from './open-title';
import type { RowCard } from './row';

/**
 * The enlarged hover card (#21, stories 52 and 53): resting the pointer on a
 * card on Home grows it and offers Play, My List and More info, with the age
 * rating, the length, the genres and the compact extra ratings.
 *
 * It is a card's `cardControl`, which is the slot #13 opened for the My List
 * toggle and said this ticket would come and share. On a device with no
 * hovering pointer — every phone, and every TV whatever its remote claims —
 * this draws **exactly what #13 drew**: the plain toggle, revealed by CSS
 * hover, which is the fallback the Chromium 68 floor gets as well.
 *
 * Three things about it are load-bearing.
 *
 * - **Nothing appears until the pointer has rested**, and the delay is what
 *   makes that true (story 53). `base.css` draws the panel from
 *   `data-resting`, never from `:hover`: a panel on bare hover would put three
 *   buttons across the middle of a card the instant the pointer crossed it, and
 *   a press meant for the card — a focus stop that opens the title page — would
 *   land on Play. `arrow-key-navigation.spec.ts` caught precisely that.
 *   `spatial-navigation.ts` ignores a zero-sized box, so a card nobody is
 *   resting on carries no stop the arrow keys step through, and Right still
 *   takes the next card along the Row (#8) — the same reason #13's toggle was
 *   hover-only to begin with.
 * - **Nothing is read until then either.** The facts and the ratings mount only
 *   once the delay has passed, so a Row of twenty cards makes no request at all
 *   until somebody stops on one. `<ExtraRatings>` reads when it mounts, and
 *   `ratings-mdblist.md` is explicit that reading eagerly would burn MDBList's
 *   thousand requests a day.
 * - **The pointer is watched on the card, not on this panel.** The panel is
 *   `display: none` until the card is already rested on, so it can never be
 *   what notices the pointer arriving. The card is the `<li class="card">`
 *   `Row` draws around this, and `closest` is how the panel reaches it — a
 *   handler on the card itself would mean `Row` growing an API for one
 *   feature's sake.
 */

export type HoverCardProps = {
  card: RowCard;
};

export function HoverCard({ card }: HoverCardProps) {
  const actions = useCardActions();
  const pointerCanHover = useHoverPointer();

  // A card with nothing offering it actions — a `Row` in a unit test of its
  // own, the title page's More like this inside its pop-up — and every device
  // that is not a computer with a hovering pointer, get #13's plain toggle.
  if (actions === undefined || !hoverCardsAvailable(actions.device.deviceForm(), pointerCanHover)) {
    return <MyListToggle card={card} />;
  }
  return <EnlargingCard card={card} />;
}

function EnlargingCard({ card }: HoverCardProps) {
  const t = useTranslate();
  const actions = useCardActions();
  const openTitle = useOpenTitle();
  const panel = useRef<HTMLDivElement | null>(null);
  /** Set once the pointer has rested long enough; cleared when it leaves. */
  const [resting, setResting] = useState(false);

  usePointerRest(panel, setResting);
  useCardGrowsWhileResting(panel, resting);

  // The Title itself, read only once the card has been rested on. `undefined`
  // is both "not read yet" and "the Server would not say": an enlarged card
  // with no facts on it is still a card with three working buttons, and a
  // notice in a box this size would be in the way of them.
  const [details, setDetails] = useState<TitleDetails | undefined>(undefined);
  useEffect(() => {
    if (!resting || actions === undefined) return;
    let abandoned = false;
    void readCardDetails(actions.gateway, card.titleId).then((read) => {
      if (abandoned) return;
      setDetails(read);
    });
    return () => {
      abandoned = true;
    };
  }, [resting, card.titleId]);

  if (actions === undefined) return null;
  const facts = details === undefined ? [] : hoverCardFactsOf(details, t);

  return (
    <div
      class={resting ? 'card__hover card__hover--resting' : 'card__hover'}
      ref={panel}
      // A press of a button in here is not a press of the card around it, which
      // is a focus stop that opens the title page.
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <p class="card__hover-actions">
        <button
          type="button"
          class="button button--primary card__hover-play"
          // A card is 150px wide, so what a User reads is "Play" and what a
          // screen reader and a test are given is the Title it plays — the
          // bargain `MyListToggle` beside it already makes.
          aria-label={t('home.card.play', { name: card.name })}
          onClick={() => {
            // The player covers the screen, so the card lets go of the
            // pointer: an enlarged card behind it would be a second "Play
            // Arrival" in the document that nobody can see.
            setResting(false);
            // Read rather than taken from the state above, which may not have
            // landed yet: a press in the moment between the card enlarging and
            // its details arriving would otherwise do nothing at all. The read
            // is held per Title, so this is the same answer the facts are
            // drawn from and almost never a second request.
            void readCardDetails(actions.gateway, card.titleId).then((read) => {
              // A Server that would not say what this Title is cannot be asked
              // how to play it either. The title page is where that refusal
              // has words of its own, so Play falls back to opening it rather
              // than doing nothing where a User pressed something.
              if (read === undefined) openTitle(card);
              else actions.play(read);
            });
          }}
        >
          {t('home.card.playLabel')}
        </button>
        {/* #13's own control, which is where it has belonged since it was
            written: beside Play and More info rather than alone in a corner. */}
        <MyListToggle card={card} />
        <button
          type="button"
          class="button button--quiet card__hover-more"
          aria-label={t('home.card.moreInfo', { name: card.name })}
          onClick={() => {
            openTitle(card);
          }}
        >
          {t('home.card.moreInfoLabel')}
        </button>
      </p>

      {/* Everything below here exists only while the pointer is resting, which
          is what keeps a Row from reading twenty Titles and twenty sets of
          ratings for a User scrolling past. */}
      {resting && details !== undefined ? (
        <>
          {facts.length === 0 ? null : (
            <p class="card__hover-facts">
              {facts.map((fact) => (
                <span class="card__hover-fact" key={fact}>
                  {fact}
                </span>
              ))}
            </p>
          )}
          {/* The compact form #20 built for this card, and nothing else. It
              reads when it mounts, which here means on hover. */}
          <ExtraRatings details={details} compact />
        </>
      ) : null}
    </div>
  );
}

/**
 * Watches the pointer on the card this panel is inside, and reports it resting
 * once {@link HOVER_CARD_DELAY_MS} has passed.
 *
 * `mouseenter` and `mouseleave` rather than `mouseover`/`mouseout`: the two
 * that do not bubble are the two that mean the pointer crossing *this card's*
 * boundary, and the bubbling pair would fire again for every button and every
 * span inside it. Both are Chrome from the beginning.
 *
 * The timer is cleared on the way out as well as on unmount, so a Row that
 * comes back from the Server shorter than it was — or a card whose Title
 * changed under it — never has a timer left running towards an element that
 * has gone.
 */
function usePointerRest(
  panel: { current: HTMLElement | null },
  setResting: (resting: boolean) => void,
): void {
  useEffect(() => {
    const card = panel.current?.closest('.card');
    if (!(card instanceof HTMLElement)) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const onEnter = (): void => {
      clear();
      timer = setTimeout(() => {
        timer = undefined;
        setResting(true);
      }, HOVER_CARD_DELAY_MS);
    };
    const onLeave = (): void => {
      clear();
      setResting(false);
    };

    card.addEventListener('mouseenter', onEnter);
    card.addEventListener('mouseleave', onLeave);
    return () => {
      clear();
      card.removeEventListener('mouseenter', onEnter);
      card.removeEventListener('mouseleave', onLeave);
    };
  }, [panel, setResting]);
}

/**
 * Grows the card this panel is inside, for as long as the pointer is resting
 * on it.
 *
 * It follows the state rather than being written where the pointer is handled,
 * so there is **one** answer to "is this card the enlarged one": a press of
 * Play lets go of the pointer too, and an attribute set in a `mouseleave`
 * handler would have stayed on a card the player is now covering.
 */
function useCardGrowsWhileResting(
  panel: { current: HTMLElement | null },
  resting: boolean,
): void {
  useEffect(() => {
    const card = panel.current?.closest('.card');
    if (!(card instanceof HTMLElement)) return;

    if (resting) card.setAttribute(RESTING_ATTRIBUTE, '');
    else card.removeAttribute(RESTING_ATTRIBUTE);

    return () => {
      card.removeAttribute(RESTING_ATTRIBUTE);
    };
  }, [panel, resting]);
}

/**
 * What says a card is the one the pointer is resting on, written on the card
 * itself so CSS can grow it.
 *
 * An **attribute rather than a class**, and written from here rather than
 * rendered: the card is `Row`'s element and `Row` draws it with a static
 * `class="card"`, so a class added here is a value Preact also owns and could
 * overwrite on any later render. Nothing renders this attribute, so nothing
 * fights it. `src/navigation/input-modality.ts` writes `data-input` on the
 * root element for the same reason.
 *
 * It is also what lets the *card* be the thing that grows. CSS cannot style an
 * ancestor — `:has()` is Chrome 105 and ADR 0002's floor is 68 — so a panel
 * that knew its own state could never enlarge the card around it.
 */
const RESTING_ATTRIBUTE = 'data-resting';
