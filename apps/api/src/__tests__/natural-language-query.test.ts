import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NaturalLanguageQueryService } from '../services/natural-language-query.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    reviewComment: {
      findMany: vi.fn(),
    },
    analyticsEvent: {
      create: vi.fn(),
    },
  },
}));

// Mock LLM - disable to use pattern-based parsing only
vi.mock('../agents/base.js', () => ({
  callLLM: vi.fn().mockRejectedValue(new Error('LLM disabled in tests')),
  buildSystemPrompt: vi.fn().mockReturnValue('Test prompt'),
}));

import { db } from '@prflow/db';

describe('NaturalLanguageQueryService', () => {
  let service: NaturalLanguageQueryService;

  beforeEach(() => {
    // Disable LLM for predictable pattern-based tests
    process.env.ENABLE_NL_QUERIES = 'false';
    service = new NaturalLanguageQueryService();
    vi.clearAllMocks();
  });

  describe('parseQuery', () => {
    it('should parse open PRs query', async () => {
      const result = await service.parseQuery('show me all open PRs');

      // originalQuery is lowercased
      expect(result.originalQuery).toBe('show me all open prs');
      // Open maps to multiple workflow statuses
      expect(result.filters.statuses).toContain('PENDING');
      expect(result.filters.statuses).toContain('REVIEWING');
    });

    it('should parse closed/merged PRs query', async () => {
      const result = await service.parseQuery('find closed PRs');

      expect(result.filters.statuses).toContain('COMPLETED');
    });

    it('should parse author filter', async () => {
      const result = await service.parseQuery('PRs by john');

      expect(result.filters.authors).toContain('john');
    });

    it('should parse author with @ prefix', async () => {
      const result = await service.parseQuery('PRs from author @janedoe');

      expect(result.filters.authors).toContain('janedoe');
    });

    it('should parse high risk filter', async () => {
      const result = await service.parseQuery('show high risk PRs');

      expect(result.filters.riskLevels).toContain('HIGH');
    });

    it('should parse critical risk filter', async () => {
      const result = await service.parseQuery('find critical risk pull requests');

      expect(result.filters.riskLevels).toContain('CRITICAL');
    });

    it('should parse date range for last N days', async () => {
      const result = await service.parseQuery('PRs from last 7 days');

      expect(result.filters.dateRange).toBeDefined();
      expect(result.filters.dateRange?.start).toBeDefined();
    });

    it('should parse date range for last week', async () => {
      const result = await service.parseQuery('PRs from last 1 week');

      expect(result.filters.dateRange).toBeDefined();
    });

    it('should parse count aggregation', async () => {
      const result = await service.parseQuery('count all PRs');

      expect(result.aggregation).toBe('count');
    });

    it('should parse group by author aggregation', async () => {
      const result = await service.parseQuery('PRs per author');

      expect(result.aggregation).toBe('group_by_author');
    });

    it('should parse sorting by oldest', async () => {
      const result = await service.parseQuery('oldest PRs');

      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('asc');
    });

    it('should parse sorting by newest/recent', async () => {
      const result = await service.parseQuery('most recent PRs');

      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should parse file pattern filter', async () => {
      const result = await service.parseQuery('PRs touching src/utils.ts');

      expect(result.filters.filePatterns).toContain('src/utils.ts');
    });

    it('should parse multiple filters combined', async () => {
      const result = await service.parseQuery('show high risk open PRs by john');

      // Open maps to multiple workflow statuses
      expect(result.filters.statuses?.length).toBeGreaterThan(0);
      expect(result.filters.riskLevels).toContain('HIGH');
      expect(result.filters.authors).toContain('john');
    });

    it('should calculate confidence score', async () => {
      const result = await service.parseQuery('open PRs');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should detect query type', async () => {
      const result = await service.parseQuery('find open PRs');

      // Open PRs get type 'status_search' due to status filter
      expect(['pr_search', 'status_search']).toContain(result.type);
    });
  });

  describe('executeQuery', () => {
    it('should execute a basic query', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Test PR',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW' },
          reviewComments: [],
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const result = await service.executeQuery('repo-1', 'open PRs');

      expect(result.results).toBeDefined();
      expect(result.totalCount).toBe(1);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply filters from parsed query', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);

      await service.executeQuery('repo-1', 'high risk open PRs');

      expect(db.pRWorkflow.findMany).toHaveBeenCalled();
    });
  });

  describe('getAutocompleteSuggestions', () => {
    it('should provide suggestions for partial queries', () => {
      const suggestions = service.getAutocompleteSuggestions('open');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.text.toLowerCase().includes('open'))).toBe(true);
    });

    it('should suggest risk levels', () => {
      const suggestions = service.getAutocompleteSuggestions('high');

      expect(suggestions.some(s => 
        s.text.toLowerCase().includes('high risk')
      )).toBe(true);
    });

    it('should suggest aggregations', () => {
      const suggestions = service.getAutocompleteSuggestions('count');

      expect(suggestions.some(s => 
        s.text.toLowerCase().includes('count')
      )).toBe(true);
    });
  });
});
