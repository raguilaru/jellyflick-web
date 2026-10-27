import { catalogueItemFrom, titleOf } from '../catalogue/catalogue';
import { cardForTitle, type RowCard } from '../home/row';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * My List: the Titles a User has saved, which is Jellyfin's Favorites and so
 * the same list every other Jellyfin app shows as Favorites.
 *
 * It is one store rather than a load per screen, because a Title added from a
 * card on Home has to appear in the Row beside it, in the My List page and on
 * every other card for the same Title at once. Everything showing the list
 * reads this one answer and is told when it changes.
 *
 * A change is shown before the Server has agreed to it, and taken back if the
 * Server refuses — a User who presses My List should see it happen, not wait
 * for a round trip. The list stays in the Server's own order while it does:
 * a Title is inserted where its name puts it, which is where the Server will
 * have it on the next read, so nothing jumps about afterwards.
 *
 * This is also the seam the title page (#17) takes for story 70's My List
 * toggle: `has`, `add` and `remove` are the whole interface, and a title page
 * needs no more than a `RowCard` to add one.
 */

/** What My List came to. */
export type MyListState =
  /** Not read from the Server yet: nothing may claim the list is empty. */
  | { outcome: 'loading' }
  /** The Server would not say what is in it. */
  | { outcome: 'unavailable' }
  | { outcome: 'list'; titles: readonly RowCard[] };

export type MyList = {
  state(): MyListState;
  /** Whether a Title is in the list. False while the list is not known. */
  has(titleId: string): boolean;
  /** Reads the list from the Server, replacing whatever was held. */
  load(): Promise<void>;
  /**
   * Adds a Title. It is in the list as soon as this is called; it is taken out
   * again if the Server refuses, and `unsaved()` then says so.
   */
  add(card: RowCard): Promise<void>;
  /** Removes a Title, with the same immediacy and the same undo. */
  remove(titleId: string): Promise<void>;
  /**
   * Whether the last change could not be saved on the Server. Cleared by the
   * next change that is. Something has to say so, or a change that reverts
   * itself looks like the app losing track.
   */
  unsaved(): boolean;
  /**
   * How many times the list has changed. Whoever is showing it subscribes
   * *after* it has rendered, so a change made in between — a press on a card
   * the moment it appeared — would otherwise never be drawn. Comparing this
   * against the number it rendered with is how that change is caught.
   */
  version(): number;
  /** Called whenever the list changes. Returns the undo. */
  subscribe(listener: () => void): () => void;
};

export function createMyList(gateway: JellyfinGateway): MyList {
  let state: MyListState = { outcome: 'loading' };
  let unsaved = false;
  /** How many times the list has been published. Read by whoever draws it. */
  let version = 0;
  /**
   * How many changes the User has made. A read asked before one of them is out
   * of date; a read asked before another *read* is not, which is why this is
   * counted apart from `version`.
   */
  let changes = 0;
  const listeners = new Set<() => void>();

  function publish(next: MyListState): void {
    state = next;
    version += 1;
    for (const listener of Array.from(listeners)) listener();
  }

  /** The list as it stands, or nothing when there is no list to change. */
  function titles(): readonly RowCard[] | undefined {
    return state.outcome === 'list' ? state.titles : undefined;
  }

  async function load(): Promise<void> {
    // A read overtaken by a change is thrown away: it was asked before the
    // change and would put the Title straight back.
    const asked = changes;
    let items;
    try {
      items = await gateway.getFavouriteItems();
    } catch {
      if (changes !== asked) return;
      publish({ outcome: 'unavailable' });
      return;
    }
    if (changes !== asked) return;

    const cards: RowCard[] = [];
    for (const dto of items) {
      const item = catalogueItemFrom(dto);
      // The Server is asked for Movies and Series only, so anything else here
      // is something this app does not show.
      if (item === undefined) continue;
      cards.push(cardForTitle(gateway, titleOf(item)));
    }
    publish({ outcome: 'list', titles: cards });
  }

  /**
   * Shows a change at once, writes it, and takes it back if the Server refuses.
   * A list that has not been read has nothing to show a change in, so it is
   * read after the write instead.
   */
  async function change(
    changed: (held: readonly RowCard[]) => readonly RowCard[],
    write: () => Promise<unknown>,
  ): Promise<void> {
    changes += 1;
    const held = titles();
    if (held !== undefined) publish({ outcome: 'list', titles: changed(held) });

    try {
      await write();
      if (unsaved) {
        unsaved = false;
        // Clearing the warning changes what the screen shows, so it has to be
        // published like any other change. The optimistic publish above went
        // out while the flag was still set, and without this one nothing
        // re-renders — so a failed change followed by a successful one left
        // "could not be saved" on the My List page over a list that had saved
        // perfectly well.
        publish(state);
      }
    } catch {
      unsaved = true;
      if (held === undefined) return;
      publish({ outcome: 'list', titles: held });
      return;
    }
    if (held === undefined) await load();
  }

  return {
    state: () => state,
    version: () => version,
    has: (titleId) => (titles() ?? []).some((card) => card.titleId === titleId),
    unsaved: () => unsaved,
    load,

    add: (card) =>
      change(
        (held) => (held.some((kept) => kept.titleId === card.titleId) ? held : inserted(held, card)),
        () => gateway.addToFavourites(card.titleId),
      ),

    remove: (titleId) =>
      change(
        (held) => held.filter((card) => card.titleId !== titleId),
        () => gateway.removeFromFavourites(titleId),
      ),

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * A card put where its name belongs. The Server orders My List by `Name`
 * ascending, so this is the place a reload will have it, and the list does not
 * reshuffle under the User a moment after they added something.
 */
function inserted(held: readonly RowCard[], card: RowCard): readonly RowCard[] {
  const at = held.findIndex((kept) => kept.name.localeCompare(card.name) > 0);
  if (at === -1) return [...held, card];
  return [...held.slice(0, at), card, ...held.slice(at)];
}
