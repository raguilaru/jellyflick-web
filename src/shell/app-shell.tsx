import { LocationProvider, Route, Router, useLocation } from 'preact-iso/router';
import { useEffect, useMemo } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { HomeScreen } from '../home/home-screen';
import { createMyList, type MyList } from '../my-list/my-list';
import { MyListScreen } from '../my-list/my-list-screen';
import { MyListProvider } from '../my-list/use-my-list';
import { SearchScreen } from '../search/search-screen';
import type { Session, SignedInUser } from '../session/session';
import { HOME_LAYOUT_PATH, HomeLayoutScreen } from '../settings/home-layout-screen';
import { SETTINGS_PATH, SettingsScreen } from '../settings/settings-screen';
import { SettingsProvider } from '../settings/settings-provider';
import { useAccentColour } from '../settings/use-accent-colour';
import { UiLanguage } from '../settings/ui-language';
import { useBackHandler } from './back';
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

export function AppShell({ user, session, device, pictureUrl }: AppShellProps) {
  return (
    <LocationProvider>
      {/* One copy of the User's settings for every screen: Home and the Home
          Layout editor are two views of the same thing (#10). */}
      <SettingsProvider gateway={session.gateway()} userId={user.userId}>
        {/* The User's language, from their settings, falling back to this
            device's (#11). Inside the provider, because that is where the
            choice is, and above everything that draws text. */}
        <UiLanguage device={device}>
          {/* And one copy of My List, for the Row on Home, the My List page and
              every card's toggle (#13). */}
          <MyListProvider value={useLoadedMyList(session, user)}>
            <ShellFrame user={user} session={session} device={device} pictureUrl={pictureUrl} />
          </MyListProvider>
        </UiLanguage>
      </SettingsProvider>
    </LocationProvider>
  );
}

/** The shell proper, which has to be inside the `LocationProvider` to ask where it is. */
function ShellFrame({ user, session, device, pictureUrl }: AppShellProps) {
  const { path } = useLocation();
  const wide = useWideScreen();
  useBackHandler(device);
  // The User's Accent Colour, painted on the root element so every rule that
  // reads `--accent` follows it (#11).
  useAccentColour();

  return (
    <div class={wide ? 'shell' : 'shell shell--with-bottom-bar'}>
      {wide ? <TopBar currentPath={path} /> : null}

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
        {/* Neither of these is a section: each has an address of its own and
            no place in `SECTIONS`. The Home Layout editor is reached from Home
            and from the settings screen; the settings screen is reached from
            whichever navigation bar is on the screen. */}
        <Route path={HOME_LAYOUT_PATH} component={HomeLayoutScreen} />
        <Route path={SETTINGS_PATH} component={SettingsScreen} device={device} />
        <Route default component={UnknownSection} />
      </Router>

      {wide ? null : <BottomBar currentPath={path} user={user} pictureUrl={pictureUrl} />}
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
