#!/usr/bin/env bash
# PRFlow — Playground Analysis Example
# Analyzes a sample diff for code review issues.
# The API must be running: pnpm dev

SAMPLE_DIFF='diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,15 @@ import { db } from "./db";
+export async function login(req: Request) {
+  const { email, password } = req.body;
+  const user = await db.query(`SELECT * FROM users WHERE email = '"'"'${email}'"'"'`);
+  if (user && password === user.password) {
+    const token = jwt.sign({ id: user.id }, "hardcoded-secret");
+    return { token };
+  }
+  throw new Error("fail");
+}'

echo "Analyzing sample diff..."
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/playground/analyze \
  -H "Content-Type: application/json" \
  -d "{\"diff\": $(echo "$SAMPLE_DIFF" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')}")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "✅ Analysis complete (HTTP $http_code)"
  echo ""
  echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
else
  echo "❌ Request failed (HTTP $http_code)"
  echo "$body"
fi

echo ""
echo "---"
echo "To analyze your own diff, pass it in the request body:"
echo '  curl -X POST http://localhost:3001/api/playground/analyze \'
echo '    -H "Content-Type: application/json" \'
echo '    -d '"'"'{"diff": "your diff here"}'"'"
