# Proxy MDBList through the container rather than calling it from the browser

MDBList takes its API key as a query parameter and allows 1,000 requests a day per
account, so calling it straight from the browser would both expose the host's key to
every signed-in User and multiply the request count by the number of browsers in the
household. The container therefore serves the app *and* proxies MDBList on its behalf,
holding `MDBLIST_API_KEY` server-side and caching responses per Title so one lookup
serves everyone. This replaces the plain static file server with a small service that
has one proxy route, and means the key is deliberately absent from the browser-visible
runtime config.

## Consequences

- The runtime config file written at container start exposes only the preset Server
  address. The MDBList key never leaves the container.
- Jellyfin's own `CriticRating`, `CommunityRating` and `OfficialRating` still come
  straight from the Server; only the extra sources go through the proxy.
- The known limitation recorded in the spec — "the MDBList key can be seen by any
  signed-in User" — no longer applies and should not be documented in the UI.
