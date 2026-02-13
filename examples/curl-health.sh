#!/usr/bin/env bash
# PRFlow — Health Check Example
# Verifies the API is running and responsive.
# Expected: both checks return HTTP 200.

echo "Checking API health..."
response=$(curl -s -w "\n%{http_code}" http://localhost:3001/api/health)
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "✅ API is healthy (HTTP $http_code)"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
else
  echo "❌ API returned HTTP $http_code — is the server running? Start with: pnpm dev"
  [ -n "$body" ] && echo "$body"
fi

# Expected output:
# {
#   "status": "ok",
#   "timestamp": "2026-02-01T00:00:00.000Z"
# }

echo ""
echo "Checking readiness..."
response=$(curl -s -w "\n%{http_code}" http://localhost:3001/api/health/ready)
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "✅ All services ready (HTTP $http_code)"
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
else
  echo "❌ Readiness check failed (HTTP $http_code) — database or Redis may be down"
  [ -n "$body" ] && echo "$body"
fi

# Expected output:
# {
#   "status": "ready",
#   "database": "connected"
# }
