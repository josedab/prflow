/**
 * @fileoverview Cross-PR Impact Graph Service
 *
 * Detects relationships between open PRs: file overlap, dependency chains,
 * conflict predictions, and optimal merge ordering.
 */

import { logger } from '../lib/logger.js';
import type { PRRelationship, PRNode, CrossPRGraph } from '@prflow/core';

interface PRFileData {
  number: number;
  title: string;
  author: string;
  status: 'open' | 'draft' | 'approved' | 'changes_requested';
  files: Array<{ path: string; additions: number; deletions: number }>;
  createdAt: Date;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export class CrossPRGraphService {
  /**
   * Build the full cross-PR impact graph for a repository.
   */
  buildGraph(repositoryId: string, openPRs: PRFileData[]): CrossPRGraph {
    const nodes = openPRs.map((pr) => this.toNode(pr));
    const edges = this.computeEdges(openPRs);
    const mergeOrder = this.computeMergeOrder(nodes, edges);
    const conflictClusters = this.detectConflictClusters(edges);

    logger.info(
      {
        repositoryId,
        prCount: nodes.length,
        edgeCount: edges.length,
        conflicts: conflictClusters.length,
      },
      'Cross-PR graph built'
    );

    return {
      repositoryId,
      nodes,
      edges,
      mergeOrder,
      conflictClusters,
      generatedAt: new Date(),
    };
  }

  private toNode(pr: PRFileData): PRNode {
    const totalLines = pr.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author,
      status: pr.status,
      filesChanged: pr.files.length,
      linesChanged: totalLines,
      riskLevel: pr.riskLevel || (totalLines > 500 ? 'high' : totalLines > 200 ? 'medium' : 'low'),
      createdAt: pr.createdAt,
    };
  }

  private computeEdges(prs: PRFileData[]): PRRelationship[] {
    const edges: PRRelationship[] = [];

    for (let i = 0; i < prs.length; i++) {
      for (let j = i + 1; j < prs.length; j++) {
        const relationship = this.analyzePair(prs[i], prs[j]);
        if (relationship) {
          edges.push(relationship);
        }
      }
    }

    return edges.sort((a, b) => b.conflictProbability - a.conflictProbability);
  }

  private analyzePair(a: PRFileData, b: PRFileData): PRRelationship | null {
    const aFiles = new Set(a.files.map((f) => f.path));
    const bFiles = new Set(b.files.map((f) => f.path));
    const shared = [...aFiles].filter((f) => bFiles.has(f));

    if (shared.length === 0) {
      // Check directory-level overlap
      const aDirs = new Set([...aFiles].map((f) => f.split('/').slice(0, -1).join('/')));
      const bDirs = new Set([...bFiles].map((f) => f.split('/').slice(0, -1).join('/')));
      const sharedDirs = [...aDirs].filter((d) => bDirs.has(d) && d !== '');

      if (sharedDirs.length === 0) return null;

      return {
        sourcePR: a.number,
        targetPR: b.number,
        type: 'dependency',
        strength: 0.2,
        conflictProbability: 0.1,
        sharedFiles: [],
        details: `Shared directories: ${sharedDirs.slice(0, 3).join(', ')}`,
      };
    }

    const overlapRatio = shared.length / Math.min(aFiles.size, bFiles.size);
    const conflictProbability = Math.min(1, overlapRatio * 0.8 + 0.1);

    return {
      sourcePR: a.number,
      targetPR: b.number,
      type: overlapRatio > 0.5 ? 'conflict' : 'file_overlap',
      strength: Math.round(overlapRatio * 100) / 100,
      conflictProbability: Math.round(conflictProbability * 100) / 100,
      sharedFiles: shared.slice(0, 10),
      details: `${shared.length} shared files (${Math.round(overlapRatio * 100)}% overlap)`,
    };
  }

  private computeMergeOrder(nodes: PRNode[], edges: PRRelationship[]): CrossPRGraph['mergeOrder'] {
    // Topological sort based on conflicts - merge smallest/safest PRs first
    const order: CrossPRGraph['mergeOrder'] = [];
    const merged = new Set<number>();
    const remaining = new Set(nodes.map((n) => n.number));

    let position = 1;
    while (remaining.size > 0 && position <= nodes.length) {
      // Find PR with fewest blocking conflicts
      let bestPR: number | null = null;
      let bestScore = Infinity;

      for (const prNumber of remaining) {
        const conflictEdges = edges.filter(
          (e) =>
            (e.sourcePR === prNumber || e.targetPR === prNumber) &&
            e.type === 'conflict' &&
            !merged.has(e.sourcePR === prNumber ? e.targetPR : e.sourcePR)
        );
        const node = nodes.find((n) => n.number === prNumber)!;
        const score = conflictEdges.length * 10 + node.linesChanged;

        if (score < bestScore) {
          bestScore = score;
          bestPR = prNumber;
        }
      }

      if (bestPR === null) break;

      const blockedBy = edges
        .filter((e) => (e.sourcePR === bestPR || e.targetPR === bestPR) && e.type === 'conflict')
        .map((e) => (e.sourcePR === bestPR ? e.targetPR : e.sourcePR))
        .filter((pr) => !merged.has(pr));

      order.push({
        order: position++,
        prNumber: bestPR,
        reason:
          blockedBy.length === 0
            ? 'No conflicts'
            : `Minimal conflicts (${blockedBy.length} remaining)`,
        blockedBy,
      });

      merged.add(bestPR);
      remaining.delete(bestPR);
    }

    return order;
  }

  private detectConflictClusters(edges: PRRelationship[]): CrossPRGraph['conflictClusters'] {
    const conflictEdges = edges.filter((e) => e.type === 'conflict');
    if (conflictEdges.length === 0) return [];

    // Union-find for clustering
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: number, b: number) => {
      parent.set(find(a), find(b));
    };

    for (const edge of conflictEdges) {
      union(edge.sourcePR, edge.targetPR);
    }

    const clusters = new Map<number, { prs: Set<number>; files: Set<string> }>();
    for (const edge of conflictEdges) {
      const root = find(edge.sourcePR);
      if (!clusters.has(root)) {
        clusters.set(root, { prs: new Set(), files: new Set() });
      }
      const cluster = clusters.get(root)!;
      cluster.prs.add(edge.sourcePR);
      cluster.prs.add(edge.targetPR);
      edge.sharedFiles.forEach((f) => cluster.files.add(f));
    }

    return Array.from(clusters.values())
      .filter((c) => c.prs.size > 1)
      .map((c) => ({
        prs: Array.from(c.prs),
        conflictFiles: Array.from(c.files).slice(0, 10),
        resolution:
          c.prs.size <= 2
            ? 'Merge one first, rebase the other'
            : `Consider coordinating merge order for ${c.prs.size} conflicting PRs`,
      }));
  }
}

export const crossPRGraphService = new CrossPRGraphService();
