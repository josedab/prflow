/**
 * @fileoverview Review Memory Graph Service
 *
 * Persistent knowledge graph of past reviews, decisions, and code patterns.
 * Uses cosine similarity on simple term-frequency vectors for retrieval.
 */

import { logger } from '../lib/logger.js';
import type {
  ReviewMemoryEntry,
  CodePattern,
  MemorySearchQuery,
  MemorySearchResult,
  ReviewMemoryStats,
  CrossPRReference,
  MemoryGraph,
  MemoryGraphNode,
  MemoryGraphEdge,
} from '@prflow/core';

export class ReviewMemoryService {
  private entries: ReviewMemoryEntry[] = [];
  private patterns = new Map<string, CodePattern>();

  addEntry(entry: ReviewMemoryEntry): void {
    // Generate simple TF embedding if not provided
    if (!entry.embedding) {
      entry.embedding = this.generateEmbedding(entry.context + ' ' + entry.codeSnippet);
    }
    this.entries.push(entry);
    this.updatePatterns(entry);
    logger.debug({ entryId: entry.id, rule: entry.rule }, 'Review memory entry added');
  }

  /**
   * Search memory by text similarity and filters.
   */
  search(query: MemorySearchQuery): MemorySearchResult[] {
    let candidates = this.entries.filter((e) => e.organizationId === query.organizationId);

    if (query.rule) candidates = candidates.filter((e) => e.rule === query.rule);
    if (query.filePath) candidates = candidates.filter((e) => e.filePath.includes(query.filePath!));
    if (query.repository)
      candidates = candidates.filter((e) => e.repositoryId === query.repository);

    if (!query.text) {
      return candidates
        .slice(0, query.limit ?? 10)
        .map((e) => ({ entry: e, similarity: 1, relevanceReason: 'Filter match' }));
    }

    const queryEmbedding = this.generateEmbedding(query.text);
    const minSimilarity = query.minSimilarity ?? 0.1;

    const scored = candidates.map((entry) => {
      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding || []);
      return {
        entry,
        similarity,
        relevanceReason: `Text similarity: ${(similarity * 100).toFixed(0)}%`,
      };
    });

