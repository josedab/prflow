/**
 * @fileoverview Tests for Feedback Learning Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackLearningService } from '../services/feedback-learning.js';

describe('FeedbackLearningService', () => {
  let service: FeedbackLearningService;
  const orgId = 'org-test';

  beforeEach(() => {
    service = new FeedbackLearningService();
  });

  it('should record feedback and update confidence', () => {
    service.recordFeedback({
      id: 'fb-1',
      organizationId: orgId,
      repositoryId: 'repo-1',
      workflowId: 'wf-1',
      commentId: 'c-1',
      rule: 'no-console',
      category: 'style',
      severity: 'low',
      action: 'accepted',
      fileType: '.ts',
      language: 'typescript',
      timestamp: new Date(),
    });

    const confidence = service.getConfidence(orgId, 'no-console');
    expect(confidence).toBeGreaterThan(0.5); // accepted increases confidence
  });

  it('should lower confidence on dismissals', () => {
    for (let i = 0; i < 5; i++) {
      service.recordFeedback({
        id: `fb-${i}`,
        organizationId: orgId,
        repositoryId: 'repo-1',
        workflowId: 'wf-1',
        commentId: `c-${i}`,
        rule: 'no-eval',
        category: 'security',
        severity: 'high',
        action: 'dismissed',
        fileType: '.ts',
        language: 'typescript',
        timestamp: new Date(),
      });
    }

    const confidence = service.getConfidence(orgId, 'no-eval');
    expect(confidence).toBeLessThan(0.3); // many dismissals = low confidence
  });

  it('should suppress rules with low confidence', () => {
    for (let i = 0; i < 6; i++) {
      service.recordFeedback({
        id: `fb-${i}`,
        organizationId: orgId,
        repositoryId: 'repo-1',
        workflowId: 'wf-1',
        commentId: `c-${i}`,
        rule: 'trivial-rule',
        category: 'style',
        severity: 'nitpick',
        action: 'false_positive',
        fileType: '.ts',
        language: 'typescript',
        timestamp: new Date(),
      });
    }

    expect(service.shouldSuppress(orgId, 'trivial-rule')).toBe(true);
  });

  it('should return learning stats', () => {
    service.recordFeedback({
      id: 'fb-1',
      organizationId: orgId,
      repositoryId: 'repo-1',
      workflowId: 'wf-1',
      commentId: 'c-1',
      rule: 'rule-a',
      category: 'bug',
      severity: 'high',
      action: 'accepted',
      fileType: '.ts',
      language: 'typescript',
      timestamp: new Date(),
    });

    const stats = service.getStats(orgId);
    expect(stats.totalFeedback).toBe(1);
    expect(stats.byAction.accepted).toBe(1);
    expect(stats.acceptanceRate).toBe(1);
  });

  it('should return adaptive config for org', () => {
    const config = service.getAdaptiveConfig(orgId);
    expect(config.organizationId).toBe(orgId);
    expect(config.suppressedRules).toEqual([]);
  });

  it('should return confidence scores for org', () => {
    service.recordFeedback({
      id: 'fb-1',
      organizationId: orgId,
      repositoryId: 'repo-1',
      workflowId: 'wf-1',
      commentId: 'c-1',
      rule: 'rule-x',
      category: 'style',
      severity: 'low',
      action: 'accepted',
      fileType: '.ts',
      language: 'typescript',
      timestamp: new Date(),
    });

    const scores = service.getConfidenceScores(orgId);
    expect(scores.length).toBe(1);
    expect(scores[0].rule).toBe('rule-x');
  });
});
