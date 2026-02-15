/**
 * @fileoverview Review-as-Code Configuration Service
 *
 * Loads, validates, and merges .prflowrc.yml configuration files
 * with support for org-level inheritance.
 */

import { logger } from '../lib/logger.js';
import { ReviewConfigSchema, type ReviewConfig } from '@prflow/core';

const DEFAULT_CONFIG: ReviewConfig = ReviewConfigSchema.parse({});

export class ReviewConfigService {
  private configCache = new Map<string, { config: ReviewConfig; loadedAt: Date }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  /**
   * Parse and validate a .prflowrc.yml config string.
   */
  parseConfig(content: string): ReviewConfig {
    try {
      const parsed = this.parseYamlLike(content);
      return ReviewConfigSchema.parse(parsed);
    } catch (error) {
      logger.warn({ error }, 'Failed to parse .prflowrc config, using defaults');
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Merge org-level config with repo-level config (repo overrides org).
   */
  mergeConfigs(orgConfig: Partial<ReviewConfig>, repoConfig: Partial<ReviewConfig>): ReviewConfig {
    const merged = this.deepMerge(
      JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
      orgConfig,
      repoConfig
    );
    return ReviewConfigSchema.parse(merged);
  }

  /**
   * Get effective config for a repository, checking cache first.
   */
  getEffectiveConfig(
    repositoryId: string,
    orgConfigContent?: string,
    repoConfigContent?: string
  ): ReviewConfig {
    const cached = this.configCache.get(repositoryId);
    if (cached && Date.now() - cached.loadedAt.getTime() < this.cacheTtlMs) {
      return cached.config;
    }

    const orgConfig = orgConfigContent ? this.parseConfig(orgConfigContent) : {};
    const repoConfig = repoConfigContent ? this.parseConfig(repoConfigContent) : {};
    const effective = this.mergeConfigs(orgConfig, repoConfig);

    this.configCache.set(repositoryId, { config: effective, loadedAt: new Date() });
    return effective;
  }

  /**
   * Validate a config string without applying it.
   */
  validateConfig(content: string): { valid: boolean; errors: string[]; config?: ReviewConfig } {
    try {
      const parsed = this.parseYamlLike(content);
      const result = ReviewConfigSchema.safeParse(parsed);
      if (result.success) {
        return { valid: true, errors: [], config: result.data };
      }
      return {
        valid: false,
        errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    } catch (error) {
      return { valid: false, errors: [(error as Error).message] };
    }
  }

  /**
   * Generate a JSON Schema for IDE autocompletion.
   */
  getJsonSchema(): Record<string, unknown> {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'PRFlow Configuration',
      description: 'Configuration for PRFlow review automation',
      type: 'object',
      properties: {
        version: { type: 'number', default: 1 },
        extends: { type: 'string', description: 'Path to parent config to inherit from' },
        review: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            severityThreshold: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low', 'nitpick'],
            },
            autoFixStyle: { type: 'boolean', default: true },
            blockOnCritical: { type: 'boolean', default: true },
            maxCommentsPerFile: { type: 'number', minimum: 1, maximum: 50 },
          },
        },
        testing: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            framework: {
              type: 'string',
              enum: ['jest', 'vitest', 'mocha', 'pytest', 'go_test', 'auto'],
            },
            coverageTarget: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
        ignore: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' } },
            patterns: { type: 'array', items: { type: 'string' } },
            rules: { type: 'array', items: { type: 'string' } },
          },
        },
        merge: {
          type: 'object',
          properties: {
            autoMergeEnabled: { type: 'boolean', default: false },
            requiredApprovals: { type: 'number', minimum: 0 },
          },
        },
      },
    };
  }

  clearCache(repositoryId?: string): void {
    if (repositoryId) {
      this.configCache.delete(repositoryId);
    } else {
      this.configCache.clear();
    }
  }

  /**
   * Simple YAML-like parser for .prflowrc files.
   * Handles JSON and basic key-value YAML structures.
   */
  private parseYamlLike(content: string): Record<string, unknown> {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }

    const result: Record<string, unknown> = {};
    let currentSection: string | null = null;
    let currentObj: Record<string, unknown> = result;

    for (const line of trimmed.split('\n')) {
      const stripped = line.replace(/#.*$/, '').trimEnd();
      if (!stripped.trim()) continue;

      const indent = stripped.length - stripped.trimStart().length;
      const keyVal = stripped.trim();

      if (indent === 0 && keyVal.endsWith(':') && !keyVal.includes(' ')) {
        currentSection = keyVal.slice(0, -1);
        result[currentSection] = {};
        currentObj = result[currentSection] as Record<string, unknown>;
      } else if (keyVal.includes(':')) {
        const colonIdx = keyVal.indexOf(':');
        const key = keyVal.slice(0, colonIdx).trim();
        const val = keyVal.slice(colonIdx + 1).trim();
        if (val) {
          currentObj[key] = this.parseValue(val);
        }
      }
    }

    return result;
  }

  private parseValue(val: string): unknown {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    const num = Number(val);
    if (!isNaN(num) && val !== '') return num;
    if (val.startsWith('[') && val.endsWith(']')) {
      try {
        return JSON.parse(val);
      } catch {
        /* not valid JSON array */
      }
    }
    return val.replace(/^['"]|['"]$/g, '');
  }

  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (
          value !== undefined &&
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          result[key] = this.deepMerge(
            (result[key] as Record<string, unknown>) || {},
            value as Record<string, unknown>
          );
        } else if (value !== undefined) {
          result[key] = value;
        }
      }
    }
    return result;
  }
}

export const reviewConfigService = new ReviewConfigService();
