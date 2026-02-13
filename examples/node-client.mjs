#!/usr/bin/env node
// PRFlow — Node.js Client Example
// Demonstrates calling the PRFlow API from Node.js (no dependencies needed).
// Usage: node examples/node-client.mjs
// Requires: API running at http://localhost:3001 (pnpm dev)

const API_URL = process.env.PRFLOW_API_URL || "http://localhost:3001";

const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,15 @@
+export async function login(req) {
+  const { email, password } = req.body;
+  const user = await db.query(\`SELECT * FROM users WHERE email = '\${email}'\`);
+  if (user && password === user.password) {
+    const token = jwt.sign({ id: user.id }, "hardcoded-secret");
+    return { token };
+  }
+  throw new Error("fail");
+}`;

async function main() {
  // 1. Health check
  console.log("1️⃣  Checking API health...");
  const health = await fetch(`${API_URL}/api/health`);
  if (!health.ok) {
    console.error(`❌ API is not running at ${API_URL}. Start with: pnpm dev`);
    process.exit(1);
  }
  console.log("   ✅ API is healthy\n");

  // 2. Analyze a diff
  console.log("2️⃣  Analyzing sample diff...");
  const res = await fetch(`${API_URL}/api/playground/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diff: sampleDiff }),
  });

  const result = await res.json();
  console.log(`   Status: ${res.status}`);
  console.log("   Response:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
