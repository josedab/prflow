/**
 * @fileoverview Impact Simulator Models
 * 
 * Types and interfaces for simulating the downstream effects
 * of PR changes before merge.
 * 
 * @module models/impact-simulator
 */

import { z } from 'zod';

/**
 * Types of impacts that can be detected
 */
export const ImpactTypeSchema = z.enum([
  'test_failure',
  'type_error',
  'api_breaking',
  'dependency_conflict',
  'performance_regression',
  'security_issue',
  'config_incompatible',
  'schema_migration',
  'downstream_repo',
]);
export type ImpactType = z.infer<typeof ImpactTypeSchema>;

/**
 * Severity of the predicted impact
 */
export const ImpactSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type ImpactSeverity = z.infer<typeof ImpactSeveritySchema>;

/**
 * A single predicted impact
 */
export interface PredictedImpact {
  /** Unique ID */
  id: string;
  /** Type of impact */
  type: ImpactType;
  /** Severity level */
  severity: ImpactSeverity;
  /** Human-readable description */
  description: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** File or location affected */
  location: ImpactLocation;
  /** Related PR changes that cause this impact */
  causedBy: string[];
  /** Suggested remediation */
  remediation?: string;
  /** Whether this is a blocking issue */
  isBlocking: boolean;
}

/**
 * Location of an impact
 */
export interface ImpactLocation {
  /** File path */
  file?: string;
  /** Line number */
  line?: number;
  /** End line */
  endLine?: number;
  /** Function or method name */
  symbol?: string;
  /** Repository (for cross-repo impacts) */
  repository?: string;
  /** Test file (for test failures) */
  testFile?: string;
  /** Test name */
  testName?: string;
}

/**
 * A dependency node in the impact graph
 */
export interface ImpactDependencyNode {
  /** Unique ID */
  id: string;
  /** File path */
  path: string;
  /** Type of node */
  nodeType: 'file' | 'function' | 'class' | 'module' | 'package' | 'repo';
  /** Display name */
  name: string;
  /** Symbols exported by this node */
  exports: string[];
  /** Symbols imported by this node */
  imports: ImportReference[];
  /** Direct dependents count */
  dependentCount: number;
  /** Whether this node is directly changed in the PR */
  isChanged: boolean;
  /** Risk score for this node (0-100) */
  riskScore: number;
}

/**
 * An import reference
 */
export interface ImportReference {
  /** Source module */
  source: string;
  /** Imported symbols */
  symbols: string[];
  /** Whether it's a type-only import */
  typeOnly: boolean;
}

/**
 * A dependency edge in the impact graph
 */
export interface ImpactDependencyEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Type of dependency */
  dependencyType: 'import' | 'extends' | 'implements' | 'calls' | 'tests' | 'configures';
  /** Symbols involved */
  symbols: string[];
  /** Weight (strength) of dependency */
  weight: number;
}

/**
 * Complete dependency graph
 */
export interface ImpactDependencyGraph {
  /** All nodes */
  nodes: ImpactDependencyNode[];
  /** All edges */
  edges: ImpactDependencyEdge[];
  /** Nodes directly affected by changes */
  changedNodes: string[];
  /** Nodes transitively affected */
  affectedNodes: string[];
  /** Total impact score */
  totalImpactScore: number;
}

/**
 * Test impact prediction
 */
export interface TestImpact {
  /** Test file */
  testFile: string;
  /** Test name/description */
  testName: string;
  /** Predicted outcome */
  prediction: 'pass' | 'fail' | 'flaky' | 'skip' | 'unknown';
  /** Confidence in prediction */
  confidence: number;
  /** Reason for prediction */
  reason: string;
  /** Changed files that affect this test */
  affectedBy: string[];
  /** Estimated run time (ms) */
  estimatedRunTime?: number;
  /** Last known status */
  lastKnownStatus?: 'pass' | 'fail' | 'skip';
}

/**
 * API compatibility analysis
 */
