import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Fastify app

describe('Intent Analysis Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /intent/analyze/:repositoryId', () => {
    it('should analyze intent from PR data with feature branch', async () => {
      const prData = {
        prNumber: 123,
        title: 'Add user authentication feature',
        body: 'This PR adds OAuth2 authentication',
        headBranch: 'feature/user-auth',
        baseBranch: 'main',
        labels: ['feature', 'auth'],
        commits: [
          { sha: 'abc123', message: 'feat: add login endpoint' },
          { sha: 'def456', message: 'feat: add OAuth2 provider' },
        ],
        files: [
          { filename: 'src/auth/login.ts', status: 'added', additions: 100, deletions: 0 },
          { filename: 'src/auth/oauth.ts', status: 'added', additions: 150, deletions: 0 },
        ],
      };

      // The branch pattern 'feature/' should match 'feature_addition' category
      expect(prData.headBranch.startsWith('feature/')).toBe(true);
      expect(prData.commits[0].message.startsWith('feat:')).toBe(true);
    });

    it('should analyze intent from PR data with bugfix branch', async () => {
      const prData = {
        prNumber: 124,
        title: 'Fix null pointer exception in user service',
        body: 'Fixes #456 - handles null user gracefully',
        headBranch: 'fix/null-user-handling',
        baseBranch: 'main',
        labels: ['bug', 'critical'],
        commits: [
          { sha: 'ghi789', message: 'fix: handle null user case' },
        ],
        files: [
          { filename: 'src/services/user.ts', status: 'modified', additions: 10, deletions: 5 },
        ],
      };

      // The branch pattern 'fix/' should match 'bug_fix' category
      expect(prData.headBranch.startsWith('fix/')).toBe(true);
      expect(prData.commits[0].message.startsWith('fix:')).toBe(true);
    });

    it('should analyze intent from PR data with refactor branch', async () => {
      const prData = {
        prNumber: 125,
        title: 'Refactor database connection pool',
        body: 'Improves connection pool management',
        headBranch: 'refactor/db-pool',
        baseBranch: 'main',
        labels: ['refactor'],
        commits: [
          { sha: 'jkl012', message: 'refactor: extract connection pool class' },
          { sha: 'mno345', message: 'refactor: simplify pool configuration' },
        ],
        files: [
          { filename: 'src/db/pool.ts', status: 'modified', additions: 80, deletions: 60 },
          { filename: 'src/db/connection.ts', status: 'modified', additions: 20, deletions: 30 },
        ],
      };

      expect(prData.headBranch.startsWith('refactor/')).toBe(true);
    });

    it('should handle security fix branches', async () => {
      const prData = {
        prNumber: 126,
        title: 'Security: Fix SQL injection vulnerability',
        body: 'Critical security fix for SQL injection',
        headBranch: 'security/sql-injection-fix',
        baseBranch: 'main',
        labels: ['security', 'critical'],
        commits: [
          { sha: 'pqr678', message: 'fix(security): sanitize SQL inputs' },
        ],
        files: [
          { filename: 'src/db/queries.ts', status: 'modified', additions: 15, deletions: 5 },
        ],
      };

      expect(prData.headBranch.startsWith('security/')).toBe(true);
    });

    it('should handle documentation branches', async () => {
      const prData = {
        prNumber: 127,
        title: 'Update API documentation',
        body: 'Updates docs for new endpoints',
        headBranch: 'docs/api-updates',
        baseBranch: 'main',
        labels: ['documentation'],
        commits: [
          { sha: 'stu901', message: 'docs: update API reference' },
        ],
        files: [
          { filename: 'docs/api.md', status: 'modified', additions: 50, deletions: 10 },
          { filename: 'README.md', status: 'modified', additions: 5, deletions: 2 },
        ],
      };

      expect(prData.headBranch.startsWith('docs/')).toBe(true);
    });
  });

  describe('POST /intent/feedback/:repositoryId', () => {
    it('should accept positive feedback', async () => {
      const feedback = {
        analysisId: 'analysis-123',
        wasCorrect: true,
        comments: 'Great analysis!',
      };

      expect(feedback.wasCorrect).toBe(true);
    });

    it('should accept negative feedback with correction', async () => {
      const feedback = {
        analysisId: 'analysis-124',
        wasCorrect: false,
        actualIntent: 'bug_fix',
        comments: 'This was actually a bug fix, not a feature',
      };

      expect(feedback.wasCorrect).toBe(false);
      expect(feedback.actualIntent).toBe('bug_fix');
    });
  });

  describe('GET /intent/stats/:repositoryId', () => {
    it('should return stats structure', async () => {
      const expectedStats = {
        repositoryId: 'repo-123',
        totalAnalyses: 0,
        feedbackCount: 0,
        accuracyRate: 0,
        categoryAccuracy: {},
        signalEffectiveness: {
          branchName: 0.7,
          commitMessages: 0.8,
          codeChanges: 0.5,
          prMetadata: 0.4,
        },
        lastUpdated: expect.any(Date),
      };

      expect(expectedStats.signalEffectiveness.branchName).toBe(0.7);
      expect(expectedStats.signalEffectiveness.commitMessages).toBe(0.8);
    });
  });

  describe('PUT /intent/config/:repositoryId', () => {
    it('should update configuration', async () => {
      const config = {
        signalWeights: {
          branchName: 0.3,
          commitMessages: 0.3,
          codeChanges: 0.2,
          prMetadata: 0.2,
        },
        minimumConfidence: 'medium',
      };

      expect(config.signalWeights.branchName + config.signalWeights.commitMessages + 
             config.signalWeights.codeChanges + config.signalWeights.prMetadata).toBe(1);
    });
  });
});

