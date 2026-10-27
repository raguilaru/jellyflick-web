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

**Two compose files, and the choice is about where your Jellyfin lives.**

| Your Jellyfin | Use | What it assumes |
| --- | --- | --- |
| On another machine, or not in Docker | [`deploy/compose.example.yaml`](../deploy/compose.example.yaml) | Jellyflick alone, publishing a port the host's proxy forwards to |
| A container on this same host | [`deploy/compose.with-jellyfin.example.yaml`](../deploy/compose.with-jellyfin.example.yaml) | Both services on one shared Docker network, reached by container name |

The walkthrough below is the first file. [Both services in one
stack](#both-services-in-one-stack) covers the second, and the differences are
only in this step and the next.

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

**SWAG**, which is nginx with its own conventions, has a ready-made file in this
repository: [`deploy/jellyflick.subdomain.conf.example`](../deploy/jellyflick.subdomain.conf.example).
Copy it into SWAG's `proxy-confs` directory as
`jellyflick.subdomain.conf`, drop the `.example`, and reload. It is written for
the shared-network arrangement below, and its last section covers changing it
for a published port instead. Check it with `nginx -t` before reloading, every
time — a conf that does not parse takes every other site on that SWAG down with
it.

Your Jellyfin server should be reachable over HTTPS too. A browser on an HTTPS
page will refuse to call a plain-HTTP Jellyfin, so an `http://` address in
`JELLYFIN_URL` will fail once Jellyflick itself is on HTTPS.

## Both services in one stack

If your Jellyfin is a container on this host, run the two together with
[`deploy/compose.with-jellyfin.example.yaml`](../deploy/compose.with-jellyfin.example.yaml).
It is the common arrangement where a reverse proxy — a SWAG, Nginx Proxy
Manager or Traefik stack — is already running on a Docker network of its own.

Three things differ from the walkthrough above.

### `JELLYFIN_URL` is resolved by the browser, not by the container

**This is the one that catches everyone**, and it looks correct while it is
wrong. `deploy/entrypoint.sh` renders the address into a *browser-visible*
config file, so it is your Users' browsers that have to resolve it:

```yaml
JELLYFIN_URL: "http://jellyfin:8096"      # WRONG — no laptop can resolve `jellyfin`
JELLYFIN_URL: "https://jellyfin.example.com"   # the address a browser reaches
```

A Docker service name works beautifully inside the network and not at all
outside it, so the symptom is that Jellyflick loads and then cannot reach the
Server for anyone — with an address that reads perfectly in the compose file.

`docker exec jellyflick cat /srv/config/config.js` shows exactly what the
browser was handed, which settles it in one command.

It also has to be **HTTPS** once Jellyflick itself is, because a browser on an
HTTPS page refuses to call a plain-HTTP server.

### Nothing needs `depends_on`

Jellyflick never calls Jellyfin from inside the container: it hands the address
to the browser and the browser does the talking. So the two services are
independent at start-up, in either order, and ordering between them buys
nothing.

### The proxy reaches the containers by name, not through a published port

On a shared network neither service needs to publish a port at all. Point the
proxy at the container and Jellyflick's internal port, **8080**:

```nginx
location / {
    proxy_pass http://jellyflick:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Caddy:

```caddyfile
jellyflick.example.com {
	reverse_proxy jellyflick:8080
}
```

With SWAG, copy [`deploy/jellyflick.subdomain.conf.example`](../deploy/jellyflick.subdomain.conf.example)
into its `proxy-confs` directory as `jellyflick.subdomain.conf` and reload. The
container name and `8080` are the only two values it needs, and both are already
in it, so on this arrangement it usually needs no editing at all — **the Docker
network's name does not appear in it**, because nginx finds the container
through Docker's embedded DNS rather than by network. It carries the reasoning
for each line, including the two things that must *not* be added: no caching of
your own, and no `add_header` inside the `location` block.

Everything in step 4 above about forwarding the whole path from the root, adding
no caching of your own, and HTTPS being worth it on your own network applies
here unchanged.

The network is `external: true` in the example, meaning compose expects to find
it rather than create it. **If your reverse proxy already has a network, use
that name instead** — a SWAG stack is often on one called `swag-net`, and Nginx
Proxy Manager and Traefik each have their own habit. `proxy-net` is only what
these examples happen to call it. If you have not got one yet:

```sh
docker network create proxy-net
```

and put your reverse proxy on it as well.

## If something is wrong

| What you see | Usually |
| --- | --- |
| `denied` or `unauthorized` on pull | Not signed in to `ghcr.io`, or the token is fine-grained rather than classic, or it has expired. |
| The container starts and stops at once, logging that it cannot write `/srv/config` | The `tmpfs` entry is missing from the compose file while `read_only: true` is set. |
| Jellyflick asks for a Server address although you set one | `JELLYFIN_URL` did not reach the container. Check the stack's environment file, then `docker exec jellyflick cat /srv/config/config.js`. |
| Jellyflick loads, but **nobody** can reach the Server, and the address looks right | `JELLYFIN_URL` is a Docker-internal name such as `http://jellyfin:8096`. The **browser** resolves it, not the container. Use the address your Users reach Jellyfin on, and check what was rendered with `docker exec jellyflick cat /srv/config/config.js`. |
| Sign-in fails only once Jellyflick is on HTTPS | `JELLYFIN_URL` is `http://`. A browser on an HTTPS page will not call a plain-HTTP Server. |
| Extra ratings never appear | No `MDBLIST_API_KEY`. `curl http://127.0.0.1:8096/api/ratings/imdb/movie/tt0133093` answers `mdblist-not-configured` when it is unset. |
| A deep link 404s | Something between the browser and the container is serving the path itself. Jellyflick answers an unknown path with the app and a 200. |
| The stack will not start: a port is already allocated | The **host** side of a published port is taken. `compose.example.yaml` publishes 8096, which is also Jellyfin's own default — move one of them. The container side (8080) is private to the container and cannot collide; on a shared network nothing is published at all. |
| A new image, or a changed setting, does not appear even after a reload | Something between the browser and the container is caching. The container sends `no-cache` for the app shell and the runtime config precisely so a reload is enough, and a cache in your proxy overrides that. Remove it rather than shortening it. |

The container's logs say, on every start, whether a Server address was preset
and whether the MDBList key is set — never the key itself.
