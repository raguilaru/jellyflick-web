import { LocationProvider, Route, Router, useLocation } from 'preact-iso/router';
import { useEffect, useMemo } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { HomeScreen } from '../home/home-screen';
import { createMyList, type MyList } from '../my-list/my-list';
import { MyListScreen } from '../my-list/my-list-screen';
import { MyListProvider } from '../my-list/use-my-list';
import type { Session, SignedInUser } from '../session/session';
import { useBackHandler } from './back';
import { useWideScreen } from './layout';
import { BottomBar } from './bottom-bar';
import { HOME_PATH, pathOf, SECTIONS } from './sections';
import { SectionPlaceholder, UnknownSection } from './section-placeholder';
import { TopBar } from './top-bar';

export type AppShellProps = {
  user: SignedInUser;
  /** Home reads what is new from the Server, so the session goes through. */
  session: Session;
  /** Where the Back key comes from, as every device-specific thing does. */
  device: DeviceLayer;
  /** The signed-in User's picture, when the Server has one for them. */
  pictureUrl?: string;
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
 * #23 and Search #24, and each only has to point its route at its own folder.
 * Home and My List are already their own screens.
 *
 * My List is the one piece of state the shell holds rather than a screen: the
 * Row on Home, the My List page and every card's toggle have to agree about it
 * and change together, so the store is made here and reaches them all through
 * `MyListProvider`.
 */
export function AppShell({ user, session, device, pictureUrl }: AppShellProps) {
  return (
    <LocationProvider>
      <MyListProvider value={useLoadedMyList(session, user)}>
        <ShellFrame user={user} session={session} device={device} pictureUrl={pictureUrl} />
      </MyListProvider>
    </LocationProvider>
  );
}

/** The shell proper, which has to be inside the `LocationProvider` to ask where it is. */
function ShellFrame({ user, session, device, pictureUrl }: AppShellProps) {
  const { path } = useLocation();
  const wide = useWideScreen();
  useBackHandler(device);

  return (
    <div class={wide ? 'shell' : 'shell shell--with-bottom-bar'}>
      {wide ? <TopBar currentPath={path} /> : null}

      <Router>
        <Route path={HOME_PATH} component={HomeScreen} user={user} session={session} />
        <Route path={MY_LIST_PATH} component={MyListScreen} />
        {SECTIONS.filter(
          (section) => section.path !== HOME_PATH && section.path !== MY_LIST_PATH,
        ).map((section) => (
          <Route
            key={section.id}
            path={section.path}
            component={SectionPlaceholder}
            section={section}
          />
        ))}
        <Route default component={UnknownSection} />
      </Router>

      {wide ? null : <BottomBar currentPath={path} user={user} pictureUrl={pictureUrl} />}
    </div>
  );
}

/** The section the My List page answers for, so the route and the bars agree. */
const MY_LIST_PATH = pathOf('my-list');

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
