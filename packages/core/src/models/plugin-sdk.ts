/**
 * @fileoverview Types for Plugin SDK
 */

import { z } from 'zod';

export const PluginTypeSchema = z.enum(['agent', 'rule', 'integration', 'formatter']);
export type PluginType = z.infer<typeof PluginTypeSchema>;

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  main: string;
  permissions: string[];
  config?: Record<
    string,
    {
      type: string;
      description: string;
      default?: unknown;
      required?: boolean;
    }
  >;
}

export interface PluginInput {
  diff: {
    files: Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
    totalAdditions: number;
    totalDeletions: number;
  };
  context: {
    repositoryId: string;
    owner: string;
    repo: string;
    prNumber: number;
    author: string;
  };
  config: Record<string, unknown>;
}

export interface PluginFinding {
  file: string;
  line: number;
  endLine?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'nitpick';
  category: string;
  message: string;
  suggestion?: {
    originalCode: string;
    suggestedCode: string;
  };
}

export interface PluginOutput {
  findings: PluginFinding[];
  metadata?: Record<string, unknown>;
}

export interface PluginRegistryEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  type: PluginType;
  downloads: number;
  rating: number;
  installedAt?: Date;
  enabled: boolean;
}
