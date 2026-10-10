import { useId } from 'preact/hooks';
import { useTranslate, type Translate } from '../i18n/index';
import { MINIMUM_SERVER_MAJOR_VERSION } from './connect-to-server';
import type { ConnectionResult } from './connect-to-server';

export type ConnectionFailure = Exclude<ConnectionResult, { outcome: 'connected' }>;

export type ServerAddressScreenProps = {
  /** Controlled: the address as it currently stands in the field. */
  address: string;
  onAddressChange(address: string): void;
  /** Why the last attempt did not work, if there was one. */
  lastFailure?: ConnectionFailure;
  busy: boolean;
  onSubmit(): void;
};

/**
 * Asks the User for the Server address. Shown when the host left the preset
 * address empty, and again whenever an attempt did not work.
 */
export function ServerAddressScreen(props: ServerAddressScreenProps) {
  const t = useTranslate();
  const inputId = useId();

  return (
    <main class="screen screen--centred">
      <h1 class="wordmark">{t('app.name')}</h1>
      <form
        class="stack panel"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <h2 class="screen__heading">{t('connect.heading')}</h2>
        <p class="screen__lead">{t('connect.explanation')}</p>

        <label class="field__label" for={inputId}>
          {t('connect.addressLabel')}
        </label>
        <input
          class="field__input"
          id={inputId}
          name="serverAddress"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          spellcheck={false}
          value={props.address}
          onInput={(event) => props.onAddressChange((event.target as HTMLInputElement).value)}
        />
        <p class="field__hint">{t('connect.addressHint')}</p>

        {props.lastFailure === undefined ? null : (
          <p class="notice notice--problem" role="alert">
            {failureMessage(t, props.lastFailure)}
          </p>
        )}

        <button class="button button--primary" type="submit" disabled={props.busy}>
          {props.busy ? t('connect.checking') : t('connect.submit')}
        </button>
      </form>
    </main>
  );
}

/** Maps each outcome onto its translated explanation. No string is inline. */
export function failureMessage(t: Translate, failure: ConnectionFailure): string {
  switch (failure.outcome) {
    case 'address-invalid':
      return t('connect.error.addressInvalid');
    case 'unreachable':
      return t('connect.error.unreachable', { serverAddress: failure.serverAddress });
    case 'not-a-jellyfin-server':
      return t('connect.error.notAJellyfinServer', { serverAddress: failure.serverAddress });
    case 'server-too-old':
      return t('connect.error.serverTooOld', {
        version: failure.version,
        minimumVersion: `${String(MINIMUM_SERVER_MAJOR_VERSION)}.0`,
      });
  }
}
