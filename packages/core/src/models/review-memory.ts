/**
 * @fileoverview Types for Review Memory Graph
 *
 * Persistent knowledge graph for past reviews, code decisions,
 * and team preferences across all PRs.
 */

export interface ReviewMemoryEntry {
  id: string;
  repositoryId: string;
  organizationId: string;
  pullRequestNumber: number;
  rule: string;
  decision: 'accepted' | 'rejected' | 'modified' | 'deferred';
  context: string;
  codeSnippet: string;
  filePath: string;
  reasoning?: string;
  author: string;
  reviewer: string;
  timestamp: Date;
  embedding?: number[];
  tags: string[];
}

export interface CodePattern {
  id: string;
  pattern: string;
  description: string;
  category: string;
  occurrences: number;
  lastSeen: Date;
  repositories: string[];
  relatedDecisions: string[];
  embedding?: number[];
}

export interface MemorySearchQuery {
  organizationId: string;
  text?: string;
  rule?: string;
  filePath?: string;
  repository?: string;
  limit?: number;
  minSimilarity?: number;
}

export interface MemorySearchResult {
  entry: ReviewMemoryEntry;
  similarity: number;
  relevanceReason: string;
}

export interface ReviewMemoryStats {
  organizationId: string;
  totalEntries: number;
  totalPatterns: number;
  repositoriesCovered: number;
  topRules: Array<{ rule: string; count: number }>;
  topPatterns: Array<{ pattern: string; occurrences: number }>;
  decisionBreakdown: Record<string, number>;
  oldestEntry: Date | null;
  newestEntry: Date | null;
}

export interface CrossPRReference {
  sourceRule: string;
  sourcePR: number;
  targetPR: number;
  repository: string;
  message: string;
  similarity: number;
}

export interface MemoryGraphNode {
  id: string;
  type: 'decision' | 'pattern' | 'rule' | 'file' | 'author';
  label: string;
  properties: Record<string, unknown>;
}

export interface MemoryGraphEdge {
  source: string;
  target: string;
  relationship: 'decided_on' | 'contains_pattern' | 'reviewed_by' | 'related_to' | 'similar_to';
  weight: number;
}

export interface MemoryGraph {
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  generatedAt: Date;
}
