#!/usr/bin/env bash
# Manually triggers the inbox-sync cron route, for local testing of IMAP reply detection and
# classification. Reads CRON_SECRET from .env.local -- never prints it.
#
# Usage:
#   ./scripts/trigger-inbox-sync.sh                 # hits http://localhost:3000
#   ./scripts/trigger-inbox-sync.sh https://your-app.vercel.app   # hits a deployed URL instead
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

URL="${1:-http://localhost:3000}/api/cron/inbox-sync"

echo "Triggering: $URL"
echo

HTTP_STATUS=$(curl -sS -o /tmp/inbox-sync-response.json -w '%{http_code}' \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "$URL")

echo "HTTP $HTTP_STATUS"
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('/tmp/inbox-sync-response.json', 'utf8')), null, 2))"
