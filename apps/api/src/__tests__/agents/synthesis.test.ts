import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SynthesisAgent } from '../../agents/synthesis.js';
import type { 
  AgentContext, 
  PullRequest, 
  PRDiff, 
  PRAnalysis, 
  ReviewResult, 
  TestGenerationResult, 
  DocUpdateResult 
} from '@prflow/core';

// Mock the LLM calls
vi.mock('../../agents/base.js', async () => {
  const actual = await vi.importActual('../../agents/base.js');
  return {
    ...actual,
    callLLM: vi.fn().mockResolvedValue({
      content: 'This is a mock LLM summary for the PR.'
    })
  };
});

describe('SynthesisAgent', () => {
  let agent: SynthesisAgent;
  let mockContext: AgentContext;
  let mockPR: PullRequest;
  let mockAnalysis: PRAnalysis;
  let mockReview: ReviewResult;
  let mockTests: TestGenerationResult;
  let mockDocs: DocUpdateResult;

  beforeEach(() => {
    // Disable LLM for tests
    process.env.ENABLE_LLM_SYNTHESIS = 'false';
    
    agent = new SynthesisAgent();
    
    mockContext = {
      pr: {} as PullRequest,
      diff: {} as PRDiff,
      repositoryId: 'test-repo-id',
      installationId: 12345,
    };

    mockPR = {
      number: 123,
      title: 'Add user authentication',
      body: 'This PR implements JWT-based authentication',
      url: 'https://api.github.com/repos/test/test/pulls/123',
      htmlUrl: 'https://github.com/test/test/pull/123',
      state: 'open',
      draft: false,
      head: { ref: 'feature/auth', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
      author: { login: 'testuser' },
      repository: { owner: 'test', name: 'test', fullName: 'test/test' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockAnalysis = {
      prNumber: 123,
      type: 'feature',
      riskLevel: 'medium',
      changes: { filesModified: 5, linesAdded: 200, linesRemoved: 50 },
      semanticChanges: [
        { type: 'new_function', name: 'authenticate', file: 'src/auth.ts', impact: 'high' },
        { type: 'new_api', name: '/api/login', file: 'src/routes/auth.ts', impact: 'high' },
      ],
      impactRadius: { 
        directDependents: 3, 
        transitiveDependents: 10, 
        affectedFiles: ['src/auth.ts', 'src/routes/auth.ts'],
        testCoverage: null 
      },
      risks: ['Authentication changes require security review'],
      suggestedReviewers: [
        { login: 'security-expert', reason: 'Security domain expert', score: 0.9, required: true },
      ],
      latencyMs: 100,
      analyzedAt: new Date(),
    };

    mockReview = {
      comments: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, nitpick: 0 },
      autoFixed: [],
    };

    mockTests = {
      tests: [],
      coverageImprovement: null,
      frameworkDetected: 'jest',
    };

    mockDocs = {
      updates: [],
    };
  });

  describe('Summary Generation', () => {
    it('should generate summary describing PR type', async () => {
      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.summary).toContain('feature');
    });

    it('should mention critical issues in summary', async () => {
      mockReview.summary.critical = 2;
      mockReview.comments = [
        createReviewComment('security', 'critical', 'SQL injection detected'),
        createReviewComment('security', 'critical', 'Hardcoded secret found'),
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.summary.toLowerCase()).toContain('critical');
    });

    it('should describe change size appropriately', async () => {
      // Small change
      mockAnalysis.changes = { filesModified: 1, linesAdded: 10, linesRemoved: 5 };
      
      let result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.data?.summary).toContain('minor');

      // Large change
      mockAnalysis.changes = { filesModified: 20, linesAdded: 800, linesRemoved: 200 };
      
      result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.data?.summary).toContain('large');
    });
  });

  describe('Risk Assessment', () => {
    it('should elevate risk level when critical issues found', async () => {
      mockAnalysis.riskLevel = 'medium';
      mockReview.summary.critical = 1;

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.riskAssessment.level).toBe('critical');
    });

    it('should include risk factors from analysis', async () => {
      mockAnalysis.risks = [
        'Security-sensitive changes',
        'Database migration included',
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.riskAssessment.factors).toContain('Security-sensitive changes');
    });

    it('should suggest mitigations based on risks', async () => {
      mockAnalysis.risks = ['Security-sensitive changes'];
      mockReview.summary.critical = 1;

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.riskAssessment.mitigations.some(
        m => m.toLowerCase().includes('security') || m.toLowerCase().includes('critical')
      )).toBe(true);
    });
  });

  describe('Findings Summary', () => {
    it('should aggregate issues by severity', async () => {
      mockReview.summary = { critical: 1, high: 2, medium: 3, low: 4, nitpick: 5 };

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.findingsSummary.bySeverity.critical).toBe(1);
      expect(result.data?.findingsSummary.bySeverity.high).toBe(2);
      expect(result.data?.findingsSummary.totalIssues).toBe(15);
    });

    it('should aggregate issues by category', async () => {
      mockReview.comments = [
        createReviewComment('security', 'high', 'Security issue 1'),
        createReviewComment('security', 'critical', 'Security issue 2'),
        createReviewComment('performance', 'medium', 'Performance issue'),
        createReviewComment('bug', 'high', 'Bug found'),
      ];
      mockReview.summary = { critical: 1, high: 2, medium: 1, low: 0, nitpick: 0 };

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.findingsSummary.byCategory.security).toBe(2);
      expect(result.data?.findingsSummary.byCategory.performance).toBe(1);
    });

    it('should track auto-fixed issues', async () => {
      mockReview.autoFixed = ['style/formatting.ts', 'lint/unused-import.ts'];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.findingsSummary.autoFixed).toBe(2);
    });
  });

  describe('Human Review Checklist', () => {
    it('should include required items for high-risk PRs', async () => {
      mockAnalysis.riskLevel = 'high';

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.humanReviewChecklist.some(
        item => item.priority === 'required'
      )).toBe(true);
    });

    it('should include API review items for API changes', async () => {
      mockAnalysis.semanticChanges = [
        { type: 'new_api', name: '/api/users', file: 'src/api.ts', impact: 'high' },
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.humanReviewChecklist.some(
        item => item.item.toLowerCase().includes('api')
      )).toBe(true);
    });

    it('should include security review for security issues', async () => {
      mockReview.comments = [
        createReviewComment('security', 'high', 'Potential vulnerability'),
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.humanReviewChecklist.some(
        item => item.item.toLowerCase().includes('security')
      )).toBe(true);
    });

    it('should include database review for schema changes', async () => {
      mockAnalysis.semanticChanges = [
        { type: 'schema_change', name: 'add_users_table', file: 'migrations/001.sql', impact: 'high' },
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.humanReviewChecklist.some(
        item => item.item.toLowerCase().includes('database') || item.item.toLowerCase().includes('migration')
      )).toBe(true);
    });
  });

  describe('Generated Assets', () => {
    it('should compile test assets', async () => {
      mockTests.tests = [
        { testFile: 'src/auth.test.ts', targetFile: 'src/auth.ts', framework: 'jest', testCode: '...', coverageTargets: [], testNames: [] },
        { testFile: 'src/api.test.ts', targetFile: 'src/api.ts', framework: 'jest', testCode: '...', coverageTargets: [], testNames: [] },
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.generatedAssets.filter(a => a.type === 'test')).toHaveLength(2);
    });

    it('should compile doc assets', async () => {
      mockDocs.updates = [
        { docType: 'jsdoc', file: 'src/auth.ts', content: '...', reason: 'Missing docs' },
        { docType: 'readme', file: 'README.md', content: '...', reason: 'New feature' },
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.generatedAssets.filter(a => a.type === 'doc')).toHaveLength(2);
    });

    it('should include changelog entry if present', async () => {
      mockDocs.changelogEntry = '## Added\n- New authentication feature';

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.generatedAssets.some(a => a.type === 'changelog')).toBe(true);
    });
  });

  describe('Confidence Score', () => {
    it('should have high confidence when no issues found', async () => {
      mockReview.comments = [];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should lower confidence for high-risk PRs', async () => {
      mockAnalysis.riskLevel = 'critical';
      mockReview.comments = [
        createReviewComment('security', 'critical', 'Issue', 0.7),
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.confidence).toBeLessThan(0.8);
    });
  });

  describe('Suggested Reviewers', () => {
    it('should pass through suggested reviewers from analysis', async () => {
      mockAnalysis.suggestedReviewers = [
        { login: 'expert1', reason: 'Domain expert', score: 0.9, required: true },
        { login: 'expert2', reason: 'Previous work', score: 0.7, required: false },
      ];

      const result = await agent.execute({
        pr: mockPR,
        analysis: mockAnalysis,
        review: mockReview,
        tests: mockTests,
        docs: mockDocs,
      }, mockContext);

      expect(result.success).toBe(true);
      expect(result.data?.suggestedReviewers).toHaveLength(2);
      expect(result.data?.suggestedReviewers[0].login).toBe('expert1');
    });
  });
});

function createReviewComment(
  category: string,
  severity: string,
  message: string,
  confidence = 0.8
) {
  return {
    id: `${category}-${Date.now()}`,
    file: 'src/test.ts',
    line: 1,
    severity: severity as 'critical' | 'high' | 'medium' | 'low' | 'nitpick',
    category: category as 'security' | 'bug' | 'performance' | 'error_handling' | 'testing' | 'documentation' | 'style' | 'maintainability',
    message,
    confidence,
  };
}
