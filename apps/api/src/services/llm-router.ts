/**
 * @fileoverview Multi-Provider LLM Router Service
 *
 * Smart routing engine that selects the optimal LLM provider based on
 * task complexity, cost constraints, latency requirements, and provider health.
 */

import { logger } from '../lib/logger.js';
import type {
  LLMProviderName,
  LLMTaskComplexity,
  LLMRoutingStrategy,
  LLMProviderConfig,
  LLMRoutingConfig,
  LLMUsageMetrics,
  LLMProviderHealth,
  LLMRoutingDecision,
} from '@prflow/core';

const DEFAULT_PROVIDER_COSTS: Record<string, { input: number; output: number }> = {
  openai: { input: 0.01, output: 0.03 },
  anthropic: { input: 0.008, output: 0.024 },
  google: { input: 0.00025, output: 0.0005 },
  ollama: { input: 0, output: 0 },
  mock: { input: 0, output: 0 },
};

export class LLMRouterService {
  private config: LLMRoutingConfig;
  private healthMap = new Map<LLMProviderName, LLMProviderHealth>();
  private usageHistory: LLMUsageMetrics[] = [];
  private readonly maxHistorySize = 1000;

  constructor(config?: Partial<LLMRoutingConfig>) {
    this.config = this.buildConfig(config);
    this.initializeHealth();
  }

  private buildConfig(partial?: Partial<LLMRoutingConfig>): LLMRoutingConfig {
    const providers = this.detectProviders();
    const strategy =
      (process.env.LLM_ROUTING_STRATEGY as LLMRoutingStrategy) || 'quality-optimized';

    return {
      strategy: partial?.strategy || strategy,
      providers: partial?.providers || providers,
      rules: partial?.rules || this.getDefaultRules(),
      defaultProvider:
        partial?.defaultProvider ||
        (providers.find((p) => p.enabled && p.name !== 'mock')?.name ?? 'mock'),
      fallbackToMock: partial?.fallbackToMock ?? true,
      maxRetries: partial?.maxRetries ?? 2,
    };
  }

