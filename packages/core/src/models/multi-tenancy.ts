/**
 * @fileoverview Types for Hosted SaaS & Multi-Tenancy
 *
 * Tenant isolation, rate limiting, API key management, and usage tracking.
 */

export type TenantPlan = 'free' | 'pro' | 'team' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  settings: TenantSettings;
  usage: TenantUsage;
}

export interface TenantSettings {
  maxReviewsPerMonth: number;
  maxRepositories: number;
  maxUsers: number;
  allowedLLMProviders: string[];
  customDomain?: string;
  ssoEnabled: boolean;
  retentionDays: number;
}

export interface TenantUsage {
  reviewsThisMonth: number;
  repositoriesConnected: number;
  usersActive: number;
  llmTokensUsed: number;
  storageUsedMB: number;
  lastReviewAt?: Date;
}

export interface APIKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  rateLimit: RateLimitConfig;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  enabled: boolean;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  reset: Date;
  retryAfter?: number;
}

export interface UsageBillingRecord {
  id: string;
  tenantId: string;
  period: { start: Date; end: Date };
  reviewCount: number;
  llmTokenCount: number;
  storageGB: number;
  totalCostCents: number;
  status: 'pending' | 'invoiced' | 'paid' | 'overdue';
}

export const PLAN_LIMITS: Record<TenantPlan, TenantSettings> = {
  free: {
    maxReviewsPerMonth: 50,
    maxRepositories: 3,
    maxUsers: 5,
    allowedLLMProviders: ['mock'],
    ssoEnabled: false,
    retentionDays: 30,
  },
  pro: {
    maxReviewsPerMonth: 500,
    maxRepositories: 20,
    maxUsers: 25,
    allowedLLMProviders: ['openai', 'anthropic'],
    ssoEnabled: false,
    retentionDays: 90,
  },
  team: {
    maxReviewsPerMonth: 5000,
    maxRepositories: 100,
    maxUsers: 100,
    allowedLLMProviders: ['openai', 'anthropic', 'google-ai'],
    ssoEnabled: true,
    retentionDays: 365,
  },
  enterprise: {
    maxReviewsPerMonth: -1,
    maxRepositories: -1,
    maxUsers: -1,
    allowedLLMProviders: ['openai', 'anthropic', 'google-ai', 'ollama'],
    ssoEnabled: true,
    retentionDays: -1,
  },
};
