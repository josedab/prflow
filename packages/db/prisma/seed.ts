import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding PRFlow database with demo data...\n');

  // Clean existing demo data
  await prisma.pRSynthesis.deleteMany();
  await prisma.docUpdate.deleteMany();
  await prisma.generatedTest.deleteMany();
  await prisma.fixApplication.deleteMany();
  await prisma.reviewComment.deleteMany();
  await prisma.pRAnalysis.deleteMany();
  await prisma.pRWorkflow.deleteMany();
  await prisma.repositorySettings.deleteMany();
  await prisma.testPattern.deleteMany();
  await prisma.repository.deleteMany();
  await prisma.session.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ─── Organization ────────────────────────────────
  const org = await prisma.organization.create({
    data: {
      githubId: 100001,
      login: 'acme-corp',
      name: 'Acme Corporation',
      avatarUrl: 'https://avatars.githubusercontent.com/u/100001',
      installationId: 50001,
    },
  });
  console.log(`  ✔ Organization: ${org.login}`);

  // ─── Team ────────────────────────────────────────
  const team = await prisma.team.create({
    data: {
      name: 'Platform Team',
      organizationId: org.id,
      settings: { reviewStyle: 'thorough', autoAssign: true },
    },
  });

  await prisma.subscription.create({
    data: {
      teamId: team.id,
      tier: 'PRO',
      status: 'ACTIVE',
      prLimit: 500,
      seatLimit: 25,
    },
  });

  // ─── Users ───────────────────────────────────────
  const users = await Promise.all([
    prisma.user.create({
      data: { githubId: 200001, login: 'alice-dev', name: 'Alice Chen', email: 'alice@acme.dev', avatarUrl: 'https://i.pravatar.cc/150?u=alice' },
    }),
    prisma.user.create({
      data: { githubId: 200002, login: 'bob-eng', name: 'Bob Martinez', email: 'bob@acme.dev', avatarUrl: 'https://i.pravatar.cc/150?u=bob' },
    }),
    prisma.user.create({
      data: { githubId: 200003, login: 'carol-ops', name: 'Carol Kim', email: 'carol@acme.dev', avatarUrl: 'https://i.pravatar.cc/150?u=carol' },
    }),
    prisma.user.create({
      data: { githubId: 200004, login: 'dave-sr', name: 'Dave Patel', email: 'dave@acme.dev', avatarUrl: 'https://i.pravatar.cc/150?u=dave' },
    }),
    prisma.user.create({
      data: { githubId: 200005, login: 'eve-ml', name: 'Eve Johnson', email: 'eve@acme.dev', avatarUrl: 'https://i.pravatar.cc/150?u=eve' },
    }),
  ]);
  console.log(`  ✔ Users: ${users.map((u) => u.login).join(', ')}`);

  // Add users to team
  await Promise.all([
    prisma.teamMember.create({ data: { teamId: team.id, userId: users[0].id, role: 'OWNER' } }),
    prisma.teamMember.create({ data: { teamId: team.id, userId: users[1].id, role: 'ADMIN' } }),
    prisma.teamMember.create({ data: { teamId: team.id, userId: users[2].id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { teamId: team.id, userId: users[3].id, role: 'MEMBER' } }),
    prisma.teamMember.create({ data: { teamId: team.id, userId: users[4].id, role: 'MEMBER' } }),
  ]);

  // ─── Repositories ────────────────────────────────
  const repos = await Promise.all([
    prisma.repository.create({
      data: {
        githubId: 300001,
        name: 'web-app',
        fullName: 'acme-corp/web-app',
        owner: 'acme-corp',
        organizationId: org.id,
        defaultBranch: 'main',
        settings: {
          create: {
            reviewEnabled: true,
            testGenerationEnabled: true,
            docUpdatesEnabled: true,
            assignmentEnabled: true,
            severityThreshold: 'MEDIUM',
            autoFixStyle: true,
            blockOnCritical: true,
          },
        },
      },
    }),
    prisma.repository.create({
      data: {
        githubId: 300002,
        name: 'api-service',
        fullName: 'acme-corp/api-service',
        owner: 'acme-corp',
        organizationId: org.id,
        defaultBranch: 'main',
        settings: {
          create: {
            reviewEnabled: true,
            testGenerationEnabled: true,
            docUpdatesEnabled: false,
            severityThreshold: 'HIGH',
            blockOnCritical: true,
          },
        },
      },
    }),
  ]);
  console.log(`  ✔ Repositories: ${repos.map((r) => r.fullName).join(', ')}`);

  // ─── PR Workflows ────────────────────────────────
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

  const workflows = await Promise.all([
    // Completed workflow
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 42,
        prTitle: 'feat: add user authentication with OAuth2',
        prUrl: 'https://github.com/acme-corp/web-app/pull/42',
        headBranch: 'feature/oauth2-auth',
        baseBranch: 'main',
        authorLogin: 'alice-dev',
        status: 'COMPLETED',
        startedAt: hoursAgo(3),
        completedAt: hoursAgo(2),
      },
    }),
    // Another completed
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 43,
        prTitle: 'fix: resolve XSS vulnerability in comment rendering',
        prUrl: 'https://github.com/acme-corp/web-app/pull/43',
        headBranch: 'fix/xss-comments',
        baseBranch: 'main',
        authorLogin: 'bob-eng',
        status: 'COMPLETED',
        startedAt: hoursAgo(5),
        completedAt: hoursAgo(4),
      },
    }),
    // Analyzing
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 44,
        prTitle: 'refactor: extract shared form validation hooks',
        prUrl: 'https://github.com/acme-corp/web-app/pull/44',
        headBranch: 'refactor/form-validation',
        baseBranch: 'main',
        authorLogin: 'carol-ops',
        status: 'ANALYZING',
        startedAt: hoursAgo(0.5),
      },
    }),
    // Pending
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[1].id,
        prNumber: 18,
        prTitle: 'feat: add rate limiting middleware',
        prUrl: 'https://github.com/acme-corp/api-service/pull/18',
        headBranch: 'feature/rate-limit',
        baseBranch: 'main',
        authorLogin: 'dave-sr',
        status: 'PENDING',
      },
    }),
    // Failed
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[1].id,
        prNumber: 17,
        prTitle: 'chore: upgrade dependencies to latest',
        prUrl: 'https://github.com/acme-corp/api-service/pull/17',
        headBranch: 'chore/dep-upgrade',
        baseBranch: 'main',
        authorLogin: 'eve-ml',
        status: 'FAILED',
        startedAt: hoursAgo(8),
        completedAt: hoursAgo(7),
      },
    }),
    // Reviewing
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 45,
        prTitle: 'feat: implement dark mode toggle with persistence',
        prUrl: 'https://github.com/acme-corp/web-app/pull/45',
        headBranch: 'feature/dark-mode',
        baseBranch: 'main',
        authorLogin: 'alice-dev',
        status: 'REVIEWING',
        startedAt: hoursAgo(1),
      },
    }),
    // Completed with high risk
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[1].id,
        prNumber: 19,
        prTitle: 'feat: database migration to add multi-tenancy',
        prUrl: 'https://github.com/acme-corp/api-service/pull/19',
        headBranch: 'feature/multi-tenancy',
        baseBranch: 'main',
        authorLogin: 'dave-sr',
        status: 'COMPLETED',
        startedAt: hoursAgo(12),
        completedAt: hoursAgo(11),
      },
    }),
    // Generating tests
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 46,
        prTitle: 'feat: add search functionality with Fuse.js',
        prUrl: 'https://github.com/acme-corp/web-app/pull/46',
        headBranch: 'feature/search',
        baseBranch: 'main',
        authorLogin: 'bob-eng',
        status: 'GENERATING_TESTS',
        startedAt: hoursAgo(0.25),
      },
    }),
    // Synthesizing
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[1].id,
        prNumber: 20,
        prTitle: 'fix: prevent SQL injection in search endpoint',
        prUrl: 'https://github.com/acme-corp/api-service/pull/20',
        headBranch: 'fix/sql-injection',
        baseBranch: 'main',
        authorLogin: 'carol-ops',
        status: 'SYNTHESIZING',
        startedAt: hoursAgo(0.75),
      },
    }),
    // Another completed
    prisma.pRWorkflow.create({
      data: {
        repositoryId: repos[0].id,
        prNumber: 41,
        prTitle: 'docs: update API reference for v2 endpoints',
        prUrl: 'https://github.com/acme-corp/web-app/pull/41',
        headBranch: 'docs/api-v2',
        baseBranch: 'main',
        authorLogin: 'eve-ml',
        status: 'COMPLETED',
        startedAt: hoursAgo(24),
        completedAt: hoursAgo(23),
      },
    }),
  ]);
  console.log(`  ✔ PR Workflows: ${workflows.length} created`);

  // ─── Analyses for completed workflows ────────────
  await Promise.all([
    prisma.pRAnalysis.create({
      data: {
        workflowId: workflows[0].id,
        prType: 'FEATURE',
        riskLevel: 'MEDIUM',
        filesModified: 12,
        linesAdded: 450,
        linesRemoved: 30,
        semanticChanges: [
          { type: 'new_auth_flow', description: 'Added OAuth2 authentication flow' },
          { type: 'new_middleware', description: 'Auth middleware for protected routes' },
        ],
        impactRadius: { directFiles: 12, dependentFiles: 8, testFiles: 5 },
        risks: ['New authentication system needs security review', 'Token storage mechanism should be audited'],
        suggestedReviewers: [{ login: 'dave-sr', reason: 'Security expertise', score: 0.92 }],
        latencyMs: 2340,
      },
    }),
    prisma.pRAnalysis.create({
      data: {
        workflowId: workflows[1].id,
        prType: 'BUGFIX',
        riskLevel: 'HIGH',
        filesModified: 3,
        linesAdded: 25,
        linesRemoved: 8,
        semanticChanges: [
          { type: 'security_fix', description: 'Sanitize HTML in user comments' },
        ],
        impactRadius: { directFiles: 3, dependentFiles: 15, testFiles: 2 },
        risks: ['XSS vulnerability affects all comment-rendering components'],
        suggestedReviewers: [{ login: 'dave-sr', reason: 'Security review', score: 0.95 }],
        latencyMs: 1120,
      },
    }),
    prisma.pRAnalysis.create({
      data: {
        workflowId: workflows[6].id,
        prType: 'FEATURE',
        riskLevel: 'CRITICAL',
        filesModified: 28,
        linesAdded: 1200,
        linesRemoved: 150,
        semanticChanges: [
          { type: 'schema_change', description: 'Added tenant_id column to all tables' },
          { type: 'migration', description: 'Data migration for existing records' },
        ],
        impactRadius: { directFiles: 28, dependentFiles: 45, testFiles: 20 },
        risks: ['Database migration on production data', 'Breaking change to all queries', 'Requires downtime window'],
        suggestedReviewers: [
          { login: 'dave-sr', reason: 'Database expertise', score: 0.98 },
          { login: 'alice-dev', reason: 'Architecture review', score: 0.85 },
        ],
        latencyMs: 4560,
      },
    }),
    prisma.pRAnalysis.create({
      data: {
        workflowId: workflows[9].id,
        prType: 'DOCS',
        riskLevel: 'LOW',
        filesModified: 5,
        linesAdded: 180,
        linesRemoved: 45,
        semanticChanges: [
          { type: 'doc_update', description: 'Updated API reference documentation' },
        ],
        impactRadius: { directFiles: 5, dependentFiles: 0, testFiles: 0 },
        risks: [],
        suggestedReviewers: [{ login: 'bob-eng', reason: 'API maintainer', score: 0.8 }],
        latencyMs: 890,
      },
    }),
  ]);
  console.log('  ✔ PR Analyses: 4 created');

  // ─── Review Comments ─────────────────────────────
  await Promise.all([
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[0].id,
        file: 'src/auth/oauth2-handler.ts',
        line: 45,
        severity: 'HIGH',
        category: 'SECURITY',
        message: 'Access token is stored in localStorage which is vulnerable to XSS attacks. Consider using httpOnly cookies instead.',
        suggestion: { code: 'res.cookie("access_token", token, { httpOnly: true, secure: true, sameSite: "strict" })' },
        confidence: 0.94,
        status: 'RESOLVED',
      },
    }),
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[0].id,
        file: 'src/auth/oauth2-handler.ts',
        line: 78,
        severity: 'MEDIUM',
        category: 'ERROR_HANDLING',
        message: 'Missing error handling for token refresh failure. User will see a blank page if refresh fails.',
        suggestion: { code: 'try { await refreshToken(); } catch (e) { redirectToLogin(); }' },
        confidence: 0.88,
        status: 'POSTED',
      },
    }),
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[0].id,
        file: 'src/middleware/auth.ts',
        line: 12,
        severity: 'LOW',
        category: 'PERFORMANCE',
        message: 'Token validation runs a database query on every request. Consider caching validated tokens with a short TTL.',
        confidence: 0.72,
        status: 'POSTED',
      },
    }),
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[1].id,
        file: 'src/components/CommentRenderer.tsx',
        line: 23,
        severity: 'CRITICAL',
        category: 'SECURITY',
        message: 'Using dangerouslySetInnerHTML without sanitization. This is the root cause of the XSS vulnerability.',
        suggestion: { code: 'import DOMPurify from "dompurify";\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />' },
        confidence: 0.99,
        status: 'RESOLVED',
      },
    }),
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[6].id,
        file: 'prisma/migrations/add-tenant-id.sql',
        line: 1,
        severity: 'CRITICAL',
        category: 'BUG',
        message: 'Migration does not set a default tenant_id for existing rows. This will cause NOT NULL constraint violations.',
        confidence: 0.97,
        status: 'RESOLVED',
      },
    }),
    prisma.reviewComment.create({
      data: {
        workflowId: workflows[6].id,
        file: 'src/middleware/tenant.ts',
        line: 34,
        severity: 'HIGH',
        category: 'SECURITY',
        message: 'Tenant ID is extracted from request header without validation. Malicious user could access other tenant data.',
        suggestion: { code: 'const tenantId = validateAndResolveTenant(req.headers["x-tenant-id"], req.user);' },
        confidence: 0.96,
        status: 'POSTED',
      },
    }),
  ]);
  console.log('  ✔ Review Comments: 6 created');

  // ─── Generated Tests ─────────────────────────────
  await Promise.all([
    prisma.generatedTest.create({
      data: {
        workflowId: workflows[0].id,
        testFile: 'src/auth/__tests__/oauth2-handler.test.ts',
        targetFile: 'src/auth/oauth2-handler.ts',
        framework: 'vitest',
        testCode: `import { describe, it, expect, vi } from 'vitest';
import { handleOAuth2Callback } from '../oauth2-handler';

describe('OAuth2 Handler', () => {
  it('should exchange code for access token', async () => {
    const result = await handleOAuth2Callback({ code: 'test-code' });
    expect(result.accessToken).toBeDefined();
  });

  it('should reject invalid authorization codes', async () => {
    await expect(handleOAuth2Callback({ code: '' })).rejects.toThrow();
  });
});`,
        coverageTargets: ['handleOAuth2Callback', 'validateState', 'exchangeCode'],
        validated: true,
        passedValidation: true,
        status: 'SUGGESTED',
      },
    }),
    prisma.generatedTest.create({
      data: {
        workflowId: workflows[0].id,
        testFile: 'src/middleware/__tests__/auth.test.ts',
        targetFile: 'src/middleware/auth.ts',
        framework: 'vitest',
        testCode: `import { describe, it, expect } from 'vitest';
import { authMiddleware } from '../auth';

describe('Auth Middleware', () => {
  it('should reject requests without token', async () => {
    const req = { headers: {} };
    await expect(authMiddleware(req)).rejects.toThrow('Unauthorized');
  });
});`,
        coverageTargets: ['authMiddleware', 'validateToken'],
        validated: true,
        passedValidation: true,
        status: 'SUGGESTED',
      },
    }),
  ]);
  console.log('  ✔ Generated Tests: 2 created');

  // ─── Synthesis for completed workflows ───────────
  await Promise.all([
    prisma.pRSynthesis.create({
      data: {
        workflowId: workflows[0].id,
        summary: 'This PR adds OAuth2 authentication with 1 high-severity security finding (token storage) and 2 medium findings. 2 test files were generated covering the auth flow. Recommend addressing the token storage issue before merging.',
        riskAssessment: { overall: 'MEDIUM', security: 'HIGH', complexity: 'MEDIUM', testCoverage: 'GOOD' },
        findingsSummary: { critical: 0, high: 1, medium: 1, low: 1, totalFindings: 3, testsGenerated: 2 },
        humanReviewChecklist: [
          'Verify OAuth2 redirect URI configuration',
          'Review token storage mechanism (httpOnly cookies recommended)',
          'Check CSRF protection on auth endpoints',
          'Validate logout flow clears all tokens',
        ],
      },
    }),
    prisma.pRSynthesis.create({
      data: {
        workflowId: workflows[1].id,
        summary: 'Critical XSS vulnerability fix. The root cause was unsanitized HTML rendering in CommentRenderer. The fix correctly applies DOMPurify. Recommend immediate merge after verification.',
        riskAssessment: { overall: 'HIGH', security: 'CRITICAL', complexity: 'LOW', testCoverage: 'NEEDS_IMPROVEMENT' },
        findingsSummary: { critical: 1, high: 0, medium: 0, low: 0, totalFindings: 1, testsGenerated: 0 },
        humanReviewChecklist: [
          'Verify DOMPurify is configured correctly',
          'Check all other uses of dangerouslySetInnerHTML',
          'Add regression test for XSS payloads',
        ],
      },
    }),
    prisma.pRSynthesis.create({
      data: {
        workflowId: workflows[6].id,
        summary: 'Large multi-tenancy migration with critical data integrity and security concerns. Migration needs default tenant_id for existing rows. Tenant isolation middleware needs validation. Recommend thorough security review and staged rollout.',
        riskAssessment: { overall: 'CRITICAL', security: 'HIGH', complexity: 'CRITICAL', testCoverage: 'INSUFFICIENT' },
        findingsSummary: { critical: 1, high: 1, medium: 0, low: 0, totalFindings: 2, testsGenerated: 0 },
        humanReviewChecklist: [
          'Verify migration handles existing data correctly',
          'Review tenant isolation is enforced at all layers',
          'Plan downtime window for production migration',
          'Test rollback procedure',
        ],
      },
    }),
  ]);
  console.log('  ✔ PR Syntheses: 3 created');

  console.log('\n🎉 Seed complete! Your PRFlow instance has demo data.\n');
  console.log('  Repos:     2 (web-app, api-service)');
  console.log('  Users:     5');
  console.log('  Workflows: 10 (across all states)');
  console.log('  Comments:  6 review findings');
  console.log('  Tests:     2 generated test files');
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
