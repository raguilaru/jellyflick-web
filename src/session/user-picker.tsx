import { useTranslate } from '../i18n/index';
import { SETTINGS_PATH } from '../settings/settings-screen';
import type { Session, SignedInUser } from './session';

/**
 * The User Picker: who of the household is watching (stories 15 to 19).
 *
 * It is one component in two places, because it answers one question in two
 * situations. When the app opens with more than one User signed in there is no
 * shell yet and nothing to go back to, so it is the whole screen. From the
 * User picture in either bar it is an overlay over whatever the User was
 * looking at, and closing it puts them back exactly there.
 *
 * It is deliberately **not an address**, unlike every section and unlike the
 * Home Layout editor:
 *
 * - Back is the browser's back button everywhere in this app. An address for
 *   the picker would put a history entry between a User and the screen they
 *   came from, and the entries behind it were made by the *previous* User —
 *   so Back after a switch would walk one User's history as another.
 * - It has to be reachable before the shell exists, which an address inside
 *   the router cannot be.
 * - Cancelling has to leave the User where they were, not one step back.
 *
 * `src/shell/sections.ts` is therefore still the single list of sections, with
 * no entry for this. A fixed overlay is its own flow as far as the arrow keys
 * are concerned (#7), so Up and Down walk the Users without any work here.
 */

/** A User as the picker shows them: who they are, and a picture if there is one. */
export type PickableUser = {
  readonly userId: string;
  readonly name: string;
  /** Already built by the gateway. Absent when the User has no picture. */
  readonly pictureUrl?: string;
};

/**
 * What switching User needs, wherever it is offered from. One object rather
 * than four props, because the bars pass it straight through the shell to the
 * overlay without having an opinion about any of it.
 */
export type UsersOnThisDevice = {
  /** Every signed-in User, in the order they signed in. */
  readonly users: readonly PickableUser[];
  /** Who is watching, when one of them is. */
  readonly current?: PickableUser;
  /** Makes a signed-in User the one watching. No password: their token is here. */
  pick(userId: string): void;
  /** Another household member signs in, with the signed-in Users all kept. */
  addUser(): void;
  /** Takes one User off this device and leaves every other one alone. */
  signOut(userId: string): void;
};

export type UserPickerProps = {
  users: UsersOnThisDevice;
  /**
   * Absent when there is nothing to go back to, which is the picker the app
   * opens on: nobody is watching yet, so there is no screen behind it.
   */
  onClose?(): void;
};

export function UserPicker({ users, onClose }: UserPickerProps) {
  const t = useTranslate();
  const current = users.current;

  return (
    <div class="user-picker">
      <div class="stack panel panel--wide user-picker__panel">
        <h1 class="screen__heading">{t('users.pickerHeading')}</h1>
        <p class="screen__lead">{t('users.pickerExplanation')}</p>

        <ul class="user-list">
          {users.users.map((user) => (
            <li class="user-list__entry" key={user.userId}>
              <button
                class="user-list__user"
                type="button"
                onClick={() => users.pick(user.userId)}
              >
                <UserPicture user={user} />
                <span class="user-list__name">{user.name}</span>
              </button>
              {/*
                A sign-out per User, and a focus stop like everything else on
                this panel. The picker is where a household says who is on this
                device, so taking someone off it has to be possible from here —
                there is no PIN or lock to pass first, and that is permanently
                so, which also means there is nobody this control could be
                hidden from. Whoever is signed out, only that User goes.
              */}
              <button
                class="button button--quiet user-list__sign-out"
                type="button"
                onClick={() => users.signOut(user.userId)}
              >
                {t('users.signOut', { name: user.name })}
              </button>
            </li>
          ))}
        </ul>

        <button class="button button--primary" type="button" onClick={() => users.addUser()}>
          {t('users.addUser')}
        </button>

        {onClose === undefined || current === undefined ? null : (
          <>
            {/*
              The way to the settings screen, and on a phone the only one.
              `/settings` is not a section, so neither bar lists it; the top bar
              carries its own link after the sections (#11), but a phone's bottom
              bar has no room for a fifth item and its User picture is how
              switching User is reached (#8). This panel is already where a
              household's own things live, so it is where settings belong too.

              It closes the picker as it navigates: the overlay is state, not an
              address, so nothing else would take it off the screen.
            */}
            <a class="button button--quiet" href={SETTINGS_PATH} onClick={onClose}>
              {t('nav.settings')}
            </a>
            <button class="button button--quiet" type="button" onClick={onClose}>
              {t('users.keepWatching', { name: current.name })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The User's picture, or their initial when the Server has none for them. */
function UserPicture({ user }: { user: PickableUser }) {
  if (user.pictureUrl === undefined) {
    return (
      <span class="user-list__initial" aria-hidden="true">
        {initialOf(user.name)}
      </span>
    );
  }
  // The name is next to the picture, so the picture adds nothing for a screen
  // reader and is left out of the button's name.
  return <img class="user-list__picture" src={user.pictureUrl} alt="" />;
}

/**
 * The signed-in Users as the picker needs them. `/UserImage` is anonymous on
 * the Server, so the URL is all the browser needs and any User's picture can
 * be built from the gateway in front of us, whoever its token belongs to.
 */
export function pickableUsersOf(session: Session): readonly PickableUser[] {
  const gateway = session.gateway();
  return session.signedInUsers().map((user) => pickableUser(user, gateway.userImageUrl));
}

function pickableUser(
  user: SignedInUser,
  userImageUrl: (userId: string, tag: string) => string,
): PickableUser {
  return {
    userId: user.userId,
    name: user.name,
    ...(user.primaryImageTag === undefined
      ? {}
      : { pictureUrl: userImageUrl(user.userId, user.primaryImageTag) }),
  };
}

/**
 * The first character of a name, for a User with no picture. Taken with
 * `Array.from` rather than `name[0]`, so a name beginning with an emoji or any
 * other character outside the basic plane is not cut in half.
 */
function initialOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return '?';
  return (Array.from(trimmed)[0] ?? '?').toLocaleUpperCase();
}
