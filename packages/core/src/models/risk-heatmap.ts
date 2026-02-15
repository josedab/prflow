/**
 * @fileoverview Types for PR Risk Heatmap & Predictive Quality Gate
 */

export interface FileRiskScore {
  file: string;
  overallRisk: number;
  lineRisks: Array<{
    startLine: number;
    endLine: number;
    riskScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  }>;
  factors: {
    complexityScore: number;
    changeFrequency: number;
    bugHistory: number;
    testCoverage: number;
    authorExperience: number;
  };
}

export interface PRRiskHeatmap {
  workflowId: string;
  prNumber: number;
  overallRisk: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  files: FileRiskScore[];
  hotspots: Array<{
    file: string;
    line: number;
    riskScore: number;
    reason: string;
  }>;
  qualityGate: {
    passed: boolean;
    score: number;
    threshold: number;
    factors: Array<{
      name: string;
      score: number;
      weight: number;
      status: 'pass' | 'warn' | 'fail';
    }>;
  };
  predictedIncidentProbability: number;
  calculatedAt: Date;
}
