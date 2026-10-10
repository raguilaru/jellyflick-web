/**
 * In-memory sample data for the fake Jellyfin.
 *
 * Every later ticket grows this: add a field to `FakeJellyfinState`, seed it in
 * `createSampleData()`, and read it from a route module. `POST /__fake/state`
 * shallow-merges a patch over the whole object, so a test can change any of it
 * without a code change here.
 */

export type FakeSystemInfo = {
  LocalAddress: string;
  ServerName: string;
  Version: string;
  ProductName: string;
  Id: string;
  StartupWizardCompleted: boolean;
};

export type FakeJellyfinState = {
  systemInfo: FakeSystemInfo;
};

export function createSampleData(): FakeJellyfinState {
  return {
    systemInfo: {
      LocalAddress: 'http://127.0.0.1:8096',
      ServerName: 'Fake Jellyfin',
      Version: '12.2.0',
      ProductName: 'Jellyfin Server',
      Id: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      StartupWizardCompleted: true,
    },
  };
}
