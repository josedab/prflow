/**
 * @fileoverview Reviewer Agent for PRFlow.
 *
 * The Reviewer Agent performs automated code review by detecting:
 * - Security vulnerabilities (SQL injection, XSS, hardcoded secrets)
 * - Bugs and logic errors (null checks, off-by-one, type issues)
 * - Performance problems (N+1 queries, inefficient loops)
 * - Error handling issues (empty catch blocks, unhandled promises)
 * - Style and maintainability concerns
 *
 * Detection uses a two-phase approach:
 * 1. Pattern-based detection using regex rules (fast, deterministic)
 * 2. LLM-based detection for context-aware analysis (optional)
 *
 * Results are deduplicated and merged, with confidence scores assigned
 * based on category and severity.
 *
 * @module agents/reviewer
 */

import type { ReviewerAgentInput, AgentContext, ReviewResult, ReviewComment, Severity, ReviewCategory } from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { getFileExtension, getLanguageFromExtension } from '@prflow/core';
import { logger } from '../lib/logger.js';
import { parseLLMJsonOrDefault } from '../lib/llm-parser.js';

/**
 * LLM configuration for consistent, deterministic analysis.
 * @internal
 */
const LLM_CONFIG = {
  /** Lower temperature for more consistent analysis */
  TEMPERATURE: 0.3,
  /** Maximum tokens for review response */
  MAX_TOKENS: 2000,
} as const;

/**
 * Configuration for deduplicating detected issues.
 * @internal
 */
const DEDUPLICATION_CONFIG = {
  /** Issues within this many lines are considered duplicates */
  LINE_PROXIMITY_THRESHOLD: 2,
} as const;

/**
 * Base confidence scores by category.
 * Security issues have highest confidence, style lowest.
 * @internal
 */
const CATEGORY_CONFIDENCE: Record<ReviewCategory, number> = {
  security: 0.9,
  bug: 0.75,
  performance: 0.7,
  error_handling: 0.8,
  testing: 0.7,
  documentation: 0.6,
  style: 0.5,
  maintainability: 0.6,
};

/**
 * Confidence adjustments based on issue severity.
 * Critical issues get a confidence boost, nitpicks get reduced confidence.
 * @internal
 */
const SEVERITY_CONFIDENCE_ADJUSTMENT: Record<Severity, number> = {
  critical: 0.1,
  high: 0.05,
  medium: 0,
  low: -0.05,
  nitpick: -0.1,
};

/**
 * URLs for additional reading on issue categories.
 * Included in review comments to help developers learn.
 * @internal
 */
const LEARN_MORE_URLS: Partial<Record<ReviewCategory, string>> = {
  security: 'https://owasp.org/www-project-top-ten/',
  performance: 'https://web.dev/performance/',
  error_handling: 'https://www.joyent.com/node-js/production/design/errors',
};

/**
 * Internal representation of a detected code issue.
 * @internal
 */
interface DetectedIssue {
  /** File path where the issue was found */
  file: string;
  /** Line number of the issue (1-indexed) */
  line: number;
  /** End line if the issue spans multiple lines */
  endLine?: number;
  /** Severity level of the issue */
  severity: Severity;
  /** Category/type of the issue */
  category: ReviewCategory;
  /** Human-readable description of the issue */
  message: string;
  /** Optional code suggestion to fix the issue */
  suggestion?: {
    originalCode: string;
    suggestedCode: string;
    language: string;
  };
}

/**
 * Structure of issues returned by LLM analysis.
 * @internal
 */
interface LLMReviewIssue {
  line: number;
  endLine?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'nitpick';
  category: 'security' | 'bug' | 'performance' | 'error_handling' | 'testing' | 'documentation' | 'style' | 'maintainability';
  message: string;
  suggestedFix?: string;
}

/**
 * Reviewer Agent - Automated code review for pull requests.
 *
 * Performs comprehensive code analysis to identify:
 * - **Security**: SQL injection, XSS, hardcoded secrets, disabled TLS
 * - **Bugs**: Type mismatches, null dereferences, off-by-one errors
 * - **Performance**: N+1 queries, sync operations, inefficient loops
 * - **Error Handling**: Empty catch blocks, unhandled promises
 *
 * @example
 * ```typescript
 * const reviewer = new ReviewerAgent();
 * const result = await reviewer.execute({
 *   pr: { title: 'Add login', number: 123 },
 *   diff: { files: [{ filename: 'auth.ts', patch: '...' }], ... }
 * }, context);
 *
 * if (result.success) {
 *   console.log(`Found ${result.data.comments.length} issues`);
 *   result.data.comments.forEach(c => {
 *     console.log(`[${c.severity}] ${c.file}:${c.line} - ${c.message}`);
 *   });
 * }
 * ```
 */
