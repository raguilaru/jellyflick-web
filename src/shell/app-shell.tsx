import { LocationProvider, Route, Router, useLocation } from 'preact-iso/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { HomeScreen } from '../home/home-screen';
import { createMyList, type MyList } from '../my-list/my-list';
import { MyListScreen } from '../my-list/my-list-screen';
import { MyListProvider } from '../my-list/use-my-list';
import { SearchScreen } from '../search/search-screen';
import type { Session, SignedInUser } from '../session/session';
import { UserPicker, type UsersOnThisDevice } from '../session/user-picker';
import { HOME_LAYOUT_PATH, HomeLayoutScreen } from '../settings/home-layout-screen';
import { SettingsProvider } from '../settings/settings-provider';
import { useBackClaim, useBackHandler } from './back';
import { useWideScreen } from './layout';
import { BottomBar } from './bottom-bar';
import { HOME_PATH, SECTIONS, sectionFor } from './sections';
import { SectionPlaceholder, UnknownSection } from './section-placeholder';
import { TopBar } from './top-bar';

export type AppShellProps = {
  user: SignedInUser;
  /** Home reads what is new from the Server, so the session goes through. */
  session: Session;
  /** Where the Back key comes from, as every device-specific thing does. */
  device: DeviceLayer;
  /**
   * The Users on this device and what can be done with them. The shell only
   * hands it to the bars and to the overlay: who is watching is `src/app.tsx`'s
   * to decide, because it is the question the shell itself hangs from.
   */
  users: UsersOnThisDevice;
};

/**
 * The app once a User is signed in: the look, the navigation and the routes.
 *
 * Every section is a real address, so a section can be bookmarked, shared and
 * reloaded — the container answers an unknown path with `index.html` and a 200
 * for exactly that reason. One navigation bar is in the document at a time: the
 * top bar on anything wider than a phone, the bottom bar on a phone.
 *
 * What each section *contains* belongs to its own ticket: Movies and Series are
 * #23, and each only has to point its route at its own folder. Home, My List
 * and Search are already their own screens.
 *
 * My List is the one piece of state the shell holds rather than a screen: the
 * Row on Home, the My List page and every card's toggle have to agree about it
 * and change together, so the store is made here and reaches them all through
 * `MyListProvider`.
 */
/**
 * The sections that have a screen of their own, named here so their addresses
 * are still written once in `SECTIONS`. Every other section is still the
 * placeholder, and taking one over is a `<Route>` of its own plus an entry in
 * the list below.
 */
const MY_LIST_SECTION = sectionFor('my-list');
const SEARCH_SECTION = sectionFor('search');

const PATHS_WITH_THEIR_OWN_SCREEN: readonly string[] = [
  HOME_PATH,
  MY_LIST_SECTION.path,
  SEARCH_SECTION.path,
];

export function AppShell({ user, session, device, users }: AppShellProps) {
  return (
    <LocationProvider>
      {/* One copy of the User's settings for every screen: Home and the Home
          Layout editor are two views of the same thing (#10). */}
      <SettingsProvider gateway={session.gateway()} userId={user.userId}>
        {/* And one copy of My List, for the Row on Home, the My List page and
            every card's toggle (#13). */}
        <MyListProvider value={useLoadedMyList(session, user)}>
          <ShellFrame user={user} session={session} device={device} users={users} />
        </MyListProvider>
      </SettingsProvider>
    </LocationProvider>
  );
}

/** The shell proper, which has to be inside the `LocationProvider` to ask where it is. */
function ShellFrame({ user, session, device, users }: AppShellProps) {
  const { path } = useLocation();
  const wide = useWideScreen();
  useBackHandler(device);

  /**
   * Whether the User Picker is over the screen. It is the shell's state and
   * not an address — see `user-picker.tsx` for why — so it closes itself when
   * the User navigates, which is what makes the browser's own back button
   * leave no overlay stranded over the screen behind it.
   */
  const [picking, setPicking] = useState(false);

  /**
   * Navigating closes it. Only an actual change of address counts, which is
   * why the address it last saw is kept: an effect also runs when the shell
   * first appears, and a reset there would close an overlay opened before that
   * first run had happened.
   */
  const addressShown = useRef(path);
  useEffect(() => {
    if (addressShown.current === path) return;
    addressShown.current = path;
    setPicking(false);
  }, [path]);

  const closePicker = useCallback(() => {
    setPicking(false);
  }, []);
  // The Back key and Escape close the overlay instead of leaving the section,
  // through the one Back handler rather than a listener of this screen's own.
  useBackClaim(picking, closePicker);

  return (
    <div class={wide ? 'shell' : 'shell shell--with-bottom-bar'}>
      {wide ? (
        <TopBar
          currentPath={path}
          user={users.current ?? { userId: user.userId, name: user.name }}
          onSwitchUser={() => setPicking(true)}
        />
      ) : null}

      <Router>
        <Route path={HOME_PATH} component={HomeScreen} user={user} session={session} />
        <Route path={MY_LIST_SECTION.path} component={MyListScreen} />
        <Route path={SEARCH_SECTION.path} component={SearchScreen} session={session} />
        {SECTIONS.filter(
          (section) => !PATHS_WITH_THEIR_OWN_SCREEN.includes(section.path),
        ).map((section) => (
          <Route
            key={section.id}
            path={section.path}
            component={SectionPlaceholder}
            section={section}
          />
        ))}
        {/* Not a section: it is reached from Home, and later from the settings
            screen (#11/#35), so it is in neither navigation bar. */}
        <Route path={HOME_LAYOUT_PATH} component={HomeLayoutScreen} />
        <Route default component={UnknownSection} />
      </Router>

      {wide ? null : (
        <BottomBar
          currentPath={path}
          user={users.current ?? { userId: user.userId, name: user.name }}
          onSwitchUser={() => setPicking(true)}
        />
      )}

      {picking ? <UserPicker users={users} onClose={closePicker} /> : null}
    </div>
  );
}

/**
 * One My List store per (Server, User), read from the Server as soon as the
 * shell is on the screen. A different User gets a different store, so one
 * User's list can never be left behind in another's.
 */
function useLoadedMyList(session: Session, user: SignedInUser): MyList {
  const serverAddress = session.gateway().serverAddress;
  // The gateway is rebuilt on every render, so who it belongs to is the
  // dependency rather than the object itself.
  const myList = useMemo(() => createMyList(session.gateway()), [serverAddress, user.userId]);

  useEffect(() => {
    void myList.load();
  }, [myList]);

  return myList;
}
