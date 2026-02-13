import type { FastifyInstance } from 'fastify';
import { logger } from '../lib/logger.js';

const SAMPLE_DIFF = `diff --git a/src/auth/login.ts b/src/auth/login.ts
index 1234567..abcdefg 100644
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -10,6 +10,15 @@ export async function handleLogin(req: Request, res: Response) {
   const { email, password } = req.body;
 
-  const user = await db.query('SELECT * FROM users WHERE email = ' + email);
+  const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
+
+  if (!user) {
+    return res.status(401).json({ error: 'Invalid credentials' });
+  }
+
+  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
+  res.cookie('token', token);
   return res.json({ success: true });
 }`;

interface PlaygroundRequest {
  diff?: string;
  options?: {
    severity_threshold?: string;
    include_suggestions?: boolean;
  };
}

interface ReviewFinding {
  file: string;
  line: number;
  severity: string;
  category: string;
  message: string;
  suggestion?: string;
}

function analyzeDiff(diff: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const lines = diff.split('\n');

  let currentFile = '';
  let currentLine = 0;

  for (const line of lines) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+,?\d* \+(\d+)/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const code = line.slice(1);

      // SQL injection detection
      if (/['"]SELECT.*\+\s*\w/.test(code) || /query\([^,]+\+/.test(code)) {
        findings.push({
          file: currentFile,
          line: currentLine,
          severity: 'CRITICAL',
          category: 'SECURITY',
          message: 'Potential SQL injection: string concatenation in query. Use parameterized queries instead.',
          suggestion: 'Use parameterized queries: db.query(\'SELECT * FROM users WHERE email = $1\', [email])',
        });
      }

      // Hardcoded secrets
      if (/process\.env\.\w*SECRET/.test(code) && !/process\.env\.\w*SECRET\b/.test(code) === false) {
        findings.push({
          file: currentFile,
          line: currentLine,
          severity: 'HIGH',
          category: 'SECURITY',
          message: 'JWT secret loaded directly from env without validation. Ensure SECRET is set and has sufficient entropy.',
        });
      }

      // Missing httpOnly flag on cookies
      if (/res\.cookie\(/.test(code) && !/httpOnly/.test(code)) {
        findings.push({
          file: currentFile,
          line: currentLine,
          severity: 'HIGH',
          category: 'SECURITY',
          message: 'Cookie set without httpOnly flag. Auth tokens in non-httpOnly cookies are vulnerable to XSS theft.',
          suggestion: 'res.cookie(\'token\', token, { httpOnly: true, secure: true, sameSite: \'strict\' })',
        });
      }

      // Missing input validation
      if (/req\.body/.test(code) && !/zod|validate|schema|joi/i.test(code)) {
        findings.push({
          file: currentFile,
          line: currentLine,
          severity: 'MEDIUM',
          category: 'ERROR_HANDLING',
          message: 'Destructuring req.body without input validation. Consider using Zod or similar for request validation.',
        });
      }

      currentLine++;
    } else if (!line.startsWith('-')) {
      currentLine++;
    }
  }

  return findings;
}

export async function playgroundRoutes(app: FastifyInstance) {
  // Only available in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  app.post<{ Body: PlaygroundRequest }>('/analyze', async (request) => {
    const diff = request.body?.diff || SAMPLE_DIFF;
    const startTime = Date.now();

    logger.info({ diffLength: diff.length }, 'Playground: analyzing diff');

    const findings = analyzeDiff(diff);
    const latencyMs = Date.now() - startTime;

    const riskLevel = findings.some((f) => f.severity === 'CRITICAL')
      ? 'CRITICAL'
      : findings.some((f) => f.severity === 'HIGH')
        ? 'HIGH'
        : findings.some((f) => f.severity === 'MEDIUM')
          ? 'MEDIUM'
          : 'LOW';

    return {
      summary: {
        riskLevel,
        findingsCount: findings.length,
        categories: [...new Set(findings.map((f) => f.category))],
        latencyMs,
      },
      findings,
      metadata: {
        note: 'This is a lightweight local analysis. Full analysis with AI agents requires GitHub App configuration.',
        docsUrl: '/api/docs',
      },
    };
  });

  app.get('/sample-diff', async () => {
    return {
      diff: SAMPLE_DIFF,
      description: 'Sample diff with intentional security issues (SQL injection, missing httpOnly cookie, no input validation)',
      usage: 'POST this diff to /api/playground/analyze to see the analysis results',
    };
  });
}
