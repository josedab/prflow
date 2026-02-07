/**
 * @fileoverview Cross-Repository Impact Graph Models (Enhanced)
 *
 * Types for live dependency graph management, impact propagation,
 * blast radius visualization, and cross-repo notification system.
 *
 * @module models/cross-repo-graph
 */

// ============================================
// Live Graph Types
// ============================================

/**
 * Graph update event type
 */
export type GraphUpdateEventType = 'node_added' | 'node_removed' | 'node_updated' | 'edge_added' | 'edge_removed';

/**
 * A live graph update event
 */
export interface GraphUpdateEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: GraphUpdateEventType;
  /** Graph ID */
  graphId: string;
  /** Node or edge ID affected */
  entityId: string;
  /** Change details */
  changes: Record<string, unknown>;
  /** Triggered by */
  triggeredBy: { repository: string; commit: string };
  /** Timestamp */
  timestamp: Date;
}

/**
 * Graph health status
 */
export interface GraphHealthStatus {
  /** Graph ID */
  graphId: string;
  /** Organization */
  organization: string;
  /** Total nodes */
  totalNodes: number;
  /** Total edges */
  totalEdges: number;
  /** Stale nodes (not updated recently) */
  staleNodes: number;
  /** Circular dependencies */
  circularDependencies: CircularDependency[];
  /** Orphan nodes */
  orphanNodes: number;
  /** Last full rebuild */
  lastFullRebuild: Date;
  /** Last incremental update */
  lastIncrementalUpdate: Date;
  /** Health score (0-100) */
  healthScore: number;
}

/**
 * Circular dependency
 */
export interface CircularDependency {
  /** Cycle path (repo names) */
  path: string[];
  /** Severity */
  severity: 'low' | 'medium' | 'high';
  /** Description */
  description: string;
}

// ============================================
// Impact Propagation Types
// ============================================

/**
 * Impact propagation result
 */
export interface ImpactPropagation {
  /** Propagation ID */
  id: string;
  /** Source repository and PR */
  source: { repository: string; prNumber: number; changedFiles: string[] };
  /** Direct impacts */
  directImpacts: RepositoryImpact[];
  /** Transitive impacts */
  transitiveImpacts: RepositoryImpact[];
  /** Total affected repositories */
  totalAffectedRepos: number;
  /** Total affected files */
  totalAffectedFiles: number;
  /** Overall risk */
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  /** Propagation depth */
  maxDepth: number;
  /** Analyzed at */
  analyzedAt: Date;
}

/**
 * Impact on a specific repository
 */
export interface RepositoryImpact {
  /** Repository full name */
  repository: string;
  /** Depth from source (1 = direct) */
  depth: number;
  /** Affected files in this repo */
  affectedFiles: string[];
  /** Impact type */
  impactType: 'breaking_change' | 'version_bump' | 'api_change' | 'type_change' | 'behavior_change';
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description */
  description: string;
  /** Team owners to notify */
  teamOwners: string[];
  /** Suggested actions */
  suggestedActions: string[];
}

// ============================================
// Notification Types
// ============================================

/**
 * Cross-repo impact notification
 */
export interface ImpactNotification {
  /** Notification ID */
  id: string;
  /** Propagation ID */
  propagationId: string;
  /** Target repository */
  targetRepository: string;
  /** Recipients */
  recipients: string[];
  /** Channel */
  channel: 'github_issue' | 'github_comment' | 'slack' | 'email';
  /** Notification status */
  status: 'pending' | 'sent' | 'acknowledged' | 'dismissed';
  /** Message */
  message: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Created at */
  createdAt: Date;
  /** Acknowledged at */
  acknowledgedAt?: Date;
  /** Acknowledged by */
  acknowledgedBy?: string;
}

// ============================================
// Visualization Types
// ============================================

/**
 * Blast radius visualization data
 */
export interface BlastRadiusVisualization {
  /** Center node (source repo) */
  center: { repository: string; prNumber: number };
  /** Rings of impact (by depth) */
  rings: BlastRadiusRing[];
  /** Total repositories affected */
  totalRepos: number;
  /** Total teams affected */
  totalTeams: number;
  /** Risk distribution */
  riskDistribution: Record<string, number>;
}

/**
 * A ring in the blast radius
 */
export interface BlastRadiusRing {
  /** Depth level */
  depth: number;
  /** Repositories in this ring */
  repositories: Array<{
    name: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedFiles: number;
    teamOwner: string;
  }>;
}
