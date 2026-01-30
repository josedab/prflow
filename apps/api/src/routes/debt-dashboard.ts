import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DebtItem, DebtSprint, DebtPolicy, SkippedReview, DebtDashboard, DebtTrends, DebtRecommendation, DebtActivity, CategoryDebtSummary, DebtCategory } from '@prflow/core/models';
import { NotFoundError } from '../lib/errors.js';

// In-memory storage (database schema available for future migration)
const debtItems = new Map<string, DebtItem>();
const sprints = new Map<string, DebtSprint>();
const policies = new Map<string, DebtPolicy>();
const skippedReviews = new Map<string, SkippedReview>();
const activities: DebtActivity[] = [];

function calculateHealthScore(items: DebtItem[]): number {
  if (items.length === 0) return 100;
  const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
  let score = 100;
  score -= openItems.filter(i => i.severity === 'critical').length * 15;
  score -= openItems.filter(i => i.severity === 'high').length * 8;
  score -= openItems.filter(i => i.severity === 'medium').length * 3;
  score -= openItems.filter(i => i.severity === 'low').length * 1;
  return Math.max(0, Math.min(100, score));
}

function sumEstimatedHours(items: DebtItem[]): number {
  const sizeHours: Record<string, number> = { trivial: 1, small: 4, medium: 16, large: 40, epic: 80 };
  return items.reduce((sum, item) => sum + (item.estimatedEffort.hours || sizeHours[item.estimatedEffort.size] || 8), 0);
}

