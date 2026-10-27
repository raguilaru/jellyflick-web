import type { FakeRoute } from '../routing.ts';

export const systemRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/System/Info/Public',
    handle: (_request, state) => ({ status: 200, body: state.systemInfo }),
  },
];
