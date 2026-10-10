# Jellyflick delivery research

Scope: container image, runtime configuration injection, multi-arch CI to GHCR, private pull on the host.
Companion files: `toolchain.md` (build, CSS, testing, i18n, fonts), `player-subtitles.md` (hls.js, subtitles, Cast/AirPlay, PWA).

Image sizes below were measured on **2026-10-10** by querying the Docker Hub registry API directly for each manifest and summing its compressed layer sizes — not read from docs. Marked **[verified]**.

---

## Recommendations

1. **Runtime server: `caddy:2-alpine`.** 23.7 MB compressed, a 4-line Caddyfile, correct SPA history fallback with HTTP **200**, on-the-fly compression, official image, `linux/amd64` + `linux/arm64`.
   - **Do NOT use `lipanski/docker-static-website`** despite being 0.1 MB: BusyBox httpd has **no SPA history fallback**. Its only related directive is `E404:`, which serves a page with a **404 status**. Deep links would 404.
   - Size-optimised alternative if 24 MB ever matters: `joseluisq/static-web-server:2-alpine`, **7.6 MB**, with `--page-fallback` documented as "served with 200 for GET requests that would 404, for SPA client-side routing". **[verified]** from its repo.
2. **Multi-stage build**: `node:22-alpine` builder (57.9 MB, discarded) → `caddy:2-alpine` runtime. Final image ships only `dist/` + the Caddyfile + the entrypoint.
3. **Runtime config: generate `/srv/config.js` from env vars at container start**, and load it with a **blocking `<script src="/config.js">` in `<head>`, before the module script**. This is the mechanism that makes one image work for any host — and it is the same indirection the E2E suite points at the fake backend (see `toolchain.md` §4).
4. **CI**: `docker/setup-qemu-action@v4`, `setup-buildx-action@v4`, `metadata-action@v6`, `login-action@v4`, `build-push-action@v7` with `platforms: linux/amd64,linux/arm64` and `permissions: { contents: read, packages: write }`.
5. **Add `LABEL org.opencontainers.image.source`** to the Dockerfile. Without it `GITHUB_TOKEN` may lack push permission, per GitHub's docs.
6. **Private GHCR pull on the host needs a classic PAT with `read:packages`** — GitHub Packages only supports classic PATs for this. `GITHUB_TOKEN` does not exist outside Actions.
7. **OMV8's Compose plugin DOES have a registry login UI** — the **Repos tab has Login/Logout buttons**. This resolves the uncertainty the spec flagged. Older OMV7 advice to SSH in and `docker login` manually is out of date. One caveat below.
8. **Extend `.github/workflows/ci.yml`, do not replace it.** The existing workflow already handles lint/typecheck/test with `hashFiles('package.json')` guards and `node-version-file: .nvmrc`. The container build belongs in a **separate** `release.yml` triggered on push to `main` only.

---

## 9. Delivery

### 9a. Choosing the static server

Measured compressed layer totals and advertised architectures from the registry API. **[verified]**

| Image | Compressed | Layers | Architectures | SPA history fallback |
| --- | --- | --- | --- | --- |
| `lipanski/docker-static-website:latest` | **0.1 MB** | 4 | amd64, arm, arm64 | **None** — `E404:` only, returns **404** |
| `joseluisq/static-web-server:2-alpine` | **7.6 MB** | 8 | 386, amd64, arm, arm64 | **Yes** — `--page-fallback`, returns **200** |
| `caddy:alpine` | **23.7 MB** | 5 | amd64, arm, arm64, ppc64le, riscv64, s390x | **Yes** — `try_files`, returns **200** |
| `nginx:alpine` | **25.1 MB** | 8 | 386, amd64, arm, arm64, ppc64le, riscv64, s390x | **Yes** — `try_files`, returns **200** |
| `busybox:stable` | 2.1 MB | 1 | many | **None** — same limitation as lipanski |
| `node:22-alpine` (builder only) | 57.9 MB | 4 | amd64, arm, arm64, s390x | n/a |

#### Why `lipanski/docker-static-website` is disqualified despite winning on size

It is the obvious pick at 0.1 MB and I wanted to recommend it, but it cannot do the one thing this app needs. From its README, the documented directives are `P:` (proxy), `E404:` (custom 404 page), `A:`/`D:` (allow/deny) and basic auth — and the README documents **no rewrite-to-`index.html` directive and no status code for a fallback**. **[verified]**

`E404:/index.html` would serve the app shell, but with a **404 status**. That breaks caching and monitoring, confuses some reverse proxies, and is simply wrong: `/library/movies` is a valid application URL, not a missing resource. Since the spec requires real URL routing (and `preact-iso` uses `history.pushState` — see `toolchain.md` §2), deep links must return 200.

