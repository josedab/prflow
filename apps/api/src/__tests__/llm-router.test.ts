/**
 * @fileoverview Tests for Multi-Provider LLM Router Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMRouterService } from '../services/llm-router.js';

describe('LLMRouterService', () => {
  let router: LLMRouterService;

  beforeEach(() => {
    router = new LLMRouterService({
      strategy: 'quality-optimized',
      providers: [
        {
          name: 'openai',
          enabled: true,
          qualityScore: 0.9,
          costPerInputToken: 0.01,
          costPerOutputToken: 0.03,
        },
        {
          name: 'anthropic',
          enabled: true,
          qualityScore: 0.92,
          costPerInputToken: 0.008,
          costPerOutputToken: 0.024,
        },
        {
          name: 'mock',
          enabled: true,
          qualityScore: 0.1,
          costPerInputToken: 0,
          costPerOutputToken: 0,
        },
      ],
      rules: [
        {
          taskType: 'security-review',
          complexity: 'critical',
          preferredProvider: 'anthropic',
          fallbackProviders: ['openai'],
        },
        {
          taskType: 'formatting',
          complexity: 'simple',
          preferredProvider: 'mock',
          fallbackProviders: [],
        },
      ],
      defaultProvider: 'openai',
      fallbackToMock: true,
      maxRetries: 2,
    });
  });

  it('should route to preferred provider based on rules', () => {
    const decision = router.route('security-review', 'critical');
    expect(decision.selectedProvider).toBe('anthropic');
    expect(decision.reason).toContain('Rule match');
  });

  it('should fall back when preferred provider is unavailable', () => {
    const routerNoAnthropic = new LLMRouterService({
      strategy: 'quality-optimized',
      providers: [
        {
          name: 'openai',
          enabled: true,
          qualityScore: 0.9,
          costPerInputToken: 0.01,
          costPerOutputToken: 0.03,
        },
        {
          name: 'anthropic',
          enabled: false,
          qualityScore: 0.92,
          costPerInputToken: 0.008,
          costPerOutputToken: 0.024,
        },
        {
          name: 'mock',
          enabled: true,
          qualityScore: 0.1,
          costPerInputToken: 0,
          costPerOutputToken: 0,
        },
      ],
      rules: [
        {
          taskType: 'security-review',
          complexity: 'critical',
          preferredProvider: 'anthropic',
          fallbackProviders: ['openai'],
        },
      ],
      defaultProvider: 'openai',
      fallbackToMock: true,
      maxRetries: 2,
    });

    const decision = routerNoAnthropic.route('security-review', 'critical');
    expect(decision.selectedProvider).toBe('openai');
    expect(decision.reason).toContain('fallback');
  });

  it('should route using quality strategy when no rule matches', () => {
    const decision = router.route('unknown-task', 'moderate');
    // Anthropic has higher quality score (0.92 vs 0.9)
    expect(decision.selectedProvider).toBe('anthropic');
    expect(decision.reason).toContain('Strategy');
  });

  it('should route by cost when cost-optimized', () => {
    router.updateStrategy('cost-optimized');
    const decision = router.route('code-review', 'moderate');
    // Mock has 0 cost, but we filter it; anthropic (0.032) < openai (0.04)
    expect(['anthropic', 'openai']).toContain(decision.selectedProvider);
  });

  it('should record usage and update health', () => {
    router.recordUsage({
      provider: 'openai',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 1500,
      costUsd: 0.003,
      success: true,
      timestamp: new Date(),
    });

    const health = router.getProviderHealth();
    const openaiHealth = health.find((h) => h.provider === 'openai');
    expect(openaiHealth).toBeDefined();
    expect(openaiHealth!.consecutiveFailures).toBe(0);
  });

  it('should track usage summary', () => {
    router.recordUsage({
      provider: 'openai',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 1500,
      costUsd: 0.003,
      success: true,
      timestamp: new Date(),
    });

    const summary = router.getUsageSummary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalCostUsd).toBe(0.003);
    expect(summary.byProvider.openai).toBeDefined();
  });

  it('should return config', () => {
    const config = router.getConfig();
    expect(config.strategy).toBe('quality-optimized');
    expect(config.providers.length).toBe(3);
  });

  it('should build fallback chain', () => {
    const decision = router.route('security-review', 'critical');
    expect(decision.fallbackChain.length).toBeGreaterThan(0);
    expect(decision.fallbackChain).not.toContain(decision.selectedProvider);
  });
});