    return scored
      .filter((r) => r.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, query.limit ?? 10);
  }

  /**
   * Find cross-PR references for a given rule/context.
   */
  findCrossPRReferences(
    organizationId: string,
    rule: string,
    context: string,
    currentPR: number,
    limit = 5
  ): CrossPRReference[] {
    const queryEmb = this.generateEmbedding(context);
    const candidates = this.entries.filter(
      (e) =>
        e.organizationId === organizationId && e.rule === rule && e.pullRequestNumber !== currentPR
    );

    return candidates
      .map((entry) => ({
        sourceRule: rule,
        sourcePR: currentPR,
        targetPR: entry.pullRequestNumber,
        repository: entry.repositoryId,
        message: `Previously discussed in PR #${entry.pullRequestNumber}: ${entry.decision}`,
        similarity: this.cosineSimilarity(queryEmb, entry.embedding || []),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Build a visual graph of memory relationships.
   */
  buildGraph(organizationId: string, limit = 100): MemoryGraph {
    const orgEntries = this.entries
      .filter((e) => e.organizationId === organizationId)
      .slice(-limit);

    const nodes: MemoryGraphNode[] = [];
    const edges: MemoryGraphEdge[] = [];
    const seenNodes = new Set<string>();

    for (const entry of orgEntries) {
      // Decision node
      if (!seenNodes.has(entry.id)) {
        nodes.push({
          id: entry.id,
          type: 'decision',
          label: `${entry.rule} on PR #${entry.pullRequestNumber}`,
          properties: { decision: entry.decision, file: entry.filePath },
        });
        seenNodes.add(entry.id);
      }

      // Rule node
      const ruleNodeId = `rule:${entry.rule}`;
      if (!seenNodes.has(ruleNodeId)) {
        nodes.push({ id: ruleNodeId, type: 'rule', label: entry.rule, properties: {} });
        seenNodes.add(ruleNodeId);
      }
      edges.push({ source: entry.id, target: ruleNodeId, relationship: 'decided_on', weight: 1 });

      // Author node
      const authorNodeId = `author:${entry.reviewer}`;
      if (!seenNodes.has(authorNodeId)) {
        nodes.push({ id: authorNodeId, type: 'author', label: entry.reviewer, properties: {} });
        seenNodes.add(authorNodeId);
      }
      edges.push({
        source: authorNodeId,
        target: entry.id,
        relationship: 'reviewed_by',
        weight: 1,
      });

      // File node
      const fileNodeId = `file:${entry.filePath}`;
      if (!seenNodes.has(fileNodeId)) {
        nodes.push({ id: fileNodeId, type: 'file', label: entry.filePath, properties: {} });
        seenNodes.add(fileNodeId);
      }
      edges.push({
        source: entry.id,
        target: fileNodeId,
        relationship: 'contains_pattern',
        weight: 1,
      });
    }

    return { nodes, edges, generatedAt: new Date() };
  }

  getStats(organizationId: string): ReviewMemoryStats {
    const orgEntries = this.entries.filter((e) => e.organizationId === organizationId);

    const ruleCounts = new Map<string, number>();
    const repos = new Set<string>();
    const decisions: Record<string, number> = {};

    for (const entry of orgEntries) {
      ruleCounts.set(entry.rule, (ruleCounts.get(entry.rule) || 0) + 1);
      repos.add(entry.repositoryId);
      decisions[entry.decision] = (decisions[entry.decision] || 0) + 1;
    }

    const topRules = Array.from(ruleCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([rule, count]) => ({ rule, count }));

    const topPatterns = Array.from(this.patterns.values())
      .filter((p) => p.repositories.some((r) => orgEntries.some((e) => e.repositoryId === r)))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10)
      .map((p) => ({ pattern: p.pattern, occurrences: p.occurrences }));

    return {
      organizationId,
      totalEntries: orgEntries.length,
      totalPatterns: this.patterns.size,
      repositoriesCovered: repos.size,
      topRules,
      topPatterns,
      decisionBreakdown: decisions,
      oldestEntry: orgEntries.length > 0 ? orgEntries[0]!.timestamp : null,
      newestEntry: orgEntries.length > 0 ? orgEntries[orgEntries.length - 1]!.timestamp : null,
    };
  }

  private updatePatterns(entry: ReviewMemoryEntry): void {
    for (const tag of entry.tags) {
      let pattern = this.patterns.get(tag);
      if (!pattern) {
        pattern = {
          id: `pattern-${tag}`,
          pattern: tag,
          description: `Pattern: ${tag}`,
          category: entry.rule,
          occurrences: 0,
          lastSeen: new Date(),
          repositories: [],
          relatedDecisions: [],
        };
      }
      pattern.occurrences++;
      pattern.lastSeen = entry.timestamp;
      if (!pattern.repositories.includes(entry.repositoryId)) {
        pattern.repositories.push(entry.repositoryId);
      }
      pattern.relatedDecisions.push(entry.id);
      this.patterns.set(tag, pattern);
    }
  }

  // Simple term-frequency vector embedding
  private generateEmbedding(text: string): number[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/);
    const vocab = new Map<string, number>();
    for (const w of words) {
      vocab.set(w, (vocab.get(w) || 0) + 1);
    }
    const total = words.length || 1;
    // Fixed-size hash embedding (dimension 64)
    const dim = 64;
    const emb = new Array(dim).fill(0);
    for (const [word, count] of vocab) {
      const hash = this.hashString(word) % dim;
      emb[hash] += count / total;
    }
    return emb;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const len = Math.min(a.length, b.length);
    let dot = 0,
      magA = 0,
      magB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i]! * b[i]!;
      magA += a[i]! * a[i]!;
      magB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }
}

export const reviewMemoryService = new ReviewMemoryService();
