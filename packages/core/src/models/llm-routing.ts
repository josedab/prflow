/**
 * @fileoverview Types for Multi-Provider LLM Orchestration
 *
 * Defines interfaces for smart routing, cost optimization, and provider management.
 */

import { z } from 'zod';

export const LLMProviderNameSchema = z.enum(['openai', 'anthropic', 'google', 'ollama', 'mock']);
export type LLMProviderName = z.infer<typeof LLMProviderNameSchema>;

export const LLMTaskComplexitySchema = z.enum(['simple', 'moderate', 'complex', 'critical']);
export type LLMTaskComplexity = z.infer<typeof LLMTaskComplexitySchema>;

export const LLMRoutingStrategySchema = z.enum([
  'cost-optimized',
  'quality-optimized',
  'latency-optimized',
  'air-gapped',
]);
export type LLMRoutingStrategy = z.infer<typeof LLMRoutingStrategySchema>;

export interface LLMProviderConfig {
  name: LLMProviderName;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  maxTokens?: number;
  enabled: boolean;
  /** Cost per 1K input tokens in USD */
  costPerInputToken?: number;
  /** Cost per 1K output tokens in USD */
  costPerOutputToken?: number;
  /** Average latency in ms */
  avgLatencyMs?: number;
  /** Quality score 0-1 based on task results */
  qualityScore?: number;
}

export interface LLMRoutingRule {
  taskType: string;
  complexity: LLMTaskComplexity;
  preferredProvider: LLMProviderName;
  fallbackProviders: LLMProviderName[];
  maxCostPerCall?: number;
  maxLatencyMs?: number;
}

export interface LLMRoutingConfig {
  strategy: LLMRoutingStrategy;
  providers: LLMProviderConfig[];
  rules: LLMRoutingRule[];
  defaultProvider: LLMProviderName;
  fallbackToMock: boolean;
  maxRetries: number;
}

export interface LLMUsageMetrics {
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  success: boolean;
  taskType?: string;
  timestamp: Date;
}

export interface LLMProviderHealth {
  provider: LLMProviderName;
  available: boolean;
  avgLatencyMs: number;
  errorRate: number;
  lastChecked: Date;
  consecutiveFailures: number;
}

export interface LLMRoutingDecision {
  selectedProvider: LLMProviderName;
  reason: string;
  estimatedCost: number;
  estimatedLatencyMs: number;
  fallbackChain: LLMProviderName[];
}
