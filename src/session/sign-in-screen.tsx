import type { ComponentChildren } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { useTranslate, type Translate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { QuickConnectPanel } from './quick-connect-panel';
import type { Credentials, Session, SignInResult } from './session';

/** A public user as the sign-in screen needs them: who to show, and a picture. */
export type PublicUser = {
  userId: string;
  name: string;
  /** Already built by the gateway. Absent when the User has no picture. */
  pictureUrl?: string;
};

export type SignInFailure = Exclude<SignInResult, { outcome: 'signed-in' }>;

export type SignInScreenProps = {
  session: Session;
  /**
   * Asked what shape of device this is, which is what decides whether Quick
   * Connect is offered before a password (#9). The screen never reads the user
   * agent or a media query itself — `device.deviceForm()` is the one answer.
   */
  device: DeviceLayer;
  /** Shown in the message when the Server cannot be reached. */
  serverAddress: string;
  onSignedIn(): void;
  /**
   * Gives up on signing in. Present only when there is something to give up
   * *to*: another household member being added while Users are already signed
   * in on the device (#8). The first User on a device has nowhere to go.
   */
  onCancel?(): void;
};

/**
 * What `/Users/Public` came back with. An empty list and a refusal are
 * different things — every account hidden, against something going wrong — and
 * they read differently on screen.
 */
type PublicUsers = { readonly users: readonly PublicUser[] } | { readonly unavailable: true };

/**
 * Signing in: with a code approved in another Jellyfin app (#9), or with a
 * password — picking yourself from the Server's public Users, or typing a
 * username the Server does not list.
 *
 * A Server with no public Users at all — every account hidden, or a Server that
 * will not say — goes straight to the typed path, because an empty list is not
 * a screen worth showing.
 *
 * **Which way is offered first is the device's answer, not this screen's
 * opinion.** On a TV the code comes first, because the thing being avoided is
 * typing a password with a remote; everywhere else the Users come first and the
 * code is one press away. The question is put to `device.deviceForm()` so that
 * the webOS port answers it by being a TV rather than by being sniffed, and so
 * nothing outside `src/device/` reads `navigator`.
 *
 * **A Server with Quick Connect switched off is never offered it at all**, not
 * even on a TV — a code that could never be approved would be the only thing
 * such a User saw. `GET /QuickConnect/Enabled` is read once, beside the public
 * Users, and a Server that will not answer is taken to mean "off": offering
 * nothing is better than offering something broken.
 */
export function SignInScreen(props: SignInScreenProps) {
  const t = useTranslate();
  const [publicUsers, setPublicUsers] = useState<PublicUsers | undefined>(undefined);
  /** Whether the Server has Quick Connect on. Undefined until it has said. */
  const [quickConnectOffered, setQuickConnectOffered] = useState<boolean | undefined>(undefined);
  /** The User asked for a code instead, or a TV was offered one first. */
  const [usingQuickConnect, setUsingQuickConnect] = useState(false);
  /** The public User whose password is being asked for, if one was picked. */
  const [chosen, setChosen] = useState<PublicUser | undefined>(undefined);
  /** The User asked to type a username instead of picking one. */
  const [typing, setTyping] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const gateway = props.session.gateway();

  useEffect(() => {
    let abandoned = false;
    void readPublicUsers(gateway).then((users) => {
      if (abandoned) return;
      setPublicUsers(users === undefined ? { unavailable: true } : { users });
    });
    // A Server that will not answer is read as "off": a code it would never
    // accept is worse than no code at all.
    void gateway
      .isQuickConnectEnabled()
      .catch(() => false)
      .then((enabled) => {
        if (abandoned) return;
        setQuickConnectOffered(enabled === true);
        // A TV is handed the code straight away, which is the acceptance
        // criterion: the device layer decides, and this is where its answer is
        // acted on.
        if (enabled === true && props.device.deviceForm() === 'tv') {
          setUsingQuickConnect(true);
        }
      });
    return () => {
      abandoned = true;
    };
    // Both belong to the Server, so they are read again only if the address
    // changes. The gateway itself is rebuilt on every render, so the address is
    // the dependency, not the gateway.
  }, [gateway.serverAddress]);

  function attempt(credentials: Credentials): void {
    setBusy(true);
    setFailure(undefined);
    void props.session.signIn(credentials).then((result) => {
      setBusy(false);
      if (result.outcome === 'signed-in') {
        props.onSignedIn();
        return;
      }
      setFailure(result);
    });
  }

  /**
   * The way to a code from the password path. One element rather than one per
   * view: a User who got as far as the list, or as far as typing a username,
   * should still be able to change their mind.
   */
  const offerQuickConnect =
    quickConnectOffered !== true ? null : (
      <button
        class="button button--quiet"
        type="button"
        onClick={() => {
          setFailure(undefined);
          setUsingQuickConnect(true);
        }}
      >
        {t('quickConnect.offer')}
      </button>
    );

  const problem =
    failure === undefined ? null : (
      <p class="notice notice--problem" role="alert">
        {failureMessage(t, failure, props.serverAddress)}
      </p>
    );

  const listed = publicUsers === undefined || 'unavailable' in publicUsers ? [] : publicUsers.users;
  // Nothing is drawn until both answers are in, so a TV never shows the list
  // of Users for a moment before replacing it with a code.
  const view =
    publicUsers === undefined || quickConnectOffered === undefined
      ? 'loading'
      : usingQuickConnect
        ? 'quick-connect'
        : chosen !== undefined
          ? 'password'
          : typing || listed.length === 0
            ? 'typed'
            : 'choosing';

  return (
    <main class="screen screen--centred">
      <h1 class="wordmark">{t('app.name')}</h1>

      {view === 'loading' ? <p class="notice">{t('signIn.loadingUsers')}</p> : null}

      {view === 'quick-connect' ? (
        <QuickConnectPanel
          session={props.session}
          serverAddress={props.serverAddress}
          onSignedIn={props.onSignedIn}
          onUsePassword={() => {
            setUsingQuickConnect(false);
          }}
        />
      ) : null}

      {view === 'choosing' ? (
        <div class="stack panel panel--wide">
          <h2 class="screen__heading">{t('signIn.heading')}</h2>
          <ul class="user-list">
            {listed.map((user) => (
              <li key={user.userId}>
                <button
                  class="user-list__user"
                  type="button"
                  onClick={() => {
                    setFailure(undefined);
                    setChosen(user);
                  }}
                >
                  <UserPicture user={user} />
                  <span class="user-list__name">{user.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            class="button button--quiet"
            type="button"
            onClick={() => {
              setFailure(undefined);
              setTyping(true);
            }}
          >
            {t('signIn.typeUsername')}
          </button>
          {offerQuickConnect}
        </div>
      ) : null}

      {view === 'password' && chosen !== undefined ? (
        <PasswordForm
          user={chosen}
          busy={busy}
          problem={problem}
          onSubmit={(password) => attempt({ username: chosen.name, password })}
          onBack={() => {
            setFailure(undefined);
            setChosen(undefined);
          }}
        />
      ) : null}

      {view === 'typed' ? (
        <>
        <TypedCredentialsForm
          usersUnavailable={publicUsers !== undefined && 'unavailable' in publicUsers}
          busy={busy}
          problem={problem}
          onSubmit={attempt}
          {...(listed.length === 0
            ? {}
            : {
                onBack: () => {
                  setFailure(undefined);
                  setTyping(false);
                },
              })}
        />
        {offerQuickConnect}
        </>
      ) : null}

      {/*
        Giving up on adding another User, in one place rather than on each of
        the three views: a Server slow to list its Users must not trap the
        household member who was already watching either.
      */}
      {props.onCancel === undefined ? null : (
        <button class="button button--quiet" type="button" onClick={props.onCancel}>
          {t('users.cancelAdding')}
        </button>
      )}
    </main>
  );
}

/** The User's picture, or their initial when the Server has none for them. */
function UserPicture({ user }: { user: PublicUser }) {
  if (user.pictureUrl === undefined) {
    return (
      <span class="user-list__initial" aria-hidden="true">
        {initialOf(user.name)}
      </span>
    );
  }
  // The name is next to the picture, so the picture itself adds nothing for a
  // screen reader and is left out of the button's name.
  return <img class="user-list__picture" src={user.pictureUrl} alt="" />;
}

function PasswordForm(props: {
  user: PublicUser;
  busy: boolean;
  problem: ComponentChildren;
  onSubmit(password: string): void;
  onBack(): void;
}) {
  const t = useTranslate();
  const passwordId = useId();
  const [password, setPassword] = useState('');

  return (
    <form
      class="stack panel"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(password);
      }}
    >
      <h2 class="screen__heading">{props.user.name}</h2>
      <p class="screen__lead">{t('signIn.passwordFor', { name: props.user.name })}</p>

      <label class="field__label" for={passwordId}>
        {t('signIn.passwordLabel')}
      </label>
      <input
        class="field__input"
        id={passwordId}
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
      />

      {props.problem}

      <button class="button button--primary" type="submit" disabled={props.busy}>
        {props.busy ? t('signIn.signingIn') : t('signIn.submit')}
      </button>
      <button class="button button--quiet" type="button" onClick={props.onBack}>
        {t('signIn.back')}
      </button>
    </form>
  );
}

function TypedCredentialsForm(props: {
  usersUnavailable: boolean;
  busy: boolean;
  problem: ComponentChildren;
  onSubmit(credentials: Credentials): void;
  /** Absent when there is no list to go back to. */
  onBack?(): void;
}) {
  const t = useTranslate();
  const usernameId = useId();
  const passwordId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      class="stack panel"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({ username, password });
      }}
    >
      <h2 class="screen__heading">{t('signIn.typedHeading')}</h2>
      <p class="screen__lead">
        {props.usersUnavailable ? t('signIn.error.usersUnavailable') : t('signIn.typedExplanation')}
      </p>

      <label class="field__label" for={usernameId}>
        {t('signIn.usernameLabel')}
      </label>
      <input
        class="field__input"
        id={usernameId}
        name="username"
        type="text"
        autoComplete="username"
        autoCorrect="off"
        spellcheck={false}
        value={username}
        onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
      />

      <label class="field__label" for={passwordId}>
        {t('signIn.passwordLabel')}
      </label>
      <input
        class="field__input"
        id={passwordId}
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
      />

      {props.problem}

      <button class="button button--primary" type="submit" disabled={props.busy}>
        {props.busy ? t('signIn.signingIn') : t('signIn.submit')}
      </button>
      {props.onBack === undefined ? null : (
        <button class="button button--quiet" type="button" onClick={props.onBack}>
          {t('signIn.back')}
        </button>
      )}
    </form>
  );
}

