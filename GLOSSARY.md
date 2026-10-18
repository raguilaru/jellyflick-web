# Jellyflick

A lightweight client for a single Jellyfin server, for browsing and watching movies and TV shows. It runs on web and mobile browsers first, and on LG TVs later.

## Server and people

**Server**:
The one Jellyfin server the app is connected to. Changing it signs every User out.
_Avoid_: Backend, instance, host

**User**:
A Jellyfin user account on the Server that has signed in on this device. Several Users can be signed in at once, and picking one never asks for a password again.
_Avoid_: Profile, account, member

**Accent Colour**:
The highlight colour a User picks from a fixed set of presets. Red is the default.
_Avoid_: Theme, brand colour

**User Picker**:
The screen that lists the signed-in Users so one can be chosen. It appears when more than one User is signed in.
_Avoid_: Profile selector, who's-watching screen, login screen

## Library content

**Title**:
A Movie or a Series. These are the only kinds of content the app shows (no music, live TV, recordings, books or photos).
_Avoid_: Item, media, content, show

**Movie**:
A single, standalone film Title.

**Series**:
A TV show Title, made up of Seasons that contain Episodes.
_Avoid_: Show, TV show

**Episode**:
One playable instalment of a Series, belonging to one Season.

**Collection**:
A Jellyfin grouping of related Titles, such as a movie franchise.
_Avoid_: Box set, franchise

**Trailer**:
A short preview video the Server holds alongside a Title. Only the trailers stored on the Server itself are used, never one fetched from the web.
_Avoid_: Preview, teaser, clip

**Extra Ratings**:
The Audience, Metacritic, Letterboxd and Trakt scores for a Title, shown beside the critic and community scores the Server sends. They need an MDBList key, and a Title without one shows none.
_Avoid_: MDBList ratings (that's where they come from), reviews, scores

**My List**:
The Titles a User has marked as favorite in Jellyfin. It's the same list other Jellyfin apps show as Favorites.
_Avoid_: Watchlist, saved, favorites (in the UI)

## Home

**Home**:
The User's main browsing screen: one Billboard at the top, followed by Rows.

**Billboard**:
The single large featured Title at the top of Home, with its backdrop or trailer, logo, description, and Play / More info actions.
_Avoid_: Hero, banner, header, jumbotron

**Billboard Source**:
The rule that picks which Title the Billboard features: Spotlight, Resume, Newest Addition, or Because You Watched.

**Spotlight**:
The default Billboard Source: a Title picked at random each time Home loads, from Titles the User hasn't finished that have a backdrop. Highly rated Titles with a logo are preferred.

**Because You Watched**:
A Billboard Source and Row of Titles related to one the User recently watched: Jellyfin's recommendations for a Movie, or similar Titles for a Series.
_Avoid_: Recommended for you, suggestions

**Row**:
A horizontal, scrollable strip of Titles on Home, smaller than the Billboard. Each Billboard Source also has a Row version.
_Avoid_: Shelf, carousel, section, lane

**Home Layout**:
A User's own choice of which Rows appear on Home and in what order.
_Avoid_: Home settings, home config

**Continue Watching**:
The Row of Titles the User has started but not finished, merged with the next unwatched Episode of each Series they're watching.
_Avoid_: Resume row, Next Up (as a separate concept)

**New on Jellyflick**:
The Row of the newest Titles across all libraries. A Series appears once, however many Episodes were added.
_Avoid_: Recently Added, Latest, New Releases

**Watch Again**:
The Row of Titles the User has finished, the most recently finished first.
_Avoid_: Rewatch, Watched, History

**Genre Row**:
A Row of the Titles in one genre the User chose. A User can have several, one per genre.
_Avoid_: Category row, tag row

**Collection Row**:
A Row of the Titles in one Collection the User chose. A User can have several.
_Avoid_: Franchise row, box set row

**Title Label**:
A short tag on a Title's card art saying what's new about it: Recently Added, New Season, or New Episodes.
_Avoid_: Badge, tag, ribbon

**Enlarged Card**:
The bigger version of a card that a resting mouse pointer opens, carrying Play, My List and More info beside the Title's age rating, length, genres and Extra Ratings. It appears only where there is a pointer that can rest on something, so never on a touch screen and never on a TV, and it never plays video.
_Avoid_: Hover preview, preview card, popover, tooltip, expanded card

## Playback

**Subtitle Offset**:
How far the subtitles are shifted earlier or later than the video, adjusted by the User while watching.
_Avoid_: Subtitle delay, sync

**Subtitle timing**:
The panel the User opens while watching to change the Subtitle Offset. The panel is what is opened; the Offset is the number it moves.
_Avoid_: Subtitle settings, delay panel

**Skip Intro**:
The button over the picture that jumps past the opening of what's playing. It appears only while the intro is on screen, because the Server is what says where the intro is.
_Avoid_: Skip ahead, skip recap, intro skipper

**Skip Credits**:
The same button for the closing credits of what's playing, appearing only while they're on screen.
_Avoid_: Skip outro, skip end

**next Episode**:
The Episode that follows the one playing. It is offered as the Episode ends, and either starts on its own after a countdown or waits to be asked for, following the User's playback preference.
_Avoid_: Next Up, up next, autoplay, binge

**Cast**:
Sending playback to a Chromecast or AirPlay receiver, with this app acting as the remote.
_Avoid_: Mirror, stream to TV

**Play On**:
Telling another running Jellyfin app on the same Server to play a Title, and controlling it from here.
_Avoid_: Cast (that's for Chromecast or AirPlay), remote control

**Download File**:
Saving a Title's original video file to the device. Only Users the Server allows to download see it. It isn't an offline mode.
_Avoid_: Download (alone), offline, save
