import type { BaseAgent } from './base.js';
import { AnalyzerAgent } from './analyzer.js';
import { ReviewerAgent } from './reviewer.js';
import { TestGeneratorAgent } from './test-generator.js';
import { DocumentationAgent } from './documentation.js';
import { SynthesisAgent } from './synthesis.js';
import type {
  PRAnalysis,
  ReviewResult,
  TestGenerationResult,
  DocUpdateResult,
  PRSynthesis,
  PullRequest,
  PRDiff,
} from '@prflow/core';

/**
 * Agent type identifiers for factory creation
 */
export type AgentType = 'analyzer' | 'reviewer' | 'test-generator' | 'documentation' | 'synthesis';

/**
 * Input/Output type mappings for each agent
 */
export interface AgentInputOutput {
  analyzer: {
    input: { pr: PullRequest; diff: PRDiff };
    output: PRAnalysis;
  };
  reviewer: {
    input: { pr: PullRequest; diff: PRDiff; analysis: PRAnalysis };
    output: ReviewResult;
  };
  'test-generator': {
    input: { pr: PullRequest; diff: PRDiff; analysis: PRAnalysis };
    output: TestGenerationResult;
  };
  documentation: {
    input: { pr: PullRequest; diff: PRDiff; analysis: PRAnalysis };
    output: DocUpdateResult;
  };
  synthesis: {
    input: {
      pr: PullRequest;
      analysis: PRAnalysis;
      review: ReviewResult;
      tests: TestGenerationResult;
      docs: DocUpdateResult;
    };
    output: PRSynthesis;
  };
}

/**
 * Factory for creating agent instances
 * Enables dependency injection and easier testing
 */
export class AgentFactory {
  private customAgents = new Map<AgentType, () => BaseAgent<unknown, unknown>>();

  /**
   * Register a custom agent implementation for testing or overriding
   */
  register<T extends AgentType>(
    type: T,
    factory: () => BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>
  ): void {
    this.customAgents.set(type, factory as () => BaseAgent<unknown, unknown>);
  }

  /**
   * Clear all registered custom agents
   */
  clear(): void {
    this.customAgents.clear();
  }

  /**
   * Create an agent instance by type
   */
  create<T extends AgentType>(type: T): BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']> {
    const customFactory = this.customAgents.get(type);
    if (customFactory) {
      return customFactory() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
    }

    switch (type) {
      case 'analyzer':
        return new AnalyzerAgent() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
      case 'reviewer':
        return new ReviewerAgent() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
      case 'test-generator':
        return new TestGeneratorAgent() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
      case 'documentation':
        return new DocumentationAgent() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
      case 'synthesis':
        return new SynthesisAgent() as BaseAgent<AgentInputOutput[T]['input'], AgentInputOutput[T]['output']>;
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  /**
   * Create an analyzer agent
   */
  createAnalyzer(): BaseAgent<AgentInputOutput['analyzer']['input'], PRAnalysis> {
    return this.create('analyzer');
  }

  /**
   * Create a reviewer agent
   */
  createReviewer(): BaseAgent<AgentInputOutput['reviewer']['input'], ReviewResult> {
    return this.create('reviewer');
  }

  /**
   * Create a test generator agent
   */
  createTestGenerator(): BaseAgent<AgentInputOutput['test-generator']['input'], TestGenerationResult> {
    return this.create('test-generator');
  }

  /**
   * Create a documentation agent
   */
  createDocumentation(): BaseAgent<AgentInputOutput['documentation']['input'], DocUpdateResult> {
    return this.create('documentation');
  }

  /**
   * Create a synthesis agent
   */
  createSynthesis(): BaseAgent<AgentInputOutput['synthesis']['input'], PRSynthesis> {
    return this.create('synthesis');
  }
}

/**
 * Default singleton factory instance
 */
export const agentFactory = new AgentFactory();
