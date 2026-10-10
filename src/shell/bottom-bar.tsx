import { useTranslate } from '../i18n/index';
import type { SignedInUser } from '../session/session';
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
 * The picture is not a control yet. Switching User and the settings screen are
 * their own tickets (#8, #11); until one of them lands, the picture says who
 * is watching and nothing more, so it is not something to land focus on.
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
      <span class="bottom-bar__user">
        {pictureUrl === undefined ? (
          <span class="bottom-bar__initial">{initialOf(user.name)}</span>
        ) : (
          <img class="bottom-bar__picture" src={pictureUrl} alt="" />
        )}
        <span class="bottom-bar__name">{user.name}</span>
      </span>
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
