import { useTranslate } from '../i18n/index';
import type { PickableUser } from '../session/user-picker';
import { BOTTOM_BAR_SECTION_IDS, sectionsFor } from './sections';
import { SectionLink } from './section-link';
import { UserButton } from './user-button';

export type BottomBarProps = {
  currentPath: string;
  /** Who is watching, with their picture when the Server has one for them. */
  user: PickableUser;
  /** Opens the User Picker, which is this bar's fourth item (story 61). */
  onSwitchUser(): void;
};

/**
 * The navigation at phone widths: Home, Search, My List and the User's picture,
 * which is the shape phone Users already know (story 61).
 *
 * The picture is the way to switch User (#8), so it is a real button and a
 * focus stop now — #6 left it inert and said so. What it opens is the User
 * Picker, which is an overlay rather than an address: see `user-picker.tsx`.
 *
 * #11 had briefly made this picture a link to the settings screen, because a
 * phone has no room for a Settings item and `/settings` is not a section. #8's
 * own acceptance criterion claims the picture in both bars, so switching User
 * won it, and **the picker carries the way to settings instead** — it is
 * already the panel a household's own things live on. The bar therefore still
 * has the four items story 61 asks for and two specs assert, rather than a
 * fifth squeezed in.
 */
export function BottomBar({ currentPath, user, onSwitchUser }: BottomBarProps) {
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
      <UserButton user={user} bar="bottom-bar" onPress={onSwitchUser} />
    </nav>
  );
}
