import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM, buildSystemPrompt, type LLMMessage } from '../agents/base.js';

/**
 * Supported query types
 */
export type QueryType =
  | 'pr_search'
  | 'file_search'
  | 'author_search'
  | 'status_search'
  | 'risk_search'
  | 'date_search'
  | 'review_search'
  | 'aggregate'
  | 'comparison'
  | 'unknown';

/**
 * Parsed query structure
 */
export interface ParsedQuery {
  originalQuery: string;
  type: QueryType;
  intent: string;
  filters: QueryFilters;
  aggregation?: AggregationType;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  confidence: number;
}

export interface QueryFilters {
  prNumbers?: number[];
  authors?: string[];
  statuses?: string[];
  riskLevels?: string[];
  files?: string[];
  filePatterns?: string[];
  branches?: string[];
  labels?: string[];
  categories?: string[];
  severities?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  hasReviews?: boolean;
  hasTests?: boolean;
  hasConflicts?: boolean;
  keywords?: string[];
}

export type AggregationType =
  | 'count'
  | 'avg_merge_time'
  | 'avg_review_time'
  | 'sum_changes'
  | 'group_by_author'
  | 'group_by_status'
  | 'group_by_risk';

/**
 * Query result
 */
export interface QueryResult {
  query: ParsedQuery;
  results: PRQueryResult[];
  aggregation?: AggregationResult;
  totalCount: number;
  executionTimeMs: number;
  suggestions?: string[];
}

export interface PRQueryResult {
  workflowId: string;
  prNumber: number;
  title: string;
  author: string;
  status: string;
  riskLevel: string;
  createdAt: Date;
  relevanceScore: number;
  matchedFilters: string[];
}

export interface AggregationResult {
  type: AggregationType;
  value: number | Record<string, number>;
  details?: string;
}

/**
 * Query suggestion for autocomplete
 */
export interface QuerySuggestion {
  text: string;
  description: string;
  type: QueryType;
}

export class NaturalLanguageQueryService {
  private useLLM = process.env.ENABLE_NL_QUERIES !== 'false';

  /**
   * Parse a natural language query into structured format
   */
  async parseQuery(query: string): Promise<ParsedQuery> {
    const normalizedQuery = query.trim().toLowerCase();

    // Try pattern-based parsing first (faster)
    const patternResult = this.parseWithPatterns(normalizedQuery);
    if (patternResult.confidence > 0.7) {
      return patternResult;
    }

    // Fall back to LLM parsing for complex queries
    if (this.useLLM) {
      try {
        return await this.parseWithLLM(query);
      } catch (error) {
        logger.warn({ error, query }, 'LLM query parsing failed, using pattern result');
      }
    }

    return patternResult;
  }

  /**
   * Execute a natural language query against the repository
   */
  async executeQuery(repositoryId: string, query: string): Promise<QueryResult> {
    const startTime = Date.now();

    const parsedQuery = await this.parseQuery(query);
    logger.info({ repositoryId, parsedQuery }, 'Executing natural language query');

    // Build database query from parsed query
    const where = this.buildWhereClause(repositoryId, parsedQuery.filters);

    // Execute query
    const workflows = await db.pRWorkflow.findMany({
      where,
      include: {
        analysis: true,
        reviewComments: {
          select: { id: true, severity: true, category: true },
        },
      },
      orderBy: parsedQuery.sortBy
        ? { [parsedQuery.sortBy]: parsedQuery.sortOrder || 'desc' }
        : { createdAt: 'desc' },
      take: parsedQuery.limit || 50,
    });

    // Calculate relevance scores
    const results: PRQueryResult[] = workflows.map((w) => ({
      workflowId: w.id,
      prNumber: w.prNumber,
      title: w.prTitle,
      author: w.authorLogin,
      status: w.status,
      riskLevel: w.analysis?.riskLevel || 'MEDIUM',
      createdAt: w.createdAt,
      relevanceScore: this.calculateRelevanceScore(w, parsedQuery),
      matchedFilters: this.getMatchedFilters(w, parsedQuery.filters),
    }));

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate aggregation if requested
    let aggregation: AggregationResult | undefined;
    if (parsedQuery.aggregation) {
      aggregation = await this.calculateAggregation(repositoryId, parsedQuery);
    }

    // Generate suggestions for refinement
    const suggestions = this.generateSuggestions(parsedQuery, results.length);

    const executionTimeMs = Date.now() - startTime;

    return {
      query: parsedQuery,
      results,
      aggregation,
      totalCount: results.length,
      executionTimeMs,
      suggestions,
    };
  }

