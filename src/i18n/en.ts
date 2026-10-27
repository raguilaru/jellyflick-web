/**
 * English is the source of truth for the key set: every other locale is typed
 * against `Messages`, so a missing or stale key fails the typecheck.
 *
 * A message is either a string or a function of a parameters object. Use
 * `Intl.NumberFormat` / `Intl.DateTimeFormat` / `Intl.PluralRules` inside the
 * function for anything formatted — all three are native on Chromium 68.
 * Formatting two locales have to agree on lives in `format.ts`.
 */
import { formatBitrate, formatSeconds, formatSpeed } from './format';

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

  // Quick Connect (#9): signing in by approving a code in another Jellyfin app.
  // Nothing here claims more than the Server says — see `quickConnect.refused`.
  'quickConnect.offer': 'Sign in with a code instead',
  'quickConnect.heading': 'Sign in with a code',
  'quickConnect.explanation':
    'In a Jellyfin app you are already signed in to, choose Quick Connect and enter this code.',
  'quickConnect.starting': 'Asking the Server for a code…',
  'quickConnect.codeLabel': 'Your code',
  'quickConnect.waiting': 'Waiting for the code to be approved…',
  'quickConnect.signingIn': 'Signing you in…',
  'quickConnect.usePassword': 'Use a password instead',
  'quickConnect.retry': 'Get a new code',

  'quickConnect.error.expired': 'Nobody approved that code in time. Get a new one and try again.',
  // The Server answers the same way for a code that ran out of time, one that
  // was turned down and one already used, so this says both rather than
  // picking one and being wrong half the time.
  'quickConnect.error.refused':
    'That code no longer works. It may have run out of time, or been turned down in the other app. Get a new one and try again.',
  'quickConnect.error.unavailable':
    'This Server does not have Quick Connect switched on, so you cannot sign in with a code here.',

  'home.signedInAs': (p: { name: string }) => `Signed in as ${p.name}.`,
  'home.rowLoading': 'Looking for Titles…',

  // Continue Watching (#12). The Row's name itself is `home.row.continueWatching`
  // below, which is also what the Home Layout editor calls it.
  'continueWatching.unavailable':
    'Jellyflick could not read what you are watching from the Server.',
  'continueWatching.unsaved': 'Jellyflick could not save that change on the Server.',
  'continueWatching.remove': (p: { name: string }) => `Remove ${p.name} from Continue Watching`,

  // The Billboard: the one Title featured at the top of Home (#16, stories 22
  // to 27). Its region is named rather than headed, because the heading inside
  // it is the Title's own logo or name.
  'billboard.region': 'Featured',
  'billboard.play': 'Play',
  'billboard.moreInfo': 'More info',
  'billboard.unavailable': 'Jellyflick could not read a Title to feature from the Server.',
  // The trailer's controls. Each says what pressing it will do, not what the
  // trailer is doing now, so a remote User hears the action rather than a state.
  'billboard.nothingToPlay': 'Jellyflick could not find an Episode of this Series to play.',
  'billboard.unmute': 'Unmute the trailer',
  'billboard.mute': 'Mute the trailer',
  'billboard.pauseTrailer': 'Pause the trailer',
  'billboard.playTrailer': 'Play the trailer',

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

  // The enlarged hover card (#21, story 52). Each button is named after its own
  // Title, because a Row of twenty cards would otherwise be twenty buttons
  // called "Play"; what a User *reads* on a 150px card is the short label
  // beside each key, which is why the name and the label are separate messages.
  'home.card.play': (p: { name: string }) => `Play ${p.name}`,
  'home.card.playLabel': 'Play',
  'home.card.moreInfo': (p: { name: string }) => `More info about ${p.name}`,
  'home.card.moreInfoLabel': 'More info',

  // A Row's name, wherever it is shown: on Home as its heading, and in the
  // Home Layout editor as the thing being moved. New on Jellyflick already had
  // a key of its own, above, and keeps it.
  'home.row.continueWatching': 'Continue Watching',
  'home.row.myList': 'My List',
  'home.row.watchAgain': 'Watch Again',
  'home.row.becauseYouWatched': 'Because You Watched',
  // The two kinds a User can have several of (#15), named generically here:
  // on Home each one is headed by its own genre or Collection instead.
  'home.row.genre': 'Genre',
  'home.row.collection': 'Collection',

  // The suggestion Rows (#15, stories 43 to 46). Because You Watched is headed
  // by the Title it came from, because the Row's name on its own says nothing
  // about why those Titles are there.
  'home.row.becauseYouWatchedTitle': (p: { title: string }) =>
    `Because you watched ${p.title}`,
  'home.row.unavailable': (p: { row: string }) =>
    `Jellyflick could not read ${p.row} from the Server.`,

  // Title Labels (#14, story 42): the one word on a card's art saying what is
  // new about it. Short, because the card art is small and the label sits
  // across the bottom of it.
  'titleLabel.recentlyAdded': 'Recently Added',
  'titleLabel.newSeason': 'New Season',
  'titleLabel.newEpisodes': 'New Episodes',

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

  // Adding a Row that needs a choice (#15): which genre, which Collection.
  // Picking is part of adding one, so it happens here and from what the Server
  // says there is.
  'homeLayout.chooseGenre': 'Add a genre Row',
  'homeLayout.chooseCollection': 'Add a Collection Row',
  'homeLayout.chooseGenreHeading': 'Which genre?',
  'homeLayout.chooseCollectionHeading': 'Which Collection?',
  'homeLayout.choiceCancel': 'Never mind',
  'homeLayout.choicesLoading': 'Looking for what you can add…',
  'homeLayout.choicesUnavailable':
    'Jellyflick could not read those from the Server. Try again in a moment.',
  'homeLayout.noChoicesLeft': 'You already have a Row for each of those.',
  'homeLayout.notSaved': 'Jellyflick could not save that change to the Server.',

  // The settings screen: #11's own settings below, and the four the User's
  // Jellyfin account carries further down (#35, story 114). The loading and
  // not-saved notices are shared by both: one screen, one message either way.
  // The two sets of copy have to stay honest about which store each belongs
  // to — see `docs/architecture.md`, "The settings screen".
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

  // The three Playback Preferences (#35, story 114). Unlike the language above,
  // these really are the User's own Jellyfin settings — `UserConfiguration`
  // fields — so this copy has the opposite job: it says that every Jellyfin app
  // follows them, and that a change is picked up the next time something plays
  // rather than in the middle of what is playing now.
  'settings.playbackHeading': 'What plays',
  'settings.playbackExplanation':
    'These are kept by Jellyfin on your account, not by Jellyflick, so every Jellyfin app you use follows them — and a change here shows up the next time you play something.',

  'settings.audioHeading': 'Audio language',
  // Said plainly, because the setting above this one is the language the app is
  // *drawn* in and the two are easy to confuse.
  'settings.audioExplanation':
    'The language to hear when a Movie or Episode offers more than one. This is the sound, not the language Jellyflick itself is in.',

  'settings.subtitleLanguageHeading': 'Subtitle language',
  'settings.subtitleLanguageExplanation': 'The language to read subtitles in when there is a choice.',

  'settings.subtitleModeHeading': 'When to show subtitles',
  'settings.subtitleModeExplanation': 'How often subtitles come on by themselves.',
  'settings.subtitleMode.none': 'Never',
  'settings.subtitleMode.onlyForced': 'Only forced ones, for signs and other languages',
  'settings.subtitleMode.default': 'Whatever the Movie or Episode marks as default',
  'settings.subtitleMode.smart': 'When the sound is not in my language',
  'settings.subtitleMode.always': 'Always',

  'settings.nextEpisodeHeading': 'The next Episode',
  'settings.nextEpisodeExplanation':
    'What happens when an Episode ends and there is another one after it.',
  'settings.nextEpisode.autoPlay': 'Start the next one',
  'settings.nextEpisode.ask': 'Ask me each time',

  // No preference at all, which is not the same as choosing a language: the
  // Server stores it as nothing and picks whatever a Movie or Episode offers.
  'settings.spoken.none': 'No preference',
  'settings.spoken.eng': 'English',
  'settings.spoken.spa': 'Spanish',
  'settings.spoken.fra': 'French',
  'settings.spoken.deu': 'German',
  'settings.spoken.ita': 'Italian',
  'settings.spoken.por': 'Portuguese',
  'settings.spoken.jpn': 'Japanese',
  'settings.spoken.kor': 'Korean',

  // The Billboard trailer (#16, story 27). One of Jellyflick's own settings,
  // so it sits with the Accent Colour and the language rather than under
  // "What plays", which is the User's Jellyfin account.
  'settings.billboardTrailerHeading': 'The Billboard trailer',
  'settings.billboardTrailerExplanation':
    'Home can play the featured Title’s trailer by itself, with the sound off. Turning it off saves data and memory, and shows the backdrop instead.',
  'settings.billboardTrailer.autoPlay': 'Play it automatically',
  'settings.billboardTrailer.off': 'Just show the backdrop',

  // The Billboard Source (#22). The names are the Sources' own, which is what
  // GLOSSARY.md calls them — note that Resume's Row is called Continue
  // Watching, so the explanation is what joins the two up for a User.
  'settings.billboardSourceHeading': 'What the Billboard features',
  'settings.billboardSourceExplanation':
    'Home features one Title at the top. Choose how it is picked — each one is also a Row you can add to your Home.',
  'settings.billboardSource.spotlight': 'Spotlight',
  'settings.billboardSource.resume': 'Resume',
  'settings.billboardSource.newestAddition': 'Newest Addition',
  'settings.billboardSource.becauseYouWatched': 'Because You Watched',

  'settings.homeHeading': 'Home',
  'settings.homeExplanation': 'Choose the Rows on your Home and the order they come in.',

  // The licence texts the app owes for the code it serves (#48). The link
  // leaves the app for a plain text file served from `public/licences/`, which
  // is why there is no screen and no heading of its own to translate.
  'settings.licencesHeading': 'Open-source licences',
  'settings.licencesExplanation':
    'Jellyflick is built on other people’s open-source work, and your browser downloads some of it to draw subtitles and play video. These are the licences that work comes under.',
  'settings.licencesLink': 'Read the licences',

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
  /*
   * Watch trailer and Download File (#19, stories 75–77).
   *
   * One Watch trailer whichever kind of trailer the Title has: a User is
   * asking to see the trailer, and which of the two the Server happens to
   * hold is not their problem. The YouTube one says where it came from only
   * once it is on the screen, in the heading above it.
   */
  'title.watchTrailer': 'Watch trailer',
  'title.closeTrailer': 'Close trailer',
  'title.trailerFromYouTube': 'Trailer on YouTube',
  /** What the player is headed with while it is playing a trailer. */
  'title.trailerPlaying': (p: { name: string }) => `${p.name} (Trailer)`,
  /**
   * Download File is the glossary's own term, capitals and all: it saves one
   * file, and calling it "Download" would promise an offline mode.
   */
  'title.downloadFile': 'Download File',
  /*
   * A Series' Seasons and Episodes (#18). The picker is a group of buttons
   * rather than a `<select>`, so every Season is one press on a remote.
   */
  'title.seasons': 'Seasons',
  'title.episodes': 'Episodes',
  /** A Season the Server holds no item for, so it has only its number. */
  'title.seasonNumber': (p: { number: number }) => `Season ${String(p.number)}`,
  /** The Episodes the Server placed in no Season at all. */
  'title.otherEpisodes': 'Other Episodes',
  /**
   * One Episode in the list. The number leads, because a list of Episodes is
   * read in order, and an Episode the Server did not number is its name alone.
   */
  'title.episodeName': (p: { number?: number; name: string }) =>
    p.number === undefined ? p.name : `${String(p.number)}. ${p.name}`,
  /**
   * What the player is told it is playing: the Series and then the Episode.
   * A player headed only "Sleepytime" says nothing about which show it is.
   */
  'title.episodePlaying': (p: { series: string; episode: string }) =>
    `${p.series}: ${p.episode}`,
  /** A Series the Server lists no Episodes of, which is nothing to play. */
  'title.noEpisodes': 'The Server did not list any Episodes of this Series.',
  /**
   * One audio or subtitle language, by the three-letter code the Server sends.
   * The dictionary is the locale's own, because a language's name is as
   * translated as anything else, and an unlisted code falls back to itself:
   * `Intl.DisplayNames` is Chrome 81 and the floor is 68.
   */
  'title.language': (p: { code: string }) =>
    LANGUAGE_NAMES_EN[p.code] ?? p.code.toUpperCase(),

  /*
   * The extra ratings an MDBList key buys (#20, stories 80–82). They sit beside
   * the Rotten Tomatoes critic score and the community score the Server sends,
   * which are `title.criticRating` and `title.communityRating` above.
   *
   * Three of the four sources are products and keep their names in every
   * language; the Rotten Tomatoes audience score is "the audience", which does
   * not. The scales are the sources' own — a percentage for three of them and
   * stars out of five for Letterboxd, which read as a percentage would be wrong
   * by a factor of twenty.
   */
  'ratings.heading': 'Ratings',
  'ratings.audience': 'Audience',
  'ratings.metacritic': 'Metacritic',
  'ratings.letterboxd': 'Letterboxd',
  'ratings.trakt': 'Trakt',
  'ratings.percent': (p: { score: number }) => `${String(Math.round(p.score))}%`,
  'ratings.outOfFive': (p: { score: number }) =>
    `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(p.score)}/5`,

  /*
   * The player (#25). The two controls carry the Title's name, as a card's My
   * List toggle does: a screen reader hears what is being paused, and the
   * player's Play is never confused with the title page's underneath it.
   */
  'player.label': (p: { name: string }) => `Playing ${p.name}`,
  'player.play': (p: { name: string }) => `Play ${p.name}`,
  'player.pause': (p: { name: string }) => `Pause ${p.name}`,
  'player.close': 'Close',
  /*
   * The controls (#26). The seek bar is named with the Title for the same
   * reason the buttons are, and `player.position` is what a screen reader
   * reads instead of the raw number of seconds the slider holds.
   */
  'player.seek': (p: { name: string }) => `Seek through ${p.name}`,
  'player.position': (p: { elapsed: string; total: string }) => `${p.elapsed} of ${p.total}`,
  'player.remaining': (p: { clock: string }) => `-${p.clock}`,
  'player.retry': 'Retry',
  'player.starting': 'Starting…',
  'player.cannotPlay': 'Jellyflick cannot play that Title on this device.',
  'player.unavailable': 'Jellyflick could not ask the Server how to play that Title.',
  'player.failed': 'Something went wrong while playing that Title.',
  'player.unreported': 'Jellyflick could not tell the Server how far you have watched.',

  /*
   * The sound and the subtitles (#27). The control carries the Title's name as
   * every other one in the player does; the menu over it does not, because a
   * User is already inside the thing that was named when they read it.
   *
   * A track's *own* name is not here: it is `MediaStream.DisplayTitle`, which
   * is the Server's label and what every Jellyfin app shows, and a track with
   * no label falls back to `title.language` above. A language's name is
   * translated; a Server's label is data, like a Title's name.
   */
  'player.tracks': (p: { name: string }) => `Audio and subtitles for ${p.name}`,
  'player.tracksLabel': 'Audio and subtitles',
  'player.audioTracks': 'Sound',
  'player.subtitleTracks': 'Subtitles',
  'player.subtitlesOff': 'Off',
  'player.tracksDone': 'Done',
  /** A track the Server gave neither a label nor a language. */
  'player.trackUnnamed': (p: { index: number }) => `Track ${String(p.index)}`,
  'player.subtitlesLabel': 'Subtitles',
  /*
   * Picture subtitles used to be offered and said to be undrawable, because a
   * track missing from the list looks like a Title that has none and a track
   * that draws nothing when pressed is worse. **#30 made them work**, so that
   * message is gone: every track in the list is now one a User can choose and
   * see.
   *
   * What replaced it is said only about the track being watched, and only when
   * the Server is the one drawing it. It has two jobs in one sentence: to
   * explain why the Subtitle timing control beside it will not open, and to
   * say whose doing that is — the words are in the video itself, so there is
   * no separate thing left to move. It deliberately does not mention
   * transcoding or formats; what a User can act on is that these particular
   * subtitles cannot be re-timed.
   */
  'player.subtitlesBurnedIn':
    'The Server is drawing these subtitles into the picture, so their timing cannot be changed.',
  'player.subtitlesUnavailable': 'Jellyflick could not read those subtitles from the Server.',

  /*
   * The Subtitle Offset (#28, stories 96–102).
   *
   * The readout is three messages rather than one with a sign in it, because
   * "later" and "earlier" are the words a User thinks in and a leading `-` is
   * not. The number is formatted with `Intl.NumberFormat` to one decimal
   * place, so `es` reads "0,8 s" — the panel passes the size of the shift and
   * the message carries the direction.
   *
   * A unit and a number that has to agree with it would need a plural rule in
   * every locale; "s" is the symbol for a second in all of them, and the
   * readout is beside the buttons that moved it.
   *
   * The two step buttons show a glyph and are **named** in words: `−` and `+`
   * on their own are not something a screen reader can say usefully, and the
   * panel is the screen most likely to be driven with a remote.
   */
  'player.subtitleTiming': 'Subtitle timing',
  'player.subtitlesInSync': 'Subtitles in sync',
  'player.subtitlesLater': (p: { seconds: number }) =>
    `Subtitles ${formatSeconds(p.seconds, 'en')} s later`,
  'player.subtitlesEarlier': (p: { seconds: number }) =>
    `Subtitles ${formatSeconds(p.seconds, 'en')} s earlier`,
  'player.subtitlesStepLater': 'Shift the subtitles later',
  'player.subtitlesStepEarlier': 'Shift the subtitles earlier',
  'player.subtitleSyncToLine': 'Sync to this line',
  /*
   * Why the button is there but cannot be pressed, which is the treatment a
   * picture subtitle track gets in the menu: `aria-disabled` keeps it a focus
   * stop a remote can reach and read, where `disabled` would make it vanish
   * from the arrow keys with no way to find out why.
   */
  'player.subtitleSyncUnavailable': 'There is no subtitle on the screen to sync to.',
  'player.subtitleTimingReset': 'Reset',
  'player.subtitleTimingDone': 'Done',

  /*
   * Skip Intro and Skip Credits (#31, story 87). The visible text is short
   * because the offer sits over the picture and has to fit a phone; the name
   * carries the Title, as every other control in the player does, so a screen
   * reader hears what is being skipped.
   *
   * There is no "Skip Recap" or "Skip Preview" yet. The Server really holds
   * those types (`jellyfin-playback.md` §12) and `SKIPPABLE_SEGMENT_TYPES` is
   * where they would be turned on, a label each.
   */
  'player.skipLabel': 'Skip',
  'player.skipIntro': 'Skip Intro',
  'player.skipIntroFor': (p: { name: string }) => `Skip the intro of ${p.name}`,
  'player.skipCredits': 'Skip Credits',
  'player.skipCreditsFor': (p: { name: string }) => `Skip the credits of ${p.name}`,

  /*
   * The next Episode (#31, stories 88 and 89).
   *
   * Which of the two the User sees follows their Jellyfin account's
   * `EnableNextEpisodeAutoPlay`, and the wording follows what the settings
   * screen already promised for each: "Start the next one" counts down, and
   * "Ask me each time" asks and waits.
   *
   * The countdown says no unit, which is not terseness: a number and a word
   * that has to agree with it would need a plural rule in every locale, and
   * the readout is beside a button that says what it will do.
   */
  'player.nextUpLabel': 'The next Episode',
  'player.nextUp': (p: { name: string }) => `Next: ${p.name}`,
  'player.nextUpCountdown': (p: { seconds: number }) => `Starting in ${String(p.seconds)}…`,
  'player.playNow': 'Play now',
  'player.playNowFor': (p: { name: string }) => `Play ${p.name} now`,
  'player.cancelNext': 'Cancel',
  'player.cancelNextFor': (p: { name: string }) => `Do not play ${p.name}`,

  /*
   * Trickplay, speed, picture-in-picture and quality (#32).
   *
   * The thumbnail over the seek bar has **no string at all**: it is
   * `aria-hidden`, because the bar already says where it is in words and a
   * picture of a frame reads out as nothing.
   *
   * The control that opens the menu carries the Title's name like every other
   * control in the player, and the menu itself does not — the same split
   * `player.tracks` and `player.tracksLabel` make.
   */
  'player.options': (p: { name: string }) => `Playback options for ${p.name}`,
  'player.optionsLabel': 'Playback options',
  'player.optionsButton': 'Playback',
  'player.optionsDone': 'Done',
  'player.speedHeading': 'Speed',
  'player.speedChoice': (p: { speed: number }) => `${formatSpeed(p.speed, 'en')}×`,
  'player.qualityHeading': 'Quality',
  /** Auto is the absence of a ceiling, which is what every Jellyfin app means. */
  'player.qualityAuto': 'Auto',
  'player.qualityChoice': (p: { bitrate: number }) => formatBitrate(p.bitrate, 'en'),
  'player.qualityPerDevice': 'Remembered on this device only.',
  'player.enterPip': 'Picture-in-picture',
  'player.leavePip': 'Leave picture-in-picture',
  /**
   * The browser refused the window. It is said beside the picture rather than
   * instead of it, like every other player failure: the Title is still
   * playing, and a window that would not open has cost the User nothing else.
   */
  'player.pictureInPictureRefused': 'This browser would not open a picture-in-picture window.',

  /**
   * Cast (#33), which `GLOSSARY.md` fixes as Chromecast **or** AirPlay — so
   * the Chromecast control says "Cast" and the Apple one says "AirPlay",
   * because that is what each picker is called where a User meets it. Neither
   * is "Play On": that is #34, and it is a different feature.
   */
  'player.cast': 'Cast',
  'player.stopCasting': 'Stop casting',
  'player.airPlay': 'AirPlay',
  /**
   * Where the Title went, said beside the picture: the control that started
   * the cast is inside a menu that closed behind it, so this is the only thing
   * on the screen that says a Chromecast is playing.
   */
  'player.castingTo': (p: { name: string }) =>
    p.name === '' ? 'Casting to a Cast device.' : `Casting to ${p.name}.`,
  /**
   * A cast that could not happen, said the way every other player failure is:
   * beside the picture, because the Title is still playing here and the press
   * that failed also closed the menu.
   *
   * It is deliberately **one message for every cause** — a browser with no
   * Cast in it, a `gstatic.com` the LAN cannot reach, a receiver that would
   * not start, a message it refused. A User can do the same one thing about
   * all of them, and naming which would be telling them about this app's
   * internals rather than about their television.
   */
  'player.castUnavailable': 'Jellyflick could not reach a Cast device.',

  /**
   * Play On (#34), which is **not** Cast: telling another running Jellyfin app
   * on this Server to play the Title. The control says the glossary's own
   * words, because the two sit side by side in one menu and a User has to be
   * able to tell them apart — "Cast" is a television protocol, "Play on" is
   * another app.
   */
  'player.playOn': 'Play on',
  'player.playOnLabel': 'Play on another app',
  'player.playOnHeading': 'Other Jellyfin apps',
  /**
   * The list takes a round trip, and unlike Cast it is a round trip that can
   * answer "nowhere" — so saying what is happening beats an empty panel.
   */
  'player.playOnLooking': 'Looking for other Jellyfin apps…',
  /**
   * The ordinary answer on a Server where nothing else is signed in, which is
   * most of them most of the time. It names what is missing rather than
   * saying nothing was found: a User whose television is on expects to see it
   * here, and "ready to play" is the part they can do something about.
   */
  'player.playOnNowhere': 'No other Jellyfin app on this Server is ready to play.',
  /** A Server that would not say what else is signed in, which is not "nowhere". */
  'player.playOnUnavailable': 'Jellyflick could not ask the Server what else is signed in.',
  /** What one app in the list is doing now (the third acceptance criterion). */
  'player.playOnIdle': 'Nothing playing',
  'player.playOnNowPlaying': (p: { name: string }) =>
    p.name === '' ? 'Playing something' : `Playing ${p.name}`,
  /**
   * A Server that gives a session neither a device name nor a client name,
   * which is `player.trackUnnamed`'s situation and gets the same treatment: a
   * row with no text at all is unpressable in any useful sense, and the thing
   * is still somewhere a Title can be sent.
   */
  'player.playOnUnnamed': 'Another Jellyfin app',
  'player.playOnDone': 'Done',
  /**
   * Where the Title went, beside the picture for the reason `castingTo` is
   * there: the press was inside a menu that closed behind it, so this is the
   * only thing on the screen that says another app is playing.
   */
  'player.playingOn': (p: { name: string }) => `Playing on ${p.name}.`,
  /**
   * Why this device went quiet, said in the panel rather than beside the
   * picture — it answers a question only a User who is looking at the remote
   * controls would have. One Title has one place in it on the Server, and two
   * apps reporting the same playback would leave that place belonging to
   * whichever stopped last.
   */
  'player.playOnHandedOver': 'Paused here, so the Server keeps one place in this Title.',
  /**
   * One message for a list that came back and a command that was refused
   * alike: the Server named the app, this app could not drive it, and there is
   * the same one thing a User can do about every cause.
   */
  'player.playOnFailed': 'Jellyflick could not tell that app what to play.',
  'player.playOnPause': 'Pause',
  'player.playOnResume': 'Resume',
  'player.playOnStop': 'Stop',

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
