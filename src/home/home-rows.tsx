import { useEffect, useState } from 'preact/hooks';
import { useTranslate, type MessageKey } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { MyListToggle } from '../my-list/my-list-toggle';
import { useMyList } from '../my-list/use-my-list';
import { ContinueWatchingRow } from './continue-watching-row';
import type { HomeRow, HomeRowKind } from './home-layout';
import { loadNewOnJellyflick, type NewOnJellyflickResult } from './new-on-jellyflick';
import { useOpenTitle } from './open-title';
import { Row, type RowCard } from './row';
import {
  loadBecauseYouWatched,
  loadCollectionRow,
  loadGenreRow,
  loadWatchAgain,
  type SuggestionRowResult,
} from './suggestion-rows';

/**
 * Which Row each kind in a Home Layout is, and what draws it.
 *
 * The Home Layout can name a Row whose feature is not built yet, so Home draws
 * only the kinds in `BUILT_ROW_KINDS` and simply leaves the rest out. That is
 * deliberately not a placeholder: an empty Row on Home would look like
 * something that failed, whereas a Row that is not there yet is honest about
 * what the app does today. The Home Layout editor says so in words. Every kind
 * the layout names is built since #15; the list stays because the next kind to
 * be added will arrive in the layout before its loader does.
 *
 * **Adding a Row's feature** is: a loader of its own beside
 * `new-on-jellyflick.ts`, a case in `HomeRowFor`, and the kind added to
 * `BUILT_ROW_KINDS`. Nothing else changes — the layout already carries it.
 */

/**
 * A Row's name where the app is what names it: in the editor, and on Home for
 * the Rows that are not named after something of the Server's. A genre or
 * Collection Row is headed by its own genre or Collection instead, which is
 * `rowHeadingOf` below.
 */
export const ROW_NAME_KEYS: Readonly<Record<HomeRowKind, MessageKey>> = {
  'continue-watching': 'home.row.continueWatching',
  'my-list': 'home.row.myList',
  // The Row's name is the app's name, so it keeps the key it has had since #4.
  'new-on-jellyflick': 'home.newOnJellyflick',
  'watch-again': 'home.row.watchAgain',
  'because-you-watched': 'home.row.becauseYouWatched',
  genre: 'home.row.genre',
  collection: 'home.row.collection',
};

/**
 * What the editor calls the control that adds a Row needing a choice. A kind
 * without one here is added by a press and needs nothing asking.
 */
export const ROW_CHOICE_KEYS: Readonly<Partial<Record<HomeRowKind, MessageKey>>> = {
  genre: 'homeLayout.chooseGenre',
  collection: 'homeLayout.chooseCollection',
};

/** The heading over the choices, once that control has been pressed. */
export const ROW_CHOICE_HEADING_KEYS: Readonly<Partial<Record<HomeRowKind, MessageKey>>> = {
  genre: 'homeLayout.chooseGenreHeading',
  collection: 'homeLayout.chooseCollectionHeading',
};

/** The kinds whose feature exists, and so the ones Home can draw today. */
export const BUILT_ROW_KINDS: readonly HomeRowKind[] = [
  'continue-watching',
  'my-list',
  'new-on-jellyflick',
  'watch-again',
  'because-you-watched',
  'genre',
  'collection',
];

/**
 * The My List toggle on every card on Home, which is how a Title gets into My
 * List in the first place (stories 40 and 52). Home is the one place Rows are
 * drawn, so it is also the one place that decides what a card offers.
 */
const myListControl = (card: RowCard) => <MyListToggle card={card} />;

export function isRowBuilt(kind: HomeRowKind): boolean {
  return BUILT_ROW_KINDS.indexOf(kind) !== -1;
}

export type HomeRowProps = {
  /**
   * The Row as the layout holds it, not just its kind: a genre or Collection
   * Row is only half itself without the choice it carries.
   */
  row: HomeRow;
  gateway: JellyfinGateway;
  /** Changes when the User or the Server does, so a Row reads itself again. */
  readKey: string;
};

/** One Row of Home, whichever kind it is. */
export function HomeRowFor({ row, gateway, readKey }: HomeRowProps) {
  const t = useTranslate();
  const choice = row.parameter;

  switch (row.kind) {
    case 'continue-watching':
      return <ContinueWatchingRow gateway={gateway} readKey={readKey} />;
    case 'my-list':
      return <MyListRow />;
    case 'new-on-jellyflick':
      return <NewOnJellyflickRow gateway={gateway} readKey={readKey} />;
    case 'watch-again':
      return (
        <SuggestionRow
          name="home.row.watchAgain"
          readKey={readKey}
          load={() => loadWatchAgain(gateway)}
        />
      );
    case 'because-you-watched':
      return (
        <SuggestionRow
          name="home.row.becauseYouWatched"
          readKey={readKey}
          // The one loader that asks twice in sequence, so it is told when the
          // Row has gone rather than going on talking to the Server for it.
          load={(stillWanted) => loadBecauseYouWatched(gateway, undefined, stillWanted)}
          // The Server says which Title it suggested from; the heading is the
          // sentence that makes of it.
          headingFrom={(title) => t('home.row.becauseYouWatchedTitle', { title })}
        />
      );
    case 'genre':
      // A Row the layout holds with no choice at all cannot be drawn.
      // `parseHomeLayout` drops one on the way in, so this is only reachable
      // through a layout built by hand in code.
      if (choice === undefined) return null;
      return (
        <SuggestionRow
          name="home.row.genre"
          readKey={`${readKey}|${choice}`}
          load={() => loadGenreRow(gateway, choice)}
        />
      );
    case 'collection':
      if (choice === undefined) return null;
      return (
        <SuggestionRow
          name="home.row.collection"
          readKey={`${readKey}|${choice}`}
          load={() => loadCollectionRow(gateway, choice)}
        />
      );
    default:
      // A kind whose feature is not built yet. See the note above.
      return null;
  }
}

