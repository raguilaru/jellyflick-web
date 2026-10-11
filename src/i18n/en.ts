/**
 * English is the source of truth for the key set: every other locale is typed
 * against `Messages`, so a missing or stale key fails the typecheck.
 *
 * A message is either a string or a function of a parameters object. Use
 * `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.PluralRules` inside the
 * function for anything formatted — all three are native on Chromium 68.
 */
/**
 * The languages a household's media is most likely to be in, by the ISO 639-2
 * code Jellyfin puts on a stream. Not exhaustive on purpose: a code that is not
 * here is shown as itself, which says more than nothing does.
 */
const LANGUAGE_NAMES_EN: Readonly<Record<string, string>> = {
  ara: 'Arabic',
  ces: 'Czech',
  cmn: 'Mandarin',
  dan: 'Danish',
  deu: 'German',
  ell: 'Greek',
  eng: 'English',
  fin: 'Finnish',
  fra: 'French',
  heb: 'Hebrew',
  hin: 'Hindi',
  hun: 'Hungarian',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  nld: 'Dutch',
  nor: 'Norwegian',
  pol: 'Polish',
  por: 'Portuguese',
  ron: 'Romanian',
  rus: 'Russian',
  spa: 'Spanish',
  swe: 'Swedish',
  tha: 'Thai',
  tur: 'Turkish',
  ukr: 'Ukrainian',
  vie: 'Vietnamese',
  zho: 'Chinese',
};

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

  // The settings screen (#11). The rest of story 114 — audio language,
  // subtitle language and next-episode autoplay, which really are Jellyfin's
  // own settings — is #35's and has no copy here yet.
  'settings.heading': 'Settings',
  'settings.loading': 'Looking for your settings…',
  'settings.notSaved': 'Jellyflick could not save that change to the Server.',

  'settings.accentHeading': 'Accent Colour',
  'settings.accentExplanation':
    'The highlight colour for buttons, the wordmark and whatever you have selected. Every colour here is one text stays readable on.',
  'settings.accent.red': 'Red',
  'settings.accent.amber': 'Amber',
  'settings.accent.green': 'Green',
  'settings.accent.teal': 'Teal',
  'settings.accent.blue': 'Blue',
  'settings.accent.violet': 'Violet',
  'settings.accent.pink': 'Pink',

  'settings.languageHeading': 'Language',
  // Jellyfin 12.x has no per-user UI language at all (`decisions.md` §2), so
  // this setting is Jellyflick's own. Saying so is the point of this string:
  // the screen must not suggest it reaches the User's other Jellyfin apps.
  'settings.languageExplanation':
    'The language Jellyflick itself is in. Jellyflick keeps this one for you and it follows you to every device, but Jellyfin has no language setting of its own — so your other Jellyfin apps keep their own language.',
  'settings.language.deviceIs': (p: { language: string }) => `Match my device (${p.language})`,
  'settings.language.en': 'English',
  'settings.language.es': 'Español',

  'settings.homeHeading': 'Home',
  'settings.homeExplanation': 'Choose the Rows on your Home and the order they come in.',

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
  // The title page (#17). A Title's own name is its heading, so there is no
  // key for it: the strings here are the labels around it.
  'title.loading': 'Looking for that Title…',
  'title.notFound':
    'Jellyflick could not find that Title. Only Movies and Series have a page of their own.',
  'title.unavailable': 'Jellyflick could not read that Title from the Server.',
  'title.close': 'Close',
  'title.play': 'Play',
  'title.markWatched': (p: { name: string }) => `Mark ${p.name} as watched`,
  'title.markNotWatched': (p: { name: string }) => `Mark ${p.name} as not watched`,
  'title.watchedUnsaved': 'Jellyflick could not save whether you have watched that on the Server.',
  // A length in whole minutes, said the way a running time is read out.
  'title.runtime': (p: { minutes: number }) => {
    const hours = Math.floor(p.minutes / 60);
    const minutes = p.minutes % 60;
    if (hours === 0) return `${String(minutes)}m`;
    if (minutes === 0) return `${String(hours)}h`;
    return `${String(hours)}h ${String(minutes)}m`;
  },
  'title.criticRating': (p: { score: number }) => `${String(Math.round(p.score))}% critics`,
  'title.communityRating': (p: { score: number }) => `${String(p.score)} from the community`,
  'title.cast': 'Cast',
  'title.audio': 'Audio',
  'title.subtitles': 'Subtitles',
  'title.collection': 'Collection',
  'title.moreLikeThis': 'More like this',
  /**
   * One audio or subtitle language, by the three-letter code the Server sends.
   * The dictionary is the locale's own, because a language's name is as
   * translated as anything else, and an unlisted code falls back to itself:
   * `Intl.DisplayNames` is Chrome 81 and the floor is 68.
   */
  'title.language': (p: { code: string }) =>
    LANGUAGE_NAMES_EN[p.code] ?? p.code.toUpperCase(),

  /*
   * The player (#25). The two controls carry the Title's name, as a card's My
   * List toggle does: a screen reader hears what is being paused, and the
   * player's Play is never confused with the title page's underneath it.
   */
  'player.label': (p: { name: string }) => `Playing ${p.name}`,
  'player.play': (p: { name: string }) => `Play ${p.name}`,
  'player.pause': (p: { name: string }) => `Pause ${p.name}`,
  'player.close': 'Close',
  'player.starting': 'Starting…',
  'player.cannotPlay': 'Jellyflick cannot play that Title on this device.',
  'player.unavailable': 'Jellyflick could not ask the Server how to play that Title.',
  'player.failed': 'Something went wrong while playing that Title.',
  'player.unreported': 'Jellyflick could not tell the Server how far you have watched.',

  'nav.sections': 'Sections',
  'nav.home': 'Home',
  'nav.movies': 'Movies',
  'nav.series': 'Series',
  'nav.myList': 'My List',
  'nav.search': 'Search',
  // Not a section — the settings screen has its own address and is reached
  // from the bars rather than listed in `SECTIONS`.
  'nav.settings': 'Settings',

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
