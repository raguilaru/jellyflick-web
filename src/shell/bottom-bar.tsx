import { useTranslate } from '../i18n/index';
import type { SignedInUser } from '../session/session';
import { SETTINGS_PATH } from '../settings/settings-screen';
import { BOTTOM_BAR_SECTION_IDS, sectionsFor } from './sections';
import { SectionLink } from './section-link';

export type BottomBarProps = {
  currentPath: string;
  user: SignedInUser;
  /** The signed-in User's picture, when the Server has one for them. */
  pictureUrl?: string;
};

/**
 * The navigation at phone widths: Home, Search, My List and the User's picture,
 * which is the shape phone Users already know (story 61).
 *
 * The picture is the way to the settings screen (#11): it is where a phone
 * User looks for their own things, and it is a real link, so it is a focus stop
 * and Back works from it. Its accessible name is "Settings" rather than the
 * User's name, because that is what pressing it does. Switching User (#8) is
 * still its own ticket.
 */
export function BottomBar({ currentPath, user, pictureUrl }: BottomBarProps) {
  const t = useTranslate();

  return (
    <nav class="bottom-bar" aria-label={t('nav.sections')}>
      {sectionsFor(BOTTOM_BAR_SECTION_IDS).map((section) => (
        <SectionLink
          key={section.id}
          class="bottom-bar__link"
          section={section}
          currentPath={currentPath}
        />
      ))}
      <a
        class={
          currentPath === SETTINGS_PATH
            ? 'bottom-bar__link bottom-bar__user bottom-bar__link--current'
            : 'bottom-bar__link bottom-bar__user'
        }
        href={SETTINGS_PATH}
        aria-label={t('nav.settings')}
        aria-current={currentPath === SETTINGS_PATH ? 'page' : undefined}
      >
        {pictureUrl === undefined ? (
          <span class="bottom-bar__initial">{initialOf(user.name)}</span>
        ) : (
          <img class="bottom-bar__picture" src={pictureUrl} alt="" />
        )}
        <span class="bottom-bar__name">{user.name}</span>
      </a>
    </nav>
  );
}

/**
 * The first character of a name, for a User with no picture. Taken with
 * `Array.from` rather than `name[0]`, so a name beginning with an emoji or any
 * other character outside the basic plane is not cut in half.
 */
function initialOf(name: string): string {
  return (Array.from(name)[0] ?? '').toLocaleUpperCase();
}
