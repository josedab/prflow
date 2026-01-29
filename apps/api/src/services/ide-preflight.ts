import { logger } from '../lib/logger.js';
import { callLLM } from '../lib/llm.js';
import { securityComplianceService } from './security-compliance.js';

/**
 * File change for pre-flight analysis
 */
export interface PreFlightFileChange {
  path: string;
  content: string;
  originalContent?: string;
  language: string;
}

/**
 * Pre-flight check result for a single file
 */
export interface FileCheckResult {
  path: string;
  issues: PreFlightIssue[];
  suggestions: PreFlightSuggestion[];
  metrics: {
    complexity: number;
    maintainability: number;
    testCoverage?: number;
  };
}

/**
 * A pre-flight issue
 */
export interface PreFlightIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: 'security' | 'bug' | 'performance' | 'style' | 'compliance' | 'test';
  message: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  quickFix?: {
    title: string;
    replacement: string;
  };
}

/**
 * A pre-flight suggestion
 */
export interface PreFlightSuggestion {
  id: string;
  type: 'improvement' | 'best-practice' | 'refactor';
  message: string;
  line?: number;
  priority: 'high' | 'medium' | 'low';
  documentation?: string;
}

/**
 * Pre-flight check request from IDE
 */
export interface PreFlightRequest {
  repositoryId?: string;
  branch: string;
  baseBranch: string;
  files: PreFlightFileChange[];
  options?: {
    includeSecurityScan?: boolean;
    includeCompliance?: boolean;
    includePrediction?: boolean;
    includeTestSuggestions?: boolean;
    complianceFrameworks?: string[];
    maxIssues?: number;
  };
}

/**
 * Pre-flight check response to IDE
 */
export interface PreFlightResponse {
  requestId: string;
  timestamp: Date;
  summary: {
    totalFiles: number;
    filesWithIssues: number;
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
    prReadiness: 'ready' | 'needs-work' | 'blocked';
    prReadinessReasons: string[];
  };
  fileResults: FileCheckResult[];
  prediction?: {
    estimatedReviewTime: number;
    mergeProbability: number;
    suggestedReviewers?: string[];
    riskFactors: string[];
  };
  testSuggestions?: {
    missingTests: string[];
    suggestedTestCases: Array<{
      file: string;
      testName: string;
      description: string;
    }>;
  };
  complianceStatus?: {
    frameworks: string[];
    violations: number;
    canMerge: boolean;
  };
}

/**
 * Cached check result
 */
interface CachedResult {
  response: PreFlightResponse;
  expiresAt: Date;
}

