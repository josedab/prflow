/**
 * @fileoverview Base agent class and utilities for PRFlow's multi-agent system.
 *
 * This module provides the foundational abstractions for all PRFlow agents:
 * - BaseAgent abstract class that all agents extend
 * - LLM integration utilities for AI-powered analysis
 * - Common prompt building functions
 *
 * @module agents/base
 */

import type { AgentContext, AgentResult } from '@prflow/core';
import { logger } from '../lib/logger.js';
import { callLLM as callLLMProvider, type LLMMessage, type LLMOptions, type LLMResponse, type LLMTool } from '../lib/llm.js';

/**
 * Abstract base class for all PRFlow agents.
 *
 * Provides common functionality for agent execution including:
 * - Execution timing/metrics
 * - Standardized result formatting
 * - Error handling and logging
 *
 * @typeParam TInput - The input type the agent accepts
 * @typeParam TOutput - The output type the agent produces
 *
 * @example
 * ```typescript
 * class MyAgent extends BaseAgent<MyInput, MyOutput> {
 *   readonly name = 'my-agent';
 *   readonly description = 'Does something useful';
 *
 *   async execute(input: MyInput, context: AgentContext) {
 *     const { result, latencyMs } = await this.measureExecution(async () => {
 *       return this.doWork(input);
 *     });
 *     return this.createSuccessResult(result, latencyMs);
 *   }
 * }
 * ```
 */
export abstract class BaseAgent<TInput, TOutput> {
  /** Unique identifier for the agent, used in logging and metrics */
  abstract readonly name: string;

  /** Human-readable description of what the agent does */
  abstract readonly description: string;

  /**
   * Wraps an async function to measure its execution time.
   *
   * @typeParam T - The return type of the wrapped function
   * @param fn - The async function to execute and measure
   * @returns Object containing the result and execution time in milliseconds
   *
   * @example
   * ```typescript
   * const { result, latencyMs } = await this.measureExecution(async () => {
   *   return await expensiveOperation();
   * });
   * console.log(`Operation took ${latencyMs}ms`);
   * ```
   */
  protected async measureExecution<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
    const startTime = Date.now();
    const result = await fn();
    return { result, latencyMs: Date.now() - startTime };
  }

  /**
   * Creates a standardized success result object.
   *
   * @param data - The output data from the agent
   * @param latencyMs - Execution time in milliseconds
   * @returns AgentResult with success=true
   */
  protected createSuccessResult(data: TOutput, latencyMs: number): AgentResult<TOutput> {
    return { success: true, data, latencyMs };
  }

  /**
   * Creates a standardized error result object and logs the error.
   *
   * @param error - Human-readable error message
   * @param latencyMs - Execution time before failure in milliseconds
   * @returns AgentResult with success=false
   */
  protected createErrorResult(error: string, latencyMs: number): AgentResult<TOutput> {
    logger.error({ agent: this.name, error }, 'Agent execution failed');
    return { success: false, error, latencyMs };
  }

  /**
   * Main execution method that must be implemented by all agents.
   *
   * @param input - The input data for the agent to process
   * @param context - Execution context including repository info, config, etc.
   * @returns Promise resolving to the agent's result
   */
  abstract execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

// Re-export types for convenience
export type { LLMMessage, LLMOptions, LLMResponse, LLMTool };

/**
 * Sends messages to the configured LLM provider for completion.
 *
 * This is a convenience wrapper around the LLM provider that handles
 * configuration and error handling.
 *
 * @param messages - Array of messages forming the conversation
 * @param options - Optional LLM configuration (temperature, maxTokens, etc.)
 * @returns Promise resolving to the LLM's response
 *
 * @example
 * ```typescript
 * const response = await callLLM([
 *   { role: 'system', content: 'You are a code reviewer.' },
 *   { role: 'user', content: 'Review this code: ...' }
 * ], { temperature: 0.3 });
 * console.log(response.content);
 * ```
 */
export async function callLLM(
  messages: LLMMessage[],
  options?: LLMOptions
): Promise<LLMResponse> {
  return callLLMProvider(messages, options);
}

/**
 * Builds a standardized system prompt for an agent.
 *
 * Creates a consistent prompt format that includes:
 * - Agent role identification
 * - Standard guidelines for code review feedback
 * - Context-specific information
 *
 * @param agentType - The type of agent (e.g., "analyzer", "reviewer")
 * @param context - Additional context to include in the prompt
 * @returns Formatted system prompt string
 *
 * @example
 * ```typescript
 * const prompt = buildSystemPrompt('code reviewer', `
 *   Language: TypeScript
 *   File: src/utils.ts
 * `);
 * ```
 */
export function buildSystemPrompt(agentType: string, context: string): string {
  const basePrompt = `You are PRFlow's ${agentType} agent, an AI assistant specialized in analyzing pull requests.

Your role is to provide actionable, accurate feedback that helps developers improve their code.

Guidelines:
- Be concise and specific
- Prioritize issues by severity
- Provide code suggestions when possible
- Explain the "why" behind your feedback
- Respect the project's existing patterns and conventions

Context about the repository and PR:
${context}`;

  return basePrompt;
}
