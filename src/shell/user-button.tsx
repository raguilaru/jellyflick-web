import { useTranslate } from '../i18n/index';
import type { PickableUser } from '../session/user-picker';

export type UserButtonProps = {
  /** Who is watching. */
  user: PickableUser;
  /** The bar this sits in, which is also the stem of its class names. */
  bar: 'top-bar' | 'bottom-bar';
  onPress(): void;
};

/**
 * The User picture in both navigation bars, and the way to switch User from
 * anywhere in the app (story 17).
 *
 * #6 left the bottom bar's picture inert and not a focus stop, waiting for this
 * ticket. It is a real `<button>` in both bars now, so it is a stop for the
 * arrow keys and the remote like every other control, and `src/navigation/`
 * reaches it without being told anything.
 *
 * Its name says who is watching as well as what it does: the picture beside it
 * is a picture, which is nothing at all to a screen reader.
 */
export function UserButton({ user, bar, onPress }: UserButtonProps) {
  const t = useTranslate();

  return (
    <button
      class={`${bar}__user`}
      type="button"
      aria-label={t('users.switchUser', { name: user.name })}
      onClick={onPress}
    >
      {user.pictureUrl === undefined ? (
        <span class={`${bar}__initial`}>{initialOf(user.name)}</span>
      ) : (
        <img class={`${bar}__picture`} src={user.pictureUrl} alt="" />
      )}
      <span class={`${bar}__name`}>{user.name}</span>
    </button>
  );
}

/** The first character of a name, whole even outside the basic plane. */
function initialOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  return (Array.from(trimmed)[0] ?? '?').toLocaleUpperCase();
}