export class IDEPreFlightService {
  private cache = new Map<string, CachedResult>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Run pre-flight checks on staged changes
   */
  async runPreFlightCheck(request: PreFlightRequest): Promise<PreFlightResponse> {
    const requestId = `preflight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const cacheKey = this.generateCacheKey(request);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      logger.debug({ requestId, cacheKey }, 'Returning cached pre-flight result');
      return { ...cached.response, requestId };
    }

    logger.info({ requestId, fileCount: request.files.length }, 'Running pre-flight check');

    const fileResults: FileCheckResult[] = [];
    const options = request.options || {};

    // Analyze each file
    for (const file of request.files) {
      const result = await this.analyzeFile(file, options);
      fileResults.push(result);
    }

    // Calculate summary
    const summary = this.calculateSummary(fileResults);

    // Build response
    const response: PreFlightResponse = {
      requestId,
      timestamp: new Date(),
      summary,
      fileResults,
    };

    // Add prediction if requested
    if (options.includePrediction) {
      response.prediction = await this.generatePrediction(request, fileResults);
    }

    // Add test suggestions if requested
    if (options.includeTestSuggestions) {
      response.testSuggestions = await this.suggestTests(request.files);
    }

    // Add compliance status if requested
    if (options.includeCompliance && request.repositoryId) {
      response.complianceStatus = await this.checkCompliance(
        request.repositoryId,
        request.files,
        options.complianceFrameworks
      );
    }

    // Cache the result
    this.cache.set(cacheKey, {
      response,
      expiresAt: new Date(Date.now() + this.CACHE_TTL_MS),
    });

    logger.info({
      requestId,
      files: request.files.length,
      issues: summary.totalIssues,
      readiness: summary.prReadiness,
    }, 'Pre-flight check completed');

    return response;
  }

  /**
   * Quick check for a single file
   */
  async checkSingleFile(
    file: PreFlightFileChange,
    options?: {
      includeAI?: boolean;
    }
  ): Promise<FileCheckResult> {
    return this.analyzeFile(file, { ...options, maxIssues: 50 });
  }

  /**
   * Get quick status for IDE status bar
   */
  async getQuickStatus(
    files: PreFlightFileChange[]
  ): Promise<{
    status: 'ok' | 'warning' | 'error';
    issueCount: number;
    message: string;
  }> {
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const file of files) {
      const issues = this.runStaticAnalysis(file);
      totalErrors += issues.filter(i => i.type === 'error').length;
      totalWarnings += issues.filter(i => i.type === 'warning').length;
    }

    if (totalErrors > 0) {
      return {
        status: 'error',
        issueCount: totalErrors,
        message: `${totalErrors} error${totalErrors > 1 ? 's' : ''} found`,
      };
    }

    if (totalWarnings > 0) {
      return {
        status: 'warning',
        issueCount: totalWarnings,
        message: `${totalWarnings} warning${totalWarnings > 1 ? 's' : ''} found`,
      };
    }

    return {
      status: 'ok',
      issueCount: 0,
      message: 'Ready for PR',
    };
  }

  /**
   * Clear cache for a repository
   */
  clearCache(repositoryId?: string): void {
    if (repositoryId) {
      for (const [key] of this.cache.entries()) {
        if (key.includes(repositoryId)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  // Private methods

  private async analyzeFile(
    file: PreFlightFileChange,
    options: PreFlightRequest['options'] = {}
  ): Promise<FileCheckResult> {
    const issues: PreFlightIssue[] = [];
    const suggestions: PreFlightSuggestion[] = [];

    // Run static analysis
    const staticIssues = this.runStaticAnalysis(file);
    issues.push(...staticIssues);

    // Run security scan if enabled
    if (options.includeSecurityScan !== false) {
      const securityIssues = this.runSecurityScan(file);
      issues.push(...securityIssues);
    }

    // Run AI analysis for complex issues
    if (file.content.length < 10000) { // Limit AI analysis to smaller files
      const aiSuggestions = await this.runAIAnalysis(file);
      suggestions.push(...aiSuggestions);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(file);

    // Limit issues if specified
    const maxIssues = options.maxIssues || 100;
    const limitedIssues = issues.slice(0, maxIssues);

    return {
      path: file.path,
      issues: limitedIssues,
      suggestions,
      metrics,
    };
  }

  private runStaticAnalysis(file: PreFlightFileChange): PreFlightIssue[] {
    const issues: PreFlightIssue[] = [];
    const lines = file.content.split('\n');

    // Check for common issues based on language
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // console.log statements
      if (/console\.(log|debug|info|warn|error)\(/.test(line)) {
        issues.push({
          id: `static-${lineNumber}-console`,
          type: 'warning',
          category: 'style',
          message: 'Remove console statement before committing',
          line: lineNumber,
          column: line.indexOf('console') + 1,
          quickFix: {
            title: 'Remove console statement',
            replacement: '',
          },
        });
      }

      // TODO/FIXME comments
      if (/\/\/\s*(TODO|FIXME|XXX|HACK):/i.test(line)) {
        issues.push({
          id: `static-${lineNumber}-todo`,
          type: 'info',
          category: 'style',
          message: 'Unresolved TODO/FIXME comment',
          line: lineNumber,
        });
      }

      // Debugger statements
      if (/\bdebugger\b/.test(line)) {
        issues.push({
          id: `static-${lineNumber}-debugger`,
          type: 'error',
          category: 'bug',
          message: 'Remove debugger statement',
          line: lineNumber,
          quickFix: {
            title: 'Remove debugger',
            replacement: '',
          },
        });
      }

      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*{\s*}/.test(line)) {
        issues.push({
          id: `static-${lineNumber}-emptycatch`,
          type: 'warning',
          category: 'bug',
          message: 'Empty catch block swallows errors',
          line: lineNumber,
          suggestion: 'Log or handle the error appropriately',
        });
      }

      // Magic numbers
      const magicNumberMatch = line.match(/[^a-zA-Z0-9_](\d{2,})[^a-zA-Z0-9_]/);
      if (magicNumberMatch && !/const|let|var|import|require/.test(line)) {
        const num = parseInt(magicNumberMatch[1], 10);
        if (num > 1 && num !== 100 && num !== 1000) {
          issues.push({
            id: `static-${lineNumber}-magic`,
            type: 'info',
            category: 'style',
            message: `Consider extracting magic number ${num} to a named constant`,
            line: lineNumber,
          });
        }
      }

      // Very long lines
      if (line.length > 120) {
        issues.push({
          id: `static-${lineNumber}-linelength`,
          type: 'info',
          category: 'style',
          message: `Line exceeds 120 characters (${line.length})`,
          line: lineNumber,
        });
      }

      // Potential SQL injection
      if (/query\s*\(\s*`[^`]*\$\{/.test(line) || /execute\s*\(\s*`[^`]*\$\{/.test(line)) {
        issues.push({
          id: `static-${lineNumber}-sqli`,
          type: 'error',
          category: 'security',
          message: 'Potential SQL injection - use parameterized queries',
          line: lineNumber,
        });
      }
    }

    return issues;
  }

  private runSecurityScan(file: PreFlightFileChange): PreFlightIssue[] {
    const issues: PreFlightIssue[] = [];
    const lines = file.content.split('\n');

    const securityPatterns = [
      {
        pattern: /(?:password|passwd|pwd)\s*[=:]\s*['"][^'"]+['"]/i,
        message: 'Hardcoded password detected',
        type: 'error' as const,
      },
      {
        pattern: /(?:api[_-]?key|apikey)\s*[=:]\s*['"][a-zA-Z0-9]{16,}['"]/i,
        message: 'Hardcoded API key detected',
        type: 'error' as const,
      },
      {
        pattern: /eval\s*\(/,
        message: 'Avoid using eval() - potential code injection',
        type: 'warning' as const,
      },
      {
        pattern: /innerHTML\s*=/,
        message: 'innerHTML assignment may lead to XSS - use textContent or sanitize',
        type: 'warning' as const,
      },
      {
        pattern: /document\.write\s*\(/,
        message: 'Avoid document.write() - potential XSS vulnerability',
        type: 'warning' as const,
      },
      {
        pattern: /dangerouslySetInnerHTML/,
        message: 'dangerouslySetInnerHTML may lead to XSS - ensure content is sanitized',
        type: 'warning' as const,
      },
      {
        pattern: /new Function\s*\(/,
        message: 'Avoid new Function() - similar risks to eval()',
        type: 'warning' as const,
      },
      {
        pattern: /child_process\.exec\s*\(/,
        message: 'Use execFile or spawn instead of exec to prevent command injection',
        type: 'warning' as const,
      },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      for (const { pattern, message, type } of securityPatterns) {
        if (pattern.test(line)) {
          issues.push({
            id: `security-${lineNumber}-${pattern.source.substring(0, 10)}`,
            type,
            category: 'security',
            message,
            line: lineNumber,
          });
        }
      }
    }

    return issues;
  }

  private async runAIAnalysis(file: PreFlightFileChange): Promise<PreFlightSuggestion[]> {
    try {
      const prompt = `Analyze this ${file.language} code and suggest 1-3 improvements.
Focus on: code quality, potential bugs, performance issues.
Be concise and actionable.

Code:
\`\`\`${file.language}
${file.content.substring(0, 3000)}
\`\`\`

Respond with JSON array of suggestions:
[{"type": "improvement|best-practice|refactor", "message": "...", "priority": "high|medium|low", "line": number_or_null}]`;

      const response = await callLLM(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-3.5-turbo', temperature: 0.3 }
      );

      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          type: string;
          message: string;
          priority: string;
          line?: number;
        }>;

        return parsed.map((s, i) => ({
          id: `ai-suggestion-${i}`,
          type: (s.type as PreFlightSuggestion['type']) || 'improvement',
          message: s.message,
          line: s.line,
          priority: (s.priority as PreFlightSuggestion['priority']) || 'medium',
        }));
      }
    } catch (error) {
      logger.debug({ error, file: file.path }, 'AI analysis failed, skipping');
    }

