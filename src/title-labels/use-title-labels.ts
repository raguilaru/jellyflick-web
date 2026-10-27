import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { loadTitleLabels, NO_TITLE_LABELS, type TitleLabel, type TitleLabels } from './title-labels';

/**
 * The labels every card in the app reads, held once in the shell.
 *
 * One read rather than one per Row: a Title's label is the same wherever its
 * card appears, and Home alone draws several Rows that can hold the same Title.
 * The default is no labels at all, so a card drawn outside the shell — a unit
 * test of a Row, and every screen before the read lands — is simply a card
 * without one, which is what a Title with nothing new about it looks like
 * anyway.
 */
const TitleLabelsContext = createContext<TitleLabels>(NO_TITLE_LABELS);

export const TitleLabelsProvider = TitleLabelsContext.Provider;

/** The label this Title's card shows, or nothing. */
export function useTitleLabel(titleId: string): TitleLabel | undefined {
  return useContext(TitleLabelsContext).get(titleId);
}

/**
 * Reads the labels for one (Server, User) and keeps them for as long as the
 * shell is on the screen. Which Titles are new is per User — the Server answers
 * for what their account can see — so a different User reads them again.
 *
 * It is read once rather than watched: an addition that lands while a User is
 * browsing is a label on their next visit, and nothing on Home is waiting for
 * it.
 */
export function useLoadedTitleLabels(
  gateway: JellyfinGateway,
  userId: string,
  device: DeviceLayer,
): TitleLabels {
  const [labels, setLabels] = useState<TitleLabels>(NO_TITLE_LABELS);
  const serverAddress = gateway.serverAddress;

  useEffect(() => {
    let abandoned = false;
    setLabels(NO_TITLE_LABELS);
    void loadTitleLabels(gateway, device.now()).then((read) => {
      if (abandoned) return;
      setLabels(read);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so who it belongs to is the
    // dependency rather than the object itself — as My List and Home do.
  }, [serverAddress, userId, device]);

  return labels;
}
