import {
  NLQueryInput,
  NLQueryResult,
  NLQueryRequest,
  NLQueryResponse,
  QueryAnalysis,
  QueryIntent,
  QueryAnswer,
  FollowUpSuggestion,
  QUERY_TEMPLATES,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

const AGENT_TYPE = 'nl-query';
const AGENT_DESCRIPTION = 'Answers natural language questions about pull requests';

const INTENT_KEYWORDS: Record<QueryIntent, string[]> = {
  file_changes: ['file', 'changed', 'modified', 'added', 'deleted', 'renamed', 'diff'],
  commit_history: ['commit', 'history', 'log', 'sha', 'message'],
  review_status: ['review', 'approved', 'reviewer', 'feedback', 'comments'],
  test_status: ['test', 'ci', 'build', 'passing', 'failing', 'check'],
  code_explanation: ['explain', 'what does', 'how does', 'why', 'purpose'],
  impact_analysis: ['impact', 'affect', 'risk', 'break', 'dependency'],
  comparison: ['compare', 'difference', 'versus', 'vs', 'between'],
  statistics: ['count', 'how many', 'number', 'lines', 'statistics'],
  timeline: ['when', 'timeline', 'history', 'activity'],
  contributor_activity: ['who', 'contributor', 'author', 'assigned'],
  risk_assessment: ['risk', 'security', 'vulnerability', 'danger'],
  merge_readiness: ['merge', 'ready', 'blocking', 'checklist'],
  general: [],
};

export class NLQueryAgent extends BaseAgent<NLQueryInput, NLQueryResult> {
  readonly name = AGENT_TYPE;
  readonly description = AGENT_DESCRIPTION;

  async execute(input: NLQueryInput, _context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: NLQueryResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result || !result.success) {
      return this.createErrorResult(result?.error || 'Operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: NLQueryInput): Promise<NLQueryResult> {
    switch (input.operation) {
      case 'query':
        return this.executeQuery(input);
      case 'analyze':
        return this.analyzeQuery(input);
      case 'list_templates':
        return this.listTemplates();
      case 'suggest':
        return this.suggestQueries(input);
      default:
        return {
          operation: input.operation,
          success: false,
          error: `Unknown operation: ${input.operation}`,
        };
    }
  }

  private listTemplates(): NLQueryResult {
    return {
      operation: 'list_templates',
      success: true,
      data: { templates: QUERY_TEMPLATES },
    };
  }

  private async analyzeQuery(input: NLQueryInput): Promise<NLQueryResult> {
    const query = input.rawQuery || input.queryRequest?.query;
    if (!query) {
      return {
        operation: 'analyze',
        success: false,
        error: 'Query required',
      };
    }

    const analysis = await this.parseQuery(query);

    return {
      operation: 'analyze',
      success: true,
      data: { analysis },
    };
  }

  private async executeQuery(input: NLQueryInput): Promise<NLQueryResult> {
    if (!input.queryRequest) {
      return {
        operation: 'query',
        success: false,
        error: 'Query request required',
      };
    }

    const { query, context, preferences } = input.queryRequest;

    logger.info(
      { query, repo: context.repositoryFullName, prNumber: context.prNumber },
      'Executing NL query'
    );

    const startTime = Date.now();

    // Step 1: Analyze the query
    const analysis = await this.parseQuery(query);

    // Step 2: Generate the answer
    const answer = await this.generateAnswer(query, analysis, context, preferences);

    // Step 3: Generate follow-up suggestions
    const suggestions = await this.generateSuggestions(query, analysis, context);

    const response: NLQueryResponse = {
      query,
      analysis,
      answer,
      suggestions,
      debug: {
        parseTime: 0,
        executionTime: Date.now() - startTime,
        dataSourcesUsed: this.identifyDataSources(analysis),
        queryPlan: `Intent: ${analysis.intent}, Complexity: ${analysis.complexity}`,
      },
    };

    return {
      operation: 'query',
      success: true,
      data: { response },
    };
  }

  private async parseQuery(query: string): Promise<QueryAnalysis> {
    const normalizedQuery = query.toLowerCase().trim();

    // Detect primary intent based on keywords
    let primaryIntent: QueryIntent = 'general';
    let maxScore = 0;

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      const score = keywords.filter((kw) => normalizedQuery.includes(kw)).length;
      if (score > maxScore) {
        maxScore = score;
        primaryIntent = intent as QueryIntent;
      }
    }

    // Use LLM for more nuanced analysis
    try {
      const userPrompt = `Analyze this query about a pull request:

Query: "${query}"

Identify:
1. Primary intent (one of: file_changes, commit_history, review_status, test_status, code_explanation, impact_analysis, comparison, statistics, timeline, contributor_activity, risk_assessment, merge_readiness, general)
2. Entities mentioned (files, users, dates, code elements)
3. Filters to apply
4. Complexity (simple, moderate, complex)

Respond with JSON:
{
  "intent": "primary_intent",
  "subIntents": ["secondary_intents"],
  "complexity": "simple|moderate|complex",
  "entities": {
    "files": ["file paths"],
    "users": ["usernames"],
    "keywords": ["important terms"],
    "codeElements": [{ "type": "function", "name": "funcName" }]
  },
  "filters": {
    "fileTypes": [".ts"],
    "changeType": "modified"
  },
  "confidence": 0.0-1.0
}`;

      const systemPrompt = buildSystemPrompt(AGENT_TYPE, `Query: ${query}`);
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1000 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      const parsed = JSON.parse(jsonStr);

      return {
        originalQuery: query,
        normalizedQuery,
        intent: parsed.intent || primaryIntent,
        subIntents: parsed.subIntents || [],
        complexity: parsed.complexity || 'simple',
        entities: parsed.entities || {},
        filters: parsed.filters || {},
        aggregations: [],
        confidence: parsed.confidence || 0.7,
      };
    } catch {
      logger.warn('Failed to parse query with LLM, using keyword analysis');
      return {
        originalQuery: query,
        normalizedQuery,
        intent: primaryIntent,
        subIntents: [],
        complexity: 'simple',
        entities: {},
        filters: {},
        aggregations: [],
        confidence: 0.5,
      };
    }
  }

  private async generateAnswer(
    query: string,
    analysis: QueryAnalysis,
    context: NLQueryRequest['context'],
    preferences?: NLQueryRequest['preferences']
  ): Promise<QueryAnswer> {
    const userPrompt = this.buildAnswerPrompt(query, analysis, context, preferences);

    const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
Repository: ${context.repositoryFullName}
PR: ${context.prTitle || 'Unknown'}
Query intent: ${analysis.intent}
`);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.4, maxTokens: 2000 });
      const content = response.content.trim();

      // Check if response is JSON
      if (content.startsWith('{')) {
        const parsed = JSON.parse(content);
        return {
          text: parsed.text || content,
          format: preferences?.format || 'markdown',
          structured: parsed.structured,
          citations: parsed.citations,
          confidence: parsed.confidence || 0.8,
          caveats: parsed.caveats,
        };
      }

      return {
        text: content,
        format: preferences?.format || 'markdown',
        confidence: 0.8,
      };
    } catch {
      return this.generateFallbackAnswer(query, analysis, context);
    }
  }

  private buildAnswerPrompt(
    query: string,
    analysis: QueryAnalysis,
    context: NLQueryRequest['context'],
    preferences?: NLQueryRequest['preferences']
  ): string {
    const verbosity = preferences?.verbosity || 'detailed';

    let contextStr = `## PR Context
- Repository: ${context.repositoryFullName}
${context.prNumber ? `- PR #${context.prNumber}: ${context.prTitle || 'Untitled'}` : ''}
${context.prDescription ? `- Description: ${context.prDescription.slice(0, 500)}` : ''}
${context.baseBranch ? `- Base: ${context.baseBranch} ← Head: ${context.headBranch}` : ''}`;

    if (context.files && context.files.length > 0) {
      contextStr += `\n\n## Changed Files (${context.files.length} total)
${context.files
  .slice(0, 20)
  .map((f) => `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`)
  .join('\n')}`;
    }

    if (context.commits && context.commits.length > 0) {
      contextStr += `\n\n## Commits (${context.commits.length} total)
${context.commits
  .slice(0, 10)
  .map((c) => `- ${c.sha.slice(0, 7)}: ${c.message} (${c.author})`)
  .join('\n')}`;
    }

    if (context.reviews && context.reviews.length > 0) {
      contextStr += `\n\n## Reviews
${context.reviews.map((r) => `- ${r.reviewer}: ${r.state}`).join('\n')}`;
    }

    return `Answer the following question about a pull request:

Query: "${query}"

Query Analysis:
- Intent: ${analysis.intent}
- Complexity: ${analysis.complexity}
- Confidence: ${analysis.confidence}

${contextStr}

Instructions:
- Provide a ${verbosity} answer
- Be specific and cite evidence from the context
- If information is missing, say so clearly
${preferences?.includeCodeSnippets ? '- Include relevant code snippets' : ''}
${preferences?.includeLinks ? '- Include relevant links' : ''}

Respond with plain text/markdown for the answer.`;
  }

  private generateFallbackAnswer(
    query: string,
    analysis: QueryAnalysis,
    context: NLQueryRequest['context']
  ): QueryAnswer {
    let text = '';

    switch (analysis.intent) {
      case 'file_changes':
        if (context.files) {
          const added = context.files.filter((f) => f.status === 'added').length;
          const modified = context.files.filter((f) => f.status === 'modified').length;
          const removed = context.files.filter((f) => f.status === 'removed').length;
          const totalAdditions = context.files.reduce((sum, f) => sum + f.additions, 0);
          const totalDeletions = context.files.reduce((sum, f) => sum + f.deletions, 0);

          text = `This PR changes ${context.files.length} files:\n`;
          text += `- ${added} added, ${modified} modified, ${removed} removed\n`;
          text += `- +${totalAdditions} / -${totalDeletions} lines\n\n`;
          text += 'Files:\n' + context.files.map((f) => `- ${f.filename}`).join('\n');
        } else {
          text = 'No file information available for this PR.';
        }
        break;

      case 'review_status':
        if (context.reviews && context.reviews.length > 0) {
          const approved = context.reviews.filter((r) => r.state === 'approved').length;
          const changesRequested = context.reviews.filter(
            (r) => r.state === 'changes_requested'
          ).length;
          text = `Review status: ${approved} approved, ${changesRequested} changes requested\n\n`;
          text += context.reviews.map((r) => `- ${r.reviewer}: ${r.state}`).join('\n');
        } else {
          text = 'No reviews have been submitted yet.';
        }
        break;

      case 'statistics':
        text = this.generateStatistics(context);
        break;

      case 'merge_readiness':
        text = this.assessMergeReadiness(context);
        break;

      default:
        text = `I can help answer questions about this PR. Based on your query "${query}", I detected the intent as "${analysis.intent}". Could you provide more specific details about what you'd like to know?`;
    }

    return {
      text,
      format: 'markdown',
      confidence: 0.6,
      caveats: ['Generated using fallback logic without LLM assistance'],
    };
  }

  private generateStatistics(context: NLQueryRequest['context']): string {
    const stats: string[] = [];

    if (context.files) {
      stats.push(`**Files Changed:** ${context.files.length}`);
      const additions = context.files.reduce((sum, f) => sum + f.additions, 0);
      const deletions = context.files.reduce((sum, f) => sum + f.deletions, 0);
      stats.push(`**Lines Added:** ${additions}`);
      stats.push(`**Lines Deleted:** ${deletions}`);

      const byType = new Map<string, number>();
      context.files.forEach((f) => {
        const ext = f.filename.split('.').pop() || 'other';
        byType.set(ext, (byType.get(ext) || 0) + 1);
      });
      stats.push(
        `**File Types:** ${Array.from(byType.entries())
          .map(([ext, count]) => `${ext}(${count})`)
          .join(', ')}`
      );
    }

    if (context.commits) {
      stats.push(`**Commits:** ${context.commits.length}`);
      const authors = new Set(context.commits.map((c) => c.author));
      stats.push(`**Contributors:** ${authors.size}`);
    }

    if (context.reviews) {
      stats.push(`**Reviews:** ${context.reviews.length}`);
    }

    return stats.length > 0 ? stats.join('\n') : 'No statistics available.';
  }

  private assessMergeReadiness(context: NLQueryRequest['context']): string {
    const checks: string[] = [];
    let readyCount = 0;
    let totalChecks = 0;

    // Check reviews
    if (context.reviews && context.reviews.length > 0) {
      totalChecks++;
      const hasApproval = context.reviews.some((r) => r.state === 'approved');
      const hasChangesRequested = context.reviews.some((r) => r.state === 'changes_requested');

      if (hasChangesRequested) {
        checks.push('❌ Changes requested by reviewer');
      } else if (hasApproval) {
        checks.push('✅ Has approval');
        readyCount++;
      } else {
        checks.push('⏳ Awaiting review');
      }
    } else {
      checks.push('⏳ No reviews yet');
    }

    // Check files
    if (context.files && context.files.length > 0) {
      totalChecks++;
      if (context.files.length <= 10) {
        checks.push('✅ Reasonable number of files changed');
        readyCount++;
      } else if (context.files.length <= 30) {
        checks.push('⚠️ Many files changed - consider splitting');
      } else {
        checks.push('❌ Too many files - strongly recommend splitting');
      }
    }

    const status =
      readyCount === totalChecks
        ? '**Ready to merge** ✅'
        : readyCount > 0
          ? '**Partially ready** ⚠️'
          : '**Not ready** ❌';

    return `${status}\n\nChecklist:\n${checks.join('\n')}`;
  }

  private async generateSuggestions(
    query: string,
    analysis: QueryAnalysis,
    context: NLQueryRequest['context']
  ): Promise<FollowUpSuggestion[]> {
    const suggestions: FollowUpSuggestion[] = [];

    // Based on intent, suggest related queries
    switch (analysis.intent) {
      case 'file_changes':
        suggestions.push({
          query: 'What is the impact of these changes?',
          description: 'Understand the risk and scope',
          relevance: 'high',
        });
        suggestions.push({
          query: 'Are there any tests for the changed files?',
          description: 'Check test coverage',
          relevance: 'medium',
        });
        break;

      case 'review_status':
        suggestions.push({
          query: 'What feedback did reviewers give?',
          description: 'See review comments',
          relevance: 'high',
        });
        suggestions.push({
          query: 'Is this PR ready to merge?',
          description: 'Check merge readiness',
          relevance: 'high',
        });
        break;

      case 'code_explanation':
        suggestions.push({
          query: 'What are the test cases for this code?',
          description: 'Verify test coverage',
          relevance: 'medium',
        });
        break;

      default:
        suggestions.push({
          query: 'What files were changed?',
          description: 'See all modified files',
          relevance: 'medium',
        });
        suggestions.push({
          query: 'Show PR statistics',
          description: 'Get numerical summary',
          relevance: 'medium',
        });
    }

    // Add context-specific suggestions
    if (context.files && context.files.length > 20) {
      suggestions.push({
        query: 'Can this PR be split into smaller PRs?',
        description: 'Large PRs are harder to review',
        relevance: 'high',
      });
    }

    return suggestions.slice(0, 5);
  }

  private async suggestQueries(input: NLQueryInput): Promise<NLQueryResult> {
    if (!input.queryRequest?.context) {
      return {
        operation: 'suggest',
        success: false,
        error: 'Context required for suggestions',
      };
    }

    const { context } = input.queryRequest;
    const suggestions: FollowUpSuggestion[] = [];

    // General suggestions based on context
    suggestions.push({
      query: 'What files were changed in this PR?',
      description: 'See all modified files',
      relevance: 'high',
    });

    suggestions.push({
      query: 'Is this PR ready to merge?',
      description: 'Check merge readiness',
      relevance: 'high',
    });

    if (context.files && context.files.length > 0) {
      suggestions.push({
        query: 'What is the impact of these changes?',
        description: 'Understand risk and scope',
        relevance: 'high',
      });
    }

    if (context.reviews && context.reviews.length > 0) {
      suggestions.push({
        query: 'What did reviewers say?',
        description: 'See review feedback',
        relevance: 'medium',
      });
    }

    return {
      operation: 'suggest',
      success: true,
      data: { suggestions },
    };
  }

  private identifyDataSources(analysis: QueryAnalysis): string[] {
    const sources: string[] = [];

    switch (analysis.intent) {
      case 'file_changes':
        sources.push('pr_files', 'diff');
        break;
      case 'commit_history':
        sources.push('commits');
        break;
      case 'review_status':
        sources.push('reviews', 'comments');
        break;
      case 'test_status':
        sources.push('checks', 'ci');
        break;
      default:
        sources.push('pr_metadata');
    }

    return sources;
  }
}

export const nlQueryAgent = new NLQueryAgent();
