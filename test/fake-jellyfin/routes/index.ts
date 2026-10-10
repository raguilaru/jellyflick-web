import type { FakeRoute } from '../routing.ts';
import { genreRoutes } from './genres.ts';
import { itemRoutes } from './items.ts';
import { systemRoutes } from './system.ts';
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
  ...userViewRoutes,
  ...itemRoutes,
  ...genreRoutes,
];