    return [];
  }

  private calculateMetrics(file: PreFlightFileChange): FileCheckResult['metrics'] {
    const lines = file.content.split('\n');
    const codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*'));
    
    // Simple complexity estimation based on control flow
    let complexity = 1;
    const complexityPatterns = [/\bif\b/, /\belse\b/, /\bfor\b/, /\bwhile\b/, /\bswitch\b/, /\bcatch\b/, /\?\s*:/];
    for (const line of lines) {
      for (const pattern of complexityPatterns) {
        if (pattern.test(line)) complexity++;
      }
    }

    // Maintainability index (simplified)
    const avgLineLength = codeLines.reduce((sum, l) => sum + l.length, 0) / (codeLines.length || 1);
    const commentRatio = (lines.length - codeLines.length) / (lines.length || 1);
    const maintainability = Math.max(0, Math.min(100,
      100 - (complexity * 2) - (avgLineLength / 2) + (commentRatio * 20)
    ));

    return {
      complexity,
      maintainability: Math.round(maintainability),
    };
  }

  private calculateSummary(fileResults: FileCheckResult[]): PreFlightResponse['summary'] {
    let totalIssues = 0;
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    let filesWithIssues = 0;
    const readinessReasons: string[] = [];

    for (const result of fileResults) {
      totalIssues += result.issues.length;
      if (result.issues.length > 0) filesWithIssues++;

      for (const issue of result.issues) {
        switch (issue.type) {
          case 'error':
            errors++;
            break;
          case 'warning':
            warnings++;
            break;
          case 'info':
            infos++;
            break;
        }
      }
    }

    // Determine PR readiness
    let prReadiness: 'ready' | 'needs-work' | 'blocked' = 'ready';

    if (errors > 0) {
      prReadiness = 'blocked';
      readinessReasons.push(`${errors} error(s) must be fixed`);
    } else if (warnings > 5) {
      prReadiness = 'needs-work';
      readinessReasons.push(`${warnings} warnings should be addressed`);
    }

    // Check for security issues
    const securityIssues = fileResults.flatMap(r => 
      r.issues.filter(i => i.category === 'security')
    );
    if (securityIssues.length > 0) {
      prReadiness = 'blocked';
      readinessReasons.push(`${securityIssues.length} security issue(s) detected`);
    }

    if (readinessReasons.length === 0) {
      readinessReasons.push('No blocking issues found');
    }

    return {
      totalFiles: fileResults.length,
      filesWithIssues,
      totalIssues,
      errors,
      warnings,
      infos,
      prReadiness,
      prReadinessReasons: readinessReasons,
    };
  }

  private async generatePrediction(
    request: PreFlightRequest,
    fileResults: FileCheckResult[]
  ): Promise<PreFlightResponse['prediction']> {
    const totalLines = request.files.reduce(
      (sum, f) => sum + f.content.split('\n').length,
      0
    );

    const totalIssues = fileResults.reduce(
      (sum, r) => sum + r.issues.length,
      0
    );

    const avgComplexity = fileResults.reduce(
      (sum, r) => sum + r.metrics.complexity,
      0
    ) / (fileResults.length || 1);

    // Estimate review time: base time + lines factor + complexity factor
    const estimatedReviewTime = Math.ceil(
      5 + (totalLines / 50) + (avgComplexity * 2)
    );

    // Estimate merge probability
    let mergeProbability = 0.9;
    if (totalIssues > 0) mergeProbability -= totalIssues * 0.02;
    if (avgComplexity > 10) mergeProbability -= 0.1;
    if (request.files.length > 10) mergeProbability -= 0.05;
    mergeProbability = Math.max(0.1, Math.min(0.95, mergeProbability));

    // Risk factors
    const riskFactors: string[] = [];
    if (avgComplexity > 15) riskFactors.push('High code complexity');
    if (request.files.length > 20) riskFactors.push('Large number of files');
    if (totalLines > 500) riskFactors.push('Large changeset');
    
    const hasSecurityChanges = request.files.some(f => 
      f.path.includes('auth') || f.path.includes('security')
    );
    if (hasSecurityChanges) riskFactors.push('Security-sensitive changes');

    return {
      estimatedReviewTime,
      mergeProbability: Math.round(mergeProbability * 100) / 100,
      riskFactors,
    };
  }

  private async suggestTests(
    files: PreFlightFileChange[]
  ): Promise<PreFlightResponse['testSuggestions']> {
    const missingTests: string[] = [];
    const suggestedTestCases: Array<{
      file: string;
      testName: string;
      description: string;
    }> = [];

    for (const file of files) {
      // Skip test files themselves
      if (file.path.includes('.test.') || file.path.includes('.spec.')) {
        continue;
      }

      // Check if there's a corresponding test file
      // testFilePath pattern: source.ts -> source.test.ts
      const testFilePath = file.path
        .replace(/\.(ts|tsx|js|jsx)$/, '.test.$1')
        .replace(/\/src\//, '/test/');

      const hasTest = files.some(f => f.path === testFilePath || 
        f.path.includes(file.path.replace(/\.[^.]+$/, '')) &&
        (f.path.includes('.test.') || f.path.includes('.spec.'))
      );

      if (!hasTest) {
        missingTests.push(file.path);
      }

      // Suggest test cases for functions
      const functionMatches = file.content.matchAll(
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>|:)/g
      );

      for (const match of functionMatches) {
        const funcName = match[1] || match[2];
        if (funcName && !funcName.startsWith('_')) {
          suggestedTestCases.push({
            file: file.path,
            testName: `should correctly execute ${funcName}`,
            description: `Test the main functionality of ${funcName}`,
          });
        }
      }
    }

    return {
      missingTests,
      suggestedTestCases: suggestedTestCases.slice(0, 10), // Limit suggestions
    };
  }

  private async checkCompliance(
    repositoryId: string,
    files: PreFlightFileChange[],
    frameworks?: string[]
  ): Promise<PreFlightResponse['complianceStatus']> {
    try {
      const config = await securityComplianceService.getConfiguration(repositoryId);
      const activeFrameworks = frameworks || config.enabledFrameworks;

      let violations = 0;

      // Quick compliance check on staged files
      for (const file of files) {
        const rules = securityComplianceService.getRules();
        for (const rule of rules) {
          if (!activeFrameworks.includes(rule.framework)) continue;

          for (const pattern of rule.patterns) {
            if (pattern.type === 'regex') {
              try {
                const regex = new RegExp(pattern.value, 'gm');
                const matches = file.content.match(regex);
                if (matches) {
                  violations += matches.length;
                }
              } catch {
                // Invalid regex, skip
              }
            }
          }
        }
      }

      return {
        frameworks: activeFrameworks,
        violations,
        canMerge: violations === 0,
      };
    } catch (error) {
      logger.warn({ error, repositoryId }, 'Failed to check compliance');
      return {
        frameworks: [],
        violations: 0,
        canMerge: true,
      };
    }
  }

  private generateCacheKey(request: PreFlightRequest): string {
    const fileHashes = request.files
      .map(f => `${f.path}:${f.content.length}`)
      .sort()
      .join('|');
    
    return `${request.repositoryId || 'unknown'}:${request.branch}:${fileHashes}`;
  }
}

export const idePreFlightService = new IDEPreFlightService();
