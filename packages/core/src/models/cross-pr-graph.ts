/**
 * @fileoverview Types for Cross-PR Impact Graph
 */

export interface PRRelationship {
  sourcePR: number;
  targetPR: number;
  type: 'file_overlap' | 'dependency' | 'conflict' | 'sequential';
  strength: number;
  conflictProbability: number;
  sharedFiles: string[];
  details: string;
}

export interface PRNode {
  number: number;
  title: string;
  author: string;
  status: 'open' | 'draft' | 'approved' | 'changes_requested';
  filesChanged: number;
  linesChanged: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
}

export interface CrossPRGraph {
  repositoryId: string;
  nodes: PRNode[];
  edges: PRRelationship[];
  mergeOrder: Array<{
    order: number;
    prNumber: number;
    reason: string;
    blockedBy: number[];
  }>;
  conflictClusters: Array<{
    prs: number[];
    conflictFiles: string[];
    resolution: string;
  }>;
  generatedAt: Date;
}
