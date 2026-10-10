import { startFakeJellyfin } from './server.ts';
import { FAKE_JELLYFIN_PORT } from './url.ts';

export default async function setup(): Promise<() => Promise<void>> {
  const fake = await startFakeJellyfin({ port: FAKE_JELLYFIN_PORT });
  return () => fake.close();
}
