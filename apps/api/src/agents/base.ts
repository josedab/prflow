import type { AgentContext, AgentResult } from '@prflow/core';
import { logger } from '../lib/logger.js';
import { callLLM as callLLMProvider, type LLMMessage, type LLMOptions, type LLMResponse, type LLMTool } from '../lib/llm.js';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;

  protected async measureExecution<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
    const startTime = Date.now();
    const result = await fn();
    return { result, latencyMs: Date.now() - startTime };
  }

  protected createSuccessResult(data: TOutput, latencyMs: number): AgentResult<TOutput> {
    return { success: true, data, latencyMs };
  }

  protected createErrorResult(error: string, latencyMs: number): AgentResult<TOutput> {
    logger.error({ agent: this.name, error }, 'Agent execution failed');
    return { success: false, error, latencyMs };
  }

  abstract execute(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>>;
}

// Re-export types for convenience
export type { LLMMessage, LLMOptions, LLMResponse, LLMTool };

// Re-export callLLM
export async function callLLM(
  messages: LLMMessage[],
  options?: LLMOptions
): Promise<LLMResponse> {
  return callLLMProvider(messages, options);
}

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
