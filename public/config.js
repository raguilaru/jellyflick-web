// Placeholder runtime config, kept so `vite dev` and `vite preview` have a
// /config.js to load. The container overwrites this file at start-up from its
// environment. It carries the preset Server address and nothing else: ADR 0004
// keeps the MDBList key inside the container.
window.__JELLYFLICK_CONFIG__ = { serverAddress: '', appVersion: 'dev' };
