#!/bin/sh
# Renders the browser-visible runtime config from the container's environment,
# then hands the process on to the server. This is the mechanism that makes one
# image work for any host: nothing about the deployment is baked into the build.
#
# Two rules this script exists to keep:
#
#   1. The file carries exactly the keys src/runtime-config.ts reads —
#      `serverAddress` and `appVersion` — and nothing else. A mismatch here
#      breaks the app silently.
#   2. MDBLIST_API_KEY is never written and never echoed. The server reads it
#      straight from the environment and proxies MDBList itself (ADR 0004).
#
# An empty JELLYFIN_URL is a supported choice, not an error: the app then asks
# the User for an address on first launch (spec story 4).
set -eu

# Written into a directory of its own, because the image's root filesystem is
# read-only and this one is a tmpfs. See deploy/compose.example.yaml.
CONFIG_DIR="${JELLYFLICK_CONFIG_DIR:-/srv/config}"
mkdir -p "$CONFIG_DIR" 2>/dev/null || true
if [ ! -w "$CONFIG_DIR" ]; then
  echo "jellyflick: cannot write $CONFIG_DIR, so the runtime config cannot be" >&2
  echo "jellyflick: rendered. The image's filesystem is read-only by design:" >&2
  echo "jellyflick: give this path a tmpfs, as deploy/compose.example.yaml does." >&2
  exit 1
fi

# jq -n builds the JSON, so quotes, backslashes and newlines in the address are
# escaped properly. Interpolating them into the file by hand would be an
# injection bug: one quote in JELLYFIN_URL would emit JavaScript that does not
# parse, and the whole app would fail to start with no clue why.
config=$(
  jq -n \
    --arg serverAddress "${JELLYFIN_URL:-}" \
    --arg appVersion "${APP_VERSION:-dev}" \
    '{serverAddress: $serverAddress, appVersion: $appVersion}'
)

printf 'window.__JELLYFLICK_CONFIG__ = %s;\n' "$config" >"$CONFIG_DIR/config.js"

if [ -n "${JELLYFIN_URL:-}" ]; then
  echo "jellyflick: preset Server address is ${JELLYFIN_URL}"
else
  echo 'jellyflick: no preset Server address; the app will ask for one'
fi
if [ -n "${MDBLIST_API_KEY:-}" ]; then
  echo 'jellyflick: MDBList key is set; extra ratings are proxied by this container'
else
  echo 'jellyflick: no MDBList key; extra ratings are switched off'
fi

# exec, so the server becomes PID 1 and Docker's stop signal reaches it.
exec "$@"
