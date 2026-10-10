import { useEffect, useState } from 'preact/hooks';

/**
 * Which navigation bar the screen gets. Phone widths get the bottom bar,
 * anything wider gets the top bar.
 *
 * It is a media query rather than a container query, which ADR 0002 bans, and
 * it is asked in JavaScript rather than hidden with CSS so that only one bar is
 * ever in the document: two sets of the same links would be two stops for a
 * screen reader and two targets for every test.
 */
export const WIDE_SCREEN_QUERY = '(min-width: 768px)';

/**
 * A wide screen *and* a precise pointer: a desktop or a laptop, and neither a
 * phone nor a TV. It is what decides whether the title page is a pop-up or a
 * full page (#17), which is a question about the pointer as much as the width —
 * a 1080p TV is the widest screen in the house and is driven with a remote.
 *
 * `pointer` is a media feature, not a container query, so ADR 0002 leaves it
 * alone, and it has been in Chrome since 41 — well under the 68 floor. A device
 * the query cannot be asked about counts as *not* wide-pointer, so the full page
 * is what an unknown device gets: it is the layout that works everywhere.
 */
export const WIDE_POINTER_QUERY = '(min-width: 768px) and (pointer: fine)';

export function useWideScreen(): boolean {
  return useMediaQuery(WIDE_SCREEN_QUERY, true);
}

export function useWidePointer(): boolean {
  return useMediaQuery(WIDE_POINTER_QUERY, false);
}

/**
 * One media query, watched. `whenUnknown` is what a device with no `matchMedia`
 * is taken to be, which differs by query: the richer navigation bar, but the
 * plainer title page.
 */
function useMediaQuery(query: string, whenUnknown: boolean): boolean {
  const [matched, setMatched] = useState(() => matches(query, whenUnknown));

  useEffect(() => {
    const list = mediaQueryList(query);
    if (list === undefined) return;
    const onChange = (): void => {
      setMatched(list.matches);
    };
    // The query can have changed between the first render and this effect.
    onChange();
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, [query]);

  return matched;
}

function mediaQueryList(query: string): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined;
}

function matches(query: string, whenUnknown: boolean): boolean {
  return mediaQueryList(query)?.matches ?? whenUnknown;
}
