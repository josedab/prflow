import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewerAgent } from '../../agents/reviewer.js';
import type { AgentContext, PullRequest, PRDiff, PRFile, PRAnalysis } from '@prflow/core';

// Mock the LLM calls
vi.mock('../../agents/base.js', async () => {
  const actual = await vi.importActual('../../agents/base.js');
  return {
    ...actual,
    callLLM: vi.fn().mockResolvedValue({
      content: '[]' // Return empty array for LLM issues
    })
  };
});

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;
  let mockContext: AgentContext;
  let mockPR: PullRequest;
  let mockDiff: PRDiff;
  let mockAnalysis: PRAnalysis;

  beforeEach(() => {
    // Disable LLM for tests to focus on pattern-based detection
    process.env.ENABLE_LLM_REVIEW = 'false';
    
    agent = new ReviewerAgent();
    
    mockContext = {
      pr: {} as PullRequest,
      diff: {} as PRDiff,
      repositoryId: 'test-repo-id',
      installationId: 12345,
    };

    mockPR = {
      number: 123,
      title: 'Test PR',
      body: 'Test description',
      url: 'https://api.github.com/repos/test/test/pulls/123',
      htmlUrl: 'https://github.com/test/test/pull/123',
      state: 'open',
      draft: false,
      head: { ref: 'feature/test', sha: 'abc123' },
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

    mockAnalysis = {
      prNumber: 123,
      type: 'feature',
      riskLevel: 'medium',
      changes: { filesModified: 1, linesAdded: 10, linesRemoved: 5 },
      semanticChanges: [],
      impactRadius: { directDependents: 0, transitiveDependents: 0, affectedFiles: [], testCoverage: null },
      risks: [],
      suggestedReviewers: [],
      latencyMs: 100,
      analyzedAt: new Date(),
    };
  });

  describe('Security Issue Detection', () => {
    it('should detect SQL injection vulnerabilities', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const query = \`SELECT * FROM users WHERE id = \${userId}\`;
+await db.query(query);`;
      
      mockDiff.files = [createMockFile('src/db/users.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'security' && c.message.toLowerCase().includes('sql injection')
      )).toBe(true);
    });

    it('should detect hardcoded secrets', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const apiKey = "sk-1234567890abcdef";
+const password = "super_secret_password";`;
      
      mockDiff.files = [createMockFile('src/config.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'security' && c.message.toLowerCase().includes('hardcoded')
      )).toBe(true);
    });

    it('should detect eval usage', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const result = eval(userInput);`;
      
      mockDiff.files = [createMockFile('src/processor.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'security' && c.message.toLowerCase().includes('eval')
      )).toBe(true);
    });

    it('should detect innerHTML without sanitization', async () => {
      const patch = `@@ -1,5 +1,10 @@
+element.innerHTML = userContent;`;
      
      mockDiff.files = [createMockFile('src/ui/renderer.tsx', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'security' && c.message.toLowerCase().includes('innerhtml')
      )).toBe(true);
    });

    it('should detect disabled SSL verification', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const options = { rejectUnauthorized: false };`;
      
      mockDiff.files = [createMockFile('src/api/client.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'security' && c.message.toLowerCase().includes('ssl')
      )).toBe(true);
    });
  });

  describe('Bug Detection', () => {
    it('should detect floating point comparison', async () => {
      const patch = `@@ -1,5 +1,10 @@
+if (value === 0.1 + 0.2) {`;
      
      mockDiff.files = [createMockFile('src/math.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'bug' && c.message.toLowerCase().includes('floating')
      )).toBe(true);
    });

    it('should detect array index arithmetic', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const prev = items[i - 1];
+const next = items[i + 1];`;
      
      mockDiff.files = [createMockFile('src/list.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'bug' && c.message.toLowerCase().includes('index')
      )).toBe(true);
    });
  });

  describe('Error Handling Detection', () => {
    it('should detect empty catch blocks', async () => {
      const patch = `@@ -1,5 +1,10 @@
+try { doSomething(); } catch (e) { }`;
      
      mockDiff.files = [createMockFile('src/service.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'error_handling' && c.message.toLowerCase().includes('empty catch')
      )).toBe(true);
    });

    it('should detect promise without catch', async () => {
      const patch = `@@ -1,5 +1,10 @@
+fetchData().then(data => process(data));`;
      
      mockDiff.files = [createMockFile('src/api.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'error_handling' && c.message.toLowerCase().includes('promise')
      )).toBe(true);
    });
  });

  describe('Performance Detection', () => {
    it('should detect synchronous file operations', async () => {
      const patch = `@@ -1,5 +1,10 @@
+const data = fs.readFileSync('file.txt');`;
      
      mockDiff.files = [createMockFile('src/files.ts', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments.some(
        c => c.category === 'performance' && c.message.toLowerCase().includes('sync')
      )).toBe(true);
    });
  });

  describe('Summary Statistics', () => {
    it('should correctly count issues by severity', async () => {
      const patch = `@@ -1,10 +1,20 @@
+const apiKey = "sk-secret-key";
+const query = \`SELECT * FROM users WHERE id = \${id}\`;
+eval(userInput);`;
      
      mockDiff.files = [createMockFile('src/vulnerable.ts', 'modified', 10, 0, patch)];
      mockDiff.totalAdditions = 10;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.summary.critical).toBeGreaterThan(0);
    });
  });

  describe('Non-Code Files', () => {
    it('should skip non-code files', async () => {
      const patch = `@@ -1,5 +1,10 @@
+This is documentation with eval() and SQL injection patterns`;
      
      mockDiff.files = [createMockFile('README.md', 'modified', 5, 0, patch)];
      mockDiff.totalAdditions = 5;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.comments).toHaveLength(0);
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
