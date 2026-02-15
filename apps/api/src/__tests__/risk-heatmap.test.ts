/**
 * @fileoverview Tests for Risk Heatmap Service
 */

import { describe, it, expect } from 'vitest';
import { RiskHeatmapService } from '../services/risk-heatmap.js';
import type { PRDiff, PRAnalysis } from '@prflow/core';

describe('RiskHeatmapService', () => {
  const service = new RiskHeatmapService();

  const mockDiff: PRDiff = {
    files: [
      {
        filename: 'src/auth.ts',
        status: 'modified',
        additions: 30,
        deletions: 5,
        changes: 35,
        patch:
          '@@ -1,5 +1,35 @@\n+const secret = "hardcoded-key";\n+eval(userInput);\n+// TODO: fix this later\n',
      },
      {
        filename: 'src/utils.ts',
        status: 'modified',
        additions: 10,
        deletions: 2,
        changes: 12,
        patch: '@@ -1,2 +1,12 @@\n+export function helper() {\n+  return true;\n+}\n',
      },
    ],
    totalAdditions: 40,
    totalDeletions: 7,
    totalChanges: 47,
  };

  const mockAnalysis: PRAnalysis = {
    prNumber: 1,
    type: 'feature',
    riskLevel: 'medium',
    changes: { filesModified: 2, linesAdded: 40, linesRemoved: 7 },
    semanticChanges: [],
    impactRadius: {
      directDependents: 3,
      transitiveDependents: 10,
      affectedFiles: [],
      testCoverage: 60,
    },
    risks: ['Security: hardcoded credentials detected'],
    suggestedReviewers: [],
    analyzedAt: new Date(),
    latencyMs: 100,
  };

  it('should generate a risk heatmap', () => {
    const heatmap = service.generateHeatmap('wf-1', 1, mockDiff, mockAnalysis);

    expect(heatmap.workflowId).toBe('wf-1');
    expect(heatmap.prNumber).toBe(1);
    expect(heatmap.files.length).toBe(2);
    expect(heatmap.overallRisk).toBeGreaterThan(0);
    expect(heatmap.riskLevel).toBeDefined();
  });

  it('should identify hotspots in risky files', () => {
    const heatmap = service.generateHeatmap('wf-1', 1, mockDiff, mockAnalysis);
    // auth.ts has hardcoded secrets and eval — should have hotspots
    const authFile = heatmap.files.find((f) => f.file === 'src/auth.ts');
    expect(authFile).toBeDefined();
    expect(authFile!.overallRisk).toBeGreaterThan(0.3);
  });

  it('should compute quality gate', () => {
    const heatmap = service.generateHeatmap('wf-1', 1, mockDiff, mockAnalysis);

    expect(heatmap.qualityGate).toBeDefined();
    expect(heatmap.qualityGate.threshold).toBe(0.6);
    expect(typeof heatmap.qualityGate.passed).toBe('boolean');
    expect(heatmap.qualityGate.factors.length).toBe(4);
  });

  it('should predict incident probability', () => {
    const heatmap = service.generateHeatmap('wf-1', 1, mockDiff, mockAnalysis);
    expect(heatmap.predictedIncidentProbability).toBeGreaterThanOrEqual(0);
    expect(heatmap.predictedIncidentProbability).toBeLessThanOrEqual(1);
  });

  it('should handle empty diff', () => {
    const emptyDiff: PRDiff = { files: [], totalAdditions: 0, totalDeletions: 0, totalChanges: 0 };
    const heatmap = service.generateHeatmap('wf-1', 1, emptyDiff, mockAnalysis);
    expect(heatmap.overallRisk).toBe(0);
    expect(heatmap.riskLevel).toBe('low');
  });
});
