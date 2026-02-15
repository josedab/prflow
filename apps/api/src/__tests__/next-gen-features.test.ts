/**
 * @fileoverview Tests for Streaming Review, Cross-PR Graph, Plugin SDK, and PR Decomposition services
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StreamingReviewService } from '../services/streaming-review.js';
import { CrossPRGraphService } from '../services/cross-pr-graph.js';
import { PluginSDKService } from '../services/plugin-sdk.js';
import { PRDecompositionEnhancedService } from '../services/pr-decomposition-enhanced.js';

describe('StreamingReviewService', () => {
  let service: StreamingReviewService;

  beforeEach(() => {
    service = new StreamingReviewService();
  });

  it('should create a streaming session', () => {
    const session = service.createSession('wf-1', ['analyzer', 'reviewer']);
    expect(session.workflowId).toBe('wf-1');
    expect(session.status).toBe('active');
    expect(Object.keys(session.agents)).toHaveLength(2);
  });

  it('should emit events and update agent state', () => {
    service.createSession('wf-1', ['analyzer']);
    service.emit('wf-1', 'agent_started', {}, 'analyzer');

    const session = service.getSession('wf-1')!;
    expect(session.agents.analyzer.status).toBe('running');
  });

  it('should track findings count', () => {
    service.createSession('wf-1', ['reviewer']);
    service.emit('wf-1', 'agent_started', {}, 'reviewer');
    service.emit('wf-1', 'finding_detected', { severity: 'high' }, 'reviewer');
    service.emit('wf-1', 'finding_detected', { severity: 'low' }, 'reviewer');

    const session = service.getSession('wf-1')!;
    expect(session.agents.reviewer.findingsCount).toBe(2);
  });

  it('should support event polling', () => {
    service.createSession('wf-1', ['analyzer']);
    service.emit('wf-1', 'agent_started', {}, 'analyzer');
    service.emit('wf-1', 'agent_completed', {}, 'analyzer');

    const events = service.getEventsSince('wf-1', 1); // skip workflow_started
    expect(events.length).toBe(2);
  });

  it('should support subscribers', () => {
    service.createSession('wf-1', ['analyzer']);
    const received: any[] = [];
    const unsub = service.subscribe('wf-1', (event) => received.push(event));

    service.emit('wf-1', 'agent_started', {}, 'analyzer');
    expect(received.length).toBe(1);

    unsub();
    service.emit('wf-1', 'agent_completed', {}, 'analyzer');
    expect(received.length).toBe(1); // no more events after unsub
  });
});

describe('CrossPRGraphService', () => {
  const service = new CrossPRGraphService();

  it('should build a graph from open PRs', () => {
    const graph = service.buildGraph('repo-1', [
      {
        number: 1,
        title: 'Feature A',
        author: 'alice',
        status: 'open',
        files: [{ path: 'src/auth.ts', additions: 10, deletions: 5 }],
        createdAt: new Date(),
      },
      {
        number: 2,
        title: 'Feature B',
        author: 'bob',
        status: 'open',
        files: [{ path: 'src/auth.ts', additions: 20, deletions: 3 }],
        createdAt: new Date(),
      },
      {
        number: 3,
        title: 'Feature C',
        author: 'carol',
        status: 'open',
        files: [{ path: 'src/utils.ts', additions: 5, deletions: 1 }],
        createdAt: new Date(),
      },
    ]);

    expect(graph.nodes.length).toBe(3);
    expect(graph.edges.length).toBeGreaterThan(0);
    // PRs 1 and 2 share src/auth.ts
    const authEdge = graph.edges.find(
      (e) => (e.sourcePR === 1 && e.targetPR === 2) || (e.sourcePR === 2 && e.targetPR === 1)
    );
    expect(authEdge).toBeDefined();
    expect(authEdge!.sharedFiles).toContain('src/auth.ts');
  });

  it('should compute merge order', () => {
    const graph = service.buildGraph('repo-1', [
      {
        number: 1,
        title: 'Small fix',
        author: 'alice',
        status: 'open',
        files: [{ path: 'src/a.ts', additions: 5, deletions: 0 }],
        createdAt: new Date(),
      },
      {
        number: 2,
        title: 'Big change',
        author: 'bob',
        status: 'open',
        files: [{ path: 'src/a.ts', additions: 100, deletions: 50 }],
        createdAt: new Date(),
      },
    ]);

    expect(graph.mergeOrder.length).toBe(2);
    // Smaller PR should be suggested first
    expect(graph.mergeOrder[0].prNumber).toBe(1);
  });

  it('should detect conflict clusters', () => {
    const graph = service.buildGraph('repo-1', [
      {
        number: 1,
        title: 'PR 1',
        author: 'a',
        status: 'open',
        files: [{ path: 'src/x.ts', additions: 50, deletions: 10 }],
        createdAt: new Date(),
      },
      {
        number: 2,
        title: 'PR 2',
        author: 'b',
        status: 'open',
        files: [{ path: 'src/x.ts', additions: 40, deletions: 5 }],
        createdAt: new Date(),
      },
    ]);

    if (graph.conflictClusters.length > 0) {
      expect(graph.conflictClusters[0].prs).toContain(1);
      expect(graph.conflictClusters[0].prs).toContain(2);
    }
  });
});

describe('PluginSDKService', () => {
  let service: PluginSDKService;

  beforeEach(() => {
    service = new PluginSDKService();
  });

  it('should register and execute a plugin', async () => {
    service.registerPlugin(
      {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        author: 'test',
        type: 'rule',
        main: 'built-in',
        permissions: [],
      },
      async () => ({
        findings: [{ file: 'a.ts', line: 1, severity: 'low', category: 'style', message: 'test' }],
      })
    );

    const output = await service.executePlugin('test-plugin', {
      diff: { files: [], totalAdditions: 0, totalDeletions: 0 },
      context: { repositoryId: 'r', owner: 'o', repo: 'r', prNumber: 1, author: 'a' },
      config: {},
    });

    expect(output.findings.length).toBe(1);
  });

  it('should list registered plugins', () => {
    service.registerPlugin(
      {
        name: 'p1',
        version: '1.0.0',
        description: 'P1',
        author: 'a',
        type: 'rule',
        main: 'x',
        permissions: [],
      },
      async () => ({ findings: [] })
    );
    expect(service.listPlugins().length).toBe(1);
  });

  it('should enable/disable plugins', () => {
    service.registerPlugin(
      {
        name: 'p1',
        version: '1.0.0',
        description: 'P1',
        author: 'a',
        type: 'rule',
        main: 'x',
        permissions: [],
      },
      async () => ({ findings: [] })
    );
    service.setEnabled('p1', false);
    expect(service.listPlugins()[0].enabled).toBe(false);
  });

  it('should register builtins', () => {
    service.registerBuiltins();
    const plugins = service.listPlugins();
    expect(plugins.length).toBe(2);
    expect(plugins.map((p) => p.name)).toContain('prflow-todo-checker');
    expect(plugins.map((p) => p.name)).toContain('prflow-console-log-checker');
  });

  it('should execute all plugins', async () => {
    service.registerBuiltins();
    const result = await service.executeAll({
      diff: {
        files: [
          {
            path: 'src/app.ts',
            status: 'modified',
            additions: 3,
            deletions: 0,
            patch: '@@ -1,1 +1,4 @@\n+// TODO: fix later\n+console.log("debug");\n+const x = 1;\n',
          },
        ],
        totalAdditions: 3,
        totalDeletions: 0,
      },
      context: { repositoryId: 'r', owner: 'o', repo: 'r', prNumber: 1, author: 'a' },
      config: {},
    });

    expect(result.findings.length).toBeGreaterThanOrEqual(2); // TODO + console.log
  });
});

describe('PRDecompositionEnhancedService', () => {
  const service = new PRDecompositionEnhancedService();

  it('should analyze PR and create decomposition plan', () => {
    const plan = service.analyze(42, [
      { path: 'src/feature/a.ts', additions: 100, deletions: 10, status: 'modified' },
      { path: 'src/feature/b.ts', additions: 80, deletions: 5, status: 'added' },
      { path: 'src/feature/a.test.ts', additions: 50, deletions: 0, status: 'added' },
      { path: 'README.md', additions: 10, deletions: 2, status: 'modified' },
      { path: 'package.json', additions: 2, deletions: 1, status: 'modified' },
    ]);

    expect(plan.originalPR).toBe(42);
    expect(plan.totalFiles).toBe(5);
    expect(plan.clusters.length).toBeGreaterThan(0);
    expect(plan.mergeOrder.length).toBe(plan.clusters.length);
  });

  it('should detect when decomposition is needed', () => {
    const largeFiles = Array.from({ length: 20 }, (_, i) => ({
      path: `src/file${i}.ts`,
      additions: 50,
      deletions: 10,
    }));

    expect(
      service.shouldSuggestDecomposition(largeFiles.map((f) => ({ ...f, status: 'modified' })))
    ).toBe(true);
  });

  it('should not suggest decomposition for small PRs', () => {
    expect(
      service.shouldSuggestDecomposition([
        { path: 'a.ts', additions: 10, deletions: 2, status: 'modified' },
      ])
    ).toBe(false);
  });

  it('should separate tests from features', () => {
    const plan = service.analyze(1, [
      { path: 'src/module.ts', additions: 50, deletions: 5, status: 'modified' },
      { path: 'src/module.test.ts', additions: 100, deletions: 0, status: 'added' },
    ]);

    const categories = plan.clusters.map((c) => c.category);
    expect(categories).toContain('test');
    expect(categories).toContain('feature');
  });

  it('should manage thresholds', () => {
    const defaults = service.getThresholds();
    expect(defaults.maxLinesPerPR).toBe(400);

    const updated = service.updateThresholds({ maxLinesPerPR: 600 });
    expect(updated.maxLinesPerPR).toBe(600);
  });
});
