import { describe, it, expect, beforeEach } from 'vitest';
import { CompliancePolicyService } from '../services/compliance-policies.js';

describe('CompliancePolicyService', () => {
  let service: CompliancePolicyService;

  beforeEach(() => {
    service = new CompliancePolicyService();
  });

  it('should register and retrieve a policy', () => {
    const policy = {
      id: 'test-policy',
      name: 'Test Policy',
      version: '1.0.0',
      description: 'test',
      framework: 'SOC2',
      organizationId: 'org-1',
      rules: [],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    service.registerPolicy(policy);
    expect(service.getPolicy('test-policy')).toBeDefined();
    expect(service.getPolicy('test-policy')?.name).toBe('Test Policy');
  });

  it('should evaluate a policy with violations', () => {
    service.createPolicyFromTemplate('soc2-basic', 'org-1');
    const policies = service.listPolicies('org-1');
    expect(policies.length).toBe(1);

    const result = service.evaluate(policies[0]!.id, {
      pullRequest: {
        number: 1,
        title: 'test',
        author: 'dev',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature',
        filesChanged: 5,
        additions: 100,
        deletions: 50,
      },
      files: [{ path: 'src/app.ts', status: 'modified', additions: 100, deletions: 50 }],
      repository: { id: 'repo-1', name: 'test-repo', owner: 'org' },
      approvals: 0,
      checks: [],
    });

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.blocksMerge).toBe(true);
  });

  it('should pass evaluation when conditions not met', () => {
    service.createPolicyFromTemplate('soc2-basic', 'org-1');
    const policies = service.listPolicies('org-1');

    const result = service.evaluate(policies[0]!.id, {
      pullRequest: {
        number: 1,
        title: 'test',
        author: 'dev',
        labels: [],
        baseBranch: 'develop',
        headBranch: 'feature',
        filesChanged: 5,
        additions: 100,
        deletions: 50,
      },
      files: [],
      repository: { id: 'repo-1', name: 'test', owner: 'org' },
      approvals: 2,
      checks: [],
    });

    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should list built-in templates', () => {
    const templates = service.listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates.some((t) => t.framework === 'SOC2')).toBe(true);
    expect(templates.some((t) => t.framework === 'HIPAA')).toBe(true);
    expect(templates.some((t) => t.framework === 'GDPR')).toBe(true);
  });

  it('should create policy from template', () => {
    const policy = service.createPolicyFromTemplate('hipaa-basic', 'org-2', {
      name: 'Custom HIPAA',
    });
    expect(policy).not.toBeNull();
    expect(policy!.name).toBe('Custom HIPAA');
    expect(policy!.framework).toBe('HIPAA');
  });

  it('should delete a policy', () => {
    service.createPolicyFromTemplate('soc2-basic', 'org-1');
    const policies = service.listPolicies('org-1');
    expect(policies.length).toBe(1);
    service.deletePolicy(policies[0]!.id);
    expect(service.listPolicies('org-1').length).toBe(0);
  });

  it('should evaluate all policies for an org', () => {
    service.createPolicyFromTemplate('soc2-basic', 'org-1');
    service.createPolicyFromTemplate('gdpr-basic', 'org-1');

    const results = service.evaluateAll('org-1', {
      pullRequest: {
        number: 1,
        title: 'test',
        author: 'dev',
        labels: [],
        baseBranch: 'main',
        headBranch: 'feature',
        filesChanged: 10,
        additions: 100,
        deletions: 50,
      },
      files: [{ path: 'src/user-service.ts', status: 'modified', additions: 50, deletions: 20 }],
      repository: { id: 'repo-1', name: 'test', owner: 'org' },
      approvals: 0,
      checks: [],
    });

    expect(results.length).toBe(2);
  });
});
