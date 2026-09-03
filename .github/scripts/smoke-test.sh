#!/usr/bin/env bash
#
# Boots a built image with the same hardening as docker-compose.yml.
# Fake CF_* IDs skip Cloudflare auto-detection (no network needed).
# Usage: smoke-test.sh <image> <container-name> [platform]
# Optional platform runs the image under that arch (release arm64 check).
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

# Generous budget for emulated arm64; still a hard fail if /healthz never answers.
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

# SPA is served; hashed JS/CSS from the shell must be reachable (a COPY that leaves
# index.html and drops /assets/* used to pass with only the root div check).
html="$(curl -fsS "http://127.0.0.1:${PORT}/")"
printf '%s' "$html" | grep -q '<div id="root">'
js_assets="$(printf '%s' "$html" | grep -oE '/assets/[^"[:space:]]+\.js' || true)"
css_assets="$(printf '%s' "$html" | grep -oE '/assets/[^"[:space:]]+\.css' || true)"
test -n "$js_assets"
test -n "$css_assets"
while IFS= read -r asset; do
  [ -z "$asset" ] && continue
  test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}${asset}")" = "200"
done <<EOF
${js_assets}
${css_assets}
EOF

test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/me")" = "401"
curl -sS "http://127.0.0.1:${PORT}/api/me" | grep -q '"code":"auth.setup_required"'

echo "Smoke test passed${PLATFORM:+ for $PLATFORM}."
