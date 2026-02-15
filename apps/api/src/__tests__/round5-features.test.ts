import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewMemoryService } from '../services/review-memory.js';
import { AutoFixService } from '../services/auto-fix-pipeline.js';
import { MergeTrainService } from '../services/merge-train.js';
import { MultiTenancyService } from '../services/multi-tenancy.js';
import { NLCreationV2Service } from '../services/nl-creation-v2.js';
import { CollaborativeReviewV2Service } from '../services/collaborative-review-v2.js';
import { ReviewInEditorService } from '../services/review-in-editor.js';

describe('ReviewMemoryService', () => {
  let service: ReviewMemoryService;

  beforeEach(() => {
    service = new ReviewMemoryService();
  });

  it('should add entries and search by text', () => {
    service.addEntry({
      id: 'mem-1',
      repositoryId: 'repo-1',
      organizationId: 'org-1',
      pullRequestNumber: 42,
      rule: 'no-eval',
      decision: 'accepted',
      context: 'eval usage in config parser',
      codeSnippet: 'eval(input)',
      filePath: 'src/parser.ts',
      author: 'dev1',
      reviewer: 'dev2',
      timestamp: new Date(),
      tags: ['eval', 'security'],
    });

    const results = service.search({ organizationId: 'org-1', text: 'eval config parser' });
    expect(results.length).toBe(1);
    expect(results[0]!.entry.rule).toBe('no-eval');
  });

  it('should find cross-PR references', () => {
    service.addEntry({
      id: 'mem-1',
      repositoryId: 'repo-1',
      organizationId: 'org-1',
      pullRequestNumber: 10,
      rule: 'no-console',
      decision: 'accepted',
      context: 'console log in production',
      codeSnippet: 'console.log(data)',
      filePath: 'src/app.ts',
      author: 'dev1',
      reviewer: 'dev2',
      timestamp: new Date(),
      tags: ['console'],
    });

    const refs = service.findCrossPRReferences('org-1', 'no-console', 'console log production', 20);
    expect(refs.length).toBe(1);
    expect(refs[0]!.targetPR).toBe(10);
    expect(refs[0]!.message).toContain('PR #10');
  });

  it('should build a memory graph', () => {
    service.addEntry({
      id: 'mem-1',
      repositoryId: 'repo-1',
      organizationId: 'org-1',
      pullRequestNumber: 1,
      rule: 'no-eval',
      decision: 'rejected',
      context: 'test',
      codeSnippet: 'test',
      filePath: 'src/a.ts',
      author: 'dev1',
      reviewer: 'dev2',
      timestamp: new Date(),
      tags: [],
    });

    const graph = service.buildGraph('org-1');
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it('should compute stats', () => {
    service.addEntry({
      id: 'mem-1',
      repositoryId: 'repo-1',
      organizationId: 'org-1',
      pullRequestNumber: 1,
      rule: 'no-eval',
      decision: 'accepted',
      context: 'test',
      codeSnippet: 'test',
      filePath: 'src/a.ts',
      author: 'dev1',
      reviewer: 'dev2',
      timestamp: new Date(),
      tags: ['security'],
    });

    const stats = service.getStats('org-1');
    expect(stats.totalEntries).toBe(1);
    expect(stats.repositoriesCovered).toBe(1);
  });
});

describe('AutoFixService', () => {
  let service: AutoFixService;

  beforeEach(() => {
    service = new AutoFixService();
  });

  it('should generate a fix for console-log rule', () => {
    const fix = service.generateFix({
      issueId: 'issue-1',
      rule: 'console-log',
      filePath: 'src/app.ts',
      startLine: 10,
      endLine: 10,
      originalCode: 'console.log("debug");',
      category: 'style',
    });
    expect(fix.confidence).toBe('high');
    expect(fix.fixedCode).not.toContain('console.log');
  });

  it('should generate fix for empty-catch rule', () => {
    const fix = service.generateFix({
      issueId: 'issue-2',
      rule: 'empty-catch',
      filePath: 'src/app.ts',
      startLine: 20,
      endLine: 22,
      originalCode: 'catch (e) {}',
      category: 'error_handling',
    });
    expect(fix.confidence).toBe('high');
    expect(fix.fixedCode).toContain('logger.error');
  });

  it('should create and validate a batch', () => {
    const fix1 = service.generateFix({
      issueId: 'i1',
      rule: 'console-log',
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      originalCode: 'console.log("x");',
      category: 'style',
    });
    const fix2 = service.generateFix({
      issueId: 'i2',
      rule: 'empty-catch',
      filePath: 'b.ts',
      startLine: 5,
      endLine: 7,
      originalCode: 'catch (e) {}',
      category: 'error_handling',
    });

    const batch = service.createBatch('wf-1', 'repo-1', 42, [fix1.id, fix2.id]);
    expect(batch.fixes.length).toBe(2);

    const validation = service.validateBatch(batch.id);
    expect(validation.results.length).toBe(2);
  });

  it('should get pipeline config', () => {
    const config = service.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.autoApplyThreshold).toBe(0.85);
  });

  it('should get stats', () => {
    service.generateFix({
      issueId: 'i1',
      rule: 'console-log',
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      originalCode: 'console.log("x");',
      category: 'style',
    });

    const stats = service.getStats('org-1');
    expect(stats.totalFixesGenerated).toBe(1);
  });
});

describe('MergeTrainService', () => {
  let service: MergeTrainService;

  beforeEach(() => {
    service = new MergeTrainService();
  });

  it('should enqueue PRs with position tracking', () => {
    const e1 = service.enqueue('repo-1', { number: 1, title: 'PR 1', author: 'dev1' });
    const e2 = service.enqueue('repo-1', { number: 2, title: 'PR 2', author: 'dev2' });

    expect(e1.position).toBe(1);
    expect(e2.position).toBe(2);
    expect(e1.status).toBe('queued');
  });

  it('should respect priority ordering', () => {
    service.enqueue('repo-1', { number: 1, title: 'Normal', author: 'dev1', priority: 5 });
    service.enqueue('repo-1', { number: 2, title: 'Urgent', author: 'dev2', priority: 10 });

    const state = service.getState('repo-1');
    expect(state.queue[0]!.pullRequestNumber).toBe(2); // urgent first
  });

  it('should create batches and record results', () => {
    service.enqueue('repo-1', { number: 1, title: 'PR 1', author: 'dev1' });
    service.enqueue('repo-1', { number: 2, title: 'PR 2', author: 'dev2' });

    const batch = service.createBatch('repo-1');
    expect(batch).not.toBeNull();
    expect(batch!.entries.length).toBeGreaterThanOrEqual(1);

    service.recordBatchResult(batch!.id, true);
    const state = service.getState('repo-1');
    expect(state.completedToday).toBeGreaterThan(0);
  });

  it('should dequeue entries', () => {
    const entry = service.enqueue('repo-1', { number: 1, title: 'PR 1', author: 'dev1' });
    expect(service.dequeue('repo-1', entry.id)).toBe(true);

    const state = service.getState('repo-1');
    expect(state.queue.length).toBe(0);
  });

  it('should get metrics', () => {
    const metrics = service.getMetrics('repo-1', new Date(0), new Date());
    expect(metrics.totalMerged).toBe(0);
    expect(metrics.totalBatches).toBe(0);
  });
});

describe('MultiTenancyService', () => {
  let service: MultiTenancyService;

  beforeEach(() => {
    service = new MultiTenancyService();
  });

  it('should create and retrieve tenants', () => {
    const tenant = service.createTenant({ name: 'Acme Corp', slug: 'acme', ownerId: 'user-1' });
    expect(tenant.plan).toBe('free');
    expect(tenant.settings.maxReviewsPerMonth).toBe(50);

    const retrieved = service.getTenant(tenant.id);
    expect(retrieved?.name).toBe('Acme Corp');
  });

  it('should upgrade tenant plan', () => {
    const tenant = service.createTenant({ name: 'Corp', slug: 'corp', ownerId: 'user-1' });
    const updated = service.updatePlan(tenant.id, 'team');
    expect(updated?.plan).toBe('team');
    expect(updated?.settings.maxReviewsPerMonth).toBe(5000);
  });

  it('should generate and validate API keys', () => {
    const tenant = service.createTenant({ name: 'Corp', slug: 'corp', ownerId: 'user-1' });
    const { key, apiKey } = service.generateAPIKey(tenant.id, 'CI Key');

    expect(key).toMatch(/^prflow_/);
    expect(apiKey.enabled).toBe(true);

    const validation = service.validateAPIKey(key);
    expect(validation.valid).toBe(true);
    expect(validation.tenant?.id).toBe(tenant.id);
  });

  it('should track usage and enforce limits', () => {
    const tenant = service.createTenant({ name: 'Corp', slug: 'corp', ownerId: 'user-1' });
    expect(service.hasCapacity(tenant.id)).toBe(true);

    // Use up capacity
    for (let i = 0; i < 50; i++) {
      service.trackUsage(tenant.id, 'review', 1);
    }
    expect(service.hasCapacity(tenant.id)).toBe(false);
  });

  it('should generate billing records', () => {
    const tenant = service.createTenant({
      name: 'Corp',
      slug: 'corp',
      ownerId: 'user-1',
      plan: 'pro',
    });
    service.trackUsage(tenant.id, 'review', 10);

    const record = service.generateBillingRecord(tenant.id, new Date(0), new Date());
    expect(record.reviewCount).toBe(10);
    expect(record.totalCostCents).toBe(100); // 10 reviews * 10 cents
  });

  it('should revoke API keys', () => {
    const tenant = service.createTenant({ name: 'Corp', slug: 'corp', ownerId: 'user-1' });
    const { key, apiKey } = service.generateAPIKey(tenant.id, 'Test');

    service.revokeAPIKey(apiKey.id);
    const validation = service.validateAPIKey(key);
    expect(validation.valid).toBe(false);
  });
});

describe('NLCreationV2Service', () => {
  let service: NLCreationV2Service;

  beforeEach(() => {
    service = new NLCreationV2Service();
  });

  it('should create a request and generate a plan', () => {
    const request = service.createRequest({
      tenantId: 't-1',
      repositoryId: 'repo-1',
      description: 'Create a new API endpoint for user settings',
    });
    expect(request.phase).toBe('parsing');

    const plan = service.generatePlan(request.id);
    expect(plan).not.toBeNull();
    expect(plan!.filesToCreate.length).toBeGreaterThan(0);
    expect(plan!.approach).toContain('API');
  });

  it('should generate code files', () => {
    const request = service.createRequest({
      tenantId: 't-1',
      repositoryId: 'repo-1',
      description: 'Create a new API endpoint with tests',
    });
    service.generatePlan(request.id);
    const files = service.generateCode(request.id);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.path.includes('route'))).toBe(true);
  });

  it('should handle conversation flow and assemble PR', () => {
    const request = service.createRequest({
      tenantId: 't-1',
      repositoryId: 'repo-1',
      description: 'Build an API for user settings',
    });
    service.generatePlan(request.id);
    service.generateCode(request.id);
    service.addUserMessage(request.id, 'Looks good, proceed');

    const result = service.assemble(request.id);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.pullRequest).toBeDefined();
    expect(result!.conversationLength).toBeGreaterThan(1);
  });

  it('should get stats', () => {
    const stats = service.getStats('org-1');
    expect(stats.totalRequests).toBe(0);
  });
});

