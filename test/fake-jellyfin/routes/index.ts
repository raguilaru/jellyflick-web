import type { FakeRoute } from '../routing.ts';
import { attachmentRoutes } from './attachments.ts';
import { displayPreferencesRoutes } from './display-preferences.ts';
import { genreRoutes } from './genres.ts';
import { itemRoutes } from './items.ts';
import { libraryRoutes } from './library.ts';
import { quickConnectRoutes } from './quick-connect.ts';
import { mediaInfoRoutes } from './media-info.ts';
import { mediaSegmentRoutes } from './media-segments.ts';
import { movieRoutes } from './movies.ts';
import { sessionRoutes } from './sessions.ts';
import { showRoutes } from './shows.ts';
import { subtitleRoutes } from './subtitles.ts';
import { systemRoutes } from './system.ts';
import { userFavoriteRoutes } from './user-favorites.ts';
import { userItemRoutes } from './user-items.ts';
import { userPlayedRoutes } from './user-played.ts';
import { userRoutes } from './users.ts';
import { userViewRoutes } from './user-views.ts';
import { videoRoutes } from './videos.ts';

/**
 * Every Jellyfin endpoint the fake answers.
 *
 * To add one: write a module next to `system.ts` exporting a
 * `readonly FakeRoute[]`, then spread it here. Keep one module per Jellyfin
 * controller so later tickets rarely touch the same file.
 */
export const jellyfinRoutes: readonly FakeRoute[] = [
  ...systemRoutes,
  ...userRoutes,
  ...quickConnectRoutes,
  ...sessionRoutes,
  ...userViewRoutes,
  ...userFavoriteRoutes,
  ...userPlayedRoutes,
  ...userItemRoutes,
  ...showRoutes,
  ...movieRoutes,
  ...mediaInfoRoutes,
  ...mediaSegmentRoutes,
  // Before the item routes: `/Items/{id}/Download` is three segments and so
  // cannot be shadowed, but keeping the narrower family first is the rule the
  // subtitle routes already follow.
  ...libraryRoutes,
  ...itemRoutes,
  // Before the video routes: both live under `/Videos`, and keeping the more
  // specific family first means a later `/Videos/…` pattern cannot shadow it.
  ...subtitleRoutes,
  ...attachmentRoutes,
  ...videoRoutes,
  ...genreRoutes,
  ...displayPreferencesRoutes,
];
