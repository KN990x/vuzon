#!/usr/bin/env bash
#
# Proves a built image actually BOOTS. `docker build` succeeding says nothing about that.
#
# The container is started with the same hardening the shipped compose file applies
# (read_only, cap_drop ALL, no-new-privileges, data volume on /app/data), so a regression
# that only shows up under those constraints — a write outside /app/data, a capability the
# runtime needs — fails here rather than on a user's homelab.
#
# Setting CF_ZONE_ID and CF_ACCOUNT_ID skips Cloudflare auto-detection, so no real
# credential is needed: the panel never reaches the network.
#
# Usage: smoke-test.sh <image> <container-name> [platform]
#
# `platform` is what makes this usable for the release build: the multi-arch image used to
# be pushed to GHCR having only ever been executed on amd64, so an arm64-only failure
# reached Raspberry Pi users as a silent restart loop (`restart: unless-stopped`).
set -euo pipefail

IMAGE="${1:?image required}"
NAME="${2:?container name required}"
PLATFORM="${3:-}"

VOLUME="${NAME}-data"
PORT=8001

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

platform_args=()
if [ -n "$PLATFORM" ]; then
  platform_args=(--platform "$PLATFORM")
fi

echo "::group::Starting $IMAGE ${PLATFORM:+($PLATFORM)}"
docker run -d --name "$NAME" \
  "${platform_args[@]}" \
  --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$VOLUME":/app/data \
  -e DOMAIN=ci-smoke-test.invalid \
  -e CF_API_TOKEN=ci-smoke-test-token \
  -e CF_ZONE_ID=ci_smoke_zone \
  -e CF_ACCOUNT_ID=ci_smoke_account \
  -p "$PORT":8001 "$IMAGE"
echo "::endgroup::"

# Emulated arm64 boots several times slower than native, so the budget is generous. It is
# still a hard bound: an image that never answers must fail, not hang until the job times out.
for i in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    echo "healthz OK after ${i}s"
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "The container never answered /healthz:"
    docker logs "$NAME"
    exit 1
  fi
  sleep 1
done

# The SPA is served…
curl -fsS "http://127.0.0.1:${PORT}/" | grep -q '<div id="root">'
# …and without credentials the API answers 401 JSON with setup_required, not the SPA. That
# pair is what proves the /api 404 is still registered before the SPA catch-all.
test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/me")" = "401"
curl -sS "http://127.0.0.1:${PORT}/api/me" | grep -q '"code":"auth.setup_required"'

echo "Smoke test passed${PLATFORM:+ for $PLATFORM}."
