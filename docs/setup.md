# Setting Jellyflick up on your own machine

For the host: how to run Jellyflick next to your Jellyfin server. There is
nothing to build — GitHub builds the image on every push to `main`, for both
ARM (a Raspberry Pi) and x86.

The whole thing is four steps:

1. Make a token so your machine can pull the image
2. Sign in to the registry, once
3. Add the compose file and its two settings
4. Point your HTTPS reverse proxy at it

## What you need

- A machine running Docker. These instructions use **OpenMediaVault 8's Compose
  plugin**, but any Docker host works; the compose file is ordinary.
- Your **Jellyfin server's address**, reachable from the browsers that will use
  Jellyflick. Optional — leave it out and Jellyflick asks for it on first launch.
- Optionally, an **MDBList API key**, for the extra ratings.
- A **reverse proxy** that already terminates HTTPS. Jellyflick speaks plain
  HTTP; it is not meant to face the internet by itself.

## 1. Make a token so your machine can pull the image

The image is private, so pulling it needs a token.

1. On GitHub, go to **Settings ▸ Developer settings ▸ Personal access tokens ▸
   Tokens (classic)** and choose **Generate new token (classic)**.
2. Give it the **`read:packages`** scope and nothing else. That scope only
   allows downloading images and reading their metadata.
3. Set an expiry you are willing to renew, and copy the token.

Two things that will otherwise cost you an afternoon:

- **It has to be a classic token.** GitHub Packages does not accept
  fine-grained personal access tokens for the container registry.
- **`GITHUB_TOKEN` is not an option.** It only exists inside a GitHub Actions
  run and expires with the job.

Treat the token as a password. Where `docker login` stores it is covered at the
end of step 2.

## 2. Sign in to the registry, once

### In OpenMediaVault's own interface

OMV8's Compose plugin can do this for you, so no SSH is needed:

1. **Services ▸ Compose ▸ Repos**.
2. Press **Login**.
3. Enter the registry `ghcr.io`, your GitHub username, and the classic token as
   the password.

The dialog's field labels are not documented, so if they do not match what is
described here, read them as *registry / server*, *username* and *password* and
use the fallback below if anything is unclear.

### Fallback: from a shell

```shell
echo "$CR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Either way, the credential lands in the `.docker/config.json` of whichever user
ran it — `/root/.docker/config.json` for the Compose plugin, which runs as root.
With no credential helper installed it is **base64-encoded, not encrypted**, so
keep the token scoped to `read:packages` alone and give it an expiry.

You only do this once per machine. `docker logout ghcr.io`, or the plugin's
**Logout** button, undoes it.

## 3. Add the compose file and its settings

Copy [`deploy/compose.example.yaml`](../deploy/compose.example.yaml) into
**Services ▸ Compose ▸ Files ▸ Add**.

Put the settings in that stack's **Environment** field, which the plugin saves
as an `.env` beside the `.yaml`. The plugin also has a global environment file
if you would rather share values between stacks; both are included in its
backups.

```sh
JELLYFIN_URL=https://jellyfin.example.lan
MDBLIST_API_KEY=
```

| Setting | What it does |
| --- | --- |
| `JELLYFIN_URL` | The Jellyfin server Users are sent to. Leave it empty and Jellyflick asks for an address on first launch instead. |
| `MDBLIST_API_KEY` | Optional. Switches on the extra ratings. Leave it empty and they are simply left out. |

Then **Up** the stack. On the first run Docker pulls the image; after that, OMV's
scheduled pull keeps it current, because the workflow publishes `latest` on every
push to `main`.

A few things about the compose file worth knowing:

- It publishes **8096 on the host, 8080 in the container**. Change the host side
  freely if 8096 is taken.
- `restart: unless-stopped`, so it comes back after a reboot.
- The filesystem is **read-only**, with a small `tmpfs` at `/srv/config`. That is
  the one place anything is written: at start-up the container renders the
  runtime config from your settings. If that tmpfs is missing the container
  stops immediately and says so, rather than serving something stale.
- There is a healthcheck on `/api/health`, so `docker ps` tells you whether it
  is actually serving.

### About the MDBList key

The key stays **inside the container**. Jellyflick's own server calls MDBList for
the browser and caches each Title's ratings for a day, so the key is never sent
to a browser and your household shares one daily quota rather than one per
device. There is nothing to configure per User, and no User can read the key.

## 4. Put it behind your HTTPS reverse proxy

Jellyflick serves plain HTTP on the port you published. Terminate HTTPS at the
proxy you already run and forward to it. Do not publish the container's port to
the internet directly.

Whatever proxy you use, three things matter:

- **Forward the whole path, unmodified, from the root.** Jellyflick expects to
  be served from `/`, not from a subdirectory.
- **Do not add caching of your own.** The container already sends the right
  headers: hashed assets are immutable, and the app shell and the runtime config
  are never cached, so a changed setting takes effect on the next reload.
- **HTTPS is worth doing even on your own network.** Browsers reserve some
  features for secure origins, and installing Jellyflick as an app needs one.

Nginx, as an example:

```nginx
location / {
    proxy_pass http://127.0.0.1:8096;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Caddy:

```caddyfile
jellyflick.example.com {
	reverse_proxy 127.0.0.1:8096
}
```

Your Jellyfin server should be reachable over HTTPS too. A browser on an HTTPS
page will refuse to call a plain-HTTP Jellyfin, so an `http://` address in
`JELLYFIN_URL` will fail once Jellyflick itself is on HTTPS.

## If something is wrong

| What you see | Usually |
| --- | --- |
| `denied` or `unauthorized` on pull | Not signed in to `ghcr.io`, or the token is fine-grained rather than classic, or it has expired. |
| The container starts and stops at once, logging that it cannot write `/srv/config` | The `tmpfs` entry is missing from the compose file while `read_only: true` is set. |
| Jellyflick asks for a Server address although you set one | `JELLYFIN_URL` did not reach the container. Check the stack's environment file, then `docker exec jellyflick cat /srv/config/config.js`. |
| Extra ratings never appear | No `MDBLIST_API_KEY`. `curl http://127.0.0.1:8096/api/ratings/imdb/movie/tt0133093` answers `mdblist-not-configured` when it is unset. |
| A deep link 404s | Something between the browser and the container is serving the path itself. Jellyflick answers an unknown path with the app and a 200. |

The container's logs say, on every start, whether a Server address was preset
and whether the MDBList key is set — never the key itself.
