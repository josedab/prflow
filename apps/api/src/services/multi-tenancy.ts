/**
 * @fileoverview Multi-Tenancy & SaaS Service
 *
 * Tenant isolation, API key management, rate limiting, and usage tracking.
 */

import { logger } from '../lib/logger.js';
import type { Tenant, TenantPlan, APIKey, RateLimitStatus, UsageBillingRecord } from '@prflow/core';
import { PLAN_LIMITS } from '@prflow/core';
import { createHash, randomBytes } from 'crypto';

export class MultiTenancyService {
  private tenants = new Map<string, Tenant>();
  private apiKeys = new Map<string, APIKey>();
  private rateLimitCounters = new Map<string, { count: number; windowStart: number }>();
  private billingRecords: UsageBillingRecord[] = [];

  createTenant(params: { name: string; slug: string; ownerId: string; plan?: TenantPlan }): Tenant {
    const plan = params.plan || 'free';
    const tenant: Tenant = {
      id: `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      slug: params.slug,
      plan,
      ownerId: params.ownerId,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: { ...PLAN_LIMITS[plan] },
      usage: {
        reviewsThisMonth: 0,
        repositoriesConnected: 0,
        usersActive: 0,
        llmTokensUsed: 0,
        storageUsedMB: 0,
      },
    };

    this.tenants.set(tenant.id, tenant);
    logger.info({ tenantId: tenant.id, plan }, 'Tenant created');
    return tenant;
  }

  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  listTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  updatePlan(tenantId: string, plan: TenantPlan): Tenant | null {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return null;
    tenant.plan = plan;
    tenant.settings = { ...PLAN_LIMITS[plan] };
    tenant.updatedAt = new Date();
    logger.info({ tenantId, plan }, 'Tenant plan updated');
    return tenant;
  }

  /**
   * Generate a new API key for a tenant.
   */
  generateAPIKey(
    tenantId: string,
    name: string,
    permissions: string[] = ['read', 'write']
  ): { key: string; apiKey: APIKey } {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const rawKey = `prflow_${randomBytes(24).toString('hex')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey: APIKey = {
      id: `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      name,
      keyPrefix,
      keyHash,
      permissions,
      rateLimit: {
        requestsPerMinute: tenant.plan === 'enterprise' ? 1000 : tenant.plan === 'team' ? 300 : 60,
        requestsPerHour: tenant.plan === 'enterprise' ? 10000 : tenant.plan === 'team' ? 3000 : 500,
        requestsPerDay:
          tenant.plan === 'enterprise' ? 100000 : tenant.plan === 'team' ? 30000 : 1000,
        burstLimit: tenant.plan === 'enterprise' ? 50 : 10,
      },
      createdAt: new Date(),
      enabled: true,
    };

    this.apiKeys.set(apiKey.id, apiKey);
    logger.info({ tenantId, keyId: apiKey.id, keyPrefix }, 'API key generated');
    return { key: rawKey, apiKey };
  }

  /**
   * Validate an API key and return tenant info.
   */
  validateAPIKey(rawKey: string): { valid: boolean; tenant?: Tenant; apiKey?: APIKey } {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = Array.from(this.apiKeys.values()).find((k) => k.keyHash === keyHash);

    if (!apiKey || !apiKey.enabled) return { valid: false };
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { valid: false };

    const tenant = this.tenants.get(apiKey.tenantId);
    if (!tenant) return { valid: false };

    apiKey.lastUsedAt = new Date();
    return { valid: true, tenant, apiKey };
  }

  revokeAPIKey(keyId: string): boolean {
    const key = this.apiKeys.get(keyId);
    if (!key) return false;
    key.enabled = false;
    return true;
  }

  listAPIKeys(tenantId: string): APIKey[] {
    return Array.from(this.apiKeys.values())
      .filter((k) => k.tenantId === tenantId)
      .map((k) => ({ ...k, keyHash: '***' }));
  }

  /**
   * Check rate limit for an API key.
   */
  checkRateLimit(keyId: string): RateLimitStatus {
    const apiKey = this.apiKeys.get(keyId);
    if (!apiKey) return { remaining: 0, limit: 0, reset: new Date(), retryAfter: 60 };

    const windowKey = `${keyId}:${Math.floor(Date.now() / 60000)}`;
    const counter = this.rateLimitCounters.get(windowKey) || { count: 0, windowStart: Date.now() };

    counter.count++;
    this.rateLimitCounters.set(windowKey, counter);

    const remaining = Math.max(0, apiKey.rateLimit.requestsPerMinute - counter.count);
    const reset = new Date(counter.windowStart + 60000);

    return {
      remaining,
      limit: apiKey.rateLimit.requestsPerMinute,
      reset,
      retryAfter: remaining === 0 ? Math.ceil((reset.getTime() - Date.now()) / 1000) : undefined,
    };
  }

  /**
   * Track usage for a tenant.
   */
  trackUsage(tenantId: string, type: 'review' | 'llm_tokens' | 'storage', amount: number): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;

    switch (type) {
      case 'review':
        tenant.usage.reviewsThisMonth += amount;
        tenant.usage.lastReviewAt = new Date();
        if (
          tenant.settings.maxReviewsPerMonth !== -1 &&
          tenant.usage.reviewsThisMonth > tenant.settings.maxReviewsPerMonth
        ) {
          logger.warn(
            {
              tenantId,
              usage: tenant.usage.reviewsThisMonth,
              limit: tenant.settings.maxReviewsPerMonth,
            },
            'Tenant review limit exceeded'
          );
          return false;
        }
        break;
      case 'llm_tokens':
        tenant.usage.llmTokensUsed += amount;
        break;
      case 'storage':
        tenant.usage.storageUsedMB += amount;
        break;
    }
    return true;
  }

  /**
   * Check if a tenant has capacity for a review.
   */
  hasCapacity(tenantId: string): boolean {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) return false;
    if (tenant.settings.maxReviewsPerMonth === -1) return true;
    return tenant.usage.reviewsThisMonth < tenant.settings.maxReviewsPerMonth;
  }

  generateBillingRecord(tenantId: string, start: Date, end: Date): UsageBillingRecord {
    const tenant = this.tenants.get(tenantId);
    const record: UsageBillingRecord = {
      id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      period: { start, end },
      reviewCount: tenant?.usage.reviewsThisMonth ?? 0,
      llmTokenCount: tenant?.usage.llmTokensUsed ?? 0,
      storageGB: (tenant?.usage.storageUsedMB ?? 0) / 1024,
      totalCostCents: 0,
      status: 'pending',
    };

    // Simple pricing: $0.10 per review for pro, $0.05 for team
    const perReviewCents = tenant?.plan === 'pro' ? 10 : tenant?.plan === 'team' ? 5 : 0;
    record.totalCostCents = record.reviewCount * perReviewCents;

    this.billingRecords.push(record);
    return record;
  }
}

export const multiTenancyService = new MultiTenancyService();
