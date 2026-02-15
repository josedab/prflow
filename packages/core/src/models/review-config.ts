/**
 * @fileoverview Types for Review-as-Code configuration (.prflowrc)
 */

import { z } from 'zod';

export const ReviewSeverityOverrideSchema = z.object({
  rule: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'nitpick', 'off']),
});

export const ReviewConfigSchema = z.object({
  version: z.number().default(1),
  extends: z.string().optional(),

  review: z
    .object({
      enabled: z.boolean().default(true),
      severityThreshold: z.enum(['critical', 'high', 'medium', 'low', 'nitpick']).default('medium'),
      autoFixStyle: z.boolean().default(true),
      blockOnCritical: z.boolean().default(true),
      maxCommentsPerFile: z.number().min(1).max(50).default(10),
      severityOverrides: z.array(ReviewSeverityOverrideSchema).default([]),
    })
    .default({}),

  testing: z
    .object({
      enabled: z.boolean().default(true),
      framework: z.enum(['jest', 'vitest', 'mocha', 'pytest', 'go_test', 'auto']).default('auto'),
      coverageTarget: z.number().min(0).max(100).default(80),
      generateForNewFunctions: z.boolean().default(true),
    })
    .default({}),

  documentation: z
    .object({
      enabled: z.boolean().default(true),
      generateJsdoc: z.boolean().default(true),
      updateReadme: z.boolean().default(false),
      updateChangelog: z.boolean().default(true),
    })
    .default({}),

  ignore: z
    .object({
      paths: z.array(z.string()).default([]),
      patterns: z.array(z.string()).default([]),
      rules: z.array(z.string()).default([]),
    })
    .default({}),

  merge: z
    .object({
      autoMergeEnabled: z.boolean().default(false),
      requiredChecks: z.array(z.string()).default([]),
      requiredApprovals: z.number().min(0).default(1),
      allowedMethods: z.array(z.enum(['merge', 'squash', 'rebase'])).default(['squash']),
      deleteOnMerge: z.boolean().default(true),
    })
    .default({}),

  personas: z
    .object({
      defaultPersona: z.enum(['strict', 'balanced', 'mentor', 'quick']).default('balanced'),
      securityReview: z.boolean().default(true),
      performanceReview: z.boolean().default(true),
    })
    .default({}),

  llm: z
    .object({
      provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'auto']).default('auto'),
      routingStrategy: z
        .enum(['cost-optimized', 'quality-optimized', 'latency-optimized', 'air-gapped'])
        .default('quality-optimized'),
    })
    .default({}),
});

export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ReviewSeverityOverride = z.infer<typeof ReviewSeverityOverrideSchema>;