/** Maps each way signing in can fail onto its translated explanation. */
export function failureMessage(
  t: Translate,
  failure: SignInFailure,
  serverAddress: string,
): string {
  switch (failure.outcome) {
    case 'wrong-credentials':
      return t('signIn.error.wrongCredentials');
    case 'username-missing':
      return t('signIn.error.usernameMissing');
    case 'password-missing':
      return t('signIn.error.passwordMissing');
    case 'unreachable':
      return t('signIn.error.unreachable', { serverAddress });
    case 'server-problem':
      return t('signIn.error.serverProblem', { status: String(failure.status) });
  }
}

/** The Server's public Users, or `undefined` when it would not say. */
async function readPublicUsers(
  gateway: JellyfinGateway,
): Promise<readonly PublicUser[] | undefined> {
  let dtos;
  try {
    dtos = await gateway.getPublicUsers();
  } catch {
    return undefined;
  }

  const users: PublicUser[] = [];
  for (const dto of dtos) {
    if (typeof dto.Id !== 'string' || dto.Id === '') continue;
    const tag = dto.PrimaryImageTag;
    users.push({
      userId: dto.Id,
      name: dto.Name ?? dto.Id,
      // A null picture tag means the User has no picture at all.
      ...(typeof tag === 'string' && tag !== ''
        ? { pictureUrl: gateway.userImageUrl(dto.Id, tag) }
        : {}),
    });
  }
  return users;
}

/** The first character of a name, for a User with no picture. */
function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed === '' ? '?' : trimmed.slice(0, 1).toUpperCase();
}
