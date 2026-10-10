import { useEffect, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import type { PickableUser } from '../session/user-picker';
import { HOME_PATH, SECTIONS } from './sections';
import { SectionLink } from './section-link';
import { UserButton } from './user-button';

/**
 * How far the page has to move before the bar stops being transparent. Small
 * enough that the Billboard behind it never shows through the text, large
 * enough that a stray pixel of scroll does not flicker it.
 */
const SOLID_AFTER_PIXELS = 16;

export type TopBarProps = {
  /** The address the User is on, so the section they are in can be marked. */
  currentPath: string;
  /** Who is watching, with their picture when the Server has one for them. */
  user: PickableUser;
  /** Opens the User Picker. Switching User is available from both bars (#8). */
  onSwitchUser(): void;
};

/**
 * The navigation for anything wider than a phone: the wordmark, one link per
 * section, then the User's picture. It sits over the Billboard and turns solid
 * as the page scrolls, so the links stay readable over the artwork (story 62).
 *
 * The picture is at the end rather than among the sections because it is not
 * one: it opens the User Picker (story 17), and the same control is the fourth
 * item of the phone's bottom bar.
 */
export function TopBar({ currentPath, user, onSwitchUser }: TopBarProps) {
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
      <UserButton user={user} bar="top-bar" onPress={onSwitchUser} />
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
