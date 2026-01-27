import type {
  PullRequest,
  PRDiff,
  PRAnalysis,
  ReviewResult,
  TestGenerationResult,
  DocUpdateResult,
  PRSynthesis,
} from '../models/index.js';

// ============================================
// Base Agent Interface
// ============================================

export interface AgentContext {
  pr: PullRequest;
  diff: PRDiff;
  repositoryId: string;
  installationId: number;
}

export interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  latencyMs: number;
}

export interface Agent<TInput, TOutput> {
  readonly name: string;
  readonly description: string;
  execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

// ============================================
// Specific Agent Interfaces
// ============================================

export interface AnalyzerAgentInput {
  pr: PullRequest;
  diff: PRDiff;
}

export interface AnalyzerAgent extends Agent<AnalyzerAgentInput, PRAnalysis> {
  readonly name: 'analyzer';
}

export interface ReviewerAgentInput {
  pr: PullRequest;
  diff: PRDiff;
  analysis: PRAnalysis;
}

export interface ReviewerAgent extends Agent<ReviewerAgentInput, ReviewResult> {
  readonly name: 'reviewer';
}

export interface TestAgentInput {
  pr: PullRequest;
  diff: PRDiff;
  analysis: PRAnalysis;
  testPatterns?: TestPatternInfo[];
}

export interface TestPatternInfo {
  framework: string;
  pattern: string;
  example?: string;
}

export interface TestAgent extends Agent<TestAgentInput, TestGenerationResult> {
  readonly name: 'test';
}

export interface DocAgentInput {
  pr: PullRequest;
  diff: PRDiff;
  analysis: PRAnalysis;
}

export interface DocAgent extends Agent<DocAgentInput, DocUpdateResult> {
  readonly name: 'doc';
}

export interface SynthesisAgentInput {
  pr: PullRequest;
  analysis: PRAnalysis;
  review: ReviewResult;
  tests: TestGenerationResult;
  docs: DocUpdateResult;
}

export interface SynthesisAgent extends Agent<SynthesisAgentInput, PRSynthesis> {
  readonly name: 'synthesis';
}

// ============================================
// Agent Registry
// ============================================

export type AgentType = 'analyzer' | 'reviewer' | 'test' | 'doc' | 'synthesis';

export interface AgentRegistry {
  analyzer: AnalyzerAgent;
  reviewer: ReviewerAgent;
  test: TestAgent;
  doc: DocAgent;
  synthesis: SynthesisAgent;
}

// ============================================
// Agent Tool Interface
// ============================================

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(input: TInput): Promise<TOutput>;
}

// ============================================
// Orchestrator Interface
// ============================================

export interface OrchestratorConfig {
  enableReview: boolean;
  enableTestGeneration: boolean;
  enableDocUpdates: boolean;
  severityThreshold: 'critical' | 'high' | 'medium' | 'low' | 'nitpick';
  timeout: number;
}

export interface Orchestrator {
  processPR(
    pr: PullRequest,
    diff: PRDiff,
    config: OrchestratorConfig
  ): Promise<{
    analysis: PRAnalysis;
    review?: ReviewResult;
    tests?: TestGenerationResult;
    docs?: DocUpdateResult;
    synthesis: PRSynthesis;
  }>;
}