/**
 * One of #15's Rows: ask the Server, draw what comes back (stories 43 to 46).
 *
 * The four of them differ in the question alone, which is the loader's, so
 * there is one component over all of them rather than four that each read a
 * little differently. Every rule about *which* Titles is in
 * `suggestion-rows.ts`.
 *
 * - **An empty Row draws nothing**, as My List's and Continue Watching's do. A
 *   User who has finished nothing, or whose genre holds one Title they have
 *   since removed, is an ordinary state and not worth a notice on every visit.
 * - **A Server that will not answer is worth saying**, because a Row that
 *   quietly vanished would look like the app having lost something.
 * - **The heading is the Server's where the Server names it** — the genre, the
 *   Collection, the Title a suggestion came from — and the Row's own name
 *   otherwise.
 */
function SuggestionRow({
  name,
  readKey,
  load,
  headingFrom,
}: {
  name: MessageKey;
  readKey: string;
  /**
   * Asks the Server. It is handed a `stillWanted` predicate for the loader
   * that asks more than once: false once this Row has gone, so no follow-up
   * question is asked for a Row nobody is looking at.
   */
  load: (stillWanted: () => boolean) => Promise<SuggestionRowResult>;
  /**
   * What to make of the name the Server gave the Row. Without one the Server's
   * name *is* the heading, which is what a genre and a Collection want: the
   * strip is headed "Comedy", not "Genre: Comedy".
   */
  headingFrom?: (fromServer: string) => string;
}) {
  const t = useTranslate();
  const openTitle = useOpenTitle();
  const [result, setResult] = useState<SuggestionRowResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setResult(undefined);
    void load(() => !abandoned).then((loaded) => {
      if (abandoned) return;
      setResult(loaded);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so what the Row is *about* — the
    // Server, the User and the choice — is the dependency.
  }, [readKey]);

  if (result === undefined) return <p class="notice">{t('home.rowLoading')}</p>;
  if (result.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('home.row.unavailable', { row: t(name) })}
      </p>
    );
  }
  if (result.titles.length === 0) return null;

  // The name the Server gave the Row, as this Row reads it, and the Row's own
  // name when the Server gave it none.
  const fromServer = result.heading;
  const heading =
    fromServer === undefined
      ? t(name)
      : headingFrom === undefined
        ? fromServer
        : headingFrom(fromServer);

  return (
    <Row
      heading={heading}
      cards={result.titles}
      onCardPress={openTitle}
      cardControl={myListControl}
    />
  );
}

/**
 * New on Jellyflick: the newest Titles across the libraries (#4).
 *
 * "The Server would not say" and "there is nothing yet" are different answers
 * and are told apart, because one is a problem and the other is not.
 */
function NewOnJellyflickRow({ gateway, readKey }: { gateway: JellyfinGateway; readKey: string }) {
  const t = useTranslate();
  const openTitle = useOpenTitle();
  const [result, setResult] = useState<NewOnJellyflickResult | undefined>(undefined);

  useEffect(() => {
    let abandoned = false;
    setResult(undefined);
    void loadNewOnJellyflick(gateway).then((loaded) => {
      if (abandoned) return;
      setResult(loaded);
    });
    return () => {
      abandoned = true;
    };
    // What is new is new to one User on one Server, which is what `readKey`
    // carries: the gateway itself is rebuilt on every render.
  }, [readKey]);

  if (result === undefined) return <p class="notice">{t('home.rowLoading')}</p>;
  if (result.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('home.newOnJellyflick.unavailable')}
      </p>
    );
  }
  // An empty Row would look like something still loading, so Home says what is
  // actually the case.
  if (result.titles.length === 0) return <p class="notice">{t('home.newOnJellyflick.empty')}</p>;

  return (
    <Row
      heading={t('home.newOnJellyflick')}
      cards={result.titles}
      onCardPress={openTitle}
      cardControl={myListControl}
    />
  );
}

/**
 * My List: the Titles the User has saved (#13, story 40).
 *
 * It reads the shell's one My List store rather than the Server, so a Title
 * added from a card beside it appears here at the same moment.
 *
 * An empty My List draws no Row at all, where New on Jellyflick says so in
 * words. The difference is that an empty My List is where every User starts and
 * is theirs to fill, so a notice on Home saying so on every visit would be in
 * the way — the My List page is where it explains itself. A Server that will not
 * say what is in the list is the same: Home shows the rest of itself and the
 * page carries the problem.
 */
function MyListRow() {
  const t = useTranslate();
  const openTitle = useOpenTitle();
  const myList = useMyList();
  const state = myList.state();

  if (state.outcome !== 'list' || state.titles.length === 0) return null;
  return (
    <Row
      heading={t('home.row.myList')}
      cards={state.titles}
      onCardPress={openTitle}
      cardControl={myListControl}
    />
  );
}
