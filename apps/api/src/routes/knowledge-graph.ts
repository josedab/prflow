import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { knowledgeGraphService } from '../services/knowledge-graph.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const repositoryIdParamsSchema = z.object({
  repositoryId: z.string(),
});

const buildGraphBodySchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
});

const analyzeImpactBodySchema = z.object({
  changedFiles: z.array(z.object({
    path: z.string(),
    changedLines: z.array(z.number()).optional(),
  })),
});

const searchSymbolsQuerySchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const nodeIdParamsSchema = z.object({
  repositoryId: z.string(),
  nodeId: z.string(),
});

const findPathsQuerySchema = z.object({
  fromNodeId: z.string(),
  toNodeId: z.string(),
  maxDepth: z.coerce.number().min(1).max(20).default(10),
});

const fileSymbolsParamsSchema = z.object({
  repositoryId: z.string(),
  '*': z.string(), // file path
});

export async function knowledgeGraphRoutes(app: FastifyInstance) {
  /**
   * Build knowledge graph for a repository
   */
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof buildGraphBodySchema>;
  }>(
    '/:repositoryId/build',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const { files } = buildGraphBodySchema.parse(request.body);

      const graph = await knowledgeGraphService.buildGraph(repositoryId, files);
      const stats = knowledgeGraphService.getStats(graph);

      return {
        repositoryId,
        success: true,
        stats,
        lastUpdated: graph.lastUpdated.toISOString(),
      };
    }
  );

  /**
   * Get knowledge graph stats
   */
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/:repositoryId/stats',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const stats = knowledgeGraphService.getStats(graph);

      return {
        repositoryId,
        stats,
        lastUpdated: graph.lastUpdated.toISOString(),
      };
    }
  );

  /**
   * Analyze impact of changes
   */
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof analyzeImpactBodySchema>;
  }>(
    '/:repositoryId/impact',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const { changedFiles } = analyzeImpactBodySchema.parse(request.body);

      try {
        const analyses = await knowledgeGraphService.analyzeImpact(repositoryId, changedFiles);

        // Format response
        const results = analyses.map((analysis) => ({
          changedNode: {
            id: analysis.changedNode.id,
            name: analysis.changedNode.name,
            type: analysis.changedNode.type,
            file: analysis.changedNode.file,
            lines: `${analysis.changedNode.startLine}-${analysis.changedNode.endLine}`,
          },
          impact: {
            directDependents: analysis.directDependents.length,
            transitiveDependents: analysis.transitiveDependents.length,
            blastRadius: analysis.blastRadius,
            riskScore: analysis.riskScore,
          },
          directDependents: analysis.directDependents.slice(0, 10).map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            file: n.file,
          })),
          affectedTests: analysis.affectedTests,
        }));

        // Summary
        const totalBlastRadius = analyses.reduce((sum, a) => sum + a.blastRadius, 0);
        const maxRiskScore = analyses.length > 0 
          ? Math.max(...analyses.map((a) => a.riskScore))
          : 0;
        const uniqueAffectedFiles = new Set(
          analyses.flatMap((a) => [
            ...a.directDependents.map((n) => n.file),
            ...a.transitiveDependents.map((n) => n.file),
          ])
        );

        return {
          repositoryId,
          summary: {
            changedSymbols: analyses.length,
            totalBlastRadius,
            maxRiskScore,
            affectedFilesCount: uniqueAffectedFiles.size,
            affectedTestsCount: new Set(analyses.flatMap((a) => a.affectedTests)).size,
          },
          analyses: results,
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to analyze impact');
        
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Knowledge graph', repositoryId);
        }
        
        throw error;
      }
    }
  );

  /**
   * Get visualization for impact analysis
   */
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof analyzeImpactBodySchema>;
  }>(
    '/:repositoryId/visualize',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const { changedFiles } = analyzeImpactBodySchema.parse(request.body);

      try {
        const analyses = await knowledgeGraphService.analyzeImpact(repositoryId, changedFiles);

        // Merge visualizations from all analyses
        const mergedNodes = new Map<string, (typeof analyses)[0]['visualization']['nodes'][0]>();
        const mergedEdges = new Map<string, (typeof analyses)[0]['visualization']['edges'][0]>();

        for (const analysis of analyses) {
          for (const node of analysis.visualization.nodes) {
            if (!mergedNodes.has(node.id)) {
              mergedNodes.set(node.id, node);
            } else {
              // Upgrade impact level if needed
              const existing = mergedNodes.get(node.id)!;
              if (node.impactLevel === 'changed' || 
                  (node.impactLevel === 'direct' && existing.impactLevel !== 'changed')) {
                mergedNodes.set(node.id, node);
              }
            }
          }

          for (const edge of analysis.visualization.edges) {
            if (!mergedEdges.has(edge.id)) {
              mergedEdges.set(edge.id, edge);
            }
          }
        }

        return {
          repositoryId,
          visualization: {
            nodes: Array.from(mergedNodes.values()),
            edges: Array.from(mergedEdges.values()),
          },
          legend: {
            nodeTypes: {
              class: 'Class definition',
              interface: 'Interface/Type definition',
              function: 'Function',
              method: 'Class method',
              constant: 'Constant',
              variable: 'Variable',
            },
            impactLevels: {
              changed: 'Directly modified',
              direct: 'Direct dependent',
              transitive: 'Transitive dependent',
              unaffected: 'Not affected',
            },
            edgeTypes: {
              calls: 'Function call',
              extends: 'Inheritance',
              implements: 'Interface implementation',
              imports: 'Import dependency',
              uses: 'Reference',
            },
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to generate visualization');
        
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Knowledge graph', repositoryId);
        }
        
        throw error;
      }
    }
  );

  /**
   * Search symbols in the graph
   */
  app.get<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Querystring: z.infer<typeof searchSymbolsQuerySchema>;
  }>(
    '/:repositoryId/search',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const { query, limit } = searchSymbolsQuerySchema.parse(request.query);

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const results = knowledgeGraphService.searchSymbols(graph, query);

      return {
        repositoryId,
        query,
        results: results.slice(0, limit).map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          file: node.file,
          lines: `${node.startLine}-${node.endLine}`,
          signature: node.signature,
        })),
        totalMatches: results.length,
      };
    }
  );

  /**
   * Get node details with dependencies
   */
  app.get<{ Params: z.infer<typeof nodeIdParamsSchema> }>(
    '/:repositoryId/nodes/:nodeId',
    async (request) => {
      const { repositoryId, nodeId } = nodeIdParamsSchema.parse(request.params);

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const node = graph.nodes.get(nodeId);
      if (!node) {
        throw new NotFoundError('Node', nodeId);
      }

      const incomingEdges = knowledgeGraphService.getIncomingEdges(graph, nodeId);
      const outgoingEdges = knowledgeGraphService.getOutgoingEdges(graph, nodeId);

      return {
        node: {
          id: node.id,
          name: node.name,
          type: node.type,
          file: node.file,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: node.signature,
          modifiers: node.modifiers,
          docComment: node.docComment,
        },
        dependencies: {
          dependsOn: outgoingEdges.map((e) => ({
            nodeId: e.target,
            type: e.type,
            node: graph.nodes.get(e.target),
          })).filter((d) => d.node).map((d) => ({
            id: d.nodeId,
            name: d.node!.name,
            type: d.node!.type,
            relationshipType: d.type,
          })),
          dependedOnBy: incomingEdges.map((e) => ({
            nodeId: e.source,
            type: e.type,
            node: graph.nodes.get(e.source),
          })).filter((d) => d.node).map((d) => ({
            id: d.nodeId,
            name: d.node!.name,
            type: d.node!.type,
            relationshipType: d.type,
          })),
        },
      };
    }
  );

  /**
   * Find paths between two nodes
   */
  app.get<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Querystring: z.infer<typeof findPathsQuerySchema>;
  }>(
    '/:repositoryId/paths',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const { fromNodeId, toNodeId, maxDepth } = findPathsQuerySchema.parse(request.query);

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const paths = knowledgeGraphService.findDependencyPaths(
        graph,
        fromNodeId,
        toNodeId,
        maxDepth
      );

      return {
        repositoryId,
        from: fromNodeId,
        to: toNodeId,
        pathCount: paths.length,
        paths: paths.slice(0, 10).map((p) => ({
          length: p.path.length,
          path: p.path.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
          })),
          edgeTypes: p.edgeTypes,
        })),
      };
    }
  );

  /**
   * Get symbols in a specific file
   */
  app.get<{ Params: z.infer<typeof fileSymbolsParamsSchema> }>(
    '/:repositoryId/files/*',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);
      const filePath = (request.params as { '*': string })['*'];

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const symbols = knowledgeGraphService.getFileSymbols(graph, filePath);

      return {
        repositoryId,
        file: filePath,
        symbols: symbols.map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type,
          startLine: s.startLine,
          endLine: s.endLine,
          signature: s.signature,
          modifiers: s.modifiers,
        })),
      };
    }
  );

  /**
   * Clear graph cache
   */
  app.delete<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/:repositoryId',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);

      knowledgeGraphService.clearCache(repositoryId);

      return {
        success: true,
        message: `Graph cache cleared for repository ${repositoryId}`,
      };
    }
  );

  /**
   * Get all files in graph
   */
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/:repositoryId/files',
    async (request) => {
      const { repositoryId } = repositoryIdParamsSchema.parse(request.params);

      const graph = await knowledgeGraphService.getGraph(repositoryId);
      if (!graph) {
        throw new NotFoundError('Knowledge graph', repositoryId);
      }

      const files = Array.from(graph.fileIndex.keys()).map((file) => {
        const nodeIds = graph.fileIndex.get(file) || [];
        const symbolCount = nodeIds.filter((id) => {
          const node = graph.nodes.get(id);
          return node && node.type !== 'file' && node.type !== 'import';
        }).length;

        return {
          path: file,
          symbolCount,
        };
      });

      return {
        repositoryId,
        fileCount: files.length,
        files: files.sort((a, b) => b.symbolCount - a.symbolCount),
      };
    }
  );
}
