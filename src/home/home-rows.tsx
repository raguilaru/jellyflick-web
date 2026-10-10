import { useEffect, useState } from 'preact/hooks';
import { useTranslate, type MessageKey } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { MyListToggle } from '../my-list/my-list-toggle';
import { useMyList } from '../my-list/use-my-list';
import type { HomeRowKind } from './home-layout';
import { loadNewOnJellyflick, type NewOnJellyflickResult } from './new-on-jellyflick';
import { Row, type RowCard } from './row';

/**
 * Which Row each kind in a Home Layout is, and what draws it.
 *
 * The Home Layout can name a Row whose feature is not built yet — Continue
 * Watching is #12 and the suggestion Rows #15 — so Home draws
 * only the kinds in `BUILT_ROW_KINDS` and simply leaves the rest out. That is
 * deliberately not a placeholder: an empty Row on Home would look like
 * something that failed, whereas a Row that is not there yet is honest about
 * what the app does today. The Home Layout editor says so in words.
 *
 * **Adding a Row's feature** is: a loader of its own beside
 * `new-on-jellyflick.ts`, a case in `HomeRowFor`, and the kind added to
 * `BUILT_ROW_KINDS`. Nothing else changes — the layout already carries it.
 */

/** A Row's name, wherever it is shown: as its heading, and in the editor. */
export const ROW_NAME_KEYS: Readonly<Record<HomeRowKind, MessageKey>> = {
  'continue-watching': 'home.row.continueWatching',
  'my-list': 'home.row.myList',
  // The Row's name is the app's name, so it keeps the key it has had since #4.
  'new-on-jellyflick': 'home.newOnJellyflick',
  'watch-again': 'home.row.watchAgain',
  'because-you-watched': 'home.row.becauseYouWatched',
};

/** The kinds whose feature exists, and so the ones Home can draw today. */
export const BUILT_ROW_KINDS: readonly HomeRowKind[] = ['my-list', 'new-on-jellyflick'];

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
  kind: HomeRowKind;
  gateway: JellyfinGateway;
  /** Changes when the User or the Server does, so a Row reads itself again. */
  readKey: string;
};

/** One Row of Home, whichever kind it is. */
export function HomeRowFor({ kind, gateway, readKey }: HomeRowProps) {
  switch (kind) {
    case 'my-list':
      return <MyListRow />;
    case 'new-on-jellyflick':
      return <NewOnJellyflickRow gateway={gateway} readKey={readKey} />;
    default:
      // A kind whose feature is not built yet. See the note above.
      return null;
  }
}

/**
 * New on Jellyflick: the newest Titles across the libraries (#4).
 *
 * "The Server would not say" and "there is nothing yet" are different answers
 * and are told apart, because one is a problem and the other is not.
 */
function NewOnJellyflickRow({ gateway, readKey }: { gateway: JellyfinGateway; readKey: string }) {
  const t = useTranslate();
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
  const myList = useMyList();
  const state = myList.state();

  if (state.outcome !== 'list' || state.titles.length === 0) return null;
  return (
    <Row heading={t('home.row.myList')} cards={state.titles} cardControl={myListControl} />
  );
}
