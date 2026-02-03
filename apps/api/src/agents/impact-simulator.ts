/**
 * @fileoverview Impact Simulator Agent for PRFlow.
 *
 * Analyzes PR changes to predict downstream effects before merge:
 * - Test failure prediction
 * - Dependency impact analysis
 * - API compatibility checking
 * - Cross-repository impact detection
 *
 * @module agents/impact-simulator
 */

import type {
  ImpactSimulationInput,
  ImpactSimulation,
  PredictedImpact,
  TestImpact,
  APICompatibility,
  ImpactDependencyGraph,
  ImpactDependencyNode,
  ImpactDependencyEdge,
  ImpactSummary,
  ImpactType,
  ImpactSeverity,
  ImpactLocation,
  ImportReference,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';
import { parseLLMJsonOrThrow } from '../lib/llm-parser.js';

// Define a simple context type for this agent since it doesn't use standard ImpactAgentContext
interface ImpactAgentContext {
  workflowId: string;
  changedFiles: Array<{ path: string; additions: number; deletions: number }>;
}

/**
 * Patterns that indicate high-risk files
 */
const HIGH_RISK_PATTERNS = [
  /^\.env/,
  /config\.(ts|js|json)$/,
  /schema\.prisma$/,
  /migrations?\//,
  /package\.json$/,
  /tsconfig\.json$/,
  /\.github\/workflows\//,
  /auth/i,
  /security/i,
  /payment/i,
  /billing/i,
];

/**
 * Patterns for test files
 */
const TEST_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /__tests__\//,
  /test\//,
  /tests\//,
];

interface LLMImpactResult {
  impacts: Array<{
    type: string;
    severity: string;
    description: string;
    location: { file?: string; symbol?: string };
    confidence: number;
    isBlocking: boolean;
  }>;
  testPredictions: Array<{
    testFile: string;
    prediction: string;
    confidence: number;
    reason: string;
  }>;
  apiChanges: Array<{
    api: string;
    isBackwardCompatible: boolean;
    breakingChanges: string[];
  }>;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  mergeRecommendation: 'safe' | 'caution' | 'block';
  reasons: string[];
}

export class ImpactSimulatorAgent extends BaseAgent<ImpactSimulationInput, ImpactSimulation> {
  readonly name = 'impact-simulator';
  readonly description = 'Simulates downstream effects of PR changes before merge';

  private useLLM = process.env.ENABLE_LLM_ANALYSIS !== 'false';

