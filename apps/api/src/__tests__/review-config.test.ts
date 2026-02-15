/**
 * @fileoverview Tests for Review-as-Code Configuration Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewConfigService } from '../services/review-config.js';

describe('ReviewConfigService', () => {
  let service: ReviewConfigService;

  beforeEach(() => {
    service = new ReviewConfigService();
  });

  it('should return defaults when no config provided', () => {
    const config = service.getEffectiveConfig('test-repo');
    expect(config.review.enabled).toBe(true);
    expect(config.review.severityThreshold).toBe('medium');
    expect(config.testing.enabled).toBe(true);
  });

  it('should parse JSON config', () => {
    const config = service.parseConfig(
      '{"review": {"severityThreshold": "high", "blockOnCritical": false}}'
    );
    expect(config.review.severityThreshold).toBe('high');
    expect(config.review.blockOnCritical).toBe(false);
    expect(config.review.enabled).toBe(true); // default preserved
  });

  it('should parse simple YAML-like config', () => {
    const config = service.parseConfig(`
review:
  enabled: true
  severityThreshold: critical
testing:
  coverageTarget: 90
`);
    expect(config.review.severityThreshold).toBe('critical');
    expect(config.testing.coverageTarget).toBe(90);
  });

  it('should merge org and repo configs', () => {
    const merged = service.mergeConfigs(
      { review: { severityThreshold: 'high', maxCommentsPerFile: 5 } } as any,
      { review: { severityThreshold: 'critical' } } as any
    );
    expect(merged.review.severityThreshold).toBe('critical'); // repo overrides
    expect(merged.review.maxCommentsPerFile).toBe(5); // org preserved
  });

  it('should validate valid config', () => {
    const result = service.validateConfig('{"review": {"enabled": true}}');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.config).toBeDefined();
  });

  it('should return JSON Schema', () => {
    const schema = service.getJsonSchema();
    expect(schema.$schema).toBeDefined();
    expect(schema.title).toBe('PRFlow Configuration');
    expect(schema.properties).toBeDefined();
  });

  it('should cache configs', () => {
    const config1 = service.getEffectiveConfig(
      'repo-1',
      undefined,
      '{"review": {"enabled": false}}'
    );
    const config2 = service.getEffectiveConfig('repo-1');
    expect(config1).toEqual(config2);

    service.clearCache('repo-1');
    const config3 = service.getEffectiveConfig('repo-1');
    expect(config3.review.enabled).toBe(true); // defaults after cache clear
  });
});
