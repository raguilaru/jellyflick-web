import { LocationProvider, Route, Router, useLocation } from 'preact-iso/router';
import type { DeviceLayer } from '../device/types';
import { HomeScreen } from '../home/home-screen';
import type { SignedInUser } from '../session/session';
import { useBackHandler } from './back';
import { useWideScreen } from './layout';
import { BottomBar } from './bottom-bar';
import { HOME_PATH, SECTIONS } from './sections';
import { SectionPlaceholder, UnknownSection } from './section-placeholder';
import { TopBar } from './top-bar';

export type AppShellProps = {
  user: SignedInUser;
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
 * What each section *contains* belongs to its own ticket. Home is a placeholder
 * until #4 fills it.
 */
export function AppShell({ user, device, pictureUrl }: AppShellProps) {
  return (
    <LocationProvider>
      <ShellFrame user={user} device={device} pictureUrl={pictureUrl} />
    </LocationProvider>
  );
}

/** The shell proper, which has to be inside the `LocationProvider` to ask where it is. */
function ShellFrame({ user, device, pictureUrl }: AppShellProps) {
  const { path } = useLocation();
  const wide = useWideScreen();
  useBackHandler(device);

  return (
    <div class={wide ? 'shell' : 'shell shell--with-bottom-bar'}>
      {wide ? <TopBar currentPath={path} /> : null}

      <Router>
        <Route path={HOME_PATH} component={HomeScreen} user={user} />
        {SECTIONS.filter((section) => section.path !== HOME_PATH).map((section) => (
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