  /**
   * Get autocomplete suggestions for a partial query
   */
  getAutocompleteSuggestions(partialQuery: string): QuerySuggestion[] {
    const suggestions: QuerySuggestion[] = [];
    const lower = partialQuery.toLowerCase();

    // Common query patterns
    const patterns = [
      { text: 'Find PRs by ', description: 'Search by author', type: 'author_search' as QueryType },
      { text: 'Show all open PRs', description: 'List open PRs', type: 'status_search' as QueryType },
      { text: 'Find high risk PRs', description: 'Filter by risk level', type: 'risk_search' as QueryType },
      { text: 'PRs touching ', description: 'Search by file', type: 'file_search' as QueryType },
      { text: 'PRs from last week', description: 'Date-based search', type: 'date_search' as QueryType },
      { text: 'PRs with security issues', description: 'Category filter', type: 'review_search' as QueryType },
      { text: 'Average merge time', description: 'Aggregation query', type: 'aggregate' as QueryType },
      { text: 'Compare PRs by ', description: 'Comparison query', type: 'comparison' as QueryType },
    ];

    for (const pattern of patterns) {
      if (pattern.text.toLowerCase().includes(lower) || lower.includes(pattern.text.toLowerCase().slice(0, 5))) {
        suggestions.push(pattern);
      }
    }

    // Add context-specific suggestions based on partial query
    if (lower.includes('find') || lower.includes('show') || lower.includes('list')) {
      suggestions.push(
        { text: `${partialQuery} with critical issues`, description: 'Add severity filter', type: 'review_search' },
        { text: `${partialQuery} needing review`, description: 'Add review status', type: 'status_search' },
        { text: `${partialQuery} by @username`, description: 'Add author filter', type: 'author_search' }
      );
    }

    if (lower.includes('how many') || lower.includes('count')) {
      suggestions.push(
        { text: `${partialQuery} per author`, description: 'Group by author', type: 'aggregate' },
        { text: `${partialQuery} this month`, description: 'Add date filter', type: 'aggregate' }
      );
    }

    return suggestions.slice(0, 8);
  }

  /**
   * Get example queries for the repository
   */
  getExampleQueries(): Array<{ query: string; description: string }> {
    return [
      { query: 'Find all high risk PRs', description: 'Filter by risk level' },
      { query: 'PRs by @john that touch auth files', description: 'Combined author and file filter' },
      { query: 'Show open PRs older than 7 days', description: 'Stale PR detection' },
      { query: 'PRs with security vulnerabilities', description: 'Security-focused search' },
      { query: 'How many PRs merged this week', description: 'Aggregation query' },
      { query: 'Compare merge times by author', description: 'Author performance comparison' },
      { query: 'Find PRs without tests', description: 'Quality check' },
      { query: 'PRs blocking others', description: 'Dependency analysis' },
    ];
  }

  // ============================================
  // Private Methods
  // ============================================

