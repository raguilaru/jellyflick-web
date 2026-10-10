import { normaliseServerAddress } from './jellyfin/gateway';

/**
 * Settings the host chooses when deploying, read once at startup from a config
 * file the container writes from its environment. The same image therefore works
 * for any host.
 *
 * It carries the preset Server address and nothing else of substance. ADR 0004:
 * the MDBList key stays inside the container, which proxies MDBList itself, so
 * no secret is ever written into a browser-visible file.
 */
export type RuntimeConfig = {
  /** Undefined when the host left the setting empty: ask the User for one. */
  presetServerAddress: string | undefined;
  /** Stamped in by the container; `dev` when running from `vite dev`. */
  appVersion: string;
};

/** The shape of the config file. Anything else in it is ignored. */
export type RuntimeConfigFile = {
  serverAddress?: string;
  appVersion?: string;
};

declare global {
  interface Window {
    __JELLYFLICK_CONFIG__?: RuntimeConfigFile;
  }
}

export function readRuntimeConfig(): RuntimeConfig {
  const file = window.__JELLYFLICK_CONFIG__;

  // There is no container in `vite dev`, so .env.local stands in for it.
  const rawAddress = file?.serverAddress ?? import.meta.env.VITE_SERVER_ADDRESS ?? '';
  const normalised = normaliseServerAddress(String(rawAddress));

  return {
    presetServerAddress: normalised === '' ? undefined : normalised,
    appVersion: file?.appVersion ?? 'dev',
  };
}
