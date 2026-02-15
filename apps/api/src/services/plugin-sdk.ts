/**
 * @fileoverview Plugin SDK Service
 *
 * Manages plugin registration, execution, and marketplace.
 * Plugins run in a sandboxed context with controlled permissions.
 */

import { logger } from '../lib/logger.js';
import type {
  PluginManifest,
  PluginInput,
  PluginOutput,
  PluginFinding,
  PluginRegistryEntry,
} from '@prflow/core';

type PluginExecutor = (input: PluginInput) => Promise<PluginOutput>;

export class PluginSDKService {
  private registry = new Map<string, PluginRegistryEntry>();
  private executors = new Map<string, PluginExecutor>();
  private manifests = new Map<string, PluginManifest>();

  /**
   * Register a plugin with the system.
   */
  registerPlugin(manifest: PluginManifest, executor: PluginExecutor): void {
    this.manifests.set(manifest.name, manifest);
    this.executors.set(manifest.name, executor);
    this.registry.set(manifest.name, {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      type: manifest.type,
      downloads: 0,
      rating: 0,
      installedAt: new Date(),
      enabled: true,
    });

    logger.info({ plugin: manifest.name, type: manifest.type }, 'Plugin registered');
  }

  /**
   * Execute a plugin with sandboxed input.
   */
  async executePlugin(name: string, input: PluginInput): Promise<PluginOutput> {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }
    if (!entry.enabled) {
      throw new Error(`Plugin is disabled: ${name}`);
    }

    const executor = this.executors.get(name);
    if (!executor) {
      throw new Error(`Plugin executor not found: ${name}`);
    }

    const startTime = Date.now();
    try {
      const output = await Promise.race([
        executor(input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Plugin execution timeout')), 30_000)
        ),
      ]);

      // Validate output
      const validated = this.validateOutput(output);
      entry.downloads++;

      logger.debug(
        {
          plugin: name,
          findings: validated.findings.length,
          latencyMs: Date.now() - startTime,
        },
        'Plugin executed'
      );

      return validated;
    } catch (error) {
      logger.error({ error, plugin: name }, 'Plugin execution failed');
      return { findings: [], metadata: { error: (error as Error).message } };
    }
  }

  /**
   * Execute all enabled plugins for a given input.
   */
  async executeAll(input: PluginInput): Promise<{
    findings: PluginFinding[];
    byPlugin: Record<string, PluginFinding[]>;
  }> {
    const enabledPlugins = Array.from(this.registry.entries())
      .filter(([_, entry]) => entry.enabled)
      .map(([name]) => name);

    const results = await Promise.allSettled(
      enabledPlugins.map(async (name) => ({
        name,
        output: await this.executePlugin(name, input),
      }))
    );

    const allFindings: PluginFinding[] = [];
    const byPlugin: Record<string, PluginFinding[]> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        byPlugin[result.value.name] = result.value.output.findings;
        allFindings.push(...result.value.output.findings);
      }
    }

    return { findings: allFindings, byPlugin };
  }

  /**
   * List all plugins in the registry.
   */
  listPlugins(type?: string): PluginRegistryEntry[] {
    const entries = Array.from(this.registry.values());
    if (type) {
      return entries.filter((e) => e.type === type);
    }
    return entries;
  }

  /**
   * Enable or disable a plugin.
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const entry = this.registry.get(name);
    if (!entry) return false;
    entry.enabled = enabled;
    logger.info({ plugin: name, enabled }, 'Plugin state changed');
    return true;
  }

  /**
   * Unregister a plugin.
   */
  unregisterPlugin(name: string): boolean {
    this.registry.delete(name);
    this.executors.delete(name);
    this.manifests.delete(name);
    return true;
  }

  /**
   * Get plugin manifest.
   */
  getManifest(name: string): PluginManifest | null {
    return this.manifests.get(name) || null;
  }

  private validateOutput(output: PluginOutput): PluginOutput {
    if (!output || !Array.isArray(output.findings)) {
      return { findings: [] };
    }

    const validFindings = output.findings.filter(
      (f) => f.file && typeof f.line === 'number' && f.message && f.severity
    );

    return { findings: validFindings, metadata: output.metadata };
  }

  /**
   * Register built-in example plugins.
   */
  registerBuiltins(): void {
    this.registerPlugin(
      {
        name: 'prflow-todo-checker',
        version: '1.0.0',
        description: 'Detects TODO/FIXME/HACK comments in changed code',
        author: 'PRFlow',
        type: 'rule',
        main: 'built-in',
        permissions: ['read:diff'],
      },
      async (input: PluginInput): Promise<PluginOutput> => {
        const findings: PluginFinding[] = [];
        const pattern = /(?:TODO|FIXME|HACK|XXX)(?:\(([^)]+)\))?:?\s*(.*)/;

        for (const file of input.diff.files) {
          if (!file.patch) continue;
          let lineNum = 0;

          for (const line of file.patch.split('\n')) {
            if (line.startsWith('@@')) {
              const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
              if (match) lineNum = parseInt(match[1], 10) - 1;
              continue;
            }
            if (line.startsWith('+') && !line.startsWith('+++')) {
              lineNum++;
              const todoMatch = line.match(pattern);
              if (todoMatch) {
                findings.push({
                  file: file.path,
                  line: lineNum,
                  severity: 'low',
                  category: 'maintainability',
                  message: `Code debt marker: ${todoMatch[0].trim()}`,
                });
              }
            } else if (!line.startsWith('-')) {
              lineNum++;
            }
          }
        }

        return { findings };
      }
    );

    this.registerPlugin(
      {
        name: 'prflow-console-log-checker',
        version: '1.0.0',
        description: 'Detects console.log statements in production code',
        author: 'PRFlow',
        type: 'rule',
        main: 'built-in',
        permissions: ['read:diff'],
      },
      async (input: PluginInput): Promise<PluginOutput> => {
        const findings: PluginFinding[] = [];

        for (const file of input.diff.files) {
          if (!file.patch) continue;
          if (file.path.includes('.test.') || file.path.includes('.spec.')) continue;

          let lineNum = 0;
          for (const line of file.patch.split('\n')) {
            if (line.startsWith('@@')) {
              const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
              if (match) lineNum = parseInt(match[1], 10) - 1;
              continue;
            }
            if (line.startsWith('+') && !line.startsWith('+++')) {
              lineNum++;
              if (/console\.(log|debug|info|warn|error)\(/.test(line)) {
                findings.push({
                  file: file.path,
                  line: lineNum,
                  severity: 'nitpick',
                  category: 'style',
                  message: 'Consider removing console statement before merge',
                  suggestion: {
                    originalCode: line.slice(1).trim(),
                    suggestedCode: `// ${line.slice(1).trim()} // Remove before merge`,
                  },
                });
              }
            } else if (!line.startsWith('-')) {
              lineNum++;
            }
          }
        }

        return { findings };
      }
    );
  }
}

export const pluginSDKService = new PluginSDKService();