export async function debtDashboardRoutes(app: FastifyInstance) {
  // Get full dashboard
  app.get('/debt/dashboard/:repositoryId', async (
    request: FastifyRequest<{ Params: { repositoryId: string } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const items = Array.from(debtItems.values()).filter(i => i.repositoryId === repositoryId);
    const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
    const healthScore = calculateHealthScore(items);
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const dashboard: DebtDashboard = {
      repositoryId,
      generatedAt: now,
      summary: {
        totalItems: items.length,
        openItems: openItems.length,
        resolvedThisWeek: items.filter(i => i.resolvedAt && i.resolvedAt >= oneWeekAgo).length,
        resolvedThisMonth: items.filter(i => i.resolvedAt && i.resolvedAt >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).length,
        newThisWeek: items.filter(i => i.createdAt >= oneWeekAgo).length,
        newThisMonth: items.filter(i => i.createdAt >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)).length,
        healthScore,
        healthTrend: 'stable',
        totalEstimatedHours: sumEstimatedHours(openItems),
        criticalEstimatedHours: sumEstimatedHours(openItems.filter(i => i.severity === 'critical')),
        avgAgeOpenDays: 0,
        oldestOpenDays: 0,
      },
      byCategory: {} as Record<DebtCategory, CategoryDebtSummary>,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      trends: { period: 'month', dataPoints: [], netChange: 0, velocity: 0, accumulation: 0 },
      topPriority: openItems.slice(0, 10),
      recentActivity: activities.slice(0, 20),
      recommendations: [],
    };
    
    return reply.send({ success: true, data: { dashboard } });
  });

  // Add a debt item
  app.post('/debt/items', async (
    request: FastifyRequest<{ Body: { repositoryId: string; item: Partial<DebtItem> } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId, item } = request.body;
    const now = new Date();
    const newItem: DebtItem = {
      id: `debt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      repositoryId,
      category: item.category || 'technical',
      severity: item.severity || 'medium',
      status: 'open',
      source: item.source || { type: 'manual_entry', createdBy: 'system' },
      title: item.title || 'Untitled Debt Item',
      description: item.description || '',
      file: item.file, line: item.line, codeSnippet: item.codeSnippet,
      impact: item.impact || { affectedFiles: 1, affectedLines: 0, userExperience: 'none', securityRisk: 'none', performanceImpact: 'none', maintainabilityImpact: 'minor', businessCriticality: 'medium' },
      suggestedFix: item.suggestedFix,
      estimatedEffort: item.estimatedEffort || { size: 'medium', complexity: 'medium', risk: 'low' },
      assignee: item.assignee, createdAt: now, updatedAt: now,
      relatedPRs: item.relatedPRs || [], relatedIssues: item.relatedIssues || [], tags: item.tags || [],
    };
    debtItems.set(newItem.id, newItem);
    activities.push({ id: `activity-${Date.now()}`, type: 'created', debtItemId: newItem.id, debtItemTitle: newItem.title, actor: newItem.source.createdBy, timestamp: now });
    return reply.status(201).send({ success: true, data: { item: newItem } });
  });

  // Update a debt item
  app.put('/debt/items/:itemId', async (
    request: FastifyRequest<{ Params: { itemId: string }; Body: { repositoryId: string; item: Partial<DebtItem> } }>,
    reply: FastifyReply
  ) => {
    const { itemId } = request.params;
    const { item } = request.body;
    const existingItem = debtItems.get(itemId);
    if (!existingItem) throw new NotFoundError('DebtItem', itemId);
    const updatedItem: DebtItem = { ...existingItem, ...item, id: existingItem.id, repositoryId: existingItem.repositoryId, createdAt: existingItem.createdAt, updatedAt: new Date() };
    debtItems.set(itemId, updatedItem);
    return reply.send({ success: true, data: { item: updatedItem } });
  });

  // Resolve a debt item
  app.post('/debt/items/:itemId/resolve', async (
    request: FastifyRequest<{ Params: { itemId: string }; Body: { repositoryId: string; resolvedBy?: string; resolutionPR?: number } }>,
    reply: FastifyReply
  ) => {
    const { itemId } = request.params;
    const { resolvedBy, resolutionPR } = request.body;
    const existingItem = debtItems.get(itemId);
    if (!existingItem) throw new NotFoundError('DebtItem', itemId);
    const now = new Date();
    const resolvedItem: DebtItem = { ...existingItem, status: 'resolved', resolvedAt: now, resolvedBy: resolvedBy || 'system', resolutionPR, updatedAt: now };
    debtItems.set(itemId, resolvedItem);
    activities.push({ id: `activity-${Date.now()}`, type: 'resolved', debtItemId: itemId, debtItemTitle: resolvedItem.title, actor: resolvedItem.resolvedBy || 'system', timestamp: now });
    return reply.send({ success: true, data: { item: resolvedItem } });
  });

  // Get trends
  app.get('/debt/trends/:repositoryId', async (
    request: FastifyRequest<{ Params: { repositoryId: string } }>,
    reply: FastifyReply
  ) => {
    // repositoryId available for future filtering: request.params.repositoryId
    const trends: DebtTrends = { period: 'month', dataPoints: [], netChange: 0, velocity: 0, accumulation: 0 };
    return reply.send({ success: true, data: { trends } });
  });

  // Get recommendations
  app.get('/debt/recommendations/:repositoryId', async (
    request: FastifyRequest<{ Params: { repositoryId: string } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const items = Array.from(debtItems.values()).filter(i => i.repositoryId === repositoryId);
    const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged');
    const recommendations: DebtRecommendation[] = [];
    
    const quickWins = openItems.filter(i => i.estimatedEffort.size === 'trivial' || i.estimatedEffort.size === 'small');
    if (quickWins.length > 0) {
      recommendations.push({
        id: 'quick-wins', type: 'quick_win', title: 'Quick Wins Sprint',
        description: `${quickWins.length} items can be resolved with minimal effort.`,
        items: quickWins.slice(0, 10).map(i => i.id),
        estimatedEffort: sumEstimatedHours(quickWins.slice(0, 10)),
        expectedImpact: 'Immediate health score improvement', priority: 8,
      });
    }
    return reply.send({ success: true, data: { recommendations } });
  });

  // Sprint management
  app.post('/debt/sprints', async (
    request: FastifyRequest<{ Body: { repositoryId: string; sprint: Partial<DebtSprint> } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId, sprint } = request.body;
    const newSprint: DebtSprint = {
      id: `sprint-${Date.now()}`, repositoryId, name: sprint.name || 'Debt Paydown Sprint', description: sprint.description || '',
      startDate: sprint.startDate || new Date(), endDate: sprint.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'planned', targetItems: sprint.targetItems || [], targetCategories: sprint.targetCategories, targetHealthScore: sprint.targetHealthScore,
      completedItems: [], progress: 0, lead: sprint.lead || 'unassigned', participants: sprint.participants || [],
    };
    sprints.set(newSprint.id, newSprint);
    return reply.status(201).send({ success: true, data: { sprint: newSprint } });
  });

  // Policy management
  app.post('/debt/policies', async (
    request: FastifyRequest<{ Body: { repositoryId: string; policy: Partial<DebtPolicy> } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId, policy } = request.body;
    const policyId = policy.id || `policy-${Date.now()}`;
    const newPolicy: DebtPolicy = {
      id: policyId, repositoryId, name: policy.name || 'Default Debt Policy', enabled: policy.enabled ?? true,
      thresholds: policy.thresholds || { maxOpenCritical: 0, maxOpenHigh: 5, maxTotalOpen: 50, maxAgeOpenDays: 90, minHealthScore: 70 },
      actions: policy.actions || { blockMerge: false, notifySlack: true, notifyEmail: false, createIssue: true, escalateAfterDays: 14 },
      excludePaths: policy.excludePaths || [], excludeTags: policy.excludeTags || [],
    };
    policies.set(policyId, newPolicy);
    return reply.status(201).send({ success: true, data: { policy: newPolicy } });
  });

  // Record skipped review
  app.post('/debt/skipped-reviews', async (
    request: FastifyRequest<{ Body: { repositoryId: string; skip: Partial<SkippedReview> } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId, skip } = request.body;
    const newSkip: SkippedReview = {
      id: `skip-${Date.now()}`, repositoryId, prNumber: skip.prNumber || 0, skipType: skip.skipType || 'full_review',
      reason: skip.reason || '', reasonCategory: skip.reasonCategory || 'other', skippedBy: skip.skippedBy || 'unknown',
      skippedAt: new Date(), approvedBy: skip.approvedBy, riskLevel: skip.riskLevel || 'medium', filesAffected: skip.filesAffected || 0,
      followUpRequired: skip.followUpRequired ?? true, followUpBy: skip.followUpBy, followUpCompleted: false, resultingDebtItems: [],
    };
    skippedReviews.set(newSkip.id, newSkip);
    return reply.status(201).send({ success: true, data: { skip: newSkip } });
  });
}
