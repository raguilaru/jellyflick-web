import type { FakeRoute } from '../routing.ts';
import { displayPreferencesRoutes } from './display-preferences.ts';
import { genreRoutes } from './genres.ts';
import { itemRoutes } from './items.ts';
import { quickConnectRoutes } from './quick-connect.ts';
import { mediaInfoRoutes } from './media-info.ts';
import { movieRoutes } from './movies.ts';
import { sessionRoutes } from './sessions.ts';
import { showRoutes } from './shows.ts';
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
  ...itemRoutes,
  ...videoRoutes,
  ...genreRoutes,
  ...displayPreferencesRoutes,
];
