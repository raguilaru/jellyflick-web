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

export function useWideScreen(): boolean {
  const [wide, setWide] = useState(() => matches(WIDE_SCREEN_QUERY));

  useEffect(() => {
    const list = mediaQueryList(WIDE_SCREEN_QUERY);
    if (list === undefined) return;
    const onChange = (): void => {
      setWide(list.matches);
    };
    // The query can have changed between the first render and this effect.
    onChange();
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, []);

  return wide;
}

/** A missing `matchMedia` means a wide screen, which is the richer layout. */
function mediaQueryList(query: string): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined;
}

function matches(query: string): boolean {
  return mediaQueryList(query)?.matches ?? true;
}
