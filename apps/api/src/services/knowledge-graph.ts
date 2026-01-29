import { logger } from '../lib/logger.js';
import { getParser, type CodeNode, type CodeEdge, type ParseResult } from './code-parser.js';
import { parseFileWithCompiler } from './enhanced-ast-parser.js';

/**
 * Knowledge graph for a repository
 */
export interface KnowledgeGraph {
  repositoryId: string;
  nodes: Map<string, CodeNode>;
  edges: Map<string, CodeEdge>;
  fileIndex: Map<string, string[]>; // file -> node IDs
  symbolIndex: Map<string, string[]>; // symbol name -> node IDs
  lastUpdated: Date;
}

/**
 * Impact analysis result
 */
export interface ImpactAnalysis {
  changedNode: CodeNode;
  directDependents: CodeNode[];
  transitiveDependents: CodeNode[];
  affectedTests: string[];
  riskScore: number;
  blastRadius: number;
  visualization: GraphVisualization;
}

/**
 * Graph visualization data (for frontend rendering)
 */
export interface GraphVisualization {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    file: string;
    impactLevel: 'changed' | 'direct' | 'transitive' | 'unaffected';
    x?: number;
    y?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    affected: boolean;
  }>;
}

/**
 * Dependency path
 */
export interface DependencyPath {
  from: CodeNode;
  to: CodeNode;
  path: CodeNode[];
  edgeTypes: string[];
}

// In-memory graph cache (would use Redis in production)
const graphCache = new Map<string, KnowledgeGraph>();

export class KnowledgeGraphService {
  /**
   * Build or update knowledge graph for a repository
   */
  async buildGraph(
    repositoryId: string,
    files: Array<{ path: string; content: string }>,
    useEnhancedParser: boolean = true
  ): Promise<KnowledgeGraph> {
    const startTime = Date.now();
    
    const graph: KnowledgeGraph = {
      repositoryId,
      nodes: new Map(),
      edges: new Map(),
      fileIndex: new Map(),
      symbolIndex: new Map(),
      lastUpdated: new Date(),
    };

    let parsedFiles = 0;
    let totalNodes = 0;
    let totalEdges = 0;

    for (const file of files) {
      try {
        let result: ParseResult;
        
        // Use enhanced TypeScript Compiler parser for TS/JS files if enabled
        if (useEnhancedParser && file.path.match(/\.(ts|tsx|js|jsx)$/)) {
          result = await parseFileWithCompiler(file.path, file.content);
        } else {
          // Fall back to regex-based parser
          const parser = getParser(file.path);
          if (!parser) continue;
          result = parser.parse(file.path, file.content);
        }
        
        this.mergeParseResult(graph, result);
        
        parsedFiles++;
        totalNodes += result.nodes.length;
        totalEdges += result.edges.length;
      } catch (error) {
        logger.warn({ error, file: file.path }, 'Failed to parse file for knowledge graph');
      }
    }

    // Build cross-file edges (resolve imports)
    this.resolveImports(graph);

    // Cache the graph
    graphCache.set(repositoryId, graph);

    logger.info({
      repositoryId,
      parsedFiles,
      totalNodes,
      totalEdges,
      buildTimeMs: Date.now() - startTime,
    }, 'Knowledge graph built');

    return graph;
  }

  /**
   * Get cached graph or build new one
   */
  async getGraph(repositoryId: string): Promise<KnowledgeGraph | null> {
    return graphCache.get(repositoryId) || null;
  }

