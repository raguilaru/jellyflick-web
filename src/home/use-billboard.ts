import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso/router';
import type { DeviceLayer } from '../device/types';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { HOME_PATH } from '../shell/sections';
import { titlePathFor } from '../title/title-page';
import { loadBillboard, type BillboardResult } from './billboard-sources';

/**
 * The Billboard's Title, held in the shell rather than on Home (#16, stories 30
 * and 31).
 *
 * It has to outlive Home itself. `preact-iso`'s `Router` draws only the
 * matching route, so opening a title page **unmounts** Home — and story 31 says
 * the Billboard must not have changed when the User comes back from it. A pick
 * kept in Home's own state would be a new pick every time, which is exactly the
 * thing the User is promised will not happen. So the pick lives above the
 * router, the way My List and the Title Labels do.
 *
 * The two stories pull in opposite directions and the rule here is what settles
 * them:
 *
 * - **A new pick each time Home loads** (story 30), so arriving at Home asks
 *   Spotlight again.
 * - **Except on the way back from a title page or the player** (story 31),
 *   which is where the User went to look at the very Title that was featured.
 *   The player is an overlay over the title page rather than an address, so the
 *   address the User is coming back *from* is the whole test.
 *
 * Anywhere else — Search, My List, the settings screen — is not somewhere a
 * User went to look at the featured Title, so coming back to Home from one is
 * a fresh visit and a fresh pick.
 */

/** What the shell holds: the pick, or nothing while the first read is in flight. */
export type BillboardState = {
  /** `undefined` until the Server has answered for the first time. */
  readonly result: BillboardResult | undefined;
};

const NO_BILLBOARD: BillboardState = { result: undefined };

/**
 * The default is "still reading", so a Billboard drawn outside the shell — a
 * unit test of Home, and every screen before the read lands — simply draws
 * nothing rather than claiming the library is empty.
 */
const BillboardContext = createContext<BillboardState>(NO_BILLBOARD);

export const BillboardProvider = BillboardContext.Provider;

/** The Title the Billboard is featuring, as Home reads it. */
export function useBillboard(): BillboardState {
  return useContext(BillboardContext);
}

/**
 * Reads the Billboard for one (Server, User) and keeps it for as long as the
 * shell is on the screen, re-picking on each fresh arrival at Home.
 *
 * The draw is taken from the device layer **here**, at the edge, and handed to
 * `loadBillboard` as a number: that is what AC 2 means by the randomness coming
 * from the device layer, and it is what lets a test fix the pick.
 */
export function useLoadedBillboard(
  gateway: JellyfinGateway,
  userId: string,
  device: DeviceLayer,
): BillboardState {
  const { path } = useLocation();
  const [result, setResult] = useState<BillboardResult | undefined>(undefined);
  /** The address this hook last saw, which is where a visit to Home came from. */
  const cameFrom = useRef<string | undefined>(undefined);
  const serverAddress = gateway.serverAddress;

  useEffect(() => {
    const previous = cameFrom.current;
    cameFrom.current = path;

    // Somewhere else in the app: the pick is kept as it is, because the User
    // will want it unchanged when they come back.
    if (path !== HOME_PATH) return undefined;
    // Back from the Title that was featured, or from playing it (story 31).
    if (previous !== undefined && isATitlePage(previous)) return undefined;

    let abandoned = false;
    setResult(undefined);
    void loadBillboard(gateway, { draw: device.random() }).then((loaded) => {
      if (abandoned) return;
      setResult(loaded);
    });
    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so who it belongs to is the
    // dependency rather than the object itself — as My List and Home do. The
    // address is here because arriving at Home is what asks again.
  }, [path, serverAddress, userId, device]);

  return { result };
}

/**
 * Whether an address is a title page. Built from `titlePathFor` rather than
 * matched against a pattern, so the one place that writes a title page's
 * address is still `src/title/title-page.ts`: `titlePathFor('')` is the prefix
 * every title page's address begins with.
 */
function isATitlePage(path: string): boolean {
  const prefix = titlePathFor('');
  return path.length > prefix.length && path.slice(0, prefix.length) === prefix;
}