  private detectProviders(): LLMProviderConfig[] {
    const providers: LLMProviderConfig[] = [];

    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        defaultModel: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        enabled: true,
        costPerInputToken: DEFAULT_PROVIDER_COSTS.openai.input,
        costPerOutputToken: DEFAULT_PROVIDER_COSTS.openai.output,
        qualityScore: 0.9,
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
        enabled: true,
        costPerInputToken: DEFAULT_PROVIDER_COSTS.anthropic.input,
        costPerOutputToken: DEFAULT_PROVIDER_COSTS.anthropic.output,
        qualityScore: 0.92,
      });
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      providers.push({
        name: 'google',
        apiKey: process.env.GOOGLE_AI_API_KEY,
        defaultModel: process.env.GOOGLE_AI_MODEL || 'gemini-pro',
        enabled: true,
        costPerInputToken: DEFAULT_PROVIDER_COSTS.google.input,
        costPerOutputToken: DEFAULT_PROVIDER_COSTS.google.output,
        qualityScore: 0.85,
      });
    }

    if (process.env.OLLAMA_BASE_URL) {
      providers.push({
        name: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL,
        defaultModel: process.env.OLLAMA_MODEL || 'llama3',
        enabled: true,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        qualityScore: 0.7,
      });
    }

    providers.push({
      name: 'mock',
      enabled: true,
      costPerInputToken: 0,
      costPerOutputToken: 0,
      qualityScore: 0.1,
    });

    return providers;
  }

  private getDefaultRules() {
    return [
      {
        taskType: 'security-review',
        complexity: 'critical' as LLMTaskComplexity,
        preferredProvider: 'anthropic' as LLMProviderName,
        fallbackProviders: ['openai' as LLMProviderName],
      },
      {
        taskType: 'code-review',
        complexity: 'complex' as LLMTaskComplexity,
        preferredProvider: 'openai' as LLMProviderName,
        fallbackProviders: ['anthropic' as LLMProviderName],
      },
      {
        taskType: 'test-generation',
        complexity: 'moderate' as LLMTaskComplexity,
        preferredProvider: 'openai' as LLMProviderName,
        fallbackProviders: ['anthropic' as LLMProviderName, 'google' as LLMProviderName],
      },
      {
        taskType: 'documentation',
        complexity: 'simple' as LLMTaskComplexity,
        preferredProvider: 'google' as LLMProviderName,
        fallbackProviders: ['openai' as LLMProviderName],
      },
      {
        taskType: 'formatting',
        complexity: 'simple' as LLMTaskComplexity,
        preferredProvider: 'ollama' as LLMProviderName,
        fallbackProviders: ['google' as LLMProviderName, 'mock' as LLMProviderName],
      },
    ];
  }

  private initializeHealth(): void {
    for (const provider of this.config.providers) {
      this.healthMap.set(provider.name, {
        provider: provider.name,
        available: provider.enabled,
        avgLatencyMs: provider.avgLatencyMs || 2000,
        errorRate: 0,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Route a task to the optimal provider based on strategy, complexity, and health.
   */
  route(taskType: string, complexity: LLMTaskComplexity = 'moderate'): LLMRoutingDecision {
    const matchingRule = this.config.rules.find(
      (r) => r.taskType === taskType && r.complexity === complexity
    );

    let candidates = this.config.providers
      .filter((p) => p.enabled)
      .filter((p) => {
        const health = this.healthMap.get(p.name);
        return health && health.available && health.consecutiveFailures < 3;
      });

    if (candidates.length === 0) {
      candidates = this.config.providers.filter((p) => p.name === 'mock');
    }

    let selected: LLMProviderConfig;
    let reason: string;

    if (matchingRule) {
      const preferred = candidates.find((c) => c.name === matchingRule.preferredProvider);
      if (preferred) {
        selected = preferred;
        reason = `Rule match: ${taskType}/${complexity} → ${preferred.name}`;
      } else {
        const fallback = matchingRule.fallbackProviders
          .map((name) => candidates.find((c) => c.name === name))
          .find(Boolean);
        selected = fallback || candidates[0];
        reason = `Rule fallback: preferred ${matchingRule.preferredProvider} unavailable`;
      }
    } else {
      selected = this.selectByStrategy(candidates);
      reason = `Strategy: ${this.config.strategy}`;
    }

    const fallbackChain = this.buildFallbackChain(selected.name, candidates);

    return {
      selectedProvider: selected.name,
      reason,
      estimatedCost: (selected.costPerInputToken || 0) * 2 + (selected.costPerOutputToken || 0),
      estimatedLatencyMs: this.healthMap.get(selected.name)?.avgLatencyMs || 2000,
      fallbackChain,
    };
  }

  private selectByStrategy(candidates: LLMProviderConfig[]): LLMProviderConfig {
    const nonMock = candidates.filter((c) => c.name !== 'mock');
    const pool = nonMock.length > 0 ? nonMock : candidates;

    switch (this.config.strategy) {
      case 'cost-optimized':
        return pool.sort(
          (a, b) =>
            (a.costPerInputToken || 0) +
            (a.costPerOutputToken || 0) -
            ((b.costPerInputToken || 0) + (b.costPerOutputToken || 0))
        )[0];

      case 'latency-optimized':
        return pool.sort((a, b) => {
          const aLatency = this.healthMap.get(a.name)?.avgLatencyMs || 9999;
          const bLatency = this.healthMap.get(b.name)?.avgLatencyMs || 9999;
          return aLatency - bLatency;
        })[0];

      case 'air-gapped':
        return pool.find((c) => c.name === 'ollama') || pool[0];

      case 'quality-optimized':
      default:
        return pool.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
    }
  }

  private buildFallbackChain(
    primary: LLMProviderName,
    candidates: LLMProviderConfig[]
  ): LLMProviderName[] {
    return candidates
      .filter((c) => c.name !== primary)
      .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
      .map((c) => c.name);
  }

  /**
   * Record usage metrics and update provider health.
   */
  recordUsage(metrics: LLMUsageMetrics): void {
    this.usageHistory.push(metrics);
    if (this.usageHistory.length > this.maxHistorySize) {
      this.usageHistory = this.usageHistory.slice(-this.maxHistorySize);
    }

    const health = this.healthMap.get(metrics.provider);
    if (health) {
      if (metrics.success) {
        health.consecutiveFailures = 0;
        health.avgLatencyMs = health.avgLatencyMs * 0.9 + metrics.latencyMs * 0.1;
      } else {
        health.consecutiveFailures++;
        if (health.consecutiveFailures >= 3) {
          health.available = false;
          logger.warn(
            { provider: metrics.provider },
            'Provider marked unavailable after consecutive failures'
          );
          setTimeout(() => {
            health.available = true;
            health.consecutiveFailures = 0;
            logger.info({ provider: metrics.provider }, 'Provider re-enabled after cooldown');
          }, 60_000);
        }
      }

      const recent = this.usageHistory.filter((u) => u.provider === metrics.provider).slice(-50);
      health.errorRate = recent.filter((u) => !u.success).length / recent.length;
      health.lastChecked = new Date();
    }
  }

  getProviderHealth(): LLMProviderHealth[] {
    return Array.from(this.healthMap.values());
  }

  getUsageSummary(since?: Date): {
    totalCalls: number;
    totalCostUsd: number;
    byProvider: Record<
      string,
      { calls: number; costUsd: number; avgLatencyMs: number; errorRate: number }
    >;
  } {
    const cutoff = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = this.usageHistory.filter((u) => u.timestamp >= cutoff);

    const byProvider: Record<
      string,
      { calls: number; costUsd: number; totalLatency: number; errors: number }
    > = {};

    for (const u of recent) {
      if (!byProvider[u.provider]) {
        byProvider[u.provider] = { calls: 0, costUsd: 0, totalLatency: 0, errors: 0 };
      }
      byProvider[u.provider].calls++;
      byProvider[u.provider].costUsd += u.costUsd;
      byProvider[u.provider].totalLatency += u.latencyMs;
      if (!u.success) byProvider[u.provider].errors++;
    }

    const summary: Record<
      string,
      { calls: number; costUsd: number; avgLatencyMs: number; errorRate: number }
    > = {};
    for (const [provider, data] of Object.entries(byProvider)) {
      summary[provider] = {
        calls: data.calls,
        costUsd: Math.round(data.costUsd * 10000) / 10000,
        avgLatencyMs: Math.round(data.totalLatency / data.calls),
        errorRate: Math.round((data.errors / data.calls) * 100) / 100,
      };
    }

    return {
      totalCalls: recent.length,
      totalCostUsd: Math.round(recent.reduce((sum, u) => sum + u.costUsd, 0) * 10000) / 10000,
      byProvider: summary,
    };
  }

  getConfig(): LLMRoutingConfig {
    return { ...this.config };
  }

  updateStrategy(strategy: LLMRoutingStrategy): void {
    this.config.strategy = strategy;
    logger.info({ strategy }, 'LLM routing strategy updated');
  }
}

export const llmRouterService = new LLMRouterService();