  /**
   * Analyze impact of changes in specific files
   */
  async analyzeImpact(
    repositoryId: string,
    changedFiles: Array<{ path: string; changedLines?: number[] }>
  ): Promise<ImpactAnalysis[]> {
    const graph = await this.getGraph(repositoryId);
    if (!graph) {
      throw new Error('Knowledge graph not found. Build it first.');
    }

    const analyses: ImpactAnalysis[] = [];

    for (const file of changedFiles) {
      const nodeIds = graph.fileIndex.get(file.path) || [];
      
      for (const nodeId of nodeIds) {
        const node = graph.nodes.get(nodeId);
        if (!node || node.type === 'file' || node.type === 'import') continue;

        // Check if node is in changed lines
        if (file.changedLines) {
          const nodeInChangedLines = file.changedLines.some(
            (line) => line >= node.startLine && line <= node.endLine
          );
          if (!nodeInChangedLines) continue;
        }

        const analysis = this.computeImpactForNode(graph, node);
        analyses.push(analysis);
      }
    }

    return analyses;
  }

  /**
   * Compute impact for a single node
   */
  private computeImpactForNode(graph: KnowledgeGraph, changedNode: CodeNode): ImpactAnalysis {
    // Find direct dependents (nodes that reference this node)
    const directDependents: CodeNode[] = [];
    const directDependentIds = new Set<string>();

    for (const edge of graph.edges.values()) {
      if (edge.target === changedNode.id || edge.target.endsWith(`:${changedNode.name}`)) {
        const sourceNode = graph.nodes.get(edge.source);
        if (sourceNode && sourceNode.id !== changedNode.id) {
          directDependents.push(sourceNode);
          directDependentIds.add(sourceNode.id);
        }
      }
    }

    // Find transitive dependents (BFS)
    const transitiveDependents: CodeNode[] = [];
    const transitiveDependentIds = new Set<string>();
    const queue = [...directDependentIds];
    const visited = new Set<string>([changedNode.id, ...directDependentIds]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      for (const edge of graph.edges.values()) {
        if (edge.target === currentId || edge.target.endsWith(`:${graph.nodes.get(currentId)?.name}`)) {
          const sourceNode = graph.nodes.get(edge.source);
          if (sourceNode && !visited.has(sourceNode.id)) {
            visited.add(sourceNode.id);
            transitiveDependents.push(sourceNode);
            transitiveDependentIds.add(sourceNode.id);
            queue.push(sourceNode.id);
          }
        }
      }
    }

    // Find affected tests
    const affectedTests = [...directDependents, ...transitiveDependents]
      .filter((n) => this.isTestFile(n.file))
      .map((n) => n.file);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(
      changedNode,
      directDependents.length,
      transitiveDependents.length
    );

    // Calculate blast radius
    const blastRadius = directDependents.length + transitiveDependents.length;

    // Generate visualization
    const visualization = this.generateVisualization(
      graph,
      changedNode,
      directDependentIds,
      transitiveDependentIds
    );

    return {
      changedNode,
      directDependents,
      transitiveDependents,
      affectedTests: [...new Set(affectedTests)],
      riskScore,
      blastRadius,
      visualization,
    };
  }

  /**
   * Find all paths between two nodes
   */
  findDependencyPaths(
    graph: KnowledgeGraph,
    fromNodeId: string,
    toNodeId: string,
    maxDepth = 10
  ): DependencyPath[] {
    const fromNode = graph.nodes.get(fromNodeId);
    const toNode = graph.nodes.get(toNodeId);

    if (!fromNode || !toNode) return [];

    const paths: DependencyPath[] = [];
    const visited = new Set<string>();

    const dfs = (
      currentId: string,
      path: CodeNode[],
      edgeTypes: string[],
      depth: number
    ): void => {
      if (depth > maxDepth) return;
      if (currentId === toNodeId) {
        paths.push({
          from: fromNode,
          to: toNode,
          path: [...path],
          edgeTypes: [...edgeTypes],
        });
        return;
      }

      visited.add(currentId);

      for (const edge of graph.edges.values()) {
        if (edge.source === currentId && !visited.has(edge.target)) {
          const targetNode = graph.nodes.get(edge.target);
          if (targetNode) {
            dfs(
              edge.target,
              [...path, targetNode],
              [...edgeTypes, edge.type],
              depth + 1
            );
          }
        }
      }

      visited.delete(currentId);
    };

    dfs(fromNodeId, [fromNode], [], 0);

    return paths;
  }