  private parseWithPatterns(query: string): ParsedQuery {
    const filters: QueryFilters = {};
    let type: QueryType = 'pr_search';
    let aggregation: AggregationType | undefined;
    let sortBy: string | undefined;
    let sortOrder: 'asc' | 'desc' | undefined;
    let confidence = 0.5;

    // Author patterns
    const authorMatch = query.match(/by\s+@?(\w+)|author[:\s]+@?(\w+)/i);
    if (authorMatch) {
      filters.authors = [authorMatch[1] || authorMatch[2]];
      type = 'author_search';
      confidence += 0.2;
    }

    // Status patterns
    if (/\bopen\b/i.test(query)) {
      filters.statuses = ['PENDING', 'ANALYZING', 'REVIEWING', 'GENERATING_TESTS', 'SYNTHESIZING'];
      type = 'status_search';
      confidence += 0.15;
    }
    if (/\bmerged\b|\bclosed\b/i.test(query)) {
      filters.statuses = ['COMPLETED'];
      type = 'status_search';
      confidence += 0.15;
    }

    // Risk patterns
    const riskMatch = query.match(/\b(low|medium|high|critical)\s*(risk)?/i);
    if (riskMatch) {
      filters.riskLevels = [riskMatch[1].toUpperCase()];
      type = 'risk_search';
      confidence += 0.2;
    }

    // File patterns
    const fileMatch = query.match(/touch(?:ing|es)?\s+(\S+)|file[s]?[:\s]+(\S+)|in\s+(\S+\.[\w]+)/i);
    if (fileMatch) {
      const pattern = fileMatch[1] || fileMatch[2] || fileMatch[3];
      filters.filePatterns = [pattern];
      type = 'file_search';
      confidence += 0.2;
    }

    // Date patterns
    const dateMatch = query.match(/(?:last|past)\s+(\d+)\s*(day|week|month)s?/i);
    if (dateMatch) {
      const amount = parseInt(dateMatch[1]);
      const unit = dateMatch[2].toLowerCase();
      const now = new Date();
      const start = new Date();

      if (unit === 'day') {
        start.setDate(now.getDate() - amount);
      } else if (unit === 'week') {
        start.setDate(now.getDate() - amount * 7);
      } else if (unit === 'month') {
        start.setMonth(now.getMonth() - amount);
      }

      filters.dateRange = { start };
      type = 'date_search';
      confidence += 0.2;
    }

    // Category patterns
    const categoryPatterns: Record<string, string[]> = {
      security: ['SECURITY'],
      bug: ['BUG'],
      performance: ['PERFORMANCE'],
      style: ['STYLE'],
      error: ['ERROR_HANDLING'],
    };

    for (const [keyword, categories] of Object.entries(categoryPatterns)) {
      if (query.includes(keyword)) {
        filters.categories = categories;
        type = 'review_search';
        confidence += 0.15;
      }
    }

    // Severity patterns
    if (/\bcritical\b/i.test(query) && !riskMatch) {
      filters.severities = ['CRITICAL'];
      type = 'review_search';
      confidence += 0.15;
    }

    // Aggregation patterns
    if (/how many|count|total/i.test(query)) {
      aggregation = 'count';
      type = 'aggregate';
      confidence += 0.2;
    }
    if (/average|avg|mean/i.test(query)) {
      if (/merge/i.test(query)) {
        aggregation = 'avg_merge_time';
      } else if (/review/i.test(query)) {
        aggregation = 'avg_review_time';
      }
      type = 'aggregate';
      confidence += 0.2;
    }
    if (/group\s*by|per\s+author/i.test(query)) {
      aggregation = 'group_by_author';
      type = 'aggregate';
      confidence += 0.2;
    }

    // Sort patterns
    if (/oldest|old first/i.test(query)) {
      sortBy = 'createdAt';
      sortOrder = 'asc';
    } else if (/newest|recent|latest/i.test(query)) {
      sortBy = 'createdAt';
      sortOrder = 'desc';
    }

    // Keyword extraction
    const keywords = query
      .replace(/\b(find|show|list|get|search|prs?|pull requests?|by|with|from|to|the|all|that|which)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (keywords.length > 0) {
      filters.keywords = keywords;
    }

    return {
      originalQuery: query,
      type,
      intent: this.inferIntent(type, filters),
      filters,
      aggregation,
      sortBy,
      sortOrder,
      confidence: Math.min(confidence, 0.95),
    };
  }

  private async parseWithLLM(query: string): Promise<ParsedQuery> {
    const systemPrompt = buildSystemPrompt('query parser', `
You are a query parser for a PR management system.
Parse natural language queries into structured filters.
`);

    const userPrompt = `Parse this query into structured format:
"${query}"

Return JSON with:
{
  "type": "pr_search" | "file_search" | "author_search" | "status_search" | "risk_search" | "date_search" | "review_search" | "aggregate",
  "intent": "brief description of what user wants",
  "filters": {
    "authors": ["username"],
    "statuses": ["PENDING", "COMPLETED", etc],
    "riskLevels": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    "filePatterns": ["pattern"],
    "categories": ["SECURITY", "BUG", etc],
    "severities": ["CRITICAL", "HIGH", etc],
    "dateRange": { "start": "ISO date", "end": "ISO date" },
    "keywords": ["keyword"]
  },
  "aggregation": "count" | "avg_merge_time" | "group_by_author" | null,
  "sortBy": "createdAt" | "prNumber" | null,
  "sortOrder": "asc" | "desc"
}

Return ONLY valid JSON.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, { temperature: 0.1, maxTokens: 1000 });

    try {
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      const parsed = JSON.parse(jsonStr);

      return {
        originalQuery: query,
        type: parsed.type || 'pr_search',
        intent: parsed.intent || 'Search PRs',
        filters: {
          authors: parsed.filters?.authors,
          statuses: parsed.filters?.statuses,
          riskLevels: parsed.filters?.riskLevels,
          filePatterns: parsed.filters?.filePatterns,
          categories: parsed.filters?.categories,
          severities: parsed.filters?.severities,
          dateRange: parsed.filters?.dateRange
            ? {
                start: parsed.filters.dateRange.start ? new Date(parsed.filters.dateRange.start) : undefined,
                end: parsed.filters.dateRange.end ? new Date(parsed.filters.dateRange.end) : undefined,
              }
            : undefined,
          keywords: parsed.filters?.keywords,
        },
        aggregation: parsed.aggregation,
        sortBy: parsed.sortBy,
        sortOrder: parsed.sortOrder,
        confidence: 0.85,
      };
    } catch (error) {
      logger.error({ error, response: response.content }, 'Failed to parse LLM query response');
      throw error;
    }
  }

  private buildWhereClause(repositoryId: string, filters: QueryFilters): Record<string, unknown> {
    const where: Record<string, unknown> = { repositoryId };

    if (filters.authors && filters.authors.length > 0) {
      where.authorLogin = { in: filters.authors };
    }

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }

    if (filters.dateRange) {
      where.createdAt = {};
      if (filters.dateRange.start) {
        (where.createdAt as Record<string, unknown>).gte = filters.dateRange.start;
      }
      if (filters.dateRange.end) {
        (where.createdAt as Record<string, unknown>).lte = filters.dateRange.end;
      }
    }

    if (filters.riskLevels && filters.riskLevels.length > 0) {
      where.analysis = {
        riskLevel: { in: filters.riskLevels },
      };
    }

    if (filters.keywords && filters.keywords.length > 0) {
      where.OR = filters.keywords.map((kw) => ({
        OR: [
          { prTitle: { contains: kw, mode: 'insensitive' } },
          { headBranch: { contains: kw, mode: 'insensitive' } },
        ],
      }));
    }

    return where;
  }

  private calculateRelevanceScore(workflow: unknown, query: ParsedQuery): number {
    const w = workflow as {
      prTitle: string;
      authorLogin: string;
      status: string;
      analysis?: { riskLevel?: string };
    };

    let score = 0.5; // Base score

    // Author match
    if (query.filters.authors?.includes(w.authorLogin)) {
      score += 0.3;
    }

    // Status match
    if (query.filters.statuses?.includes(w.status)) {
      score += 0.2;
    }

    // Risk level match
    if (query.filters.riskLevels?.includes(w.analysis?.riskLevel || 'MEDIUM')) {
      score += 0.2;
    }

    // Keyword match in title
    for (const kw of query.filters.keywords || []) {
      if (w.prTitle.toLowerCase().includes(kw.toLowerCase())) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  private getMatchedFilters(workflow: unknown, filters: QueryFilters): string[] {
    const w = workflow as {
      authorLogin: string;
      status: string;
      analysis?: { riskLevel?: string };
    };

    const matched: string[] = [];

    if (filters.authors?.includes(w.authorLogin)) {
      matched.push(`author:${w.authorLogin}`);
    }

    if (filters.statuses?.includes(w.status)) {
      matched.push(`status:${w.status}`);
    }

    if (filters.riskLevels?.includes(w.analysis?.riskLevel || 'MEDIUM')) {
      matched.push(`risk:${w.analysis?.riskLevel}`);
    }

    return matched;
  }

  private async calculateAggregation(repositoryId: string, query: ParsedQuery): Promise<AggregationResult> {
    switch (query.aggregation) {
      case 'count': {
        const where = this.buildWhereClause(repositoryId, query.filters);
        const count = await db.pRWorkflow.count({ where });
        return { type: 'count', value: count, details: `${count} PRs match the criteria` };
      }

      case 'group_by_author': {
        const workflows = await db.pRWorkflow.findMany({
          where: this.buildWhereClause(repositoryId, query.filters),
          select: { authorLogin: true },
        });
        const counts: Record<string, number> = {};
        for (const w of workflows) {
          counts[w.authorLogin] = (counts[w.authorLogin] || 0) + 1;
        }
        return { type: 'group_by_author', value: counts };
      }

      case 'group_by_status': {
        const workflows = await db.pRWorkflow.findMany({
          where: { repositoryId },
          select: { status: true },
        });
        const counts: Record<string, number> = {};
        for (const w of workflows) {
          counts[w.status] = (counts[w.status] || 0) + 1;
        }
        return { type: 'group_by_status', value: counts };
      }

      default:
        return { type: query.aggregation || 'count', value: 0 };
    }
  }

  private generateSuggestions(query: ParsedQuery, resultCount: number): string[] {
    const suggestions: string[] = [];

    if (resultCount === 0) {
      suggestions.push('Try broadening your search criteria');
      if (query.filters.dateRange) {
        suggestions.push('Try expanding the date range');
      }
      if (query.filters.authors) {
        suggestions.push('Check if the author username is correct');
      }
    }

    if (resultCount > 20) {
      suggestions.push('Add more filters to narrow results');
      if (!query.filters.riskLevels) {
        suggestions.push('Try filtering by risk level');
      }
      if (!query.filters.statuses) {
        suggestions.push('Try filtering by status');
      }
    }

    if (query.confidence < 0.6) {
      suggestions.push('Try using more specific terms');
      suggestions.push('Use keywords like "by @author", "high risk", "touching filename"');
    }

    return suggestions;
  }

  private inferIntent(type: QueryType, filters: QueryFilters): string {
    const parts: string[] = ['Find PRs'];

    if (filters.authors?.length) {
      parts.push(`by ${filters.authors.join(', ')}`);
    }
    if (filters.statuses?.length) {
      parts.push(`with status ${filters.statuses.join('/')}`);
    }
    if (filters.riskLevels?.length) {
      parts.push(`with ${filters.riskLevels.join('/')} risk`);
    }
    if (filters.filePatterns?.length) {
      parts.push(`touching ${filters.filePatterns.join(', ')}`);
    }
    if (filters.dateRange?.start) {
      parts.push(`since ${filters.dateRange.start.toLocaleDateString()}`);
    }

    return parts.length > 1 ? parts.join(' ') : 'Search all PRs';
  }
}

export const naturalLanguageQueryService = new NaturalLanguageQueryService();
