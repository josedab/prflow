import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

// ============================================
// Audit Event Types
// ============================================

export type AuditEventType =
  // Authentication
  | 'user.login'
  | 'user.logout'
  | 'user.token_refresh'
  // Repository
  | 'repository.installed'
  | 'repository.uninstalled'
  | 'repository.settings_updated'
  // Rules
  | 'rule.created'
  | 'rule.updated'
  | 'rule.deleted'
  | 'rule.toggled'
  // Workflows
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  // Reviews
  | 'review.comment_posted'
  | 'review.comment_dismissed'
  | 'review.comment_resolved'
  // Tests
  | 'test.generated'
  | 'test.accepted'
  | 'test.rejected'
  // Merge
  | 'merge.queued'
  | 'merge.completed'
  | 'merge.failed'
  // Admin
  | 'admin.settings_changed'
  | 'admin.team_member_added'
  | 'admin.team_member_removed'
  | 'admin.subscription_changed';

export interface AuditEventData {
  // Common fields
  ipAddress?: string;
  userAgent?: string;
  // Event-specific data
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  actorId?: string;
  actorLogin?: string;
  organizationId?: string;
  repositoryId?: string;
  resourceType?: string;
  resourceId?: string;
  data: AuditEventData;
  success: boolean;
  errorMessage?: string;
}

// ============================================
// Audit Logger Service
// ============================================

export class AuditLogger {
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      await db.analyticsEvent.create({
        data: {
          repositoryId: entry.repositoryId || 'system',
          eventType: `audit.${entry.eventType}`,
          eventData: JSON.parse(JSON.stringify({
            actorId: entry.actorId,
            actorLogin: entry.actorLogin,
            organizationId: entry.organizationId,
            resourceType: entry.resourceType,
            resourceId: entry.resourceId,
            success: entry.success,
            errorMessage: entry.errorMessage,
            ...entry.data,
          })),
        },
      });

      logger.debug(
        {
          eventType: entry.eventType,
          actorLogin: entry.actorLogin,
          resourceId: entry.resourceId,
        },
        'Audit event logged'
      );
    } catch (error) {
      logger.error({ error, entry }, 'Failed to log audit event');
    }
  }

  // Convenience methods for common events
  async logLogin(userId: string, userLogin: string, data?: AuditEventData): Promise<void> {
    await this.log({
      eventType: 'user.login',
      actorId: userId,
      actorLogin: userLogin,
      success: true,
      data: data || {},
    });
  }

  async logSettingsChange(
    actorLogin: string,
    repositoryId: string,
    changes: Record<string, { from: unknown; to: unknown }>
  ): Promise<void> {
    await this.log({
      eventType: 'repository.settings_updated',
      actorLogin,
      repositoryId,
      resourceType: 'repository_settings',
      resourceId: repositoryId,
      success: true,
      data: { changes },
    });
  }

  async logRuleChange(
    actorLogin: string,
    repositoryId: string,
    action: 'created' | 'updated' | 'deleted' | 'toggled',
    ruleId: string,
    ruleName?: string
  ): Promise<void> {
    await this.log({
      eventType: `rule.${action}` as AuditEventType,
      actorLogin,
      repositoryId,
      resourceType: 'rule',
      resourceId: ruleId,
      success: true,
      data: { ruleName },
    });
  }

  async logWorkflowEvent(
    repositoryId: string,
    workflowId: string,
    event: 'started' | 'completed' | 'failed',
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: `workflow.${event}` as AuditEventType,
      repositoryId,
      resourceType: 'workflow',
      resourceId: workflowId,
      success: event !== 'failed',
      data: data || {},
    });
  }

  async logMergeEvent(
    repositoryId: string,
    prNumber: number,
    event: 'queued' | 'completed' | 'failed',
    data?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: `merge.${event}` as AuditEventType,
      repositoryId,
      resourceType: 'pull_request',
      resourceId: String(prNumber),
      success: event !== 'failed',
      data: data || {},
    });
  }

  // Query methods
  async getAuditLog(options: {
    repositoryId?: string;
    organizationId?: string;
    actorLogin?: string;
    eventTypes?: AuditEventType[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options.repositoryId) {
      where.repositoryId = options.repositoryId;
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      where.eventType = { in: options.eventTypes.map((t) => `audit.${t}`) };
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        (where.createdAt as Record<string, unknown>).gte = options.startDate;
      }
      if (options.endDate) {
        (where.createdAt as Record<string, unknown>).lte = options.endDate;
      }
    }

    const [events, total] = await Promise.all([
      db.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 100,
        skip: options.offset || 0,
      }),
      db.analyticsEvent.count({ where }),
    ]);

    const entries: AuditLogEntry[] = events.map((e) => {
      const data = e.eventData as Record<string, unknown>;
      return {
        id: e.id,
        timestamp: e.createdAt,
        eventType: e.eventType.replace('audit.', '') as AuditEventType,
        actorId: data.actorId as string | undefined,
        actorLogin: data.actorLogin as string | undefined,
        organizationId: data.organizationId as string | undefined,
        repositoryId: e.repositoryId,
        resourceType: data.resourceType as string | undefined,
        resourceId: data.resourceId as string | undefined,
        data: data,
        success: data.success as boolean,
        errorMessage: data.errorMessage as string | undefined,
      };
    });

    return { entries, total };
  }

  async exportAuditLog(options: {
    repositoryId: string;
    startDate: Date;
    endDate: Date;
    format?: 'json' | 'csv';
  }): Promise<string> {
    const { entries } = await this.getAuditLog({
      repositoryId: options.repositoryId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 10000, // Max export size
    });

    if (options.format === 'csv') {
      const headers = [
        'timestamp',
        'eventType',
        'actorLogin',
        'resourceType',
        'resourceId',
        'success',
      ];
      const rows = entries.map((e) =>
        [
          e.timestamp.toISOString(),
          e.eventType,
          e.actorLogin || '',
          e.resourceType || '',
          e.resourceId || '',
          e.success,
        ].join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    return JSON.stringify(entries, null, 2);
  }
}

export const auditLogger = new AuditLogger();
