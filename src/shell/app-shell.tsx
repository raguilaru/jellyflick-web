import { LocationProvider, Route, Router, useLocation } from 'preact-iso/router';
import type { DeviceLayer } from '../device/types';
import { HomeScreen } from '../home/home-screen';
import { SearchScreen } from '../search/search-screen';
import type { Session, SignedInUser } from '../session/session';
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
 * #23 and My List #13, and each only has to point its route at its own folder.
 * Home and Search are already their own screens.
 */
/** Search has its own screen, so its route is named rather than placeheld. */
const SEARCH_SECTION = sectionFor('search');

export function AppShell({ user, session, device, pictureUrl }: AppShellProps) {
  return (
    <LocationProvider>
      <ShellFrame user={user} session={session} device={device} pictureUrl={pictureUrl} />
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
        <Route path={SEARCH_SECTION.path} component={SearchScreen} session={session} />
        {SECTIONS.filter(
          (section) => section.path !== HOME_PATH && section.path !== SEARCH_SECTION.path,
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