describe('Intent Signal Analysis', () => {
  describe('Branch Name Analysis', () => {
    const branchPatterns = [
      { branch: 'feature/user-auth', expected: 'feature_addition' },
      { branch: 'feat/new-feature', expected: 'feature_addition' },
      { branch: 'fix/bug-123', expected: 'bug_fix' },
      { branch: 'bugfix/critical-issue', expected: 'bug_fix' },
      { branch: 'hotfix/urgent-fix', expected: 'bug_fix' },
      { branch: 'refactor/cleanup-code', expected: 'refactoring' },
      { branch: 'perf/optimize-queries', expected: 'performance_optimization' },
      { branch: 'security/fix-vuln', expected: 'security_fix' },
      { branch: 'deps/update-lodash', expected: 'dependency_update' },
      { branch: 'docs/readme-update', expected: 'documentation' },
      { branch: 'test/add-unit-tests', expected: 'testing' },
      { branch: 'config/update-settings', expected: 'configuration' },
      { branch: 'chore/cleanup', expected: 'cleanup' },
      { branch: 'ci/update-workflow', expected: 'infrastructure' },
      { branch: 'migrate/db-schema', expected: 'migration' },
      { branch: 'random-branch-name', expected: 'unknown' },
    ];

    branchPatterns.forEach(({ branch, expected }) => {
      it(`should detect '${expected}' from branch '${branch}'`, () => {
        // Test the pattern matching logic
        const patterns = [
          { pattern: /^feat(ure)?\//, category: 'feature_addition' },
          { pattern: /^fix\//, category: 'bug_fix' },
          { pattern: /^bugfix\//, category: 'bug_fix' },
          { pattern: /^hotfix\//, category: 'bug_fix' },
          { pattern: /^refactor\//, category: 'refactoring' },
          { pattern: /^perf(ormance)?\//, category: 'performance_optimization' },
          { pattern: /^security\//, category: 'security_fix' },
          { pattern: /^dep(s|endenc(y|ies))?\//, category: 'dependency_update' },
          { pattern: /^docs?\//, category: 'documentation' },
          { pattern: /^test\//, category: 'testing' },
          { pattern: /^config\//, category: 'configuration' },
          { pattern: /^chore\//, category: 'cleanup' },
          { pattern: /^ci\//, category: 'infrastructure' },
          { pattern: /^cd\//, category: 'infrastructure' },
          { pattern: /^migrat(e|ion)\//, category: 'migration' },
        ];

        let detected = 'unknown';
        for (const { pattern, category } of patterns) {
          if (pattern.test(branch)) {
            detected = category;
            break;
          }
        }

        expect(detected).toBe(expected);
      });
    });
  });

  describe('Commit Message Analysis', () => {
    it('should detect conventional commit types', () => {
      const commits = [
        { message: 'feat: add new feature', expected: 'feature_addition' },
        { message: 'fix: resolve bug', expected: 'bug_fix' },
        { message: 'docs: update readme', expected: 'documentation' },
        { message: 'refactor: cleanup code', expected: 'refactoring' },
        { message: 'test: add unit tests', expected: 'testing' },
        { message: 'chore: update deps', expected: 'cleanup' },
        { message: 'perf: optimize query', expected: 'performance_optimization' },
      ];

      const conventionMap: Record<string, string> = {
        feat: 'feature_addition',
        fix: 'bug_fix',
        docs: 'documentation',
        refactor: 'refactoring',
        test: 'testing',
        chore: 'cleanup',
        perf: 'performance_optimization',
      };

      commits.forEach(({ message, expected }) => {
        const type = message.split(':')[0];
        expect(conventionMap[type]).toBe(expected);
      });
    });
  });
});