describe('CollaborativeReviewV2Service', () => {
  let service: CollaborativeReviewV2Service;

  beforeEach(() => {
    service = new CollaborativeReviewV2Service();
  });

  it('should create a session and manage participants', () => {
    const session = service.createSession({
      repositoryId: 'repo-1',
      pullRequestNumber: 42,
      title: 'Review PR #42',
      hostId: 'host-1',
      hostName: 'Alice',
    });
    expect(session.participants.length).toBe(1);

    service.joinSession(session.id, 'rev-1', 'Bob');
    const updated = service.getSession(session.id);
    expect(updated!.participants.length).toBe(2);
  });

  it('should manage discussion threads and messages', () => {
    const session = service.createSession({
      repositoryId: 'repo-1',
      pullRequestNumber: 42,
      title: 'Review',
      hostId: 'host-1',
      hostName: 'Alice',
    });

    const thread = service.createThread(session.id, {
      filePath: 'src/app.ts',
      startLine: 10,
      endLine: 15,
      authorId: 'host-1',
      authorName: 'Alice',
      initialMessage: 'This needs error handling',
    });
    expect(thread).not.toBeNull();

    const msg = service.addMessage(session.id, thread!.id, {
      authorId: 'rev-1',
      authorName: 'Bob',
      content: 'Agreed, adding try-catch',
    });
    expect(msg).not.toBeNull();

    service.resolveThread(session.id, thread!.id);
    const s = service.getSession(session.id);
    expect(s!.threads[0]!.status).toBe('resolved');
  });

  it('should record decisions and complete sessions', () => {
    const session = service.createSession({
      repositoryId: 'repo-1',
      pullRequestNumber: 42,
      title: 'Review',
      hostId: 'host-1',
      hostName: 'Alice',
    });
    service.startSession(session.id, 'host-1');

    service.recordDecision(session.id, {
      type: 'approve',
      description: 'Looks good',
      decidedBy: 'host-1',
    });

    const summary = service.completeSession(session.id);
    expect(summary).not.toBeNull();
    expect(summary!.decisionsCount).toBe(1);
    expect(summary!.participantCount).toBe(1);
  });

  it('should list sessions with filters', () => {
    service.createSession({
      repositoryId: 'repo-1',
      pullRequestNumber: 1,
      title: 'A',
      hostId: 'h1',
      hostName: 'H1',
    });
    service.createSession({
      repositoryId: 'repo-2',
      pullRequestNumber: 2,
      title: 'B',
      hostId: 'h2',
      hostName: 'H2',
    });

    expect(service.listSessions('repo-1').length).toBe(1);
    expect(service.listSessions(undefined, 'waiting').length).toBe(2);
  });

  it('should track events', () => {
    const session = service.createSession({
      repositoryId: 'repo-1',
      pullRequestNumber: 42,
      title: 'Review',
      hostId: 'host-1',
      hostName: 'Alice',
    });
    service.joinSession(session.id, 'rev-1', 'Bob');

    const events = service.getEvents(session.id);
    expect(events.length).toBeGreaterThanOrEqual(2); // join + join
  });
});