export class ReviewerAgent extends BaseAgent<ReviewerAgentInput, ReviewResult> {
  readonly name = 'reviewer';
  readonly description = 'Reviews code changes for bugs, security issues, and best practices';
  
  // Flag to enable/disable LLM-powered review (can be toggled via env)
  private useLLM = process.env.ENABLE_LLM_REVIEW !== 'false';

  async execute(input: ReviewerAgentInput, context: AgentContext) {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.review(input, context);
    });

    if (!result) {
      return this.createErrorResult('Review failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async review(input: ReviewerAgentInput, _context: AgentContext): Promise<ReviewResult> {
    const { pr, diff } = input;
    const comments: ReviewComment[] = [];
    const autoFixed: string[] = [];

    for (const file of diff.files) {
      if (!file.patch) continue;

      const ext = getFileExtension(file.filename);
      const language = getLanguageFromExtension(ext);

      // Skip non-code files
      if (!this.isCodeFile(file.filename)) continue;

      // Pattern-based detection (fast, always runs)
      const patternIssues = await this.detectIssuesWithPatterns(file.filename, file.patch, language);
      
      // LLM-based detection (slower, more intelligent)
      let llmIssues: DetectedIssue[] = [];
      if (this.useLLM) {
        try {
          llmIssues = await this.detectIssuesWithLLM(file.filename, file.patch, language, pr.title);
        } catch (error) {
          logger.warn({ error, file: file.filename }, 'LLM review failed, using pattern-based only');
        }
      }

      // Merge and deduplicate issues
      const allIssues = this.mergeIssues(patternIssues, llmIssues);

      for (const issue of allIssues) {
        comments.push({
          id: `${file.filename}-${issue.line}-${issue.category}`,
          file: issue.file,
          line: issue.line,
          endLine: issue.endLine,
          severity: issue.severity,
          category: issue.category,
          message: issue.message,
          suggestion: issue.suggestion,
          confidence: this.calculateConfidence(issue),
          learnMoreUrl: this.getLearnMoreUrl(issue.category),
        });
      }
    }

    // Calculate summary
    const summary = {
      critical: comments.filter((c) => c.severity === 'critical').length,
      high: comments.filter((c) => c.severity === 'high').length,
      medium: comments.filter((c) => c.severity === 'medium').length,
      low: comments.filter((c) => c.severity === 'low').length,
      nitpick: comments.filter((c) => c.severity === 'nitpick').length,
    };

    return { comments, summary, autoFixed };
  }

  private mergeIssues(patternIssues: DetectedIssue[], llmIssues: DetectedIssue[]): DetectedIssue[] {
    const merged = [...patternIssues];
    
    // Add LLM issues that don't overlap with pattern issues
    for (const llmIssue of llmIssues) {
      const isDuplicate = patternIssues.some(
        (pi) => pi.file === llmIssue.file && 
                Math.abs(pi.line - llmIssue.line) <= DEDUPLICATION_CONFIG.LINE_PROXIMITY_THRESHOLD && 
                pi.category === llmIssue.category
      );
      
      if (!isDuplicate) {
        merged.push(llmIssue);
      }
    }
    
    return merged;
  }

  private async detectIssuesWithLLM(
    filename: string, 
    patch: string, 
    language: string,
    prTitle: string
  ): Promise<DetectedIssue[]> {
    const systemPrompt = buildSystemPrompt('code reviewer', `
Language: ${language}
File: ${filename}
PR Title: ${prTitle}
`);

    const userPrompt = `Review the following code changes and identify any issues. Focus on:
1. Security vulnerabilities (SQL injection, XSS, hardcoded secrets, etc.)
2. Bugs and logic errors
3. Performance issues
4. Error handling problems
5. Best practice violations

For each issue found, respond with a JSON array of objects with these fields:
- line: number (the line number in the new code)
- endLine: number (optional, if the issue spans multiple lines)
- severity: "critical" | "high" | "medium" | "low" | "nitpick"
- category: "security" | "bug" | "performance" | "error_handling" | "testing" | "documentation" | "style" | "maintainability"
- message: string (clear explanation of the issue)
- suggestedFix: string (optional, code suggestion to fix the issue)

Only report actual issues. If no issues are found, return an empty array [].

Code changes (unified diff format):
\`\`\`${language}
${patch}
\`\`\`

Respond with ONLY the JSON array, no additional text.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, {
      temperature: LLM_CONFIG.TEMPERATURE,
      maxTokens: LLM_CONFIG.MAX_TOKENS,
    });

    const llmIssues = parseLLMJsonOrDefault<LLMReviewIssue[]>(response.content, [], {
      expectedType: 'array',
      context: 'code review issues',
    });
    
    return llmIssues.map((issue) => ({
      file: filename,
      line: issue.line,
      endLine: issue.endLine,
      severity: issue.severity as Severity,
      category: issue.category as ReviewCategory,
      message: issue.message,
      suggestion: issue.suggestedFix ? {
        originalCode: '',
        suggestedCode: issue.suggestedFix,
        language,
      } : undefined,
    }));
  }

  private isCodeFile(filename: string): boolean {
    const codeExtensions = [
      'ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 
      'rb', 'php', 'cs', 'cpp', 'c', 'swift', 'scala'
    ];
    const ext = getFileExtension(filename);
    return codeExtensions.includes(ext);
  }

  private async detectIssuesWithPatterns(filename: string, patch: string, language: string): Promise<DetectedIssue[]> {
    const issues: DetectedIssue[] = [];
    const lines = patch.split('\n');
    let currentLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track line numbers from hunk headers
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10) - 1;
        continue;
      }

      // Only analyze added lines
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      currentLine++;

      const code = line.substring(1); // Remove '+' prefix

      // Security checks
      const securityIssues = this.checkSecurity(filename, code, currentLine, language);
      issues.push(...securityIssues);

      // Bug detection
      const bugIssues = this.checkBugs(filename, code, currentLine, language);
      issues.push(...bugIssues);

      // Performance checks
      const perfIssues = this.checkPerformance(filename, code, currentLine, language);
      issues.push(...perfIssues);

      // Error handling checks
      const errorHandlingIssues = this.checkErrorHandling(filename, code, currentLine, language, lines, i);
      issues.push(...errorHandlingIssues);
    }

    return issues;
  }

  private checkSecurity(filename: string, code: string, line: number, language: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    // SQL Injection
    if (/`SELECT.*\$\{|\+\s*['"].*SELECT/i.test(code) || 
        /['"]SELECT.*['"].*\+/i.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'critical',
        category: 'security',
        message: 'Potential SQL injection vulnerability. User input appears to be interpolated directly into SQL query.',
        suggestion: this.getSQLInjectionSuggestion(code, language),
      });
    }

    // Hardcoded secrets
    if (/(password|secret|api_key|apikey|token|auth)\s*[=:]\s*['"][^'"]+['"]/i.test(code) &&
        !code.includes('process.env') && !code.includes('os.environ')) {
      issues.push({
        file: filename,
        line,
        severity: 'critical',
        category: 'security',
        message: 'Hardcoded secret detected. Use environment variables instead.',
      });
    }

    // Eval usage
    if (/\beval\s*\(/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'critical',
        category: 'security',
        message: 'Use of eval() is dangerous and can lead to code injection attacks.',
      });
    }

    // innerHTML without sanitization
    if (/\.innerHTML\s*=/.test(code) && !code.includes('DOMPurify') && !code.includes('sanitize')) {
      issues.push({
        file: filename,
        line,
        severity: 'high',
        category: 'security',
        message: 'Direct innerHTML assignment may be vulnerable to XSS. Consider using textContent or sanitizing input.',
      });
    }

    // Disabled security features
    if (/verify\s*[=:]\s*false|rejectUnauthorized\s*[=:]\s*false/i.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'high',
        category: 'security',
        message: 'SSL/TLS verification is disabled. This makes the connection vulnerable to man-in-the-middle attacks.',
      });
    }

    return issues;
  }

  private checkBugs(filename: string, code: string, line: number, language: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    // Comparison with assignment
    if (/if\s*\([^=]*[^=!<>]=[^=][^)]*\)/.test(code) && !code.includes('==') && !code.includes('===')) {
      // Avoid false positives for arrow functions and destructuring
      if (!code.includes('=>') && !code.includes('{')) {
        issues.push({
          file: filename,
          line,
          severity: 'high',
          category: 'bug',
          message: 'Possible assignment instead of comparison in condition. Use == or === for comparison.',
        });
      }
    }

    // Array index out of bounds (common pattern)
    if (/\[\w+\s*\+\s*1\]/.test(code) || /\[\w+\s*-\s*1\]/.test(code)) {
      // This is a heuristic - might be false positive
      issues.push({
        file: filename,
        line,
        severity: 'medium',
        category: 'bug',
        message: 'Index arithmetic detected. Verify boundary conditions to avoid off-by-one errors.',
      });
    }

    // Null/undefined checks
    if (language === 'typescript' || language === 'javascript') {
      if (/\.length\s*[><=]/.test(code) && !code.includes('?.length') && !code.includes('&& ')) {
        // Check if there's a null check
        if (!/\w+\s*&&\s*\w+\.length/.test(code) && !/\?\?/.test(code)) {
          issues.push({
            file: filename,
            line,
            severity: 'medium',
            category: 'bug',
            message: 'Accessing .length without null check. Consider using optional chaining (?.) or a guard clause.',
          });
        }
      }
    }

    // Floating point comparison
    if (/===?\s*\d+\.\d+/.test(code) || /\d+\.\d+\s*===?/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'low',
        category: 'bug',
        message: 'Direct floating-point comparison may lead to precision issues. Consider using a tolerance-based comparison.',
      });
    }

    return issues;
  }

  private checkPerformance(filename: string, code: string, line: number, _language: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    // N+1 query pattern hint
    if (/for\s*\(.*\)\s*{[\s\S]*await\s+\w+\.(find|query|get|fetch)/m.test(code) ||
        /\.forEach\s*\(\s*async/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'medium',
        category: 'performance',
        message: 'Potential N+1 query pattern detected. Consider batching database queries.',
      });
    }

    // Inefficient string concatenation in loops
    if (/for\s*\([\s\S]*\)\s*{[\s\S]*\+=\s*['"`]/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'low',
        category: 'performance',
        message: 'String concatenation in loop. Consider using array.join() or template literals.',
      });
    }

    // Synchronous file operations
    if (/Sync\s*\(/.test(code) && filename.includes('.ts') || filename.includes('.js')) {
      issues.push({
        file: filename,
        line,
        severity: 'medium',
        category: 'performance',
        message: 'Synchronous file operation detected. Consider using async version to avoid blocking.',
      });
    }

    return issues;
  }

  private checkErrorHandling(
    filename: string, 
    code: string, 
    line: number, 
    language: string,
    allLines: string[],
    currentIndex: number
  ): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    // Empty catch blocks
    if (/catch\s*\([^)]*\)\s*{\s*}/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'medium',
        category: 'error_handling',
        message: 'Empty catch block swallows errors. At minimum, log the error.',
        suggestion: {
          originalCode: code.trim(),
          suggestedCode: code.replace(/catch\s*\((\w+)\)\s*{\s*}/, 'catch ($1) { console.error($1); }'),
          language,
        },
      });
    }

    // catch without error parameter
    if (/catch\s*{\s*/.test(code) || /catch\s*\(\s*\)\s*{/.test(code)) {
      issues.push({
        file: filename,
        line,
        severity: 'low',
        category: 'error_handling',
        message: 'Catch block without error parameter. Consider capturing the error for debugging.',
      });
    }

    // Promise without catch
    if (/\.then\s*\(/.test(code) && !code.includes('.catch') && !code.includes('await')) {
      // Look ahead for .catch
      const nextLines = allLines.slice(currentIndex + 1, currentIndex + 5).join('\n');
      if (!nextLines.includes('.catch')) {
        issues.push({
          file: filename,
          line,
          severity: 'medium',
          category: 'error_handling',
          message: 'Promise chain without .catch(). Unhandled promise rejections may cause issues.',
        });
      }
    }

    return issues;
  }

  private getSQLInjectionSuggestion(code: string, language: string): { originalCode: string; suggestedCode: string; language: string } | undefined {
    // Try to provide a suggestion for SQL injection
    if (language === 'typescript' || language === 'javascript') {
      return {
        originalCode: code.trim(),
        suggestedCode: '// Use parameterized queries:\nconst result = await db.query("SELECT * FROM table WHERE id = $1", [userId]);',
        language,
      };
    }
    return undefined;
  }

  private calculateConfidence(issue: DetectedIssue): number {
    return Math.min(1, Math.max(0, 
      CATEGORY_CONFIDENCE[issue.category] + SEVERITY_CONFIDENCE_ADJUSTMENT[issue.severity]
    ));
  }

  private getLearnMoreUrl(category: ReviewCategory): string | undefined {
    return LEARN_MORE_URLS[category];
  }
}
