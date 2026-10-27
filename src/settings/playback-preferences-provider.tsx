import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JellyfinGateway } from '../jellyfin/gateway';
import {
  createPlaybackPreferences,
  DEFAULT_PLAYBACK_PREFERENCES,
  type PlaybackPreferences,
} from './playback-preferences';

/**
 * One copy of a User's Playback Preferences for the whole app, shaped exactly
 * like `settings-provider.tsx` — the same `loaded` and `saveFailed`, the same
 * "shown at once, saved behind it", the same dropped stale read.
 *
 * It is a *second* provider rather than more fields on the first because they
 * are two different stores on the Server: Client Settings are Jellyflick's
 * alone and these are the User's Jellyfin account, shared with every other
 * Jellyfin app. One save must not drag the other's store along.
 *
 * **The player reads this too.** "A change takes effect on the next playback"
 * is the ticket's second acceptance criterion, and the Server is what makes it
 * true — a Jellyfin client reads `UserConfiguration` when it decides which
 * audio and subtitle track to start with. A player built inside this provider
 * gets the User's choice without another round trip, and a player built
 * anywhere else still gets it from the Server. Either way nothing changes
 * mid-playback: the preference is read when playback starts.
 */

export type PlaybackPreferencesState = {
  readonly preferences: PlaybackPreferences;
  /** False while the first read is in flight: the Server's defaults are showing. */
  readonly loaded: boolean;
  /** True when the last save did not reach the Server. */
  readonly saveFailed: boolean;
  /** Changes some preferences here and on the Server. */
  change(changes: Partial<PlaybackPreferences>): void;
};

const PlaybackPreferencesContext = createContext<PlaybackPreferencesState>({
  preferences: DEFAULT_PLAYBACK_PREFERENCES,
  loaded: false,
  saveFailed: false,
  change: () => undefined,
});

/** What a screen reads. Never the store: that is this provider's alone. */
export function usePlaybackPreferences(): PlaybackPreferencesState {
  return useContext(PlaybackPreferencesContext);
}

export type PlaybackPreferencesProviderProps = {
  gateway: JellyfinGateway;
  userId: string;
  children: ComponentChildren;
};

export function PlaybackPreferencesProvider({
  gateway,
  userId,
  children,
}: PlaybackPreferencesProviderProps) {
  const [preferences, setPreferences] = useState<PlaybackPreferences>(
    DEFAULT_PLAYBACK_PREFERENCES,
  );
  const [loaded, setLoaded] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // The gateway is rebuilt on every render, so who it belongs to stands in for
  // it, as it does on Home and in the Client Settings provider.
  const store = useMemo(
    () => createPlaybackPreferences({ gateway, userId }),
    [gateway.serverAddress, userId],
  );

  /**
   * Whether the User has changed anything since the read started. A read that
   * answers after they have would quietly undo what they just did.
   */
  const edited = useRef(false);

  useEffect(() => {
    let abandoned = false;
    edited.current = false;
    setLoaded(false);
    setPreferences(DEFAULT_PLAYBACK_PREFERENCES);
    void store.read().then((read) => {
      if (abandoned) return;
      if (edited.current) {
        setLoaded(true);
        return;
      }
      // A Server that will not answer hands back the Server's own defaults, so
      // there is nothing to decide here.
      setPreferences(read.preferences);
      setLoaded(true);
    });
    return () => {
      abandoned = true;
    };
  }, [store]);

  /**
   * Saves run one after another, never at once: each is a read-modify-write of
   * the whole `UserConfiguration`, so two in flight together could write the
   * older of two changes last.
   */
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const state: PlaybackPreferencesState = {
    preferences,
    loaded,
    saveFailed,
    change: (changes) => {
      edited.current = true;
      setPreferences((current) => ({ ...current, ...changes }));
      setSaveFailed(false);
      saving.current = saving.current.then(() =>
        store.save(changes).then((save) => {
          if (save.outcome !== 'saved') setSaveFailed(true);
        }),
      );
    },
  };

  return (
    <PlaybackPreferencesContext.Provider value={state}>
      {children}
    </PlaybackPreferencesContext.Provider>
  );
}
