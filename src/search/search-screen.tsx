import { useEffect, useRef, useState } from 'preact/hooks';
import { Row } from '../home/row';
import { useTranslate } from '../i18n/index';
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
 */
export function SearchScreen({ session }: SearchScreenProps) {
  const t = useTranslate();
  const gateway = session.gateway();
  const [term, setTerm] = useState('');
  const settled = useDebounced(term, SEARCH_DEBOUNCE_MS);
  const results = useSearch(gateway, settled);

  return (
    <main class="screen">
      <h1 class="screen__heading">{t('search.heading')}</h1>

      <div class="stack">
        <label class="field__label" for={FIELD_ID}>
          {t('search.fieldLabel')}
        </label>
        <input
          class="field__input"
          id={FIELD_ID}
          type="search"
          autoComplete="off"
          value={term}
          onInput={(event) => {
            setTerm((event.target as HTMLInputElement).value);
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
  return <Row heading={t('search.results')} cards={results.titles} />;
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
