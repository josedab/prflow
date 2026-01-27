import { z } from 'zod';

// ============================================
// Knowledge Graph Types
// ============================================

export const NodeTypeSchema = z.enum([
  'file',
  'function',
  'class',
  'interface',
  'type',
  'variable',
  'constant',
  'module',
  'package',
  'api_endpoint',
  'database_table',
  'test',
  'component',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const EdgeTypeSchema = z.enum([
  'imports',
  'exports',
  'calls',
  'implements',
  'extends',
  'uses',
  'tests',
  'depends_on',
  'contains',
  'references',
  'modified_by',
  'owned_by',
]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

// ============================================
// Graph Nodes
// ============================================

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  file: string;
  startLine?: number;
  endLine?: number;
  metadata: NodeMetadata;
  lastModified: Date;
  modificationCount: number;
}

export interface NodeMetadata {
  language?: string;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  isAsync?: boolean;
  isExported?: boolean;
  documentation?: string;
  complexity?: number;
  parameters?: ParameterInfo[];
  returnType?: string;
  decorators?: string[];
  tags?: string[];
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

// ============================================
// Graph Edges
// ============================================

export interface GraphEdge {
  id: string;
  type: EdgeType;
  source: string; // Node ID
  target: string; // Node ID
  weight: number;
  metadata: EdgeMetadata;
}

export interface EdgeMetadata {
  frequency?: number;
  lastUsed?: Date;
  context?: string;
  line?: number;
}

// ============================================
// Knowledge Graph
// ============================================

export interface KnowledgeGraph {
  repositoryId: string;
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  stats: GraphStats;
  lastIndexedAt: Date;
  version: number;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<EdgeType, number>;
  avgConnections: number;
  maxDepth: number;
  indexingTimeMs: number;
}

// ============================================
// Graph Queries
// ============================================

export interface GraphQuery {
  type: 'path' | 'neighbors' | 'subgraph' | 'impact' | 'ownership' | 'hotspots';
  startNode?: string;
  endNode?: string;
  nodeTypes?: NodeType[];
  edgeTypes?: EdgeType[];
  maxDepth?: number;
  limit?: number;
}

export interface PathResult {
  paths: GraphNode[][];
  shortestPath: GraphNode[];
  totalPaths: number;
}

export interface NeighborResult {
  node: GraphNode;
  incoming: Array<{ edge: GraphEdge; node: GraphNode }>;
  outgoing: Array<{ edge: GraphEdge; node: GraphNode }>;
}

export interface SubgraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootNode: GraphNode;
}

export interface ImpactResult {
  directImpact: GraphNode[];
  transitiveImpact: GraphNode[];
  impactScore: number;
  affectedTests: GraphNode[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface OwnershipResult {
  primaryOwners: OwnerInfo[];
  secondaryOwners: OwnerInfo[];
  lastModifiers: ModifierInfo[];
  ownershipScore: number;
}

export interface OwnerInfo {
  login: string;
  email?: string;
  fileCount: number;
  lineCount: number;
  commitCount: number;
  lastContribution: Date;
  expertise: string[];
}

export interface ModifierInfo {
  login: string;
  date: Date;
  commitSha: string;
  changeType: 'added' | 'modified' | 'deleted';
  linesChanged: number;
}

export interface HotspotResult {
  hotspots: HotspotInfo[];
  totalChanges: number;
  period: { start: Date; end: Date };
}

export interface HotspotInfo {
  node: GraphNode;
  changeFrequency: number;
  bugFrequency: number;
  complexity: number;
  score: number;
  contributors: string[];
}

// ============================================
// Indexing Types
// ============================================

export interface IndexingConfig {
  includePatterns: string[];
  excludePatterns: string[];
  maxFileSize: number;
  parseComments: boolean;
  resolveTypes: boolean;
  trackHistory: boolean;
  historyDepth: number;
}

export interface IndexingProgress {
  status: 'pending' | 'indexing' | 'completed' | 'failed';
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  errors: IndexingError[];
  startedAt: Date;
  completedAt?: Date;
}

export interface IndexingError {
  file: string;
  error: string;
  recoverable: boolean;
}

export interface IncrementalUpdate {
  addedNodes: GraphNode[];
  removedNodes: string[];
  modifiedNodes: GraphNode[];
  addedEdges: GraphEdge[];
  removedEdges: string[];
}

// ============================================
// Semantic Search
// ============================================

export interface SemanticSearchQuery {
  query: string;
  nodeTypes?: NodeType[];
  limit?: number;
  threshold?: number;
}

export interface SemanticSearchResult {
  node: GraphNode;
  score: number;
  matchedTerms: string[];
  context?: string;
}

// ============================================
// Code Intelligence
// ============================================

export interface CodeIntelligence {
  definitions: GraphNode[];
  references: GraphNode[];
  implementations: GraphNode[];
  callers: GraphNode[];
  callees: GraphNode[];
  typeHierarchy: TypeHierarchyNode[];
}

export interface TypeHierarchyNode {
  node: GraphNode;
  parents: TypeHierarchyNode[];
  children: TypeHierarchyNode[];
}

// ============================================
// Agent Types
// ============================================

export interface KnowledgeGraphAgentInput {
  repositoryId: string;
  operation: 'index' | 'query' | 'update' | 'analyze';
  query?: GraphQuery;
  files?: string[];
  config?: Partial<IndexingConfig>;
}

export interface KnowledgeGraphAgentResult {
  operation: string;
  success: boolean;
  data?: {
    graph?: Partial<KnowledgeGraph>;
    queryResult?: PathResult | NeighborResult | SubgraphResult | ImpactResult | OwnershipResult | HotspotResult;
    progress?: IndexingProgress;
    intelligence?: CodeIntelligence;
  };
  error?: string;
}
