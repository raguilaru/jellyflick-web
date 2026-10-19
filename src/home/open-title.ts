import { useLocation } from 'preact-iso/router';
import { titlePathFor } from '../title/title-page';
import type { RowCard } from './row';

/**
 * What pressing a card does: it opens that Title's page (#17).
 *
 * This is the handler `Row` has taken since #7 and had nothing to pass it, and
 * it is one fact for the whole app — a card on Home, a result in Search, a
 * Title in My List and one in More like this all go to the same place.
 *
 * It lives in a module of its own rather than beside the Rows that use it: it
 * used to sit in `home-rows.tsx`, which every Row's own module would then have
 * to import back from the file that imports *them*, and a cycle like that works
 * only until one of the two files grows something evaluated at import time.
 */
export function useOpenTitle(): (card: Pick<RowCard, 'titleId'>) => void {
  const { route } = useLocation();
  return (card) => {
    route(titlePathFor(card.titleId));
  };
}
