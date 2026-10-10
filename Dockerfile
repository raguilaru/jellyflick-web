# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
# Builds the browser bundle and compiles the container's own server. Both are
# discarded from the final image except for their output.
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer caches independently of the source.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `npm run build` also fails on TOLERATED_TRANSFORM, so an image is never
# published with syntax the Chromium 68 target cannot parse (ADR 0002).
RUN npm run build && npm run build:server

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine

# Required for the GHCR push: without it GITHUB_TOKEN may lack push permission,
# and the package would not be linked to the repository.
LABEL org.opencontainers.image.source="https://github.com/raguilaru/jellyflick-web"
LABEL org.opencontainers.image.description="A lightweight web client for a single Jellyfin server"
LABEL org.opencontainers.image.licenses="NOASSERTION"

# jq builds the runtime config's JSON in the entrypoint. Escaping it by hand in
# sh would be an injection bug, so the megabyte is worth it.
RUN apk add --no-cache jq

# /srv/app is the immutable build output; /srv/config is where the entrypoint
# writes config.js and is a tmpfs at run time, because the compose file sets
# read_only: true. The directory is created here so the mount has somewhere to
# land, and owned by `node` so the entrypoint can write into it.
COPY --from=build /app/dist /srv/app
COPY --from=build /app/server-dist /srv/server
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /srv/config \
  && chown -R node:node /srv/config

# Stamped by the release workflow with the commit the image was built from, so
# the host does not have to set it. The entrypoint writes it into the runtime
# config as `appVersion`.
ARG APP_VERSION=dev

ENV APP_VERSION=${APP_VERSION} \
  NODE_ENV=production \
  JELLYFLICK_ROOT=/srv/app \
  JELLYFLICK_CONFIG_DIR=/srv/config \
  HOST=0.0.0.0 \
  PORT=8080

# 8080 rather than 80, so the container never needs NET_BIND_SERVICE.
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "/srv/server/main.js"]