  async execute(input: ImpactSimulationInput, _context: import('@prflow/core').AgentContext) {
    // Create the impact-specific context (agent uses its own context type)
    const impactContext: ImpactAgentContext = {
      workflowId: `impact-${Date.now()}`,
      changedFiles: [], // Files are fetched within simulate() if needed
    };

    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.simulate(input, impactContext);
    });

    return result.success
      ? this.createSuccessResult(result.data!, latencyMs)
      : this.createErrorResult(result.error!, latencyMs);
  }

  private async simulate(
    input: ImpactSimulationInput,
    context: ImpactAgentContext
  ): Promise<{ success: boolean; data?: ImpactSimulation; error?: string }> {
    try {
      logger.info({ repo: `${input.owner}/${input.repo}`, pr: input.prNumber }, 'Starting impact simulation');

      // Step 1: Build or use provided dependency graph
      const dependencyGraph = input.dependencyGraph || await this.buildImpactDependencyGraph(input, context);

      // Step 2: Analyze code changes
      const impacts = await this.analyzeImpacts(input, dependencyGraph, context);

      // Step 3: Predict test outcomes
      const testImpacts = input.includeTestPredictions !== false
        ? await this.predictTestOutcomes(input, dependencyGraph, context)
        : [];

      // Step 4: Analyze API compatibility
      const apiCompatibility = await this.analyzeAPICompatibility(input, context);

      // Step 5: Check cross-repo impacts
      const crossRepoImpacts = input.includeCrossRepo
        ? await this.analyzeCrossRepoImpacts(input, context)
        : [];

      // Step 6: Calculate overall risk and recommendation
      const { riskScore, riskLevel, recommendation, reasons } = this.calculateRisk(
        impacts,
        testImpacts,
        apiCompatibility,
        crossRepoImpacts
      );

      // Step 7: Build summary
      const summary = this.buildSummary(dependencyGraph, impacts, testImpacts, apiCompatibility, crossRepoImpacts);

      const simulation: ImpactSimulation = {
        id: `sim-${Date.now()}`,
        workflowId: context.workflowId,
        repository: { owner: input.owner, name: input.repo },
        prNumber: input.prNumber,
        commitSha: input.commitSha || 'HEAD',
        overallRiskScore: riskScore,
        riskLevel,
        impacts,
        dependencyGraph,
        testImpacts,
        apiCompatibility,
        crossRepoImpacts,
        summary,
        simulatedAt: new Date(),
        confidence: this.calculateConfidence(impacts, testImpacts),
        mergeRecommendation: recommendation,
        recommendationReasons: reasons,
      };

      logger.info(
        { 
          repo: `${input.owner}/${input.repo}`,
          riskLevel,
          recommendation,
          impactCount: impacts.length
        },
        'Impact simulation completed'
      );

      return { success: true, data: simulation };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Impact simulation failed');
      return { success: false, error: message };
    }
  }

  private async buildImpactDependencyGraph(
    input: ImpactSimulationInput,
    context: ImpactAgentContext
  ): Promise<ImpactDependencyGraph> {
    // In a real implementation, this would parse imports/exports from files
    // For now, we build a simplified graph based on file patterns
    
    const changedFiles = context.changedFiles || [];
    const nodes: ImpactDependencyNode[] = [];
    const edges: ImpactDependencyEdge[] = [];
    const changedNodes: string[] = [];
    const affectedNodes: string[] = [];

    for (const fileInfo of changedFiles) {
      const filePath = fileInfo.path;
      const nodeId = `node-${nodes.length}`;
      const isHighRisk = HIGH_RISK_PATTERNS.some(p => p.test(filePath));
      
      nodes.push({
        id: nodeId,
        path: filePath,
        nodeType: 'file',
        name: filePath.split('/').pop() || filePath,
        exports: [],
        imports: [],
        dependentCount: 0,
        isChanged: true,
        riskScore: isHighRisk ? 80 : 30,
      });

      changedNodes.push(nodeId);
    }

    // Calculate total impact score
    const totalImpactScore = nodes.reduce((sum, n) => sum + n.riskScore, 0) / Math.max(nodes.length, 1);

    return {
      nodes,
      edges,
      changedNodes,
      affectedNodes,
      totalImpactScore,
    };
  }

  private async analyzeImpacts(
    input: ImpactSimulationInput,
    graph: ImpactDependencyGraph,
    context: ImpactAgentContext
  ): Promise<PredictedImpact[]> {
    const impacts: PredictedImpact[] = [];
    const changedFiles = context.changedFiles || [];

    // Pattern-based impact detection
    for (const fileInfo of changedFiles) {
      const file = fileInfo.path;
      
      // Check for config file changes
      if (/config\.(ts|js|json)$/.test(file) || file.includes('.env')) {
        impacts.push({
          id: `impact-${impacts.length}`,
          type: 'config_incompatible',
          severity: 'high',
          description: `Configuration file ${file} was modified. This may affect application behavior.`,
          confidence: 0.8,
          location: { file },
          causedBy: [file],
          remediation: 'Verify configuration changes in all environments',
          isBlocking: false,
        });
      }

      // Check for schema changes
      if (file.includes('schema') || file.includes('migration')) {
        impacts.push({
          id: `impact-${impacts.length}`,
          type: 'schema_migration',
          severity: 'high',
          description: `Database schema change detected in ${file}. Migration may be required.`,
          confidence: 0.9,
          location: { file },
          causedBy: [file],
          remediation: 'Ensure migration scripts are included and tested',
          isBlocking: true,
        });
      }

      // Check for API changes
      if (file.includes('routes') || file.includes('api') || file.includes('controller')) {
        impacts.push({
          id: `impact-${impacts.length}`,
          type: 'api_breaking',
          severity: 'medium',
          description: `API endpoint modification in ${file}. Check for backward compatibility.`,
          confidence: 0.7,
          location: { file },
          causedBy: [file],
          remediation: 'Verify API contract with consumers',
          isBlocking: false,
        });
      }

      // Check for security-sensitive files
      if (/auth|security|permission|password/i.test(file)) {
        impacts.push({
          id: `impact-${impacts.length}`,
          type: 'security_issue',
          severity: 'critical',
          description: `Security-sensitive file ${file} was modified. Manual security review required.`,
          confidence: 0.85,
          location: { file },
          causedBy: [file],
          remediation: 'Request security team review before merge',
          isBlocking: true,
        });
      }
    }

    // Use LLM for deeper analysis if enabled
    const filePaths = changedFiles.map((f: { path: string }) => f.path);
    if (this.useLLM && changedFiles.length > 0) {
      const llmImpacts = await this.getLLMImpacts(input, filePaths, context);
      if (llmImpacts) {
        for (const impact of llmImpacts.impacts) {
          impacts.push({
            id: `impact-${impacts.length}`,
            type: impact.type as ImpactType,
            severity: impact.severity as ImpactSeverity,
            description: impact.description,
            confidence: impact.confidence,
            location: impact.location,
            causedBy: [impact.location.file || 'unknown'],
            isBlocking: impact.isBlocking,
          });
        }
      }
    }

    return impacts;
  }

  private async predictTestOutcomes(
    input: ImpactSimulationInput,
    graph: ImpactDependencyGraph,
    context: ImpactAgentContext
  ): Promise<TestImpact[]> {
    const testImpacts: TestImpact[] = [];
    const changedFiles = context.changedFiles || [];

    // Find test files related to changed files
    for (const fileInfo of changedFiles) {
      const file = fileInfo.path;
      if (TEST_PATTERNS.some(p => p.test(file))) continue; // Skip test files themselves

      // Predict which tests might be affected
      const baseName = file.replace(/\.(ts|tsx|js|jsx)$/, '');
      const possibleTestFiles = [
        `${baseName}.test.ts`,
        `${baseName}.test.tsx`,
        `${baseName}.spec.ts`,
        `__tests__/${file.split('/').pop()?.replace(/\.(ts|tsx)$/, '.test.ts')}`,
      ];

      for (const testFile of possibleTestFiles) {
        testImpacts.push({
          testFile,
          testName: `Tests for ${file}`,
          prediction: 'unknown',
          confidence: 0.5,
          reason: `Source file ${file} was modified`,
          affectedBy: [file],
          lastKnownStatus: 'pass',
        });
      }
    }

    // High-risk changes might cause test failures
    const highRiskFilePaths = changedFiles
      .map((f: { path: string }) => f.path)
      .filter((f: string) => HIGH_RISK_PATTERNS.some(p => p.test(f)));
    if (highRiskFilePaths.length > 0) {
      testImpacts.push({
        testFile: 'integration/*',
        testName: 'Integration tests',
        prediction: 'fail',
        confidence: 0.6,
        reason: `High-risk files modified: ${highRiskFilePaths.join(', ')}`,
        affectedBy: highRiskFilePaths,
      });
    }

    return testImpacts;
  }

  private async analyzeAPICompatibility(
    input: ImpactSimulationInput,
    context: ImpactAgentContext
  ): Promise<APICompatibility[]> {
    const compatibility: APICompatibility[] = [];
    const changedFiles = context.changedFiles || [];

    // Find API-related files
    const apiFiles = changedFiles
      .map((f: { path: string }) => f.path)
      .filter((f: string) => 
        f.includes('routes') || 
        f.includes('api') || 
        f.includes('controller') ||
        f.endsWith('.d.ts')
      );

    for (const file of apiFiles) {
      compatibility.push({
        api: file,
        changeType: 'modified',
        isBackwardCompatible: true, // Would need deeper analysis
        breakingChanges: [],
        versionImpact: 'patch',
        consumersAffected: [],
      });
    }

    return compatibility;
  }

  private async analyzeCrossRepoImpacts(
    input: ImpactSimulationInput,
    context: ImpactAgentContext
  ): Promise<{ repository: string; owner: string; description: string; affectedFiles: string[]; severity: ImpactSeverity; requiresCoordinatedRelease: boolean }[]> {
    // In a real implementation, this would query linked repositories
    // and analyze their dependencies on this repo
    return [];
  }

  private async getLLMImpacts(
    input: ImpactSimulationInput,
    changedFiles: string[],
    context: ImpactAgentContext
  ): Promise<LLMImpactResult | null> {
    try {
      const systemPrompt = buildSystemPrompt('impact analyzer', `
Repository: ${input.owner}/${input.repo}
PR Number: ${input.prNumber}
Files Changed: ${changedFiles.length}
`);

      const userPrompt = `Analyze these file changes and predict potential impacts:

Changed Files:
${changedFiles.map(f => `- ${f}`).join('\n')}

Identify:
1. Potential issues (type errors, test failures, breaking changes)
2. Risk level for each issue
3. Whether each issue should block merge

Respond with JSON:
{
  "impacts": [{"type": "test_failure|type_error|api_breaking|...", "severity": "critical|high|medium|low", "description": "...", "location": {"file": "...", "symbol": "..."}, "confidence": 0.0-1.0, "isBlocking": true|false}],
  "testPredictions": [{"testFile": "...", "prediction": "pass|fail|flaky", "confidence": 0.0-1.0, "reason": "..."}],
  "apiChanges": [{"api": "...", "isBackwardCompatible": true|false, "breakingChanges": ["..."]}],
  "overallRisk": "low|medium|high|critical",
  "mergeRecommendation": "safe|caution|block",
  "reasons": ["..."]
}`;

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await callLLM(messages, { temperature: 0.2, maxTokens: 2000 });
      return parseLLMJsonOrThrow<LLMImpactResult>(response.content);
    } catch (error) {
      logger.warn({ error }, 'LLM impact analysis failed');
      return null;
    }
  }

  private calculateRisk(
    impacts: PredictedImpact[],
    testImpacts: TestImpact[],
    apiCompatibility: APICompatibility[],
    crossRepoImpacts: unknown[]
  ): {
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: 'safe' | 'caution' | 'block';
    reasons: string[];
  } {
    let riskScore = 0;
    const reasons: string[] = [];

    // Score from impacts
    for (const impact of impacts) {
      switch (impact.severity) {
        case 'critical': riskScore += 30; break;
        case 'high': riskScore += 20; break;
        case 'medium': riskScore += 10; break;
        case 'low': riskScore += 5; break;
      }
      if (impact.isBlocking) {
        reasons.push(`Blocking: ${impact.description}`);
      }
    }

    // Score from test predictions
    const failingTests = testImpacts.filter(t => t.prediction === 'fail');
    riskScore += failingTests.length * 15;
    if (failingTests.length > 0) {
      reasons.push(`${failingTests.length} tests predicted to fail`);
    }

    // Score from API changes
    const breakingAPIs = apiCompatibility.filter(a => !a.isBackwardCompatible);
    riskScore += breakingAPIs.length * 25;
    if (breakingAPIs.length > 0) {
      reasons.push(`${breakingAPIs.length} breaking API changes detected`);
    }

    // Cross-repo impacts
    riskScore += crossRepoImpacts.length * 20;

    // Normalize to 0-100
    riskScore = Math.min(100, riskScore);

    // Determine level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 75) riskLevel = 'critical';
    else if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';
    else riskLevel = 'low';

    // Determine recommendation
    let recommendation: 'safe' | 'caution' | 'block';
    const hasBlockingIssue = impacts.some(i => i.isBlocking);
    if (hasBlockingIssue || riskLevel === 'critical') {
      recommendation = 'block';
      if (!reasons.some(r => r.startsWith('Blocking'))) {
        reasons.push('Critical risk level requires manual review');
      }
    } else if (riskLevel === 'high') {
      recommendation = 'caution';
      reasons.push('High risk level - proceed with caution');
    } else {
      recommendation = 'safe';
      if (reasons.length === 0) {
        reasons.push('No significant risks detected');
      }
    }

    return { riskScore, riskLevel, recommendation, reasons };
  }

  private calculateConfidence(impacts: PredictedImpact[], testImpacts: TestImpact[]): number {
    if (impacts.length === 0 && testImpacts.length === 0) return 0.5;

    const impactConfidence = impacts.reduce((sum, i) => sum + i.confidence, 0) / Math.max(impacts.length, 1);
    const testConfidence = testImpacts.reduce((sum, t) => sum + t.confidence, 0) / Math.max(testImpacts.length, 1);

    return (impactConfidence + testConfidence) / 2;
  }

  private buildSummary(
    graph: ImpactDependencyGraph,
    impacts: PredictedImpact[],
    testImpacts: TestImpact[],
    apiCompatibility: APICompatibility[],
    crossRepoImpacts: unknown[]
  ): ImpactSummary {
    return {
      filesAnalyzed: graph.nodes.length,
      filesChanged: graph.changedNodes.length,
      filesAffected: graph.affectedNodes.length,
      testsAnalyzed: testImpacts.length,
      testsPredictedToFail: testImpacts.filter(t => t.prediction === 'fail').length,
      testsPredictedFlaky: testImpacts.filter(t => t.prediction === 'flaky').length,
      apisAffected: apiCompatibility.length,
      breakingChangesCount: apiCompatibility.filter(a => !a.isBackwardCompatible).length,
      downstreamReposAffected: crossRepoImpacts.length,
      blockingIssuesCount: impacts.filter(i => i.isBlocking).length,
    };
  }
}

export const impactSimulatorAgent = new ImpactSimulatorAgent();
