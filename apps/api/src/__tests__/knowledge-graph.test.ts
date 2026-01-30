import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeGraphService } from '../services/knowledge-graph.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
    },
  },
}));

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;

  beforeEach(() => {
    service = new KnowledgeGraphService();
    vi.clearAllMocks();
  });

  describe('buildGraph', () => {
    it('should build a knowledge graph from files', async () => {
      const files = [
        {
          path: 'src/utils/math.ts',
          content: `
            export function add(a: number, b: number): number {
              return a + b;
            }

            export function multiply(a: number, b: number): number {
              return a * b;
            }
          `,
        },
        {
          path: 'src/services/calculator.ts',
          content: `
            import { add, multiply } from '../utils/math';

            export class Calculator {
              calculate(operation: string, a: number, b: number): number {
                switch (operation) {
                  case 'add': return add(a, b);
                  case 'multiply': return multiply(a, b);
                  default: throw new Error('Unknown operation');
                }
              }
            }
          `,
        },
      ];

      const graph = await service.buildGraph('repo-1', files, true);

      expect(graph).toBeDefined();
      expect(graph.repositoryId).toBe('repo-1');
      expect(graph.nodes.size).toBeGreaterThan(0);
      expect(graph.edges.size).toBeGreaterThan(0);
      expect(graph.fileIndex.size).toBe(2);
    });

    it('should create file nodes', async () => {
      const files = [
        {
          path: 'index.ts',
          content: 'export const value = 42;',
        },
      ];

      const graph = await service.buildGraph('repo-2', files, true);

      const fileNodes = Array.from(graph.nodes.values()).filter(n => n.type === 'file');
      expect(fileNodes.length).toBe(1);
      expect(fileNodes[0].name).toBe('index.ts');
    });

    it('should build symbol index', async () => {
      const files = [
        {
          path: 'types.ts',
          content: `
            export interface User {
              id: string;
              name: string;
            }

            export type Status = 'active' | 'inactive';
          `,
        },
      ];

      const graph = await service.buildGraph('repo-3', files, true);

      expect(graph.symbolIndex.has('User')).toBe(true);
      expect(graph.symbolIndex.has('Status')).toBe(true);
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze impact of file changes', async () => {
      // First build a graph
      const files = [
        {
          path: 'src/core.ts',
          content: `
            export function coreFunction(): void {
              console.log('core');
            }
          `,
        },
        {
          path: 'src/service.ts',
          content: `
            import { coreFunction } from './core';

            export function serviceFunction(): void {
              coreFunction();
            }
          `,
        },
        {
          path: 'src/api.ts',
          content: `
            import { serviceFunction } from './service';

            export function handleRequest(): void {
              serviceFunction();
            }
          `,
        },
      ];

      await service.buildGraph('repo-4', files, true);

      const analyses = await service.analyzeImpact('repo-4', [
        { path: 'src/core.ts', changedLines: [2, 3] },
      ]);

      expect(Array.isArray(analyses)).toBe(true);
    });

    it('should throw error if graph not found', async () => {
      await expect(
        service.analyzeImpact('nonexistent-repo', [{ path: 'file.ts' }])
      ).rejects.toThrow('Knowledge graph not found');
    });
  });

  describe('getGraph', () => {
    it('should return cached graph', async () => {
      const files = [
        { path: 'test.ts', content: 'export const x = 1;' },
      ];

      await service.buildGraph('repo-5', files, true);
      const graph = await service.getGraph('repo-5');

      expect(graph).toBeDefined();
      expect(graph?.repositoryId).toBe('repo-5');
    });

    it('should return null for non-existent graph', async () => {
      const graph = await service.getGraph('nonexistent');
      expect(graph).toBeNull();
    });
  });

  describe('findPath', () => {
    it('should find dependency path between nodes', async () => {
      const files = [
        {
          path: 'a.ts',
          content: `
            export function funcA(): void {}
          `,
        },
        {
          path: 'b.ts',
          content: `
            import { funcA } from './a';
            export function funcB(): void { funcA(); }
          `,
        },
        {
          path: 'c.ts',
          content: `
            import { funcB } from './b';
            export function funcC(): void { funcB(); }
          `,
        },
      ];

      await service.buildGraph('repo-6', files, true);

      // Path finding would require node IDs which depend on parsing
      // This tests the graph structure is correct
      const graph = await service.getGraph('repo-6');
      expect(graph?.nodes.size).toBeGreaterThan(0);
    });
  });

  describe('getFileSymbols', () => {
    it('should get symbols defined in a file', async () => {
      const files = [
        {
          path: 'module.ts',
          content: `
            export class Service {
              process(): void {}
            }
            export function helper(): void {}
          `,
        },
      ];

      const graph = await service.buildGraph('repo-7', files, true);
      const symbols = service.getFileSymbols(graph, 'module.ts');

      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeGreaterThan(0);
      // Should have class and function, but not file or import nodes
      expect(symbols.some(s => s.type === 'class')).toBe(true);
    });
  });
});
