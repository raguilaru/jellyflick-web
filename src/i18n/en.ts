/**
 * English is the source of truth for the key set: every other locale is typed
 * against `Messages`, so a missing or stale key fails the typecheck.
 *
 * A message is either a string or a function of a parameters object. Use
 * `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.PluralRules` inside the
 * function for anything formatted — all three are native on Chromium 68.
 */
export const en = {
  'app.name': 'Jellyflick',

  'connect.heading': 'Connect to your Server',
  'connect.explanation': 'Jellyflick needs the address of your Jellyfin server.',
  'connect.addressLabel': 'Server address',
  'connect.addressHint': 'For example 192.168.1.10:8096 or https://jellyfin.example.com',
  'connect.submit': 'Connect',
  'connect.checking': 'Checking the Server…',

  'connect.error.addressInvalid': 'That is not an address Jellyflick can use. Check it and try again.',
  'connect.error.unreachable': (p: { serverAddress: string }) =>
    `Nothing answered at ${p.serverAddress}. Check the address and that the Server is switched on.`,
  'connect.error.notAJellyfinServer': (p: { serverAddress: string }) =>
    `Something answered at ${p.serverAddress}, but it is not a Jellyfin server.`,
  'connect.error.serverTooOld': (p: { version: string; minimumVersion: string }) =>
    `That server runs Jellyfin ${p.version}. Jellyflick needs ${p.minimumVersion} or later, so it cannot connect to it.`,

  'signIn.heading': 'Choose your User',
  'signIn.loadingUsers': 'Looking for Users on the Server…',
  'signIn.typedHeading': 'Sign in with your username',
  'signIn.typedExplanation':
    'Accounts hidden from the Server’s list are not shown. Type the username to sign in.',
  'signIn.typeUsername': 'Type a username instead',
  'signIn.usernameLabel': 'Username',
  'signIn.passwordLabel': 'Password',
  'signIn.passwordFor': (p: { name: string }) => `Enter the password for ${p.name}.`,
  'signIn.submit': 'Sign in',
  'signIn.signingIn': 'Signing in…',
  'signIn.back': 'Back',

  'signIn.error.wrongCredentials':
    'That username and password do not match an account on this Server.',
  'signIn.error.usernameMissing': 'Type your username.',
  'signIn.error.passwordMissing': 'Type your password.',
  'signIn.error.unreachable': (p: { serverAddress: string }) =>
    `Jellyflick could not reach ${p.serverAddress}. Check that the Server is switched on and try again.`,
  'signIn.error.serverProblem': (p: { status: string }) =>
    `The Server could not sign you in just now (error ${p.status}). Try again in a moment.`,
  'signIn.error.usersUnavailable':
    'Jellyflick could not read the list of Users from the Server. Type your username to sign in.',

  'home.signedInAs': (p: { name: string }) => `Signed in as ${p.name}.`,
  'home.rowLoading': 'Looking for Titles…',

  'home.newOnJellyflick': 'New on Jellyflick',
  'home.newOnJellyflick.empty': 'Nothing has been added to your libraries yet.',
  'home.newOnJellyflick.unavailable': 'Jellyflick could not read what is new from the Server.',

  // My List is Jellyfin's Favorites. The Row on Home and the page share the
  // section's own name, `nav.myList`, so there is one string for one list.
  'myList.loading': 'Looking for what you have saved…',
  'myList.empty': 'Nothing is in My List yet. Add a Title from any Row to find it here.',
  'myList.unavailable': 'Jellyflick could not read My List from the Server.',
  'myList.unsaved': 'Jellyflick could not save that change on the Server.',
  'myList.add': (p: { name: string }) => `Add ${p.name} to My List`,
  'myList.remove': (p: { name: string }) => `Remove ${p.name} from My List`,
  'home.empty': 'No Rows are shown on Home. Edit Home to choose some.',

  // A Row's name, wherever it is shown: on Home as its heading, and in the
  // Home Layout editor as the thing being moved. New on Jellyflick already had
  // a key of its own, above, and keeps it.
  'home.row.continueWatching': 'Continue Watching',
  'home.row.myList': 'My List',
  'home.row.watchAgain': 'Watch Again',
  'home.row.becauseYouWatched': 'Because You Watched',

  'homeLayout.heading': 'Edit Home',
  'homeLayout.explanation':
    'Choose the Rows on your Home and the order they come in. Your Home follows you to every device.',
  'homeLayout.done': 'Done',
  'homeLayout.hide': (p: { row: string }) => `Hide ${p.row}`,
  'homeLayout.show': (p: { row: string }) => `Show ${p.row}`,
  'homeLayout.moveUp': (p: { row: string }) => `Move ${p.row} up`,
  'homeLayout.moveDown': (p: { row: string }) => `Move ${p.row} down`,
  'homeLayout.hidden': 'Hidden',
  'homeLayout.notBuiltYet': 'Not on Home yet',
  'homeLayout.addHeading': 'Rows you can add',
  'homeLayout.add': (p: { row: string }) => `Add ${p.row}`,
  'homeLayout.nothingToAdd': 'Every Row is already on Home.',
  'homeLayout.notSaved': 'Jellyflick could not save that change to the Server.',

  'search.heading': 'Search',
  'search.fieldLabel': 'Search for a Movie or Series',
  'search.searching': 'Searching…',
  'search.results': 'Results',
  'search.nothingFound': (p: { term: string }) =>
    `Nothing on this Server matches “${p.term}”.`,
  'search.unavailable': 'Jellyflick could not search the Server just now.',
  'search.genresHeading': 'Browse by genre',
  'search.genresLoading': 'Looking for genres…',
  'search.genresEmpty': 'Nothing in your libraries is in a genre yet.',
  'search.genresUnavailable': 'Jellyflick could not read the genres from the Server.',
  'search.allGenres': 'All genres',
  'search.genreEmpty': (p: { genre: string }) => `There is nothing in ${p.genre} yet.`,
  'search.genreUnavailable': (p: { genre: string }) =>
    `Jellyflick could not read what is in ${p.genre}.`,

  // Several Users on one device, and the User Picker (#8).
  'users.pickerHeading': 'Who is watching?',
  'users.pickerExplanation':
    'Pick yourself to carry on with your own Home and My List. Nobody is asked for a password again.',
  'users.addUser': 'Add another User',
  'users.cancelAdding': 'Cancel',
  'users.signOut': (p: { name: string }) => `Sign out ${p.name}`,
  // The control in both navigation bars. It says who is watching as well as
  // what it does, because the picture beside it is the only other clue.
  'users.switchUser': (p: { name: string }) => `Switch User, currently ${p.name}`,
  'users.keepWatching': (p: { name: string }) => `Keep watching as ${p.name}`,

  'nav.sections': 'Sections',
  'nav.home': 'Home',
  'nav.movies': 'Movies',
  'nav.series': 'Series',
  'nav.myList': 'My List',
  'nav.search': 'Search',

  'shell.sectionNotBuiltYet': 'This section is not built yet.',
  'shell.unknownSectionHeading': 'Nothing here',
  'shell.unknownSection': 'There is nothing at this address. Pick a section to carry on.',
} as const;

/**
 * The key set, with plain strings widened from their English literals so other
 * locales can hold different text, and parameter objects kept exactly.
 */
export type Messages = {
  readonly [K in keyof typeof en]: (typeof en)[K] extends (params: infer P) => string
    ? (params: P) => string
    : string;
};

export type MessageKey = keyof Messages;
