import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceCalibrationService } from '../services/confidence-calibration.js';
import type { PredictionOutcome } from '@prflow/core';

describe('ConfidenceCalibrationService', () => {
  let service: ConfidenceCalibrationService;

  const makeOutcome = (overrides: Partial<PredictionOutcome> = {}): PredictionOutcome => ({
    id: `o-${Date.now()}-${Math.random()}`,
    workflowId: 'wf-1',
    repositoryId: 'repo-1',
    organizationId: 'org-1',
    rule: 'security/sql-injection',
    severity: 'high',
    predictedConfidence: 0.8,
    actualOutcome: 'true_positive',
    outcomeSource: 'feedback',
    predictedAt: new Date(),
    resolvedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    service = new ConfidenceCalibrationService();
  });

  it('should record outcomes and generate calibration curve', () => {
    for (let i = 0; i < 20; i++) {
      service.recordOutcome(
        makeOutcome({
          predictedConfidence: i / 20,
          actualOutcome: i > 10 ? 'true_positive' : 'false_positive',
        })
      );
    }

    const curve = service.generateCalibrationCurve('org-1');
    expect(curve.bins.length).toBe(10);
    expect(curve.totalSamples).toBe(20);
    expect(curve.expectedCalibrationError).toBeGreaterThanOrEqual(0);
  });

  it('should fit Platt scaling parameters', () => {
    for (let i = 0; i < 15; i++) {
      service.recordOutcome(
        makeOutcome({
          predictedConfidence: 0.5 + Math.random() * 0.3,
          actualOutcome: Math.random() > 0.3 ? 'true_positive' : 'false_positive',
        })
      );
    }

    const params = service.fitPlattScaling('org-1');
    expect(params.sampleCount).toBe(15);
    expect(typeof params.a).toBe('number');
    expect(typeof params.b).toBe('number');
  });

  it('should calibrate raw confidence scores', () => {
    for (let i = 0; i < 15; i++) {
      service.recordOutcome(
        makeOutcome({ predictedConfidence: 0.7, actualOutcome: 'true_positive' })
      );
    }
    service.fitPlattScaling('org-1');

    const calibrated = service.calibrate('org-1', 0.7);
    expect(calibrated).toBeGreaterThan(0);
    expect(calibrated).toBeLessThanOrEqual(1);
  });

  it('should return identity calibration when no params fitted', () => {
    const calibrated = service.calibrate('org-unknown', 0.65);
    expect(calibrated).toBe(0.65);
  });

  it('should generate confidence badges', () => {
    for (let i = 0; i < 10; i++) {
      service.recordOutcome(
        makeOutcome({ rule: 'style/console-log', actualOutcome: 'true_positive' })
      );
    }

    const badge = service.getConfidenceBadge('org-1', 'style/console-log');
    expect(badge.label).toBe('Reliable');
    expect(badge.color).toBe('green');
    expect(badge.sampleSize).toBe(10);
  });

  it('should generate badge for new rules with insufficient data', () => {
    const badge = service.getConfidenceBadge('org-1', 'new-rule');
    expect(badge.label).toBe('New');
    expect(badge.color).toBe('yellow');
  });

  it('should generate full report with recommendations', () => {
    // Mix of good and bad outcomes
    for (let i = 0; i < 10; i++) {
      service.recordOutcome(makeOutcome({ rule: 'good-rule', actualOutcome: 'true_positive' }));
    }
    for (let i = 0; i < 10; i++) {
      service.recordOutcome(makeOutcome({ rule: 'bad-rule', actualOutcome: 'false_positive' }));
    }

    const report = service.generateReport('org-1');
    expect(report.overall.totalSamples).toBe(20);
    expect(report.plattParams).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('should track outcome stats', () => {
    service.recordOutcome(makeOutcome({ actualOutcome: 'true_positive' }));
    service.recordOutcome(makeOutcome({ actualOutcome: 'false_positive' }));

    const stats = service.getOutcomeStats('org-1');
    expect(stats.total).toBe(2);
    expect(stats.byOutcome['true_positive']).toBe(1);
    expect(stats.byOutcome['false_positive']).toBe(1);
  });
});
