import type { FakeRoute } from '../routing.ts';
import { displayPreferencesRoutes } from './display-preferences.ts';
import { genreRoutes } from './genres.ts';
import { itemRoutes } from './items.ts';
import { sessionRoutes } from './sessions.ts';
import { systemRoutes } from './system.ts';
import { userFavoriteRoutes } from './user-favorites.ts';
import { userPlayedRoutes } from './user-played.ts';
import { userRoutes } from './users.ts';
import { userViewRoutes } from './user-views.ts';

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
  ...sessionRoutes,
  ...userViewRoutes,
  ...userFavoriteRoutes,
  ...userPlayedRoutes,
  ...itemRoutes,
  ...genreRoutes,
  ...displayPreferencesRoutes,
];
