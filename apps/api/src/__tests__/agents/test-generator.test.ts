import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestGeneratorAgent } from '../../agents/test-generator.js';
import type { AgentContext, PullRequest, PRDiff, PRFile, PRAnalysis, SemanticChange } from '@prflow/core';

// Mock the LLM calls
vi.mock('../../agents/base.js', async () => {
  const actual = await vi.importActual('../../agents/base.js');
  return {
    ...actual,
    callLLM: vi.fn().mockResolvedValue({
      content: `import { describe, it, expect } from 'vitest';
import { testFunc } from './module';

describe('testFunc', () => {
  it('should work', () => {
    expect(testFunc()).toBeDefined();
  });
});`
    })
  };
});

describe('TestGeneratorAgent', () => {
  let agent: TestGeneratorAgent;
  let mockContext: AgentContext;
  let mockPR: PullRequest;
  let mockDiff: PRDiff;
  let mockAnalysis: PRAnalysis;

  beforeEach(() => {
    // Disable LLM for most tests to test template-based generation
    process.env.ENABLE_LLM_TESTS = 'false';
    
    agent = new TestGeneratorAgent();
    
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

    mockAnalysis = {
      prNumber: 123,
      type: 'feature',
      riskLevel: 'medium',
      changes: { filesModified: 1, linesAdded: 50, linesRemoved: 0 },
      semanticChanges: [],
      impactRadius: { directDependents: 0, transitiveDependents: 0, affectedFiles: [], testCoverage: null },
      risks: [],
      suggestedReviewers: [],
      latencyMs: 100,
      analyzedAt: new Date(),
    };
  });

  describe('Framework Detection', () => {
    it('should detect Jest from config file', async () => {
      mockDiff.files = [
        createMockFile('jest.config.js', 'modified', 5, 0),
        createMockFile('src/utils.ts', 'added', 50, 0, createFunctionPatch()),
      ];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'processData', 'src/utils.ts')];

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.frameworkDetected).toBe('jest');
    });

    it('should detect Vitest from config file', async () => {
      mockDiff.files = [
        createMockFile('vitest.config.ts', 'modified', 5, 0),
        createMockFile('src/utils.ts', 'added', 50, 0, createFunctionPatch()),
      ];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'processData', 'src/utils.ts')];

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.frameworkDetected).toBe('vitest');
    });

    it('should detect pytest from Python test files', async () => {
      mockDiff.files = [
        createMockFile('test_existing.py', 'modified', 5, 0),
        createMockFile('src/utils.py', 'added', 50, 0, createPythonFunctionPatch()),
      ];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'process_data', 'src/utils.py')];

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.frameworkDetected).toBe('pytest');
    });

    it('should detect Go test from test files', async () => {
      mockDiff.files = [
        createMockFile('utils_test.go', 'modified', 5, 0),
        createMockFile('utils.go', 'added', 50, 0, createGoFunctionPatch()),
      ];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'ProcessData', 'utils.go')];

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.frameworkDetected).toBe('go_test');
    });
  });

  describe('Test Generation', () => {
    it('should generate tests for new functions', async () => {
      mockDiff.files = [createMockFile('src/utils.ts', 'added', 50, 0, createFunctionPatch())];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'processData', 'src/utils.ts')];
      mockDiff.totalAdditions = 50;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests.length).toBeGreaterThan(0);
      expect(result.data?.tests[0].targetFile).toBe('src/utils.ts');
    });

    it('should generate test file with correct naming convention', async () => {
      mockDiff.files = [createMockFile('src/services/user.ts', 'added', 50, 0, createFunctionPatch())];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'createUser', 'src/services/user.ts')];
      mockDiff.totalAdditions = 50;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests[0].testFile).toContain('.test.ts');
    });

    it('should skip existing test files', async () => {
      mockDiff.files = [
        createMockFile('src/utils.test.ts', 'modified', 20, 5),
        createMockFile('src/__tests__/api.test.ts', 'added', 50, 0),
      ];
      mockAnalysis.semanticChanges = [];
      mockDiff.totalAdditions = 70;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests).toHaveLength(0);
    });

    it('should skip deleted files', async () => {
      mockDiff.files = [createMockFile('src/deprecated.ts', 'removed', 0, 100)];
      mockAnalysis.semanticChanges = [createSemanticChange('deleted_function', 'oldFunc', 'src/deprecated.ts')];

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests).toHaveLength(0);
    });
  });

  describe('Test Content', () => {
    it('should generate tests with proper structure', async () => {
      const patch = `@@ -0,0 +1,10 @@
+export async function fetchUsers(ids: string[]): Promise<User[]> {
+  return Promise.all(ids.map(id => getUser(id)));
+}`;
      
      mockDiff.files = [createMockFile('src/api/users.ts', 'added', 10, 0, patch)];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'fetchUsers', 'src/api/users.ts')];
      mockDiff.totalAdditions = 10;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests.length).toBeGreaterThan(0);
      const testCode = result.data?.tests[0].testCode || '';
      expect(testCode).toContain('describe');
      expect(testCode).toContain('fetchUsers');
    });

    it('should extract coverage targets', async () => {
      const patch = `@@ -0,0 +1,20 @@
+export function add(a: number, b: number): number {
+  return a + b;
+}
+
+export function multiply(a: number, b: number): number {
+  return a * b;
+}`;
      
      mockDiff.files = [createMockFile('src/math.ts', 'added', 20, 0, patch)];
      mockAnalysis.semanticChanges = [
        createSemanticChange('new_function', 'add', 'src/math.ts'),
        createSemanticChange('new_function', 'multiply', 'src/math.ts'),
      ];
      mockDiff.totalAdditions = 20;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.tests[0].coverageTargets).toContain('add');
      expect(result.data?.tests[0].coverageTargets).toContain('multiply');
    });
  });

  describe('Coverage Improvement Estimation', () => {
    it('should estimate coverage improvement', async () => {
      mockDiff.files = [createMockFile('src/utils.ts', 'added', 100, 0, createFunctionPatch())];
      mockAnalysis.semanticChanges = [createSemanticChange('new_function', 'processData', 'src/utils.ts')];
      mockDiff.totalAdditions = 100;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.coverageImprovement).toBeGreaterThan(0);
    });

    it('should return null coverage improvement when no tests generated', async () => {
      mockDiff.files = [createMockFile('README.md', 'modified', 10, 5)];
      mockAnalysis.semanticChanges = [];
      mockDiff.totalAdditions = 10;

      const result = await agent.execute({ pr: mockPR, diff: mockDiff, analysis: mockAnalysis }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.coverageImprovement).toBeNull();
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

function createSemanticChange(
  type: SemanticChange['type'],
  name: string,
  file: string
): SemanticChange {
  return {
    type,
    name,
    file,
    impact: 'medium',
  };
}

function createFunctionPatch(): string {
  return `@@ -0,0 +1,10 @@
+export function processData(input: string): string {
+  return input.trim().toLowerCase();
+}`;
}

function createPythonFunctionPatch(): string {
  return `@@ -0,0 +1,10 @@
+def process_data(input_str):
+    return input_str.strip().lower()`;
}

function createGoFunctionPatch(): string {
  return `@@ -0,0 +1,10 @@
+func ProcessData(input string) string {
+    return strings.TrimSpace(strings.ToLower(input))
+}`;
}
