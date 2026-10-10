import { useEffect, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import { HOME_PATH, SECTIONS } from './sections';
import { SectionLink } from './section-link';

/**
 * How far the page has to move before the bar stops being transparent. Small
 * enough that the Billboard behind it never shows through the text, large
 * enough that a stray pixel of scroll does not flicker it.
 */
const SOLID_AFTER_PIXELS = 16;

export type TopBarProps = {
  /** The address the User is on, so the section they are in can be marked. */
  currentPath: string;
};

/**
 * The navigation for anything wider than a phone: the wordmark, then one link
 * per section. It sits over the Billboard and turns solid as the page scrolls,
 * so the links stay readable over the artwork (story 62).
 */
export function TopBar({ currentPath }: TopBarProps) {
  const t = useTranslate();
  const solid = useSolidOnScroll();

  return (
    <header class={solid ? 'top-bar top-bar--solid' : 'top-bar'}>
      {/* The wordmark is the way back to Home, as well as the app's name. */}
      <a class="top-bar__wordmark wordmark" href={HOME_PATH}>
        {t('app.name')}
      </a>
      <nav class="top-bar__sections" aria-label={t('nav.sections')}>
        {SECTIONS.map((section) => (
          <SectionLink
            key={section.id}
            class="top-bar__link"
            section={section}
            currentPath={currentPath}
          />
        ))}
      </nav>
    </header>
  );
}

/**
 * Whether the page has been scrolled far enough for the bar to be solid.
 *
 * The listener is passive, because it must never hold up a scroll on a TV, and
 * `pageYOffset` is read rather than `scrollY` only because it is the name that
 * exists everywhere down to the floor.
 */
function useSolidOnScroll(): boolean {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = (): void => {
      setSolid(window.pageYOffset > SOLID_AFTER_PIXELS);
    };
    // A reload can restore a scrolled page before this ever fires.
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return solid;
}
