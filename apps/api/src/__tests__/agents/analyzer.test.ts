import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyzerAgent } from '../../agents/analyzer.js';
import type { AgentContext, PullRequest, PRDiff, PRFile } from '@prflow/core';

// Mock the LLM calls
vi.mock('../../agents/base.js', async () => {
  const actual = await vi.importActual('../../agents/base.js');
  return {
    ...actual,
    callLLM: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        prType: 'feature',
        riskLevel: 'medium',
        risks: ['Test risk'],
        semanticChanges: [
          { type: 'new_function', name: 'testFunc', file: 'test.ts', impact: 'medium' }
        ],
        summary: 'Test summary'
      })
    })
  };
});

describe('AnalyzerAgent', () => {
  let agent: AnalyzerAgent;
  let mockContext: AgentContext;
  let mockPR: PullRequest;
  let mockDiff: PRDiff;

  beforeEach(() => {
    // Disable LLM for most tests to test pattern-based detection
    process.env.ENABLE_LLM_ANALYSIS = 'false';
    
    agent = new AnalyzerAgent();
    
    mockContext = {
      pr: {} as PullRequest,
      diff: {} as PRDiff,
      repositoryId: 'test-repo-id',
      installationId: 12345,
    };

    mockPR = {
      number: 123,
      title: 'Add new feature',
      body: 'This PR adds a new feature',
      url: 'https://api.github.com/repos/test/test/pulls/123',
      htmlUrl: 'https://github.com/test/test/pull/123',
      state: 'open',
      draft: false,
      head: { ref: 'feature/new-feature', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
      author: { login: 'testuser' },
      repository: { owner: 'test', name: 'test', fullName: 'test/test' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockDiff = {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      totalChanges: 0,
    };
  });

  describe('PR Type Detection', () => {
    it('should detect bugfix from branch name', async () => {
      mockPR.head.ref = 'fix/login-bug';
      mockDiff.files = [createMockFile('src/auth.ts', 'modified', 10, 5)];
      mockDiff.totalAdditions = 10;
      mockDiff.totalDeletions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('bugfix');
    });

    it('should detect feature from branch name', async () => {
      mockPR.head.ref = 'feature/new-login';
      mockDiff.files = [createMockFile('src/login.ts', 'added', 100, 0)];
      mockDiff.totalAdditions = 100;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('feature');
    });

    it('should detect docs from branch name', async () => {
      mockPR.head.ref = 'docs/update-readme';
      mockDiff.files = [createMockFile('README.md', 'modified', 20, 5)];
      mockDiff.totalAdditions = 20;
      mockDiff.totalDeletions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('docs');
    });

    it('should detect refactor from branch name', async () => {
      mockPR.head.ref = 'refactor/cleanup-utils';
      mockDiff.files = [createMockFile('src/utils.ts', 'modified', 50, 30)];
      mockDiff.totalAdditions = 50;
      mockDiff.totalDeletions = 30;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('refactor');
    });

    it('should detect deps from branch name', async () => {
      mockPR.head.ref = 'deps/upgrade-lodash';
      mockDiff.files = [createMockFile('package.json', 'modified', 5, 5)];
      mockDiff.totalAdditions = 5;
      mockDiff.totalDeletions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('deps');
    });
  });

  describe('Risk Assessment', () => {
    it('should assess high risk for large PRs', async () => {
      mockPR.head.ref = 'feature/big-change';
      mockDiff.files = Array(25).fill(null).map((_, i) => 
        createMockFile(`src/file${i}.ts`, 'modified', 50, 20)
      );
      mockDiff.totalAdditions = 1250;
      mockDiff.totalDeletions = 500;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(['high', 'critical']).toContain(result.data?.riskLevel);
      expect(result.data?.risks.some(r => r.includes('Large PR') || r.includes('Many files'))).toBe(true);
    });

    it('should assess high risk for security-sensitive files', async () => {
      mockPR.head.ref = 'feature/auth-update';
      mockDiff.files = [
        createMockFile('src/auth/login.ts', 'modified', 30, 10),
        createMockFile('src/security/crypto.ts', 'modified', 20, 5),
      ];
      mockDiff.totalAdditions = 50;
      mockDiff.totalDeletions = 15;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.risks.some(r => r.toLowerCase().includes('security'))).toBe(true);
    });

    it('should assess low risk for small documentation changes', async () => {
      mockPR.head.ref = 'docs/typo-fix';
      mockDiff.files = [createMockFile('README.md', 'modified', 2, 2)];
      mockDiff.totalAdditions = 2;
      mockDiff.totalDeletions = 2;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.riskLevel).toBe('low');
    });
  });

  describe('Semantic Change Detection', () => {
    it('should detect new function additions', async () => {
      mockPR.head.ref = 'feature/new-utils';
      const patch = `@@ -0,0 +1,10 @@
+export function calculateTotal(items: Item[]): number {
+  return items.reduce((sum, item) => sum + item.price, 0);
+}`;
      mockDiff.files = [createMockFile('src/utils.ts', 'added', 10, 0, patch)];
      mockDiff.totalAdditions = 10;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.semanticChanges.some(
        c => c.type === 'new_function' && c.name === 'calculateTotal'
      )).toBe(true);
    });

    it('should detect API changes', async () => {
      mockPR.head.ref = 'feature/new-endpoint';
      mockDiff.files = [createMockFile('src/api/routes/users.ts', 'added', 50, 0)];
      mockDiff.totalAdditions = 50;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.semanticChanges.some(c => c.type === 'new_api')).toBe(true);
    });

    it('should detect dependency changes', async () => {
      mockPR.head.ref = 'deps/add-lodash';
      const patch = `@@ -10,6 +10,7 @@
   "dependencies": {
     "express": "^4.18.0",
+    "lodash": "^4.17.21",
     "typescript": "^5.0.0"
   }`;
      mockDiff.files = [createMockFile('package.json', 'modified', 1, 0, patch)];
      mockDiff.totalAdditions = 1;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.semanticChanges.some(c => c.type === 'dependency_added')).toBe(true);
    });

    it('should detect config changes', async () => {
      mockPR.head.ref = 'chore/update-config';
      mockDiff.files = [createMockFile('config/settings.yaml', 'modified', 5, 3)];
      mockDiff.totalAdditions = 5;
      mockDiff.totalDeletions = 3;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.semanticChanges.some(c => c.type === 'config_change')).toBe(true);
    });
  });

  describe('Impact Radius', () => {
    it('should calculate impact radius based on files changed', async () => {
      mockPR.head.ref = 'feature/multi-file';
      mockDiff.files = [
        createMockFile('src/core/utils.ts', 'modified', 20, 5),
        createMockFile('src/api/handler.ts', 'modified', 15, 3),
        createMockFile('src/services/user.ts', 'modified', 10, 2),
      ];
      mockDiff.totalAdditions = 45;
      mockDiff.totalDeletions = 10;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.impactRadius.affectedFiles).toHaveLength(3);
      expect(result.data?.impactRadius.directDependents).toBeGreaterThan(0);
    });
  });

  describe('Changes Summary', () => {
    it('should correctly summarize change counts', async () => {
      mockPR.head.ref = 'feature/test';
      mockDiff.files = [
        createMockFile('src/a.ts', 'modified', 100, 50),
        createMockFile('src/b.ts', 'added', 75, 0),
        createMockFile('src/c.ts', 'modified', 25, 25),
      ];
      mockDiff.totalAdditions = 200;
      mockDiff.totalDeletions = 75;
      mockDiff.totalChanges = 275;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.changes.filesModified).toBe(3);
      expect(result.data?.changes.linesAdded).toBe(200);
      expect(result.data?.changes.linesRemoved).toBe(75);
    });
  });
});

function createMockFile(
  filename: string,
  status: PRFile['status'],
  additions: number,
  deletions: number,
  patch?: string
): PRFile {
  return {
    filename,
    status,
    additions,
    deletions,
    changes: additions + deletions,
    patch,
  };
}