describe('ReviewInEditorService', () => {
  let service: ReviewInEditorService;

  beforeEach(() => {
    service = new ReviewInEditorService();
  });

  it('should detect console.log issues', () => {
    const result = service.analyze({
      filePath: 'src/app.ts',
      content: 'const x = 1;\nconsole.log("debug");\nconst y = 2;',
      languageId: 'typescript',
      version: 1,
    });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.rule).toBe('no-console');
  });

  it('should detect security issues (eval, hardcoded secrets)', () => {
    const result = service.analyze({
      filePath: 'src/danger.ts',
      content: 'eval("alert(1)");\nconst password = "secret123";',
      languageId: 'typescript',
      version: 1,
    });
    const rules = result.diagnostics.map((d) => d.rule);
    expect(rules).toContain('no-eval');
    expect(rules).toContain('no-hardcoded-secrets');
  });

  it('should provide quick fixes', () => {
    const result = service.analyze({
      filePath: 'src/app.ts',
      content: 'console.log("test");',
      languageId: 'typescript',
      version: 1,
    });
    expect(result.diagnostics[0]!.quickFixes.length).toBeGreaterThan(0);
    expect(result.codeActions.length).toBeGreaterThan(0);
  });

  it('should compute risk scores', () => {
    const safe = service.analyze({
      filePath: 'a.ts',
      content: 'const x = 1;',
      languageId: 'typescript',
      version: 1,
    });
    const risky = service.analyze({
      filePath: 'b.ts',
      content: 'eval("x");\npassword = "123";',
      languageId: 'typescript',
      version: 1,
    });

    expect(risky.riskScore).toBeGreaterThan(safe.riskScore);
  });

  it('should run preflight checks', () => {
    const result = service.preflight('src/app.ts', 'console.log("test");\neval("x");');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('should batch analyze multiple files', () => {
    const results = service.batchAnalyze([
      { filePath: 'a.ts', content: 'console.log("a");', languageId: 'typescript', version: 1 },
      { filePath: 'b.ts', content: 'eval("b");', languageId: 'typescript', version: 1 },
    ]);
    expect(results.length).toBe(2);
  });

  it('should track stats', () => {
    service.analyze({
      filePath: 'a.ts',
      content: 'console.log("x");',
      languageId: 'typescript',
      version: 1,
    });
    service.recordFixApplied();

    const stats = service.getStats();
    expect(stats.totalAnalyses).toBe(1);
    expect(stats.fixesAppliedInEditor).toBe(1);
  });
});
