#!/bin/bash
# =============================================================================
# Test the PlanningPing webhook endpoint locally.
# Run this while your Next.js dev server is running (npm run dev).
#
# Usage:
#   chmod +x tools/test_webhook.sh
#   WEBHOOK_SECRET=your-secret ./tools/test_webhook.sh
#
# Or set WEBHOOK_SECRET in your shell first:
#   export WEBHOOK_SECRET=your-secret-from-env-local
#   ./tools/test_webhook.sh
# =============================================================================

set -e

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:3000/api/webhooks/n8n}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"

if [ -z "$WEBHOOK_SECRET" ]; then
  echo "ERROR: Set WEBHOOK_SECRET before running."
  echo "  export WEBHOOK_SECRET=your-secret && ./tools/test_webhook.sh"
  exit 1
fi

echo "Sending test payload to $WEBHOOK_URL"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
    "council_slug": "westminster",
    "applications": [
      {
        "reference": "26/00001/FUL",
        "address": "1 Parliament Square, Westminster, SW1P 3BD",
        "description": "Erection of single-storey rear extension",
        "status": "Pending Consideration",
        "application_date": "2026-05-28"
      },
      {
        "reference": "26/00002/LBC",
        "address": "10 Downing Street, Westminster, SW1A 2AA",
        "description": "Listed building consent for internal alterations",
        "status": "Approved",
        "application_date": "2026-05-25",
        "decision_date": "2026-06-01"
      }
    ]
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

echo "HTTP Status: $HTTP_CODE"
echo "Response:    $BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "SUCCESS — webhook is working."
elif [ "$HTTP_CODE" = "401" ]; then
  echo "FAILED — wrong or missing WEBHOOK_SECRET."
else
  echo "FAILED — unexpected status code $HTTP_CODE."
fi
