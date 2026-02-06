/**
 * @fileoverview Cross-Repository Impact Analysis Models
 *
 * Types for dependency tracing, impact analysis, and alerting
 * across repositories in monorepos and microservice architectures.
 *
 * @module models/cross-repo-impact
 */

// ============================================
// Dependency Graph Types
// ============================================

/**
 * A node in the dependency graph
 */
export interface CrossRepoDependencyNode {
  /** Unique node ID */
  id: string;
  /** Node type */
  type: DependencyNodeType;
  /** Name (package, file, function, etc.) */
  name: string;
  /** Full path or identifier */
  path: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** Version (if applicable) */
  version?: string;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Last updated */
  lastUpdatedAt: Date;
}

/**
 * Node types in the dependency graph
 */
export type DependencyNodeType =
  | 'repository'
  | 'package'
  | 'module'
  | 'file'
  | 'class'
  | 'function'
  | 'api_endpoint'
  | 'database_table'
  | 'event'
  | 'config';

/**
 * An edge in the dependency graph
 */
export interface CrossRepoDependencyEdge {
  /** Edge ID */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Dependency type */
  type: DependencyEdgeType;
  /** Weight/strength of dependency */
  weight: number;
  /** Is this a direct or transitive dependency */
  direct: boolean;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Edge types
 */
export type DependencyEdgeType =
  | 'imports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'uses'
  | 'publishes'
  | 'subscribes'
  | 'reads'
  | 'writes'
  | 'depends_on';

/**
 * Complete dependency graph
 */
export interface CrossRepoDependencyGraph {
  /** Graph ID */
  id: string;
  /** Organization/scope */
  organization: string;
  /** Nodes */
  nodes: CrossRepoDependencyNode[];
  /** Edges */
  edges: CrossRepoDependencyEdge[];
  /** Graph statistics */
  stats: CrossRepoGraphStats;
  /** Last built */
  builtAt: Date;
  /** Build duration (ms) */
  buildDurationMs: number;
}

/**
 * Graph statistics
 */
export interface CrossRepoGraphStats {
  /** Total nodes */
  nodeCount: number;
  /** Total edges */
  edgeCount: number;
  /** Repositories included */
  repositoryCount: number;
  /** Average connections per node */
  avgConnections: number;
  /** Most connected nodes */
  hubNodes: string[];
  /** Isolated nodes */
  isolatedNodes: string[];
}

// ============================================
// Impact Analysis Types
// ============================================

/**
 * Impact analysis result
 */
export interface ImpactAnalysis {
  /** Analysis ID */
  id: string;
  /** Source PR */
  sourcePR: {
    owner: string;
    repo: string;
    number: number;
    title: string;
  };
  /** Changed entities */
  changedEntities: ChangedEntity[];
  /** Direct impacts */
  directImpacts: Impact[];
  /** Transitive impacts */
  transitiveImpacts: Impact[];
  /** Blast radius metrics */
  blastRadius: BlastRadius;
  /** Risk assessment */
  riskAssessment: ImpactRiskAssessment;
  /** Recommended actions */
  recommendations: ImpactRecommendation[];
  /** Analysis timestamp */
  analyzedAt: Date;
}

/**
 * A changed entity in the PR
 */
export interface ChangedEntity {
  /** Entity type */
  type: DependencyNodeType;
  /** Entity name */
  name: string;
  /** File path */
  file: string;
  /** Change type */
  changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Is this a breaking change */
  isBreaking: boolean;
  /** Change description */
  description: string;
  /** Lines changed */
  linesChanged: number;
}

/**
 * An impact on a downstream consumer
 */
export interface Impact {
  /** Impact ID */
  id: string;
  /** Impacted entity */
  entity: {
    type: DependencyNodeType;
    name: string;
    path: string;
  };
  /** Impacted repository */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** Impact type */
  impactType: CrossRepoImpactType;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Confidence score */
  confidence: number;
  /** Description */
  description: string;
  /** Potentially affected files */
  affectedFiles: string[];
  /** Suggested action */
  suggestedAction: string;
  /** Related tests */
  relatedTests?: string[];
}

/**
 * Impact types
 */
export type CrossRepoImpactType =
  | 'api_breaking_change'
  | 'api_signature_change'
  | 'dependency_update'
  | 'schema_change'
  | 'event_format_change'
  | 'config_change'
  | 'behavior_change'
  | 'performance_impact'
  | 'security_impact';

/**
 * Blast radius metrics
 */
export interface BlastRadius {
  /** Total repositories affected */
  repositoriesAffected: number;
  /** List of affected repositories */
  repositories: Array<{
    owner: string;
    name: string;
    impactCount: number;
    maxSeverity: string;
  }>;
  /** Total files potentially affected */
  filesAffected: number;
  /** Total consumers affected */
  consumersAffected: number;
  /** Depth of impact (how many hops) */
  maxDepth: number;
  /** Visual representation data */
  visualization: {
    centerNode: string;
    rings: Array<{
      depth: number;
      nodes: string[];
    }>;
  };
}

/**
 * Risk assessment for impact
 */
export interface ImpactRiskAssessment {
  /** Overall risk level */
  level: 'critical' | 'high' | 'medium' | 'low';
  /** Risk score (0-100) */
  score: number;
  /** Risk factors */
  factors: Array<{
    factor: string;
    contribution: number;
    description: string;
  }>;
  /** Mitigation strategies */
  mitigations: string[];
}

/**
 * Impact recommendation
 */
export interface ImpactRecommendation {
  /** Recommendation ID */
  id: string;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Action items */
  actions: string[];
  /** Affected repositories */
  affectedRepos: string[];
}

// ============================================
// Alert Types
// ============================================

/**
 * Cross-repo impact alert
 */
export interface ImpactAlert {
  /** Alert ID */
  id: string;
  /** Alert type */
  type: AlertType;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Source PR */
  sourcePR: {
    owner: string;
    repo: string;
    number: number;
    url: string;
  };
  /** Affected repository */
  affectedRepo: {
    owner: string;
    name: string;
  };
  /** Alert title */
  title: string;
  /** Alert message */
  message: string;
  /** Details */
  details: {
    changedEntity: string;
    impactedEntities: string[];
    suggestedAction: string;
  };
  /** Status */
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  /** Created at */
  createdAt: Date;
  /** Acknowledged by */
  acknowledgedBy?: string;
  /** Acknowledged at */
  acknowledgedAt?: Date;
}

/**
 * Alert types
 */
export type AlertType =
  | 'breaking_change'
  | 'dependency_update'
  | 'api_change'
  | 'schema_migration'
  | 'security_vulnerability'
  | 'deprecation';

/**
 * Alert subscription
 */
export interface AlertSubscription {
  /** Subscription ID */
  id: string;
  /** User or team */
  subscriber: {
    type: 'user' | 'team';
    id: string;
    name: string;
  };
  /** Subscribed repositories */
  repositories: string[];
  /** Alert types to receive */
  alertTypes: AlertType[];
  /** Minimum severity */
  minSeverity: 'critical' | 'high' | 'medium' | 'low';
  /** Notification channels */
  channels: NotificationChannel[];
  /** Active */
  active: boolean;
}

/**
 * Notification channel
 */
export interface NotificationChannel {
  /** Channel type */
  type: 'github' | 'slack' | 'teams' | 'email' | 'webhook';
  /** Channel config */
  config: Record<string, string>;
  /** Enabled */
  enabled: boolean;
}

// ============================================
// Dependency Detection Types
// ============================================

/**
 * Dependency manifest (package.json, go.mod, etc.)
 */
export interface DependencyManifest {
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** Manifest type */
  type: ManifestType;
  /** File path */
  path: string;
  /** Package name */
  packageName: string;
  /** Version */
  version: string;
  /** Dependencies */
  dependencies: DependencyEntry[];
  /** Dev dependencies */
  devDependencies: DependencyEntry[];
  /** Peer dependencies */
  peerDependencies: DependencyEntry[];
  /** Parsed at */
  parsedAt: Date;
}

/**
 * Manifest types
 */
export type ManifestType =
  | 'package.json'
  | 'go.mod'
  | 'requirements.txt'
  | 'Gemfile'
  | 'pom.xml'
  | 'build.gradle'
  | 'Cargo.toml'
  | 'pubspec.yaml';

/**
 * A dependency entry
 */
export interface DependencyEntry {
  /** Package name */
  name: string;
  /** Version constraint */
  version: string;
  /** Is internal (same org) */
  internal: boolean;
  /** Registry */
  registry?: string;
}

/**
 * API endpoint definition
 */
export interface APIEndpoint {
  /** Endpoint ID */
  id: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path */
  path: string;
  /** Version */
  version?: string;
  /** Request schema */
  requestSchema?: Record<string, unknown>;
  /** Response schema */
  responseSchema?: Record<string, unknown>;
  /** File location */
  file: string;
  /** Line number */
  line: number;
  /** Consumers */
  consumers: string[];
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Analyze impact request
 */
export interface AnalyzeImpactRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Include transitive impacts */
  includeTransitive?: boolean;
  /** Max depth for transitive analysis */
  maxDepth?: number;
  /** Repositories to include (empty = all in org) */
  includeRepositories?: string[];
}

/**
 * Build graph request
 */
export interface BuildGraphRequest {
  /** Organization */
  organization: string;
  /** Repositories to include */
  repositories: string[];
  /** Include internal dependencies only */
  internalOnly?: boolean;
  /** Dependency types to trace */
  dependencyTypes?: DependencyEdgeType[];
}

/**
 * Get alerts request
 */
export interface GetAlertsRequest {
  /** Repository filter */
  repository?: string;
  /** Severity filter */
  severity?: string[];
  /** Status filter */
  status?: string[];
  /** Limit */
  limit?: number;
  /** Offset */
  offset?: number;
}

/**
 * Impact analysis webhook payload
 */
export interface ImpactWebhook {
  /** Event type */
  event: 'impact_detected' | 'alert_created' | 'graph_updated';
  /** Source PR */
  sourcePR?: {
    owner: string;
    repo: string;
    number: number;
    url: string;
  };
  /** Impact summary */
  impact?: {
    repositoriesAffected: number;
    highestSeverity: string;
    breakingChanges: number;
  };
  /** Alert (if applicable) */
  alert?: ImpactAlert;
  /** Timestamp */
  timestamp: Date;
}