  /**
   * Get symbols defined in a file
   */
  getFileSymbols(graph: KnowledgeGraph, filePath: string): CodeNode[] {
    const nodeIds = graph.fileIndex.get(filePath) || [];
    return nodeIds
      .map((id) => graph.nodes.get(id))
      .filter((n): n is CodeNode => n !== undefined && n.type !== 'file' && n.type !== 'import');
  }

  /**
   * Search for symbols by name
   */
  searchSymbols(graph: KnowledgeGraph, query: string): CodeNode[] {
    const results: CodeNode[] = [];
    const lowerQuery = query.toLowerCase();

    for (const node of graph.nodes.values()) {
      if (node.type === 'file' || node.type === 'import') continue;
      
      if (node.name.toLowerCase().includes(lowerQuery)) {
        results.push(node);
      }
    }

    return results.sort((a, b) => {
      // Prioritize exact matches
      const aExact = a.name.toLowerCase() === lowerQuery;
      const bExact = b.name.toLowerCase() === lowerQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get incoming edges for a node (what depends on it)
   */
  getIncomingEdges(graph: KnowledgeGraph, nodeId: string): CodeEdge[] {
    const node = graph.nodes.get(nodeId);
    if (!node) return [];

    return Array.from(graph.edges.values()).filter(
      (e) => e.target === nodeId || e.target.endsWith(`:${node.name}`)
    );
  }

  /**
   * Get outgoing edges for a node (what it depends on)
   */
  getOutgoingEdges(graph: KnowledgeGraph, nodeId: string): CodeEdge[] {
    return Array.from(graph.edges.values()).filter((e) => e.source === nodeId);
  }

  /**
   * Merge parse result into graph
   */
  private mergeParseResult(graph: KnowledgeGraph, result: ParseResult): void {
    const fileNodeIds: string[] = [];

    for (const node of result.nodes) {
      graph.nodes.set(node.id, node);
      fileNodeIds.push(node.id);

      // Update symbol index
      if (node.type !== 'file' && node.type !== 'import') {
        const existing = graph.symbolIndex.get(node.name) || [];
        existing.push(node.id);
        graph.symbolIndex.set(node.name, existing);
      }
    }

    for (const edge of result.edges) {
      graph.edges.set(edge.id, edge);
    }

    graph.fileIndex.set(result.file, fileNodeIds);
  }

  /**
   * Resolve imports to actual nodes
   */
  private resolveImports(graph: KnowledgeGraph): void {
    for (const edge of graph.edges.values()) {
      if (edge.type === 'imports' && edge.target.startsWith('external:')) {
        const importPath = edge.target.replace('external:', '');
        
        // Try to find the target file
        const possiblePaths = [
          importPath,
          `${importPath}.ts`,
          `${importPath}.js`,
          `${importPath}/index.ts`,
          `${importPath}/index.js`,
        ];

        for (const path of possiblePaths) {
          const fileNodes = graph.fileIndex.get(path);
          if (fileNodes && fileNodes.length > 0) {
            edge.target = fileNodes[0];
            break;
          }
        }
      }
    }
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(filePath: string): boolean {
    return filePath.includes('.test.') || 
           filePath.includes('.spec.') || 
           filePath.includes('__tests__') ||
           filePath.includes('/test/') ||
           filePath.includes('/tests/');
  }

  /**
   * Calculate risk score for a change
   */
  private calculateRiskScore(
    node: CodeNode,
    directDependents: number,
    transitiveDependents: number
  ): number {
    let score = 0;

    // Base score by node type
    const typeScores: Record<string, number> = {
      class: 30,
      interface: 25,
      function: 20,
      method: 15,
      type_alias: 10,
      constant: 5,
      variable: 5,
    };
    score += typeScores[node.type] || 10;

    // Impact multiplier
    score += directDependents * 5;
    score += transitiveDependents * 2;

    // API/export penalty
    if (node.modifiers?.includes('export')) {
      score += 15;
    }

    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Generate visualization data
   */
  private generateVisualization(
    graph: KnowledgeGraph,
    changedNode: CodeNode,
    directDependentIds: Set<string>,
    transitiveDependentIds: Set<string>
  ): GraphVisualization {
    const relevantNodeIds = new Set([
      changedNode.id,
      ...directDependentIds,
      ...transitiveDependentIds,
    ]);

    const nodes: GraphVisualization['nodes'] = [];
    const edges: GraphVisualization['edges'] = [];

    // Add nodes
    for (const nodeId of relevantNodeIds) {
      const node = graph.nodes.get(nodeId);
      if (!node) continue;

      let impactLevel: 'changed' | 'direct' | 'transitive' | 'unaffected';
      if (nodeId === changedNode.id) {
        impactLevel = 'changed';
      } else if (directDependentIds.has(nodeId)) {
        impactLevel = 'direct';
      } else if (transitiveDependentIds.has(nodeId)) {
        impactLevel = 'transitive';
      } else {
        impactLevel = 'unaffected';
      }

      nodes.push({
        id: node.id,
        label: node.name,
        type: node.type,
        file: node.file,
        impactLevel,
      });
    }

    // Add edges between relevant nodes
    for (const edge of graph.edges.values()) {
      if (relevantNodeIds.has(edge.source) || relevantNodeIds.has(edge.target)) {
        const sourceNode = graph.nodes.get(edge.source);
        const targetNode = graph.nodes.get(edge.target);
        
        if (sourceNode && targetNode && 
            relevantNodeIds.has(sourceNode.id) && 
            relevantNodeIds.has(targetNode.id)) {
          edges.push({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type,
            affected: relevantNodeIds.has(edge.source) && relevantNodeIds.has(edge.target),
          });
        }
      }
    }

    // Layout nodes in a simple force-directed style (simplified)
    this.layoutNodes(nodes, edges);

    return { nodes, edges };
  }

  /**
   * Simple node layout algorithm
   */
  private layoutNodes(
    nodes: GraphVisualization['nodes'],
    _edges: GraphVisualization['edges']
  ): void {
    // Group by impact level
    const changedNodes = nodes.filter((n) => n.impactLevel === 'changed');
    const directNodes = nodes.filter((n) => n.impactLevel === 'direct');
    const transitiveNodes = nodes.filter((n) => n.impactLevel === 'transitive');

    // Place changed nodes at center
    changedNodes.forEach((n, i) => {
      n.x = 400 + i * 50;
      n.y = 300;
    });

    // Place direct dependents in a ring around center
    directNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(directNodes.length, 1);
      n.x = 400 + Math.cos(angle) * 150;
      n.y = 300 + Math.sin(angle) * 150;
    });

    // Place transitive dependents in an outer ring
    transitiveNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(transitiveNodes.length, 1);
      n.x = 400 + Math.cos(angle) * 300;
      n.y = 300 + Math.sin(angle) * 300;
    });
  }

  /**
   * Clear graph cache
   */
  clearCache(repositoryId?: string): void {
    if (repositoryId) {
      graphCache.delete(repositoryId);
    } else {
      graphCache.clear();
    }
  }

  /**
   * Get graph statistics
   */
  getStats(graph: KnowledgeGraph): {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    symbolCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  } {
    const nodesByType: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    for (const node of graph.nodes.values()) {
      nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
    }

    for (const edge of graph.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    return {
      nodeCount: graph.nodes.size,
      edgeCount: graph.edges.size,
      fileCount: graph.fileIndex.size,
      symbolCount: graph.symbolIndex.size,
      nodesByType,
      edgesByType,
    };
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();
