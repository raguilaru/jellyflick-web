# Jellyflick

A web client for [Jellyfin](https://jellyfin.org) 12 and later, in the shape of
a modern streaming app: a featured Billboard, rows a household arranges for
itself, Continue Watching, My List, extra ratings, and a player with subtitle
timing, Cast and Play On.

It is built with Preact and no framework beyond it, deliberately light: the code
keeps to a Chromium 68 floor so that an LG webOS TV port stays small tweaks
rather than a rewrite ([ADR 0002](docs/adr/0002-webos-5-minimum-modern-css-with-fallbacks.md)).
Today it runs in current desktop and phone browsers; the TV app does not exist
yet.

![Home](screenshots/04-home.png)

## What you need

- A **Docker host** — a Raspberry Pi is enough.
- A **Jellyfin 12+ server**, reachable from the browsers that will use
  Jellyflick. Optional at install time: leave it unset and Jellyflick asks for
  an address on first launch.
- A **reverse proxy that terminates HTTPS**. Jellyflick speaks plain HTTP and is
  not meant to face the internet by itself.
- Optionally an **[MDBList](https://mdblist.com) API key**, for the extra
  ratings. It stays inside the container and is never sent to a browser
  ([ADR 0004](docs/adr/0004-mdblist-proxied-by-the-container.md)).

## Quick start

The image is published to a **private** registry, so first sign in once —
[docs/setup.md](docs/setup.md) covers making the `read:packages` token:

```sh
echo "$CR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Then pick the compose file that matches your situation:

| Your Jellyfin | Use |
| --- | --- |
| Already a container on this host, or about to be | [`deploy/compose.with-jellyfin.example.yaml`](deploy/compose.with-jellyfin.example.yaml) |
| On another machine, or not in Docker | [`deploy/compose.example.yaml`](deploy/compose.example.yaml) |

Set `JELLYFIN_URL` and, if you want them, `MDBLIST_API_KEY`, then:

```sh
docker compose up -d
```

Finally point your reverse proxy at it. The container serves plain HTTP on
**8080**. SWAG users have a ready-made conf:
[`deploy/jellyflick.subdomain.conf.example`](deploy/jellyflick.subdomain.conf.example).

> **The one thing that catches everyone.** `JELLYFIN_URL` is resolved by the
> **browser**, not by the container — so in a composed stack
> `http://jellyfin:8096` fails for every User while looking perfectly correct,
> because no laptop can resolve `jellyfin`. Use the address your Users' browsers
> reach Jellyfin on.

[docs/setup.md](docs/setup.md) is the full guide: the registry token, both
compose arrangements, proxy configuration for nginx, Caddy and SWAG, and a
troubleshooting table.

## What it is not

- **Not a Jellyfin plugin or a fork.** It is a separate client that talks to the
  Jellyfin HTTP API; nothing is installed into your Server.
- **Not internet-facing on its own.** No HTTPS, no authentication of its own —
  Users sign in to *your* Jellyfin. Put it behind your proxy.
- **Not a Jellyfin 10.x client.** 12.0 is the floor, on purpose
  ([ADR 0001](docs/adr/0001-jellyfin-12-minimum.md)).
- **Not offline-capable.** It is installable as an app, but there is no service
  worker, so it needs the network every time. (There *is* a Download File
  control on a title page, which hands you the original file from the Server —
  that is a download, not offline playback in the app.)

## Documentation

| | |
| --- | --- |
| [docs/setup.md](docs/setup.md) | Running it next to your Jellyfin, end to end |
| [docs/architecture.md](docs/architecture.md) | How the code is organised, how to run each test suite, and the Chromium 68 traps |
| [GLOSSARY.md](GLOSSARY.md) | The project's vocabulary, which the code and the tickets both use |
| [docs/adr/](docs/adr/) | The decisions that constrain everything else |
| [docs/research/decisions.md](docs/research/decisions.md) | The calls made while building, with their reasons |

## Development

```sh
npm install
npm run dev
```

`npm test` runs Vitest, `npm run test:e2e` runs Playwright against a production
build, and both start their own fake Jellyfin — no real Server needed. Read
[docs/architecture.md](docs/architecture.md) before changing code; it is written
for whoever picks up the next ticket.

## Licence

**The project itself has no licence file yet**, which by default means all
rights reserved — worth knowing before you reuse any of it.

The third-party code the app *serves* is licensed, and those texts ship with it:
[`public/licences/`](public/licences/), with
[`NOTICE.txt`](public/licences/NOTICE.txt) linked from the settings screen.
