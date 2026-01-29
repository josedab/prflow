import { BaseAgent } from './base.js';
import type { AgentContext, AgentResult } from '@prflow/core';
import {
  DebtDashboardInput,
  DebtDashboardResult,
  DebtItem,
  DebtDashboard,
  DebtCategory,
  DebtSeverity,
  DebtSummary,
  CategoryDebtSummary,
  DebtTrends,
  TrendDataPoint,
  DebtRecommendation,
  DebtActivity,
  DebtSprint,
  DebtPolicy,
  SkippedReview,
} from '@prflow/core/models';

// In-memory storage (replace with database in production)
const debtItems = new Map<string, DebtItem>();
const sprints = new Map<string, DebtSprint>();
const policies = new Map<string, DebtPolicy>();
const skippedReviews = new Map<string, SkippedReview>();
const activities: DebtActivity[] = [];

export class DebtDashboardAgent extends BaseAgent<DebtDashboardInput, DebtDashboardResult> {
  readonly name = 'debt-dashboard';
  readonly description = 'Review Debt Dashboard - Track and manage accumulated review debt';

  async execute(input: DebtDashboardInput, _context: AgentContext): Promise<AgentResult<DebtDashboardResult>> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });
    
    if (!result.success) {
      return this.createErrorResult(result.error || 'Unknown error', latencyMs);
    }
    
    return this.createSuccessResult(result, latencyMs);
  }

  private processOperation(input: DebtDashboardInput): DebtDashboardResult {
    switch (input.operation) {
      case 'get_dashboard':
        return this.getDashboard(input);
      case 'add_item':
        return this.addDebtItem(input);
      case 'update_item':
        return this.updateDebtItem(input);
      case 'resolve_item':
        return this.resolveDebtItem(input);
      case 'get_trends':
        return this.getTrends(input);
      case 'create_sprint':
        return this.createSprint(input);
      case 'update_sprint':
        return this.updateSprint(input);
      case 'configure_policy':
        return this.configurePolicy(input);
      case 'record_skip':
        return this.recordSkip(input);
      case 'get_recommendations':
        return this.getRecommendations(input);
      default:
        return { operation: input.operation, success: false, error: 'Unknown operation' };
    }
  }

  private getDashboard(input: DebtDashboardInput): DebtDashboardResult {
    const { repositoryId } = input;
    const repoItems = Array.from(debtItems.values()).filter(item => item.repositoryId === repositoryId);
    const dashboard = this.buildDashboard(repositoryId, repoItems);
    return { operation: 'get_dashboard', success: true, data: { dashboard } };
  }

  private buildDashboard(repositoryId: string, items: DebtItem[]): DebtDashboard {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
    const healthScore = this.calculateHealthScore(items);
    const previousHealthScore = this.calculatePreviousHealthScore(items, oneWeekAgo);
    
    const summary: DebtSummary = {
      totalItems: items.length,
      openItems: openItems.length,
      resolvedThisWeek: items.filter(i => i.resolvedAt && i.resolvedAt >= oneWeekAgo).length,
      resolvedThisMonth: items.filter(i => i.resolvedAt && i.resolvedAt >= oneMonthAgo).length,
      newThisWeek: items.filter(i => i.createdAt >= oneWeekAgo).length,
      newThisMonth: items.filter(i => i.createdAt >= oneMonthAgo).length,
      healthScore,
      healthTrend: healthScore > previousHealthScore ? 'improving' : healthScore < previousHealthScore ? 'degrading' : 'stable',
      totalEstimatedHours: this.sumEstimatedHours(openItems),
      criticalEstimatedHours: this.sumEstimatedHours(openItems.filter(i => i.severity === 'critical')),
      avgAgeOpenDays: this.calculateAvgAge(openItems),
      oldestOpenDays: this.calculateOldestAge(openItems),
    };
    
    const categories: DebtCategory[] = ['security', 'technical', 'testing', 'documentation', 'performance', 'accessibility', 'compliance', 'deprecated'];
    const byCategory = {} as Record<DebtCategory, CategoryDebtSummary>;
    for (const category of categories) {
      const categoryItems = items.filter(i => i.category === category);
      const openCategoryItems = categoryItems.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
      byCategory[category] = {
        category, total: categoryItems.length, open: openCategoryItems.length,
        critical: openCategoryItems.filter(i => i.severity === 'critical').length,
        high: openCategoryItems.filter(i => i.severity === 'high').length,
        medium: openCategoryItems.filter(i => i.severity === 'medium').length,
        low: openCategoryItems.filter(i => i.severity === 'low').length,
        trend: this.calculateCategoryTrend(categoryItems, oneWeekAgo),
        estimatedHours: this.sumEstimatedHours(openCategoryItems),
      };
    }
    
    const severities: DebtSeverity[] = ['critical', 'high', 'medium', 'low'];
    const bySeverity = {} as Record<DebtSeverity, number>;
    for (const severity of severities) { bySeverity[severity] = openItems.filter(i => i.severity === severity).length; }
    
    return {
      repositoryId, generatedAt: now, summary, byCategory, bySeverity,
      trends: this.buildTrends(items, 'month'),
      topPriority: this.prioritizeItems(openItems).slice(0, 10),
      recentActivity: activities.filter(a => items.some(i => i.id === a.debtItemId)).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 20),
      recommendations: this.generateRecommendations(items),
    };
  }

  private calculateHealthScore(items: DebtItem[]): number {
    if (items.length === 0) return 100;
    const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
    let score = 100;
    score -= openItems.filter(i => i.severity === 'critical').length * 15;
    score -= openItems.filter(i => i.severity === 'high').length * 8;
    score -= openItems.filter(i => i.severity === 'medium').length * 3;
    score -= openItems.filter(i => i.severity === 'low').length * 1;
    return Math.max(0, Math.min(100, score));
  }

  private calculatePreviousHealthScore(items: DebtItem[], asOf: Date): number {
    const itemsAsOf = items.filter(i => i.createdAt <= asOf);
    const openItemsAsOf = itemsAsOf.filter(i => !i.resolvedAt || i.resolvedAt > asOf);
    return this.calculateHealthScore(openItemsAsOf);
  }

  private sumEstimatedHours(items: DebtItem[]): number {
    const sizeHours: Record<string, number> = { trivial: 1, small: 4, medium: 16, large: 40, epic: 80 };
    return items.reduce((sum, item) => sum + (item.estimatedEffort.hours || sizeHours[item.estimatedEffort.size] || 8), 0);
  }

  private calculateAvgAge(items: DebtItem[]): number {
    if (items.length === 0) return 0;
    const now = new Date();
    return Math.round(items.reduce((sum, item) => sum + (now.getTime() - item.createdAt.getTime()) / (24 * 60 * 60 * 1000), 0) / items.length);
  }

  private calculateOldestAge(items: DebtItem[]): number {
    if (items.length === 0) return 0;
    const now = new Date();
    const oldest = items.reduce((oldest, item) => item.createdAt < oldest.createdAt ? item : oldest);
    return Math.round((now.getTime() - oldest.createdAt.getTime()) / (24 * 60 * 60 * 1000));
  }

  private calculateCategoryTrend(items: DebtItem[], since: Date): 'improving' | 'stable' | 'worsening' {
    const newItems = items.filter(i => i.createdAt >= since).length;
    const resolvedItems = items.filter(i => i.resolvedAt && i.resolvedAt >= since).length;
    if (resolvedItems > newItems * 1.2) return 'improving';
    if (newItems > resolvedItems * 1.2) return 'worsening';
    return 'stable';
  }

  private prioritizeItems(items: DebtItem[]): DebtItem[] {
    const severityWeight: Record<DebtSeverity, number> = { critical: 100, high: 50, medium: 20, low: 5 };
    return [...items].sort((a, b) => {
      const scoreA = severityWeight[a.severity] + (a.impact.securityRisk === 'critical' ? 50 : 0);
      const scoreB = severityWeight[b.severity] + (b.impact.securityRisk === 'critical' ? 50 : 0);
      return scoreB - scoreA;
    });
  }

  private generateRecommendations(items: DebtItem[]): DebtRecommendation[] {
    const recommendations: DebtRecommendation[] = [];
    const openItems = items.filter(i => i.status === 'open' || i.status === 'acknowledged' || i.status === 'in_progress');
    
    const quickWins = openItems.filter(i => i.estimatedEffort.size === 'trivial' || i.estimatedEffort.size === 'small');
    if (quickWins.length > 0) {
      recommendations.push({
        id: 'quick-wins', type: 'quick_win', title: 'Quick Wins Sprint',
        description: `${quickWins.length} items can be resolved with minimal effort.`,
        items: quickWins.slice(0, 10).map(i => i.id),
        estimatedEffort: this.sumEstimatedHours(quickWins.slice(0, 10)),
        expectedImpact: `+${Math.min(quickWins.length * 2, 15)} health score points`, priority: 8,
      });
    }
    
    const highImpact = openItems.filter(i => i.severity === 'critical' || i.impact.securityRisk === 'critical');
    if (highImpact.length > 0) {
      recommendations.push({
        id: 'high-impact', type: 'high_impact', title: 'Critical Items',
        description: `${highImpact.length} critical items require immediate attention.`,
        items: highImpact.map(i => i.id), estimatedEffort: this.sumEstimatedHours(highImpact),
        expectedImpact: 'Significant risk reduction', priority: 10,
      });
    }
    
    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  private buildTrends(items: DebtItem[], period: 'week' | 'month' | 'quarter'): DebtTrends {
    const now = new Date();
    const periods = period === 'week' ? 7 : period === 'month' ? 30 : 90;
    const dataPoints: TrendDataPoint[] = [];
    
    for (let i = periods; i >= 0; i -= Math.ceil(periods / 10)) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const openAsOf = items.filter(item => item.createdAt <= date && (!item.resolvedAt || item.resolvedAt > date));
      dataPoints.push({ date, openItems: openAsOf.length, newItems: 0, resolvedItems: 0, healthScore: this.calculateHealthScore(openAsOf) });
    }
    
    return {
      period, dataPoints,
      netChange: (dataPoints[dataPoints.length - 1]?.openItems || 0) - (dataPoints[0]?.openItems || 0),
      velocity: 0, accumulation: 0,
    };
  }

  private addDebtItem(input: DebtDashboardInput): DebtDashboardResult {
    const { item, repositoryId } = input;
    if (!item) return { operation: 'add_item', success: false, error: 'No item provided' };
    
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
    return { operation: 'add_item', success: true, data: { item: newItem } };
  }

  private updateDebtItem(input: DebtDashboardInput): DebtDashboardResult {
    const { itemId, item } = input;
    if (!itemId) return { operation: 'update_item', success: false, error: 'No item ID provided' };
    const existingItem = debtItems.get(itemId);
    if (!existingItem) return { operation: 'update_item', success: false, error: 'Item not found' };
    
    const updatedItem: DebtItem = { ...existingItem, ...item, id: existingItem.id, repositoryId: existingItem.repositoryId, createdAt: existingItem.createdAt, updatedAt: new Date() };
    debtItems.set(itemId, updatedItem);
    activities.push({ id: `activity-${Date.now()}`, type: 'updated', debtItemId: itemId, debtItemTitle: updatedItem.title, actor: 'system', timestamp: new Date() });
    return { operation: 'update_item', success: true, data: { item: updatedItem } };
  }

  private resolveDebtItem(input: DebtDashboardInput): DebtDashboardResult {
    const { itemId, item } = input;
    if (!itemId) return { operation: 'resolve_item', success: false, error: 'No item ID provided' };
    const existingItem = debtItems.get(itemId);
    if (!existingItem) return { operation: 'resolve_item', success: false, error: 'Item not found' };
    
    const now = new Date();
    const resolvedItem: DebtItem = { ...existingItem, status: 'resolved', resolvedAt: now, resolvedBy: item?.resolvedBy || 'system', resolutionPR: item?.resolutionPR, updatedAt: now };
    debtItems.set(itemId, resolvedItem);
    activities.push({ id: `activity-${Date.now()}`, type: 'resolved', debtItemId: itemId, debtItemTitle: resolvedItem.title, actor: resolvedItem.resolvedBy || 'system', timestamp: now });
    return { operation: 'resolve_item', success: true, data: { item: resolvedItem } };
  }

  private getTrends(input: DebtDashboardInput): DebtDashboardResult {
    const items = Array.from(debtItems.values()).filter(i => i.repositoryId === input.repositoryId);
    return { operation: 'get_trends', success: true, data: { trends: this.buildTrends(items, 'month') } };
  }

  private createSprint(input: DebtDashboardInput): DebtDashboardResult {
    const { sprint, repositoryId } = input;
    if (!sprint) return { operation: 'create_sprint', success: false, error: 'No sprint data provided' };
    
    const newSprint: DebtSprint = {
      id: `sprint-${Date.now()}`, repositoryId, name: sprint.name || 'Debt Paydown Sprint', description: sprint.description || '',
      startDate: sprint.startDate || new Date(), endDate: sprint.endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'planned', targetItems: sprint.targetItems || [], targetCategories: sprint.targetCategories, targetHealthScore: sprint.targetHealthScore,
      completedItems: [], progress: 0, lead: sprint.lead || 'unassigned', participants: sprint.participants || [],
    };
    sprints.set(newSprint.id, newSprint);
    return { operation: 'create_sprint', success: true, data: { sprint: newSprint } };
  }

  private updateSprint(input: DebtDashboardInput): DebtDashboardResult {
    const { sprintId, sprint } = input;
    if (!sprintId) return { operation: 'update_sprint', success: false, error: 'No sprint ID provided' };
    const existingSprint = sprints.get(sprintId);
    if (!existingSprint) return { operation: 'update_sprint', success: false, error: 'Sprint not found' };
    
    const updatedSprint: DebtSprint = { ...existingSprint, ...sprint, id: existingSprint.id, repositoryId: existingSprint.repositoryId };
    if (updatedSprint.targetItems.length > 0) {
      updatedSprint.progress = Math.round((updatedSprint.completedItems.length / updatedSprint.targetItems.length) * 100);
    }
    sprints.set(sprintId, updatedSprint);
    return { operation: 'update_sprint', success: true, data: { sprint: updatedSprint } };
  }

  private configurePolicy(input: DebtDashboardInput): DebtDashboardResult {
    const { policy, repositoryId } = input;
    if (!policy) return { operation: 'configure_policy', success: false, error: 'No policy data provided' };
    
    const policyId = policy.id || `policy-${Date.now()}`;
    const newPolicy: DebtPolicy = {
      id: policyId, repositoryId, name: policy.name || 'Default Debt Policy', enabled: policy.enabled ?? true,
      thresholds: policy.thresholds || { maxOpenCritical: 0, maxOpenHigh: 5, maxTotalOpen: 50, maxAgeOpenDays: 90, minHealthScore: 70 },
      actions: policy.actions || { blockMerge: false, notifySlack: true, notifyEmail: false, createIssue: true, escalateAfterDays: 14 },
      excludePaths: policy.excludePaths || [], excludeTags: policy.excludeTags || [],
    };
    policies.set(policyId, newPolicy);
    return { operation: 'configure_policy', success: true, data: { policy: newPolicy } };
  }

  private recordSkip(input: DebtDashboardInput): DebtDashboardResult {
    const { skip, repositoryId } = input;
    if (!skip) return { operation: 'record_skip', success: false, error: 'No skip data provided' };
    
    const newSkip: SkippedReview = {
      id: `skip-${Date.now()}`, repositoryId, prNumber: skip.prNumber || 0, skipType: skip.skipType || 'full_review',
      reason: skip.reason || '', reasonCategory: skip.reasonCategory || 'other', skippedBy: skip.skippedBy || 'unknown',
      skippedAt: new Date(), approvedBy: skip.approvedBy, riskLevel: skip.riskLevel || 'medium', filesAffected: skip.filesAffected || 0,
      followUpRequired: skip.followUpRequired ?? true, followUpBy: skip.followUpBy, followUpCompleted: false, resultingDebtItems: [],
    };
    skippedReviews.set(newSkip.id, newSkip);
    return { operation: 'record_skip', success: true, data: { items: [] } };
  }

  private getRecommendations(input: DebtDashboardInput): DebtDashboardResult {
    const items = Array.from(debtItems.values()).filter(i => i.repositoryId === input.repositoryId);
    return { operation: 'get_recommendations', success: true, data: { recommendations: this.generateRecommendations(items) } };
  }
}
