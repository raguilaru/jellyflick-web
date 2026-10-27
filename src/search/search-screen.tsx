import { useEffect, useRef, useState } from 'preact/hooks';
import { useOpenTitle } from '../home/open-title';
import { Row } from '../home/row';
import { useTranslate } from '../i18n/index';
import { FOCUSABLE_SELECTOR, groupOf, tabStopIn } from '../navigation/focusable';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { Session } from '../session/session';
import { BrowseByGenre } from './genres';
import { searchForTitles, type TitlesResult } from './search';

export type SearchScreenProps = {
  session: Session;
};

/** The one id the label and the field agree on. */
const FIELD_ID = 'search-term';

/**
 * How long after the last keystroke the Server is asked. Long enough that a
 * word typed at speed is one question, short enough that the results feel live.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * Search: results as the User types.
 *
 * The typing is debounced, so a term is one question to the Server rather than
 * one per keystroke, and the results already on the screen stay there while the
 * next answer is on its way — a strip that emptied between every keystroke
 * would flicker. An answer that arrives after a later one has been asked for is
 * dropped, so the slowest reply cannot overwrite the newest.
 *
 * On a remote the flow is the field first and then the results, so the field
 * takes focus when the screen opens and Down or Enter hands focus on to what is
 * below it. That handing on is the field's own, deliberately: a field owns its
 * arrow keys — Left and Right move the caret — so `spatial-navigation.ts` keeps
 * out of a field altogether, and a screen that wants a key back has to take it
 * before that handler rather than add a second one.
 */
export function SearchScreen({ session }: SearchScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const [term, setTerm] = useState('');
  const settled = useDebounced(term, SEARCH_DEBOUNCE_MS);
  const results = useSearch(gateway, settled);
  const field = useRef<HTMLInputElement | null>(null);

  // The screen opens on the typing, so the first key a User presses goes where
  // they expect — and on a TV, where it brings up the on-screen keyboard.
  useEffect(() => {
    field.current?.focus();
  }, []);

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('search.heading')}</h1>

      {/*
        The field is kept narrow rather than running the width of a TV. That is
        how it reads, and it is also what keeps the arrow keys sensible: the
        navigator scores a candidate partly by how far its centre is across the
        direction pressed, so a field spanning 1920px would lose Up from a
        result to a link in the bar above it.
      */}
      <div class="stack search__field">
        <label class="field__label" for={FIELD_ID}>
          {t('search.fieldLabel')}
        </label>
        <input
          class="field__input"
          id={FIELD_ID}
          type="search"
          autoComplete="off"
          ref={field}
          value={term}
          onInput={(event) => {
            setTerm((event.target as HTMLInputElement).value);
          }}
          onKeyDown={(event) => {
            // Down and Enter are the two ways off a field and into what it
            // found. Everything else stays the field's: Left and Right are the
            // caret's, Backspace is an edit, and Up has the bar above it.
            if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
            if (!focusAfter(event.currentTarget)) return;
            event.preventDefault();
          }}
        />
      </div>

      {/*
        Genres are what the screen offers while no term has been typed. Once
        there is one, the results take the space: a User who is searching has
        said what they want.
      */}
      {settled === '' ? (
        <BrowseByGenre gateway={gateway} />
      ) : (
        <SearchResults term={settled} results={results} />
      )}
    </main>
  );
}

/**
 * What the Server said about the term on the screen: the strip of matches, or
 * the one line that stands in for it.
 */
function SearchResults({
  term,
  results,
}: {
  term: string;
  results: TitlesResult | undefined;
}) {
  const t = useTranslate();
  const openTitle = useOpenTitle();

  if (results === undefined) return <p class="notice">{t('search.searching')}</p>;
  if (results.outcome === 'unavailable') {
    return (
      <p class="notice notice--problem" role="alert">
        {t('search.unavailable')}
      </p>
    );
  }
  // An empty strip would look like something still loading, so the screen says
  // what is actually the case.
  if (results.titles.length === 0) {
    return <p class="notice">{t('search.nothingFound', { term })}</p>;
  }
  // Opening a result is the same thing as opening a card on Home: its title
  // page (#17). #7 and #24 both left this handler waiting for one to exist.
  return (
    <Row heading={t('search.results')} cards={results.titles} onCardPress={openTitle} />
  );
}

/**
 * Asks the Server about a term, keeping the answer on the screen while the next
 * one is on its way. Nothing is cleared when a new term arrives: that is the
 * whole of "no flicker".
 */
function useSearch(gateway: JellyfinGateway, searchTerm: string): TitlesResult | undefined {
  const [results, setResults] = useState<TitlesResult | undefined>(undefined);
  // Which question the answer on the screen belongs to, so a slow reply that
  // arrives after a newer question was asked is thrown away rather than shown.
  const asked = useRef(0);

  useEffect(() => {
    const question = (asked.current += 1);
    if (searchTerm === '') {
      setResults(undefined);
      return;
    }
    void searchForTitles(gateway, searchTerm).then((found) => {
      if (asked.current !== question) return;
      setResults(found);
    });
    // A search is one User's on one Server, so a change of either asks again.
    // The gateway is rebuilt on every render, which is why the address is the
    // dependency rather than the gateway itself.
  }, [gateway.serverAddress, searchTerm]);

  return results;
}

/**
 * Moves focus to the first thing after the field on this screen, and answers
 * whether there was one: the strip of results, or the genres when nothing has
 * been typed. Document order rather than geometry, because on this screen the
 * field runs the width of it and what is below is the only way on — and
 * because arriving in a strip should land on the card it remembers, which is
 * what `tabStopIn` is.
 */
function focusAfter(field: HTMLElement): boolean {
  const screen = field.closest('main');
  if (screen === null) return false;

  const items: HTMLElement[] = [];
  screen.querySelectorAll(FOCUSABLE_SELECTOR).forEach((element) => {
    if (element instanceof HTMLElement) items.push(element);
  });

  const next = items[items.indexOf(field) + 1];
  if (next === undefined) return false;

  const group = groupOf(next);
  const target = (group === undefined ? undefined : tabStopIn(group)) ?? next;
  target.focus();
  return true;
}

/**
 * A value as it was `delay` milliseconds ago, once it has stopped changing.
 * This is the debounce, and it is the *value* that waits rather than the
 * request: one place decides when a term has settled, and everything
 * downstream simply reads a term.
 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return settled;
}
