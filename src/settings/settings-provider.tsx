import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JellyfinGateway } from '../jellyfin/gateway';
import {
  createClientSettings,
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
} from './client-settings';

/**
 * One copy of a User's settings for the whole app.
 *
 * Home and the Home Layout editor are two screens looking at one thing, so they
 * read the same state rather than each asking the Server: an edit shows on Home
 * without a reload, and there is never a second opinion about what the layout
 * is. The Server is the durable copy — this is the one in front of the User.
 *
 * A change is shown at once and saved behind it. That is the right way round
 * for a remote: pressing "move up" four times must not wait for four round
 * trips. A save that does not land says so, and the screen keeps the change the
 * User made rather than silently undoing their work.
 */

export type SettingsState = {
  readonly settings: ClientSettings;
  /** False while the first read is in flight: the defaults are showing. */
  readonly loaded: boolean;
  /** True when the last save did not reach the Server. */
  readonly saveFailed: boolean;
  /** Changes some settings here and on the Server. */
  change(changes: Partial<ClientSettings>): void;
};

const SettingsContext = createContext<SettingsState>({
  settings: DEFAULT_CLIENT_SETTINGS,
  loaded: false,
  saveFailed: false,
  change: () => undefined,
});

/** What a screen reads. Never the store: that is this provider's alone. */
export function useSettings(): SettingsState {
  return useContext(SettingsContext);
}

export type SettingsProviderProps = {
  gateway: JellyfinGateway;
  userId: string;
  children: ComponentChildren;
};

export function SettingsProvider({ gateway, userId, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<ClientSettings>(DEFAULT_CLIENT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // The gateway is rebuilt on every render, so the address stands in for it, as
  // it does on Home.
  const store = useMemo(
    () => createClientSettings({ gateway, userId }),
    [gateway.serverAddress, userId],
  );

  /**
   * Whether the User has changed anything since the read started. A read that
   * answers after they have is stale — it would quietly undo what they just
   * did, which is easy to hit: the editor opens before the first read lands if
   * the Server is slow.
   */
  const edited = useRef(false);

  useEffect(() => {
    let abandoned = false;
    edited.current = false;
    setLoaded(false);
    setSettings(DEFAULT_CLIENT_SETTINGS);
    void store.read().then((read) => {
      if (abandoned) return;
      if (edited.current) {
        setLoaded(true);
        return;
      }
      // A Server that will not answer hands back the defaults, so there is
      // nothing to decide here: the User gets a working Home either way.
      setSettings(read.settings);
      setLoaded(true);
    });
    return () => {
      abandoned = true;
    };
  }, [store]);

  /**
   * Saves run one after another, never at once. Each one reads the stored set
   * before writing it back whole, so two in flight together could write the
   * older of two changes last — pressing "move up" twice quickly is exactly
   * that case.
   */
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const state: SettingsState = {
    settings,
    loaded,
    saveFailed,
    change: (changes) => {
      edited.current = true;
      setSettings((current) => ({ ...current, ...changes }));
      setSaveFailed(false);
      saving.current = saving.current.then(() =>
        store.save(changes).then((save) => {
          if (save.outcome !== 'saved') setSaveFailed(true);
        }),
      );
    },
  };

  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>;
}