export interface APICompatibility {
  /** API endpoint or interface */
  api: string;
  /** Type of change */
  changeType: 'added' | 'modified' | 'removed' | 'unchanged';
  /** Whether change is backward compatible */
  isBackwardCompatible: boolean;
  /** Breaking changes if any */
  breakingChanges: BreakingChange[];
  /** Version impact */
  versionImpact: 'major' | 'minor' | 'patch' | 'none';
  /** Consumers affected */
  consumersAffected: string[];
}

/**
 * A breaking change detail
 */
export interface BreakingChange {
  /** What changed */
  change: string;
  /** Previous signature/type */
  previous: string;
  /** New signature/type */
  current: string;
  /** Migration path */
  migration?: string;
}

/**
 * Cross-repository impact
 */
export interface CrossRepoImpact {
  /** Affected repository */
  repository: string;
  /** Repository owner */
  owner: string;
  /** Impact description */
  description: string;
  /** Affected files in that repo */
  affectedFiles: string[];
  /** Severity */
  severity: ImpactSeverity;
  /** Whether a coordinated release is needed */
  requiresCoordinatedRelease: boolean;
}

/**
 * Complete impact simulation result
 */
export interface ImpactSimulation {
  /** Simulation ID */
  id: string;
  /** PR workflow ID */
  workflowId: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** PR number */
  prNumber: number;
  /** Commit SHA analyzed */
  commitSha: string;
  /** Overall risk score (0-100) */
  overallRiskScore: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Predicted impacts */
  impacts: PredictedImpact[];
  /** Dependency graph */
  dependencyGraph: ImpactDependencyGraph;
  /** Test impact predictions */
  testImpacts: TestImpact[];
  /** API compatibility analysis */
  apiCompatibility: APICompatibility[];
  /** Cross-repo impacts */
  crossRepoImpacts: CrossRepoImpact[];
  /** Summary statistics */
  summary: ImpactSummary;
  /** Simulation timestamp */
  simulatedAt: Date;
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether merge is recommended */
  mergeRecommendation: 'safe' | 'caution' | 'block';
  /** Reasons for recommendation */
  recommendationReasons: string[];
}

/**
 * Summary statistics for impact simulation
 */
export interface ImpactSummary {
  /** Total files analyzed */
  filesAnalyzed: number;
  /** Files directly changed */
  filesChanged: number;
  /** Files transitively affected */
  filesAffected: number;
  /** Total tests analyzed */
  testsAnalyzed: number;
  /** Tests predicted to fail */
  testsPredictedToFail: number;
  /** Tests predicted to be flaky */
  testsPredictedFlaky: number;
  /** APIs affected */
  apisAffected: number;
  /** Breaking changes count */
  breakingChangesCount: number;
  /** Downstream repos affected */
  downstreamReposAffected: number;
  /** Blocking issues count */
  blockingIssuesCount: number;
}

/**
 * Input for impact simulation
 */
export interface ImpactSimulationInput {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Specific commit to analyze (defaults to head) */
  commitSha?: string;
  /** Whether to include cross-repo analysis */
  includeCrossRepo?: boolean;
  /** Whether to run test predictions */
  includeTestPredictions?: boolean;
  /** Custom dependency graph (if pre-computed) */
  dependencyGraph?: ImpactDependencyGraph;
}

/**
 * Configuration for impact simulation
 */
export interface ImpactSimulationConfig {
  /** Repository ID */
  repositoryId: string;
  /** Enable test failure prediction */
  enableTestPrediction: boolean;
  /** Enable cross-repo impact analysis */
  enableCrossRepoAnalysis: boolean;
  /** Linked repositories for cross-repo analysis */
  linkedRepositories: string[];
  /** Custom risk thresholds */
  riskThresholds: {
    low: number;
    medium: number;
    high: number;
  };
  /** Patterns to ignore */
  ignorePatterns: string[];
  /** High-risk file patterns */
  highRiskPatterns: string[];
}
