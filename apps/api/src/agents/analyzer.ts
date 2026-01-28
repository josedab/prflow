import type { AnalyzerAgentInput, AgentContext, PRAnalysis, SemanticChange, SemanticChangeType } from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';
import { parseLLMJsonOrThrow } from '../lib/llm-parser.js';

interface LLMAnalysisResult {
  prType: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'chore' | 'test' | 'deps';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  risks: string[];
  semanticChanges: Array<{
    type: string;
    name: string;
    file: string;
    impact: 'low' | 'medium' | 'high';
    description?: string;
  }>;
  summary: string;
}

export class AnalyzerAgent extends BaseAgent<AnalyzerAgentInput, PRAnalysis> {
  readonly name = 'analyzer';
  readonly description = 'Analyzes PR changes to identify semantic changes, impact, and risks';
  
  private useLLM = process.env.ENABLE_LLM_ANALYSIS !== 'false';

  async execute(input: AnalyzerAgentInput, context: AgentContext) {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.analyze(input, context);
    });

    if (!result) {
      return this.createErrorResult('Analysis failed', latencyMs);
    }

    return this.createSuccessResult({ ...result, latencyMs, analyzedAt: new Date() }, latencyMs);
  }

  private async analyze(input: AnalyzerAgentInput, context: AgentContext): Promise<Omit<PRAnalysis, 'latencyMs' | 'analyzedAt'>> {
    const { pr, diff } = input;

    // Pattern-based detection (fast, always runs)
    const patternPRType = this.detectPRType(pr.head.ref, diff.files);
    const patternSemanticChanges = await this.detectSemanticChanges(diff.files);
    const patternImpactRadius = this.calculateImpactRadius(diff.files, patternSemanticChanges);
    const { riskLevel: patternRiskLevel, risks: patternRisks } = this.assessRisk(diff, patternSemanticChanges, patternPRType);

    // LLM-enhanced analysis
    let llmAnalysis: LLMAnalysisResult | null = null;
    if (this.useLLM) {
      try {
        llmAnalysis = await this.analyzeWithLLM(pr, diff);
      } catch (error) {
        logger.warn({ error }, 'LLM analysis failed, using pattern-based only');
      }
    }

    // Merge results (LLM takes precedence where available)
    const prType = llmAnalysis?.prType || patternPRType;
    const riskLevel = llmAnalysis?.riskLevel || patternRiskLevel;
    const risks = llmAnalysis?.risks?.length ? llmAnalysis.risks : patternRisks;
    
    // Merge semantic changes
    const semanticChanges = this.mergeSemanticChanges(
      patternSemanticChanges,
      llmAnalysis?.semanticChanges || []
    );

    // Generate reviewer suggestions
    const suggestedReviewers = this.suggestReviewers(diff.files, context);

    return {
      prNumber: pr.number,
      type: prType,
      riskLevel,
      changes: {
        filesModified: diff.files.length,
        linesAdded: diff.totalAdditions,
        linesRemoved: diff.totalDeletions,
      },
      semanticChanges,
      impactRadius: patternImpactRadius,
      risks,
      suggestedReviewers,
    };
  }

  private async analyzeWithLLM(
    pr: { title: string; body: string | null; head: { ref: string } },
    diff: { files: Array<{ filename: string; patch?: string; status: string }>; totalAdditions: number; totalDeletions: number }
  ): Promise<LLMAnalysisResult> {
    const systemPrompt = buildSystemPrompt('analyzer', `
PR Title: ${pr.title}
PR Description: ${pr.body || 'No description provided'}
Branch: ${pr.head.ref}
Files changed: ${diff.files.length}
Lines added: ${diff.totalAdditions}
Lines removed: ${diff.totalDeletions}
`);

    // Build a summary of changes for the LLM
    const filesSummary = diff.files.map((f) => `- ${f.filename} (${f.status})`).join('\n');
    const patchSamples = diff.files
      .filter((f) => f.patch)
      .slice(0, 5)
      .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch?.substring(0, 500)}${(f.patch?.length || 0) > 500 ? '\n...(truncated)' : ''}\n\`\`\``)
      .join('\n\n');

    const userPrompt = `Analyze this pull request and provide a structured analysis.

## Files Changed
${filesSummary}

## Code Changes (sample)
${patchSamples}

Respond with a JSON object containing:
- prType: "feature" | "bugfix" | "refactor" | "docs" | "chore" | "test" | "deps"
- riskLevel: "low" | "medium" | "high" | "critical"
- risks: string[] (list of specific risks or concerns)
- semanticChanges: array of { type: string, name: string, file: string, impact: "low"|"medium"|"high", description?: string }
- summary: string (1-2 sentence summary of the PR)

Semantic change types include: new_function, modified_function, deleted_function, new_api, modified_api, deleted_api, new_class, modified_class, config_change, dependency_added, dependency_removed, schema_change.

Respond with ONLY the JSON object.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    return parseLLMJsonOrThrow<LLMAnalysisResult>(response.content, {
      expectedType: 'object',
      context: 'PR analysis',
    });
  }

  private mergeSemanticChanges(
    patternChanges: SemanticChange[],
    llmChanges: Array<{ type: string; name: string; file: string; impact: 'low' | 'medium' | 'high'; description?: string }>
  ): SemanticChange[] {
    const merged = [...patternChanges];
    
    for (const llmChange of llmChanges) {
      const isDuplicate = patternChanges.some(
        (pc) => pc.file === llmChange.file && pc.name === llmChange.name
      );
      
      if (!isDuplicate) {
        merged.push({
          type: llmChange.type as SemanticChangeType,
          name: llmChange.name,
          file: llmChange.file,
          impact: llmChange.impact,
        });
      }
    }
    
    return merged;
  }

  private detectPRType(branchName: string, files: { filename: string; status: string }[]): PRAnalysis['type'] {
    const branch = branchName.toLowerCase();

    if (branch.includes('fix') || branch.includes('bug') || branch.includes('hotfix')) {
      return 'bugfix';
    }
    if (branch.includes('feat') || branch.includes('feature')) {
      return 'feature';
    }
    if (branch.includes('refactor') || branch.includes('cleanup')) {
      return 'refactor';
    }
    if (branch.includes('docs') || branch.includes('documentation')) {
      return 'docs';
    }
    if (branch.includes('test')) {
      return 'test';
    }
    if (branch.includes('dep') || branch.includes('bump') || branch.includes('upgrade')) {
      return 'deps';
    }
    if (branch.includes('chore') || branch.includes('ci') || branch.includes('build')) {
      return 'chore';
    }

    // Analyze file types if branch name doesn't give hints
    const hasSourceFiles = files.some((f) => 
      /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php)$/.test(f.filename) &&
      !f.filename.includes('.test.') &&
      !f.filename.includes('.spec.')
    );
    const hasTestFiles = files.some((f) => 
      f.filename.includes('.test.') || f.filename.includes('.spec.')
    );
    const hasDocFiles = files.some((f) => 
      /\.(md|rst|txt)$/i.test(f.filename) || f.filename.toLowerCase().includes('readme')
    );

    if (!hasSourceFiles && hasTestFiles) return 'test';
    if (!hasSourceFiles && hasDocFiles) return 'docs';
    if (hasSourceFiles) return 'feature';

    return 'chore';
  }

  private async detectSemanticChanges(files: { filename: string; patch?: string; status: string }[]): Promise<SemanticChange[]> {
    const changes: SemanticChange[] = [];

    for (const file of files) {
      // Detect function changes from patch
      if (file.patch) {
        const functionChanges = this.detectFunctionChanges(file.filename, file.patch, file.status);
        changes.push(...functionChanges);
      }

      // Detect dependency changes
      if (file.filename.includes('package.json') || 
          file.filename.includes('requirements.txt') ||
          file.filename.includes('go.mod') ||
          file.filename.includes('Cargo.toml')) {
        changes.push({
          type: 'dependency_added',
          name: 'dependencies',
          file: file.filename,
          impact: 'medium',
        });
      }

      // Detect config changes
      if (file.filename.includes('config') || 
          file.filename.includes('.env') ||
          file.filename.endsWith('.yaml') ||
          file.filename.endsWith('.yml') ||
          file.filename.endsWith('.json')) {
        changes.push({
          type: 'config_change',
          name: file.filename,
          file: file.filename,
          impact: 'medium',
        });
      }

      // Detect API changes
      if (file.filename.includes('api') || 
          file.filename.includes('route') ||
          file.filename.includes('endpoint')) {
        if (file.status === 'added') {
          changes.push({
            type: 'new_api',
            name: file.filename,
            file: file.filename,
            impact: 'high',
          });
        } else if (file.status === 'modified') {
          changes.push({
            type: 'modified_api',
            name: file.filename,
            file: file.filename,
            impact: 'high',
            breaking: false,
          });
        }
      }
    }

    return changes;
  }

  private detectFunctionChanges(filename: string, patch: string, status: string): SemanticChange[] {
    const changes: SemanticChange[] = [];
    const lines = patch.split('\n');

    // Simple regex patterns for function detection
    const functionPatterns = [
      /^\+\s*(async\s+)?function\s+(\w+)/,           // JavaScript/TypeScript
      /^\+\s*(export\s+)?(async\s+)?function\s+(\w+)/, // Export functions
      /^\+\s*(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/,  // Arrow functions
      /^\+\s*(public|private|protected)?\s*(async\s+)?(\w+)\s*\(/,  // Class methods
      /^\+\s*def\s+(\w+)/,                           // Python
      /^\+\s*func\s+(\w+)/,                          // Go
    ];

    for (const line of lines) {
      for (const pattern of functionPatterns) {
        const match = line.match(pattern);
        if (match) {
          const funcName = match[match.length - 1] || match[2] || 'unknown';
          const changeType: SemanticChangeType = status === 'added' ? 'new_function' : 'modified_function';
          changes.push({
            type: changeType,
            name: funcName,
            file: filename,
            impact: 'medium',
          });
          break;
        }
      }
    }

    return changes;
  }

  private calculateImpactRadius(
    files: { filename: string }[],
    semanticChanges: SemanticChange[]
  ): PRAnalysis['impactRadius'] {
    // Estimate dependents based on change types
    const highImpactChanges = semanticChanges.filter((c) => c.impact === 'high').length;

    return {
      directDependents: Math.min(files.length * 2, 50),
      transitiveDependents: Math.min(files.length * 5 + highImpactChanges * 10, 200),
      affectedFiles: files.map((f) => f.filename),
      testCoverage: null, // Would require actual coverage data
    };
  }

  private assessRisk(
    diff: { totalAdditions: number; totalDeletions: number; files: { filename: string }[] },
    semanticChanges: SemanticChange[],
    _prType: PRAnalysis['type']
  ): { riskLevel: PRAnalysis['riskLevel']; risks: string[] } {
    const risks: string[] = [];
    let riskScore = 0;

    // Size-based risk
    const totalChanges = diff.totalAdditions + diff.totalDeletions;
    if (totalChanges > 1000) {
      risks.push('Large PR size may make thorough review difficult');
      riskScore += 3;
    } else if (totalChanges > 500) {
      risks.push('Consider splitting this PR for easier review');
      riskScore += 2;
    }

    // File count risk
    if (diff.files.length > 20) {
      risks.push('Many files modified - higher chance of unintended changes');
      riskScore += 2;
    }

    // Breaking changes
    const breakingChanges = semanticChanges.filter((c) => c.breaking);
    if (breakingChanges.length > 0) {
      risks.push('Contains potential breaking changes');
      riskScore += 3;
    }

    // API changes
    const apiChanges = semanticChanges.filter((c) => 
      c.type === 'new_api' || c.type === 'modified_api' || c.type === 'deleted_api'
    );
    if (apiChanges.length > 0) {
      risks.push('API changes require careful review');
      riskScore += 2;
    }

    // Security-sensitive files
    const securityFiles = diff.files.filter((f) => 
      f.filename.includes('auth') ||
      f.filename.includes('security') ||
      f.filename.includes('password') ||
      f.filename.includes('secret') ||
      f.filename.includes('token') ||
      f.filename.includes('crypto')
    );
    if (securityFiles.length > 0) {
      risks.push('Changes to security-sensitive files require extra scrutiny');
      riskScore += 3;
    }

    // Database/migration changes
    const dbFiles = diff.files.filter((f) => 
      f.filename.includes('migration') ||
      f.filename.includes('schema') ||
      f.filename.includes('database')
    );
    if (dbFiles.length > 0) {
      risks.push('Database schema changes - verify migration safety');
      riskScore += 2;
    }

    // Determine risk level
    let riskLevel: PRAnalysis['riskLevel'];
    if (riskScore >= 8) {
      riskLevel = 'critical';
    } else if (riskScore >= 5) {
      riskLevel = 'high';
    } else if (riskScore >= 2) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return { riskLevel, risks };
  }

  private suggestReviewers(
    files: { filename: string }[],
    _context: AgentContext
  ): PRAnalysis['suggestedReviewers'] {
    // Basic implementation - in production, would analyze git history
    // and CODEOWNERS to suggest actual reviewers
    const domains = new Set<string>();

    for (const file of files) {
      if (file.filename.includes('api') || file.filename.includes('route')) {
        domains.add('api');
      }
      if (file.filename.includes('auth') || file.filename.includes('security')) {
        domains.add('security');
      }
      if (file.filename.includes('ui') || file.filename.includes('component')) {
        domains.add('frontend');
      }
      if (file.filename.includes('database') || file.filename.includes('migration')) {
        domains.add('database');
      }
    }

    // Return placeholder suggestions
    return Array.from(domains).map((domain, index) => ({
      login: `${domain}-expert`,
      reason: `${domain} domain expertise`,
      score: 0.8 - index * 0.1,
      required: index === 0,
    }));
  }
}
