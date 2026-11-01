#!/usr/bin/env bash
# Manually triggers the follow-ups cron route (grace check + scheduled application sends + the
# follow-up scheduler), for local testing. Reads CRON_SECRET from .env.local -- never prints it.
#
# Usage:
#   ./scripts/trigger-follow-ups.sh                 # hits http://localhost:3000
#   ./scripts/trigger-follow-ups.sh https://your-app.vercel.app   # hits a deployed URL instead
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
    echo "No .env.local found in $(pwd)" >&2
    exit 1
fi

CRON_SECRET=$(grep -E '^CRON_SECRET=' .env.local | head -1 | cut -d '=' -f2- | sed -e 's/^"//' -e 's/"$//')

if [ -z "$CRON_SECRET" ]; then
    echo "CRON_SECRET is not set in .env.local" >&2
    exit 1
fi

URL="${1:-http://localhost:3000}/api/cron/follow-ups"

echo "Triggering: $URL"
echo

HTTP_STATUS=$(curl -sS -o /tmp/follow-ups-response.json -w '%{http_code}' \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "$URL")

echo "HTTP $HTTP_STATUS"
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/tmp/follow-ups-response.json', 'utf8')), null, 2))"
