import { useEffect, useState } from 'preact/hooks';
import { useTranslate, type Translate } from '../i18n/index';
import type { QuickConnectState } from './quick-connect';
import type { Session } from './session';

export type QuickConnectPanelProps = {
  session: Session;
  /** Shown in the message when the Server cannot be reached. */
  serverAddress: string;
  onSignedIn(): void;
  /** Goes to the password path instead. Always offered: see the note below. */
  onUsePassword(): void;
};

/**
 * Signing in by showing a code and waiting for it to be approved in another
 * Jellyfin app (#9, story 12).
 *
 * The flow and every rule about when it stops is `quick-connect.ts`. This is
 * the screen over it, and it owns three decisions of its own.
 *
 * **The attempt lives and dies with the panel.** It is started in an effect and
 * stopped in that effect's cleanup, so the one thing that must never happen —
 * a loop still asking a household's Server about a code nobody is looking at —
 * cannot: there is no way off this screen that does not unmount it.
 *
 * **A new code is a new attempt.** Nothing retries by itself, because the old
 * secret is spent or gone by the time anything went wrong with it. "Get a new
 * code" bumps a counter the effect depends on, which is the same as arriving
 * on the screen again.
 *
 * **The password is always one press away**, even on a TV where this is what is
 * offered first. A household member who would rather type, or whose phone is
 * in another room, is never cornered.
 */
export function QuickConnectPanel(props: QuickConnectPanelProps) {
  const t = useTranslate();
  const [state, setState] = useState<QuickConnectState>({ phase: 'starting' });
  /** Bumped by "Get a new code": a new attempt, from the start. */
  const [attemptNumber, setAttemptNumber] = useState(0);

  useEffect(() => {
    const attempt = props.session.startQuickConnect({ onState: setState });
    return () => {
      attempt.stop();
    };
    // `attemptNumber` is the dependency on purpose: it is what "try again"
    // means, and the session is one per app for the app's whole life.
  }, [props.session, attemptNumber]);

  // Leaving the screen is the app's to do, not this panel's: the effect's
  // cleanup is what stops the polling, and it runs because the panel goes.
  useEffect(() => {
    if (state.phase === 'signed-in') props.onSignedIn();
  }, [state.phase]);

  const failure = failureMessageFor(t, state, props.serverAddress);

  return (
    <div class="stack panel">
      <h2 class="screen__heading">{t('quickConnect.heading')}</h2>

      {state.phase === 'waiting' ? (
        <>
          <p class="screen__lead">{t('quickConnect.explanation')}</p>
          {/*
            The code is the one thing on this screen that has to be read from
            the other side of a room. It is a paragraph rather than a `strong`
            deliberately: Bebas Neue has a single weight, so a browser asked for
            a bold one synthesises it and the digits come out smeared. Size and
            letter spacing carry the emphasis instead, in `.quick-connect__code`.
          */}
          <p class="field__label" id="quick-connect-code-label">
            {t('quickConnect.codeLabel')}
          </p>
          <p class="quick-connect__code" aria-labelledby="quick-connect-code-label">
            {state.code}
          </p>
          <p class="notice" role="status">
            {t('quickConnect.waiting')}
          </p>
        </>
      ) : null}

      {state.phase === 'starting' ? <p class="notice">{t('quickConnect.starting')}</p> : null}
      {state.phase === 'signing-in' || state.phase === 'signed-in' ? (
        <p class="notice">{t('quickConnect.signingIn')}</p>
      ) : null}

      {failure === undefined ? null : (
        <>
          <p class="notice notice--problem" role="alert">
            {failure}
          </p>
          <button
            class="button button--primary"
            type="button"
            onClick={() => {
              setState({ phase: 'starting' });
              setAttemptNumber((number) => number + 1);
            }}
          >
            {t('quickConnect.retry')}
          </button>
        </>
      )}

      <button class="button button--quiet" type="button" onClick={props.onUsePassword}>
        {t('quickConnect.usePassword')}
      </button>
    </div>
  );
}

/**
 * The message for a state that has gone wrong, or `undefined` while nothing
 * has. The unreachable and server-problem wordings are the ones the password
 * path already uses: the same thing has happened, and a second phrasing for it
 * would be two strings to keep true rather than one.
 */
export function failureMessageFor(
  t: Translate,
  state: QuickConnectState,
  serverAddress: string,
): string | undefined {
  switch (state.phase) {
    case 'expired':
      return t('quickConnect.error.expired');
    case 'refused':
      return t('quickConnect.error.refused');
    case 'unavailable':
      return t('quickConnect.error.unavailable');
    case 'unreachable':
      return t('signIn.error.unreachable', { serverAddress });
    case 'server-problem':
      return t('signIn.error.serverProblem', { status: String(state.status) });
    default:
      return undefined;
  }
}
