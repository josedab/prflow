import type {
  KnowledgeGraphAgentInput,
  KnowledgeGraphAgentResult,
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphQuery,
  NodeType,
  EdgeType,
  GraphStats,
  ImpactResult,
  NeighborResult,
  OwnershipResult,
  HotspotResult,
  IndexingProgress,
  SemanticSearchQuery,
  SemanticSearchResult,
} from '@prflow/core';
import { BaseAgent, callLLM, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

interface ParsedSymbol {
  name: string;
  type: NodeType;
  startLine: number;
  endLine: number;
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
  isExported: boolean;
  isAsync: boolean;
  documentation?: string;
}

interface ParsedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  line: number;
}

export class KnowledgeGraphAgent extends BaseAgent<KnowledgeGraphAgentInput, KnowledgeGraphAgentResult> {
  readonly name = 'knowledge-graph';
  readonly description = 'Builds and queries semantic code knowledge graphs for intelligent analysis';

  private graphs: Map<string, KnowledgeGraph> = new Map();
  private indexingProgress: Map<string, IndexingProgress> = new Map();

  async execute(input: KnowledgeGraphAgentInput, _context: unknown): Promise<{
    success: boolean;
    data?: KnowledgeGraphAgentResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result) {
      return this.createErrorResult('Knowledge graph operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: KnowledgeGraphAgentInput): Promise<KnowledgeGraphAgentResult> {
    const { repositoryId, operation, query, files, config } = input;

    switch (operation) {
      case 'index':
        return this.indexRepository(repositoryId, files || [], config);
      case 'query':
        if (!query) {
          return { operation, success: false, error: 'Query is required for query operation' };
        }
        return this.queryGraph(repositoryId, query);
      case 'update':
        return this.updateGraph(repositoryId, files || []);
      case 'analyze':
        return this.analyzeGraph(repositoryId);
      default:
        return { operation, success: false, error: `Unknown operation: ${operation}` };
    }
  }

  private async indexRepository(
    repositoryId: string,
    files: string[],
    _config?: Partial<{
      includePatterns: string[];
      excludePatterns: string[];
      maxFileSize: number;
      parseComments: boolean;
      resolveTypes: boolean;
      trackHistory: boolean;
      historyDepth: number;
    }>
  ): Promise<KnowledgeGraphAgentResult> {
    logger.info({ repositoryId, fileCount: files.length }, 'Starting repository indexing');

    const progress: IndexingProgress = {
      status: 'indexing',
      totalFiles: files.length,
      processedFiles: 0,
      errors: [],
      startedAt: new Date(),
    };
    this.indexingProgress.set(repositoryId, progress);

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const startTime = Date.now();

    try {
      // Process each file
      for (const file of files) {
        progress.currentFile = file;
        
        try {
          const { fileNodes, fileEdges } = await this.indexFile(repositoryId, file);
          
          for (const node of fileNodes) {
            nodes.set(node.id, node);
          }
          edges.push(...fileEdges);
        } catch (error) {
          progress.errors.push({
            file,
            error: (error as Error).message,
            recoverable: true,
          });
        }

        progress.processedFiles++;
      }

      // Build cross-file edges
      const crossFileEdges = this.buildCrossFileEdges(nodes, edges);
      edges.push(...crossFileEdges);

      // Calculate stats
      const stats = this.calculateStats(nodes, edges, Date.now() - startTime);

      // Create the graph
      const graph: KnowledgeGraph = {
        repositoryId,
        nodes,
        edges,
        stats,
        lastIndexedAt: new Date(),
        version: 1,
      };

      this.graphs.set(repositoryId, graph);

      progress.status = 'completed';
      progress.completedAt = new Date();

      return {
        operation: 'index',
        success: true,
        data: {
          graph: {
            repositoryId: graph.repositoryId,
            stats: graph.stats,
            lastIndexedAt: graph.lastIndexedAt,
            version: graph.version,
          },
          progress,
        },
      };
    } catch (error) {
      progress.status = 'failed';
      progress.completedAt = new Date();
      
      return {
        operation: 'index',
        success: false,
        error: (error as Error).message,
        data: { progress },
      };
    }
  }

  private async indexFile(
    repositoryId: string,
    file: string
  ): Promise<{ fileNodes: GraphNode[]; fileEdges: GraphEdge[] }> {
    const fileNodes: GraphNode[] = [];
    const fileEdges: GraphEdge[] = [];

    // Create file node
    const fileNode: GraphNode = {
      id: `${repositoryId}:${file}`,
      type: 'file',
      name: file.split('/').pop() || file,
      file,
      metadata: {
        language: this.getLanguageFromFile(file),
      },
      lastModified: new Date(),
      modificationCount: 1,
    };
    fileNodes.push(fileNode);

    // Parse file for symbols (would use actual file content in production)
    const symbols = await this.parseFileSymbols(file);
    const imports = await this.parseFileImports(file);

    // Create nodes for symbols
    for (const symbol of symbols) {
      const symbolNode: GraphNode = {
        id: `${repositoryId}:${file}:${symbol.name}`,
        type: symbol.type,
        name: symbol.name,
        file,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        metadata: {
          language: this.getLanguageFromFile(file),
          isExported: symbol.isExported,
          isAsync: symbol.isAsync,
          parameters: symbol.parameters,
          returnType: symbol.returnType,
          documentation: symbol.documentation,
        },
        lastModified: new Date(),
        modificationCount: 1,
      };
      fileNodes.push(symbolNode);

      // Create "contains" edge from file to symbol
      fileEdges.push({
        id: `edge:${fileNode.id}:contains:${symbolNode.id}`,
        type: 'contains',
        source: fileNode.id,
        target: symbolNode.id,
        weight: 1,
        metadata: {},
      });

      // Create "exports" edge if exported
      if (symbol.isExported) {
        fileEdges.push({
          id: `edge:${symbolNode.id}:exports:${fileNode.id}`,
          type: 'exports',
          source: symbolNode.id,
          target: fileNode.id,
          weight: 1,
          metadata: {},
        });
      }
    }

    // Create edges for imports
    for (const importInfo of imports) {
      fileEdges.push({
        id: `edge:${fileNode.id}:imports:${importInfo.source}`,
        type: 'imports',
        source: fileNode.id,
        target: `${repositoryId}:${importInfo.source}`,
        weight: importInfo.specifiers.length,
        metadata: {
          line: importInfo.line,
          context: importInfo.specifiers.join(', '),
        },
      });
    }

    return { fileNodes, fileEdges };
  }

  private async parseFileSymbols(file: string): Promise<ParsedSymbol[]> {
    // In production, this would use tree-sitter or TypeScript compiler API
    // For now, return empty array - actual parsing would happen here
    const symbols: ParsedSymbol[] = [];
    
    // Simulate finding some symbols based on file patterns
    if (file.includes('service') || file.includes('Service')) {
      symbols.push({
        name: 'ServiceClass',
        type: 'class',
        startLine: 1,
        endLine: 50,
        isExported: true,
        isAsync: false,
      });
    }
    
    if (file.includes('util') || file.includes('helper')) {
      symbols.push({
        name: 'utilityFunction',
        type: 'function',
        startLine: 1,
        endLine: 20,
        isExported: true,
        isAsync: false,
      });
    }

    return symbols;
  }

  private async parseFileImports(_file: string): Promise<ParsedImport[]> {
    // In production, this would parse actual imports
    return [];
  }

  private buildCrossFileEdges(
    nodes: Map<string, GraphNode>,
    _existingEdges: GraphEdge[]
  ): GraphEdge[] {
    const crossFileEdges: GraphEdge[] = [];

    // Find function calls across files
    // In production, this would use actual call analysis
    const functions = Array.from(nodes.values()).filter(n => n.type === 'function');
    
    for (const fn of functions) {
      // Check for calls to other functions (simplified)
      for (const otherFn of functions) {
        if (fn.id !== otherFn.id && fn.file !== otherFn.file) {
          // In production, we'd check if fn actually calls otherFn
          // For now, skip to avoid creating false edges
        }
      }
    }

    return crossFileEdges;
  }

  private calculateStats(
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[],
    indexingTimeMs: number
  ): GraphStats {
    const nodesByType: Record<NodeType, number> = {
      file: 0,
      function: 0,
      class: 0,
      interface: 0,
      type: 0,
      variable: 0,
      constant: 0,
      module: 0,
      package: 0,
      api_endpoint: 0,
      database_table: 0,
      test: 0,
      component: 0,
    };

    const edgesByType: Record<EdgeType, number> = {
      imports: 0,
      exports: 0,
      calls: 0,
      implements: 0,
      extends: 0,
      uses: 0,
      tests: 0,
      depends_on: 0,
      contains: 0,
      references: 0,
      modified_by: 0,
      owned_by: 0,
    };

    for (const node of nodes.values()) {
      nodesByType[node.type]++;
    }

    for (const edge of edges) {
      edgesByType[edge.type]++;
    }

    const totalNodes = nodes.size;
    const totalEdges = edges.length;

    return {
      totalNodes,
      totalEdges,
      nodesByType,
      edgesByType,
      avgConnections: totalNodes > 0 ? totalEdges / totalNodes : 0,
      maxDepth: this.calculateMaxDepth(nodes, edges),
      indexingTimeMs,
    };
  }

  private calculateMaxDepth(
    nodes: Map<string, GraphNode>,
    edges: GraphEdge[]
  ): number {
    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const node of nodes.keys()) {
      adjacency.set(node, []);
    }
    for (const edge of edges) {
      const neighbors = adjacency.get(edge.source) || [];
      neighbors.push(edge.target);
      adjacency.set(edge.source, neighbors);
    }

    // BFS to find max depth
    let maxDepth = 0;
    for (const startNode of nodes.keys()) {
      const visited = new Set<string>();
      const queue: Array<{ node: string; depth: number }> = [{ node: startNode, depth: 0 }];
      
      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (visited.has(node)) continue;
        visited.add(node);
        maxDepth = Math.max(maxDepth, depth);
        
        const neighbors = adjacency.get(node) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push({ node: neighbor, depth: depth + 1 });
          }
        }
      }
    }

    return maxDepth;
  }

  private async queryGraph(
    repositoryId: string,
    query: GraphQuery
  ): Promise<KnowledgeGraphAgentResult> {
    const graph = this.graphs.get(repositoryId);
    if (!graph) {
      return {
        operation: 'query',
        success: false,
        error: `No graph found for repository: ${repositoryId}`,
      };
    }

    switch (query.type) {
      case 'neighbors':
        return this.queryNeighbors(graph, query);
      case 'impact':
        return this.queryImpact(graph, query);
      case 'ownership':
        return this.queryOwnership(graph, query);
      case 'hotspots':
        return this.queryHotspots(graph, query);
      case 'path':
        return this.queryPath(graph, query);
      case 'subgraph':
        return this.querySubgraph(graph, query);
      default:
        return {
          operation: 'query',
          success: false,
          error: `Unknown query type: ${query.type}`,
        };
    }
  }

  private queryNeighbors(
    graph: KnowledgeGraph,
    query: GraphQuery
  ): KnowledgeGraphAgentResult {
    if (!query.startNode) {
      return { operation: 'query', success: false, error: 'startNode is required for neighbors query' };
    }

    const node = graph.nodes.get(query.startNode);
    if (!node) {
      return { operation: 'query', success: false, error: `Node not found: ${query.startNode}` };
    }

    const incoming: Array<{ edge: GraphEdge; node: GraphNode }> = [];
    const outgoing: Array<{ edge: GraphEdge; node: GraphNode }> = [];

    for (const edge of graph.edges) {
      if (query.edgeTypes && !query.edgeTypes.includes(edge.type)) continue;

      if (edge.target === query.startNode) {
        const sourceNode = graph.nodes.get(edge.source);
        if (sourceNode && (!query.nodeTypes || query.nodeTypes.includes(sourceNode.type))) {
          incoming.push({ edge, node: sourceNode });
        }
      }

      if (edge.source === query.startNode) {
        const targetNode = graph.nodes.get(edge.target);
        if (targetNode && (!query.nodeTypes || query.nodeTypes.includes(targetNode.type))) {
          outgoing.push({ edge, node: targetNode });
        }
      }
    }

    const result: NeighborResult = { node, incoming, outgoing };

    return {
      operation: 'query',
      success: true,
      data: { queryResult: result },
    };
  }

  private queryImpact(
    graph: KnowledgeGraph,
    query: GraphQuery
  ): KnowledgeGraphAgentResult {
    if (!query.startNode) {
      return { operation: 'query', success: false, error: 'startNode is required for impact query' };
    }

    const node = graph.nodes.get(query.startNode);
    if (!node) {
      return { operation: 'query', success: false, error: `Node not found: ${query.startNode}` };
    }

    const maxDepth = query.maxDepth || 3;
    const directImpact: GraphNode[] = [];
    const transitiveImpact: GraphNode[] = [];
    const affectedTests: GraphNode[] = [];
    const visited = new Set<string>();

    // BFS to find impact
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: query.startNode, depth: 0 }];
    
    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (visited.has(nodeId) || depth > maxDepth) continue;
      visited.add(nodeId);

      for (const edge of graph.edges) {
        if (edge.source === nodeId && ['calls', 'uses', 'depends_on', 'imports'].includes(edge.type)) {
          const targetNode = graph.nodes.get(edge.target);
          if (targetNode && !visited.has(edge.target)) {
            if (depth === 0) {
              directImpact.push(targetNode);
            } else {
              transitiveImpact.push(targetNode);
            }
            
            if (targetNode.type === 'test') {
              affectedTests.push(targetNode);
            }
            
            queue.push({ nodeId: edge.target, depth: depth + 1 });
          }
        }
      }
    }

    const totalImpact = directImpact.length + transitiveImpact.length;
    const riskLevel = totalImpact > 20 ? 'critical' : totalImpact > 10 ? 'high' : totalImpact > 5 ? 'medium' : 'low';

    const result: ImpactResult = {
      directImpact,
      transitiveImpact,
      impactScore: totalImpact,
      affectedTests,
      riskLevel,
    };

    return {
      operation: 'query',
      success: true,
      data: { queryResult: result },
    };
  }

  private queryOwnership(
    graph: KnowledgeGraph,
    query: GraphQuery
  ): KnowledgeGraphAgentResult {
    if (!query.startNode) {
      return { operation: 'query', success: false, error: 'startNode is required for ownership query' };
    }

    // In production, this would query git history
    const result: OwnershipResult = {
      primaryOwners: [],
      secondaryOwners: [],
      lastModifiers: [],
      ownershipScore: 0,
    };

    return {
      operation: 'query',
      success: true,
      data: { queryResult: result },
    };
  }

  private queryHotspots(
    graph: KnowledgeGraph,
    _query: GraphQuery
  ): KnowledgeGraphAgentResult {
    // Find nodes with high modification counts and complexity
    const hotspots: Array<{
      node: GraphNode;
      changeFrequency: number;
      bugFrequency: number;
      complexity: number;
      score: number;
      contributors: string[];
    }> = [];

    for (const node of graph.nodes.values()) {
      if (node.type === 'file' || node.type === 'function' || node.type === 'class') {
        const complexity = node.metadata.complexity || 1;
        const changeFrequency = node.modificationCount;
        const score = complexity * changeFrequency;

        if (score > 1) {
          hotspots.push({
            node,
            changeFrequency,
            bugFrequency: 0, // Would come from issue tracking
            complexity,
            score,
            contributors: [],
          });
        }
      }
    }

    hotspots.sort((a, b) => b.score - a.score);

    const result: HotspotResult = {
      hotspots: hotspots.slice(0, 20),
      totalChanges: hotspots.reduce((sum, h) => sum + h.changeFrequency, 0),
      period: { start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), end: new Date() },
    };

    return {
      operation: 'query',
      success: true,
      data: { queryResult: result },
    };
  }

  private queryPath(
    graph: KnowledgeGraph,
    query: GraphQuery
  ): KnowledgeGraphAgentResult {
    if (!query.startNode || !query.endNode) {
      return { operation: 'query', success: false, error: 'startNode and endNode are required for path query' };
    }

    // BFS to find shortest path
    const visited = new Set<string>();
    const parents = new Map<string, string>();
    const queue: string[] = [query.startNode];
    visited.add(query.startNode);

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current === query.endNode) {
        // Reconstruct path
        const path: GraphNode[] = [];
        let node = query.endNode;
        while (node) {
          const graphNode = graph.nodes.get(node);
          if (graphNode) path.unshift(graphNode);
          node = parents.get(node)!;
        }
        
        return {
          operation: 'query',
          success: true,
          data: {
            queryResult: {
              paths: [path],
              shortestPath: path,
              totalPaths: 1,
            },
          },
        };
      }

      for (const edge of graph.edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          visited.add(edge.target);
          parents.set(edge.target, current);
          queue.push(edge.target);
        }
      }
    }

    return {
      operation: 'query',
      success: true,
      data: {
        queryResult: {
          paths: [],
          shortestPath: [],
          totalPaths: 0,
        },
      },
    };
  }

  private querySubgraph(
    graph: KnowledgeGraph,
    query: GraphQuery
  ): KnowledgeGraphAgentResult {
    if (!query.startNode) {
      return { operation: 'query', success: false, error: 'startNode is required for subgraph query' };
    }

    const rootNode = graph.nodes.get(query.startNode);
    if (!rootNode) {
      return { operation: 'query', success: false, error: `Node not found: ${query.startNode}` };
    }

    const maxDepth = query.maxDepth || 2;
    const subgraphNodes: GraphNode[] = [rootNode];
    const subgraphEdges: GraphEdge[] = [];
    const visited = new Set<string>([query.startNode]);

    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: query.startNode, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      for (const edge of graph.edges) {
        if (edge.source === nodeId) {
          subgraphEdges.push(edge);
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            const targetNode = graph.nodes.get(edge.target);
            if (targetNode) {
              subgraphNodes.push(targetNode);
              queue.push({ nodeId: edge.target, depth: depth + 1 });
            }
          }
        }
      }
    }

    return {
      operation: 'query',
      success: true,
      data: {
        queryResult: {
          nodes: subgraphNodes,
          edges: subgraphEdges,
          rootNode,
        },
      },
    };
  }

  private async updateGraph(
    repositoryId: string,
    files: string[]
  ): Promise<KnowledgeGraphAgentResult> {
    const graph = this.graphs.get(repositoryId);
    if (!graph) {
      return this.indexRepository(repositoryId, files, {});
    }

    logger.info({ repositoryId, fileCount: files.length }, 'Updating knowledge graph');

    // Re-index only the changed files
    for (const file of files) {
      // Remove old nodes and edges for this file
      const nodesToRemove: string[] = [];
      for (const [id, node] of graph.nodes) {
        if (node.file === file) {
          nodesToRemove.push(id);
        }
      }
      for (const id of nodesToRemove) {
        graph.nodes.delete(id);
      }

      graph.edges = graph.edges.filter(edge => 
        !nodesToRemove.includes(edge.source) && !nodesToRemove.includes(edge.target)
      );

      // Re-index the file
      const { fileNodes, fileEdges } = await this.indexFile(repositoryId, file);
      for (const node of fileNodes) {
        graph.nodes.set(node.id, node);
      }
      graph.edges.push(...fileEdges);
    }

    // Recalculate stats
    graph.stats = this.calculateStats(graph.nodes, graph.edges, 0);
    graph.lastIndexedAt = new Date();
    graph.version++;

    return {
      operation: 'update',
      success: true,
      data: {
        graph: {
          repositoryId: graph.repositoryId,
          stats: graph.stats,
          lastIndexedAt: graph.lastIndexedAt,
          version: graph.version,
        },
      },
    };
  }

  private async analyzeGraph(repositoryId: string): Promise<KnowledgeGraphAgentResult> {
    const graph = this.graphs.get(repositoryId);
    if (!graph) {
      return {
        operation: 'analyze',
        success: false,
        error: `No graph found for repository: ${repositoryId}`,
      };
    }

    // Use LLM to analyze the graph structure
    const systemPrompt = `You are a code architecture analyst. Analyze the provided code graph statistics and provide insights.`;
    
    const userPrompt = `Analyze this code graph:
- Total nodes: ${graph.stats.totalNodes}
- Total edges: ${graph.stats.totalEdges}
- Average connections: ${graph.stats.avgConnections.toFixed(2)}
- Max depth: ${graph.stats.maxDepth}

Node types: ${JSON.stringify(graph.stats.nodesByType)}
Edge types: ${JSON.stringify(graph.stats.edgesByType)}

Provide a brief analysis of the codebase structure, potential issues, and recommendations.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      await callLLM(messages, { temperature: 0.5, maxTokens: 1000 });
      
      return {
        operation: 'analyze',
        success: true,
        data: {
          graph: {
            repositoryId: graph.repositoryId,
            stats: graph.stats,
          },
        },
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to analyze graph with LLM');
      return {
        operation: 'analyze',
        success: true,
        data: {
          graph: {
            repositoryId: graph.repositoryId,
            stats: graph.stats,
          },
        },
      };
    }
  }

  // Semantic search using LLM
  async semanticSearch(
    repositoryId: string,
    query: SemanticSearchQuery
  ): Promise<SemanticSearchResult[]> {
    const graph = this.graphs.get(repositoryId);
    if (!graph) {
      return [];
    }

    const results: SemanticSearchResult[] = [];
    const queryLower = query.query.toLowerCase();

    // Simple text matching for now
    for (const node of graph.nodes.values()) {
      if (query.nodeTypes && !query.nodeTypes.includes(node.type)) continue;

      const nameLower = node.name.toLowerCase();
      const docLower = (node.metadata.documentation || '').toLowerCase();

      if (nameLower.includes(queryLower) || docLower.includes(queryLower)) {
        const score = nameLower === queryLower ? 1.0 : 
                      nameLower.startsWith(queryLower) ? 0.8 :
                      nameLower.includes(queryLower) ? 0.6 : 0.4;

        if (score >= (query.threshold || 0.5)) {
          results.push({
            node,
            score,
            matchedTerms: [query.query],
            context: node.metadata.documentation,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, query.limit || 20);
  }

  private getLanguageFromFile(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      rb: 'ruby',
    };
    return langMap[ext] || ext;
  }

  // Get graph for external use
  getGraph(repositoryId: string): KnowledgeGraph | undefined {
    return this.graphs.get(repositoryId);
  }

  // Get indexing progress
  getIndexingProgress(repositoryId: string): IndexingProgress | undefined {
    return this.indexingProgress.get(repositoryId);
  }
}

export const knowledgeGraphAgent = new KnowledgeGraphAgent();
