#!/usr/bin/env bash

set -Eeuo pipefail

WEB_URL="${1:-https://vprocly.com}"
API_URL="${2:-https://api.vprocly.com}"

check() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status
  status="$(curl --silent --show-error --location --output /dev/null --write-out '%{http_code}' "$url")"
  [[ "$status" =~ $expected ]] || { printf '%s failed: %s returned %s\n' "$label" "$url" "$status" >&2; exit 1; }
  printf '%-18s %s (%s)\n' "$label" "$url" "$status"
}

check "Web shell" "${WEB_URL}/" '^(200|30[1278])$'
check "API liveness" "${API_URL}/health/live" '^200$'
check "API readiness" "${API_URL}/health/ready" '^200$'

# A staging deployment can provide seeded credentials without putting them in source control. Production
# normally omits these variables and runs only the anonymous infrastructure smoke checks above.
if [[ -n "${SMOKE_TOKEN_URL:-}" && -n "${SMOKE_CLIENT_ID:-}" && -n "${SMOKE_CLIENT_SECRET:-}" && -n "${SMOKE_USERNAME:-}" && -n "${SMOKE_PASSWORD:-}" ]]; then
  token="$(curl --silent --show-error --fail \
    --data-urlencode grant_type=password \
    --data-urlencode client_id="$SMOKE_CLIENT_ID" \
    --data-urlencode client_secret="$SMOKE_CLIENT_SECRET" \
    --data-urlencode username="$SMOKE_USERNAME" \
    --data-urlencode password="$SMOKE_PASSWORD" \
    "$SMOKE_TOKEN_URL" | jq -er '.access_token')"
  curl --silent --show-error --fail --header "Authorization: Bearer ${token}" "${API_URL}/api/me" >/dev/null
  curl --silent --show-error --fail --header "Authorization: Bearer ${token}" "${API_URL}/api/sourcing-requests" >/dev/null
  printf '%-18s %s\n' "Authenticated flow" "passed"
fi