Its gzip support is also pre-compressed-only ("for every file that should be served gzipped, add a matching `[FILENAME].gz`"), which means a build step to emit `.gz` siblings. Workable, but another reason the size advantage is less real than it looks.

#### Recommendation: Caddy

**`caddy:2-alpine`**, weighing:

- **Correctness is trivial.** `try_files {path} /index.html` is one directive, documented, and returns 200.
- **Compression is automatic.** `encode zstd gzip` compresses on the fly; no `.gz` sibling build step, and zstd is a real win for a 184 KB hls.js chunk.
- **arm64 is first-class**, which matters because the OMV host may well be ARM.
- **24 MB is the right thing to be relaxed about.** It is one-third of the discarded `node:22-alpine` builder, it is pulled once, and the project's "lightweight" constraint is about bytes the TV downloads, not bytes on the NAS. Trading correctness for 16 MB of disk would be a bad trade.

`static-web-server` at 7.6 MB is a legitimate alternative and I verified `--page-fallback` does exactly the right thing (200, GET-only, documented in the repo's own reference). Choose it if image size becomes a real constraint; it is a single-binary Rust server with env-var configuration (`SERVER_*`). nginx is equally correct but needs more config for the same result and has no on-the-fly compression without extra directives.

Sources: <https://github.com/lipanski/docker-static-website>, `static-web-server/static-web-server` repo reference docs.

### 9b. The image

```dockerfile
# syntax=docker/dockerfile:1

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
# Copy manifests first so the dependency layer caches independently of source.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build          # emits /app/dist

# ---- runtime ----
FROM caddy:2-alpine
# Required so GITHUB_TOKEN gets push permission and the package links to the repo.
LABEL org.opencontainers.image.source="https://github.com/raguilaru/jellyflick-web"

COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
```

```caddyfile
# deploy/Caddyfile
:8080 {
	root * /srv
	encode zstd gzip
	file_server

	# Never cache the shell or the runtime config: both must reflect a new
	# deploy and new env vars immediately. Hashed assets under /assets/ are
	# immutable and safe to cache hard.
	@immutable path /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"
	header /index.html Cache-Control "no-cache"
	header /config.js Cache-Control "no-store"

	# SPA history fallback: unknown paths serve the shell with HTTP 200.
	try_files {path} /index.html
}
```

Pin `caddy:2-alpine` rather than `caddy:alpine` so a Caddy 3 release cannot change behaviour under you. Use port 8080, not 80, so the container can run as a non-root user without `NET_BIND_SERVICE`.

### 9c. Runtime config from environment variables

The requirement: one image, any host. So the Jellyfin URL and MDBList key must be read at **container start**, not baked in at **build** time. (Anything referenced as `import.meta.env.VITE_*` is inlined into the bundle at build time and is therefore unusable for this.)

#### Shape of the generated file

A plain, non-module script that assigns one global. Not JSON, because JSON would need a `fetch` before the app can mount, which introduces a render-blocking round trip and an error path; a classic `<script>` in `<head>` is synchronous and guaranteed to have run before the module script executes.

```js
// /srv/config.js — generated at container start. Do not edit; do not commit.
window.__JELLYFLICK_CONFIG__ = {
  "jellyfinUrl": "https://jellyfin.example.lan",
  "mdbListApiKey": "abc123",
  "version": "1.4.0"
};
```

#### Entrypoint that writes it

```sh
#!/bin/sh
# deploy/entrypoint.sh — renders /srv/config.js from the environment, then execs Caddy.
set -eu

: "${JELLYFIN_URL:?JELLYFIN_URL is required}"   # fail fast and loudly
MDBLIST_API_KEY="${MDBLIST_API_KEY:-}"
APP_VERSION="${APP_VERSION:-dev}"

# jq -n builds valid JSON and escapes quotes, backslashes and newlines for us.
# Hand-rolled string interpolation here would be an injection bug.
config=$(jq -n \
  --arg jellyfinUrl   "$JELLYFIN_URL" \
  --arg mdbListApiKey "$MDBLIST_API_KEY" \
  --arg version       "$APP_VERSION" \
  '{jellyfinUrl: $jellyfinUrl, mdbListApiKey: $mdbListApiKey, version: $version}')

printf 'window.__JELLYFLICK_CONFIG__ = %s;\n' "$config" > /srv/config.js

echo "jellyflick: wrote /srv/config.js (jellyfinUrl=$JELLYFIN_URL)"
exec "$@"
```

Add `jq` to the runtime stage (`RUN apk add --no-cache jq`, ~1 MB) — it is worth it. Escaping JSON by hand in `sh` is a real injection vector: a URL containing a quote would produce a syntax error that breaks the whole app, and the MDBList key is attacker-influenced data in the sense that it is arbitrary user input.

`exec "$@"` hands PID 1 to Caddy so signals and graceful shutdown work.

#### How the app reads it before mounting

```html
<!-- index.html — config.js MUST come before the module script. -->
<!-- A classic script in <head> is executed synchronously, so the global is
     guaranteed to exist by the time the deferred module script runs. -->
<script src="/config.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

```ts
// src/runtime-config.ts
export type RuntimeConfig = {
  jellyfinUrl: string;
  mdbListApiKey: string;
  version: string;
};

declare global {
  interface Window { __JELLYFLICK_CONFIG__?: Partial<RuntimeConfig>; }
}

function readRuntimeConfig(): RuntimeConfig {
  const raw = window.__JELLYFLICK_CONFIG__;
  // In `vite dev` there is no container, so fall back to .env.local values.
  const jellyfinUrl = raw?.jellyfinUrl || import.meta.env.VITE_JELLYFIN_URL || '';
  if (!jellyfinUrl) {
    throw new Error('jellyfinUrl is not configured: set JELLYFIN_URL on the container, or VITE_JELLYFIN_URL for local dev.');
  }
  return {
    jellyfinUrl: jellyfinUrl.replace(/\/+$/, ''),   // normalise once, here
    mdbListApiKey: raw?.mdbListApiKey ?? import.meta.env.VITE_MDBLIST_API_KEY ?? '',
    version: raw?.version ?? 'dev',
  };
}

export const config: RuntimeConfig = readRuntimeConfig();
```

For `vite dev`, add a `public/config.js` that is **gitignored** (or let the `import.meta.env` fallback above cover it — simpler, and what I'd recommend).

Two points worth recording in the ticket:

- **`MDBLIST_API_KEY` is served to every browser that loads the app.** Putting it in `config.js` makes it public — anyone who opens devtools has it. That is inherent to a browser-only app calling MDBList directly, and the spec's design implies it, but it should be a conscious decision and documented in the README. The alternative is proxying MDBList through the container (Caddy `reverse_proxy` with the key injected server-side), which keeps the key secret at the cost of making the container a stateful participant. **Flag this to the spec owner.**
- `?? ''` vs `|| ''`: use `||` for `jellyfinUrl` so an empty string is also treated as unset; use `??` for the key so an intentional empty string is preserved. Both operators are downleveled correctly at `chrome68` (see `toolchain.md` §1).

**Mounting a config instead:** worth noting as an alternative the entrypoint pattern does not preclude — a user can bind-mount their own `/srv/config.js` and the entrypoint will overwrite it. If mount-based config is wanted, guard the write with `[ -f /srv/config.js ] || ...` or an `APPLY_RUNTIME_CONFIG=0` escape hatch.

### 9d. Multi-arch GitHub Actions workflow

Latest action majors, read from each repo's latest release on 2026-10-10: **[verified]**

`docker/setup-qemu-action` **v4.4.0** · `docker/setup-buildx-action` **v4.4.1** · `docker/build-push-action` **v7.4.0** · `docker/login-action` **v4.6.0** · `docker/metadata-action` **v6.2.0**

#### Relationship to the existing CI

`.github/workflows/ci.yml` already exists and runs lint/typecheck/test on `pull_request` and on push to `main`, with `hashFiles('package.json') != ''` guards so it no-ops until the app is scaffolded, and `node-version-file: .nvmrc`. **Leave it alone.** The container build has a different trigger (push to `main` only), different permissions (`packages: write`), and a much longer runtime — mixing them would slow every PR for no benefit. Add a new file.

```yaml
# .github/workflows/release.yml
name: Release container

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    # Least privilege: read the repo, write packages. Nothing else.
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v5

      # QEMU provides the arm64 emulation that lets one amd64 runner
      # build both architectures.
      - uses: docker/setup-qemu-action@v4
        with:
          platforms: arm64

      - uses: docker/setup-buildx-action@v4

      - uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest
            type=sha,format=long
            type=ref,event=branch

      - uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          # Persist the layer cache in the registry so arm64 rebuilds are not
          # a full emulated npm ci every time.
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Notes:

- `metadata-action` emits the OCI `labels` including `org.opencontainers.image.source`, which is **also** set as a `LABEL` in the Dockerfile. Keep both: the Dockerfile label covers manual `docker push` from a workstation, which GitHub's docs call out specifically.
- **Caching matters a lot here.** arm64 is built under QEMU emulation, so `npm ci` and the Vite build run perhaps 5–10× slower. `cache-from/to: type=gha` turns most pushes into a layer reuse.
- **To verify in implementation:** if emulated arm64 build time proves painful, the faster pattern is a matrix of native runners (`ubuntu-latest` + `ubuntu-24.04-arm`) building by digest, then a separate job merging them into a manifest list with `docker buildx imagetools create`. ARM-hosted GitHub runners are now generally available for public repos; confirm availability and cost for this repo's plan before restructuring.

#### Pushing requires the source label

From GitHub's docs: `GITHUB_TOKEN` "won't have push permission if you previously pushed to the same namespace without connecting the package to the repository", and the fix is to "add the `org.opencontainers.image.source` label to your Dockerfile so the repository is connected and the token gets appropriate permissions". Hence the `LABEL` above.

Source: <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry>

### 9e. Pulling a private GHCR image on the host

The package is **private by default** when the repository is private. GitHub's documented method, verbatim:

```shell
echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
```

Three facts from that page that constrain the design: **[verified]**

1. **Scope for read-only pull is `read:packages`**, which "lets you download container images and read their metadata". Create a token with that scope and nothing else.
2. **It must be a classic PAT.** The page states GitHub Packages "only supports that token type for authentication" — **fine-grained PATs do not work for GHCR**. This is the detail most likely to waste an afternoon.
3. **`GITHUB_TOKEN` cannot be used on the host.** It only exists inside an Actions run and expires with the job. The page documents it only for workflows and directs other contexts to a PAT.

Credential storage reality: with no credential helper installed, `docker login` writes the token **base64-encoded (not encrypted)** into `$HOME/.docker/config.json` of whichever user ran it. Because the OMV Compose plugin runs as root, that is `/root/.docker/config.json`. Treat it as a secret at rest, and prefer a token scoped to `read:packages` alone with an expiry so a leak is bounded.

**A simpler option worth putting to the spec owner:** if the repository (and therefore the package) is made **public**, no login is needed on the host at all, and the whole PAT lifecycle disappears. The image contains no secrets — the Jellyfin URL and MDBList key are injected at runtime, never baked in (§9c) — so there is no technical reason the image must be private. This removes an entire class of operational failure. Recommend it unless the project is deliberately closed-source.

#### Does OMV8's Compose plugin have a registry login UI? Yes.

The spec flagged this as needing verification. **It does.** The omv-extras wiki page for the OMV8 Docker Compose plugin documents a **Repos tab with Login and Logout buttons**, where Login "Opens a dialog to authenticate with a container image repository", and notes that authentication affects pulling or pushing from private repositories. **[verified]** by fetching the page.

Source: <https://wiki.omv-extras.org/doku.php?id=omv8:omv8_plugins:docker_compose>

So the host procedure is: **Services ▸ Compose ▸ Repos ▸ Login**, entering `ghcr.io`, the GitHub username, and the classic PAT as the password. No SSH needed.

Caveats to carry into the runbook:

- The wiki page **does not describe the dialog's fields** and does not mention `ghcr.io` specifically, so the exact field labels (registry/server, username, password) are unconfirmed. **To verify in implementation** — confirm on the actual box; have the `docker login ghcr.io -u USER --password-stdin` fallback ready.
- Widely-circulated advice to SSH in and run `docker login` by hand comes from an **OMV 7**-era forum thread (December 2024) that predates this UI. It still works as a fallback but is no longer the only way. The same thread records the reason a login UI was initially resisted — the plugin runs everything as root, so credentials would land in root's `config.json` — which is still where they end up, just written by the UI instead of by hand.

Other plugin facts relevant to the compose file: each compose configuration can have its own **`.env` file** (the "Environment" field in the Files ▸ Add dialog, saved beside the `.yaml`), and there is a **global environment file** for variables shared across all stacks, referenced as `${VAR}`. Both are included in the plugin's backups. That is the natural home for `JELLYFIN_URL` and `MDBLIST_API_KEY`. **[verified]** from the same wiki page.

#### Compose file for the host

```yaml
services:
  jellyflick:
    image: ghcr.io/raguilaru/jellyflick-web:latest
    container_name: jellyflick
    restart: unless-stopped
    ports:
      - "8096:8080"
    environment:
      # Supplied by the stack's .env or the plugin's global environment file.
      JELLYFIN_URL: "${JELLYFIN_URL}"
      MDBLIST_API_KEY: "${MDBLIST_API_KEY}"
    # The entrypoint writes /srv/config.js at start, so the filesystem cannot
    # be fully read-only; /srv is given a tmpfs overlay instead.
    read_only: true
    tmpfs:
      - /srv/config.js.d
    security_opt:
      - no-new-privileges:true
```

**To verify in implementation:** `read_only: true` conflicts with the entrypoint writing `/srv/config.js`. Either drop `read_only`, or write the config to a `tmpfs`-mounted directory and have Caddy serve `/config.js` from there via a `handle_path` / `root` override. The second is cleaner but needs the Caddyfile adjusted — resolve this when the Dockerfile is actually written rather than guessing the mount layout now.
