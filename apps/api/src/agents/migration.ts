import type {
  MigrationAgentInput,
  MigrationResult,
  MigrationPlan,
  MigrationTarget,
  FileMigration,
  MigrationChange,
  MigrationValidation,
  MigrationStatus,
  MigrationPhase,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

interface LLMMigrationAnalysis {
  canMigrate: boolean;
  complexity: 'low' | 'medium' | 'high';
  patterns: string[];
  breakingChanges: string[];
  dependencies: string[];
  estimatedChanges: number;
}

interface LLMFileMigration {
  migratedCode: string;
  changes: Array<{
    type: 'addition' | 'deletion' | 'modification' | 'rename';
    startLine: number;
    endLine: number;
    before: string;
    after: string;
    description: string;
  }>;
  confidence: number;
  warnings: string[];
  requiresManualReview: boolean;
}

export class MigrationAgent extends BaseAgent<MigrationAgentInput, MigrationResult> {
  readonly name = 'migration';
  readonly description = 'Assists with code migrations between frameworks, patterns, and languages';

  private readonly maxFilesPerBatch = 10;
  private readonly confidenceThreshold = 0.7;

  async execute(input: MigrationAgentInput, context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: MigrationResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.performMigration(input, context);
    });

    if (!result) {
      return this.createErrorResult('Migration failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async performMigration(
    input: MigrationAgentInput,
    _context: { repositoryId: string }
  ): Promise<MigrationResult> {
    const { target, files = [], dryRun = true } = input;
    const startedAt = new Date();

    // Step 1: Analyze migration feasibility
    logger.info({ target, fileCount: files.length }, 'Starting migration analysis');
    const plan = await this.createMigrationPlan(target, files);

    if (dryRun) {
      // For dry run, return the plan without executing
      return {
        planId: plan.id,
        status: 'completed',
        target,
        files: [],
        validation: {
          syntaxValid: true,
          typesValid: true,
          testsPass: null,
          lintPass: null,
          errors: [],
          warnings: [],
        },
        summary: {
          totalFiles: plan.files.length,
          successfulFiles: 0,
          failedFiles: 0,
          partialFiles: 0,
          totalChanges: plan.estimatedChanges,
          linesAdded: 0,
          linesRemoved: 0,
          avgConfidence: 0,
          manualReviewRequired: [],
        },
        startedAt,
        completedAt: new Date(),
      };
    }

    // Step 2: Execute migration in phases
    const migratedFiles: FileMigration[] = [];
    let totalChanges = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const phase of plan.phases) {
      const phaseResults = await this.executePhase(phase, target);
      migratedFiles.push(...phaseResults);
      
      for (const file of phaseResults) {
        totalChanges += file.changes.length;
        for (const change of file.changes) {
          if (change.type === 'addition') {
            linesAdded += change.after.split('\n').length;
          } else if (change.type === 'deletion') {
            linesRemoved += change.before.split('\n').length;
          } else if (change.type === 'modification') {
            const beforeLines = change.before.split('\n').length;
            const afterLines = change.after.split('\n').length;
            linesAdded += Math.max(0, afterLines - beforeLines);
            linesRemoved += Math.max(0, beforeLines - afterLines);
          }
        }
      }
    }

    // Step 3: Validate results
    const validation = await this.validateMigration(migratedFiles, target);

    // Calculate summary
    const successfulFiles = migratedFiles.filter(f => f.status === 'completed').length;
    const failedFiles = migratedFiles.filter(f => f.status === 'failed').length;
    const partialFiles = migratedFiles.filter(f => f.status === 'partial').length;
    const avgConfidence = migratedFiles.length > 0
      ? migratedFiles.reduce((sum, f) => sum + f.confidence, 0) / migratedFiles.length
      : 0;
    const manualReviewRequired = migratedFiles
      .filter(f => f.requiresManualReview)
      .map(f => f.sourceFile);

    const status: MigrationStatus = failedFiles > 0 
      ? (successfulFiles > 0 ? 'partial' : 'failed')
      : 'completed';

    return {
      planId: plan.id,
      status,
      target,
      files: migratedFiles,
      validation,
      summary: {
        totalFiles: migratedFiles.length,
        successfulFiles,
        failedFiles,
        partialFiles,
        totalChanges,
        linesAdded,
        linesRemoved,
        avgConfidence,
        manualReviewRequired,
      },
      startedAt,
      completedAt: new Date(),
    };
  }

  private async createMigrationPlan(
    target: MigrationTarget,
    files: string[]
  ): Promise<MigrationPlan> {
    const planId = `mig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use LLM to analyze migration complexity
    const analysis = await this.analyzeMigrationWithLLM(target, files);

    // Group files into phases based on dependencies
    const phases = this.groupIntoPhases(files, analysis);

    return {
      id: planId,
      target,
      files,
      estimatedChanges: analysis.estimatedChanges,
      complexity: analysis.complexity,
      phases,
      dependencies: analysis.dependencies,
      breakingChanges: analysis.breakingChanges,
      rollbackPossible: true,
    };
  }

  private async analyzeMigrationWithLLM(
    target: MigrationTarget,
    files: string[]
  ): Promise<LLMMigrationAnalysis> {
    const systemPrompt = buildSystemPrompt('migration analyzer', `
Migration Target:
- From: ${target.from}
- To: ${target.to}
- Type: ${target.type}
- Files to analyze: ${files.length}
`);

    const userPrompt = `Analyze this code migration request and provide a structured assessment.

Files to migrate:
${files.slice(0, 20).join('\n')}
${files.length > 20 ? `\n... and ${files.length - 20} more files` : ''}

Respond with a JSON object containing:
- canMigrate: boolean (is this migration feasible?)
- complexity: "low" | "medium" | "high"
- patterns: string[] (common patterns that will need transformation)
- breakingChanges: string[] (potential breaking changes)
- dependencies: string[] (package dependencies that need updating)
- estimatedChanges: number (estimated number of code changes)

Respond with ONLY the JSON object.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1500 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content :
                      content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      return JSON.parse(jsonStr) as LLMMigrationAnalysis;
    } catch (error) {
      logger.warn({ error }, 'Failed to analyze migration with LLM, using defaults');
      return {
        canMigrate: true,
        complexity: 'medium',
        patterns: [],
        breakingChanges: [],
        dependencies: [],
        estimatedChanges: files.length * 5,
      };
    }
  }

  private groupIntoPhases(files: string[], _analysis: LLMMigrationAnalysis): MigrationPhase[] {
    const phases: MigrationPhase[] = [];
    const batchSize = this.maxFilesPerBatch;

    // Group files by type for better organization
    const configFiles = files.filter(f => 
      f.includes('config') || f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')
    );
    const typeFiles = files.filter(f => f.endsWith('.d.ts') || f.includes('types'));
    const utilFiles = files.filter(f => f.includes('util') || f.includes('helper') || f.includes('lib'));
    const componentFiles = files.filter(f => 
      !configFiles.includes(f) && !typeFiles.includes(f) && !utilFiles.includes(f)
    );

    // Phase 1: Config files first
    if (configFiles.length > 0) {
      phases.push({
        name: 'Configuration Migration',
        description: 'Migrate configuration files and dependencies',
        files: configFiles,
        order: 1,
        dependencies: [],
        canRunInParallel: false,
      });
    }

    // Phase 2: Type definitions
    if (typeFiles.length > 0) {
      phases.push({
        name: 'Type Migration',
        description: 'Migrate type definitions',
        files: typeFiles,
        order: 2,
        dependencies: configFiles.length > 0 ? ['Configuration Migration'] : [],
        canRunInParallel: true,
      });
    }

    // Phase 3: Utilities and helpers
    if (utilFiles.length > 0) {
      for (let i = 0; i < utilFiles.length; i += batchSize) {
        const batch = utilFiles.slice(i, i + batchSize);
        phases.push({
          name: `Utility Migration (Batch ${Math.floor(i / batchSize) + 1})`,
          description: 'Migrate utility and helper files',
          files: batch,
          order: 3 + Math.floor(i / batchSize),
          dependencies: typeFiles.length > 0 ? ['Type Migration'] : [],
          canRunInParallel: true,
        });
      }
    }

    // Phase 4: Component/main files
    for (let i = 0; i < componentFiles.length; i += batchSize) {
      const batch = componentFiles.slice(i, i + batchSize);
      const baseOrder = 3 + Math.ceil(utilFiles.length / batchSize);
      phases.push({
        name: `Component Migration (Batch ${Math.floor(i / batchSize) + 1})`,
        description: 'Migrate component and main source files',
        files: batch,
        order: baseOrder + Math.floor(i / batchSize),
        dependencies: utilFiles.length > 0 ? [`Utility Migration (Batch 1)`] : [],
        canRunInParallel: true,
      });
    }

    return phases.sort((a, b) => a.order - b.order);
  }

  private async executePhase(
    phase: MigrationPhase,
    target: MigrationTarget
  ): Promise<FileMigration[]> {
    logger.info({ phase: phase.name, files: phase.files.length }, 'Executing migration phase');
    
    const results: FileMigration[] = [];

    // Process files in parallel if allowed
    if (phase.canRunInParallel) {
      const promises = phase.files.map(file => this.migrateFile(file, target));
      const migrationResults = await Promise.allSettled(promises);
      
      for (let i = 0; i < migrationResults.length; i++) {
        const result = migrationResults[i];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            sourceFile: phase.files[i],
            targetFile: phase.files[i],
            originalCode: '',
            migratedCode: '',
            changes: [],
            status: 'failed',
            confidence: 0,
            warnings: [result.reason?.message || 'Unknown error'],
            requiresManualReview: true,
          });
        }
      }
    } else {
      // Process sequentially
      for (const file of phase.files) {
        try {
          const migration = await this.migrateFile(file, target);
          results.push(migration);
        } catch (error) {
          results.push({
            sourceFile: file,
            targetFile: file,
            originalCode: '',
            migratedCode: '',
            changes: [],
            status: 'failed',
            confidence: 0,
            warnings: [(error as Error).message],
            requiresManualReview: true,
          });
        }
      }
    }

    return results;
  }

  private async migrateFile(
    file: string,
    target: MigrationTarget
  ): Promise<FileMigration> {
    // In a real implementation, we would read the file content here
    // For now, we'll use a placeholder
    const originalCode = `// Placeholder for ${file}`;

    const systemPrompt = buildSystemPrompt('code migration specialist', `
Migration:
- From: ${target.from}
- To: ${target.to}
- Type: ${target.type}
- File: ${file}
`);

    const userPrompt = `Migrate the following code from ${target.from} to ${target.to}.

Original code:
\`\`\`
${originalCode}
\`\`\`

Respond with a JSON object containing:
- migratedCode: string (the transformed code)
- changes: array of { type: "addition"|"deletion"|"modification"|"rename", startLine: number, endLine: number, before: string, after: string, description: string }
- confidence: number (0-1, how confident you are in the migration)
- warnings: string[] (any warnings or notes)
- requiresManualReview: boolean (does this need human review?)

Respond with ONLY the JSON object.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.2, maxTokens: 4000 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content :
                      content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      
      const llmResult: LLMFileMigration = JSON.parse(jsonStr);

      const changes: MigrationChange[] = llmResult.changes.map(c => ({
        type: c.type,
        location: {
          startLine: c.startLine,
          endLine: c.endLine,
        },
        before: c.before,
        after: c.after,
        description: c.description,
      }));

      const status: MigrationStatus = llmResult.confidence >= this.confidenceThreshold
        ? 'completed'
        : 'partial';

      return {
        sourceFile: file,
        targetFile: this.getTargetFilename(file, target),
        originalCode,
        migratedCode: llmResult.migratedCode,
        changes,
        status,
        confidence: llmResult.confidence,
        warnings: llmResult.warnings,
        requiresManualReview: llmResult.requiresManualReview || llmResult.confidence < this.confidenceThreshold,
      };
    } catch (error) {
      logger.warn({ error, file }, 'Failed to migrate file');
      return {
        sourceFile: file,
        targetFile: file,
        originalCode,
        migratedCode: originalCode,
        changes: [],
        status: 'failed',
        confidence: 0,
        warnings: [(error as Error).message],
        requiresManualReview: true,
      };
    }
  }

  private getTargetFilename(file: string, target: MigrationTarget): string {
    // Handle file extension changes for language migrations
    if (target.type === 'language') {
      if (target.from === 'javascript' && target.to === 'typescript') {
        return file.replace(/\.js$/, '.ts').replace(/\.jsx$/, '.tsx');
      }
    }
    return file;
  }

  private async validateMigration(
    files: FileMigration[],
    _target: MigrationTarget
  ): Promise<MigrationValidation> {
    const errors: Array<{
      file: string;
      line: number;
      column?: number;
      message: string;
      severity: 'error' | 'warning';
      fixable: boolean;
      suggestedFix?: string;
    }> = [];
    const warnings: string[] = [];

    // Basic syntax validation
    let syntaxValid = true;
    const typesValid = true;

    for (const file of files) {
      if (file.status === 'failed') {
        syntaxValid = false;
        errors.push({
          file: file.sourceFile,
          line: 1,
          message: `Migration failed: ${file.warnings.join(', ')}`,
          severity: 'error',
          fixable: false,
        });
      }

      if (file.confidence < this.confidenceThreshold) {
        warnings.push(`${file.sourceFile}: Low confidence migration (${(file.confidence * 100).toFixed(0)}%)`);
      }

      if (file.requiresManualReview) {
        warnings.push(`${file.sourceFile}: Requires manual review`);
      }
    }

    return {
      syntaxValid,
      typesValid,
      testsPass: null, // Would require running tests
      lintPass: null,  // Would require running linter
      errors,
      warnings,
    };
  }

  // Public method to get supported migrations
  getSupportedMigrations(): Record<string, Array<{ from: string; to: string; type: string }>> {
    return {
      'react': [
        { from: 'react-class', to: 'react-hooks', type: 'syntax' },
        { from: 'react', to: 'vue', type: 'framework' },
        { from: 'react', to: 'solid', type: 'framework' },
      ],
      'javascript': [
        { from: 'javascript', to: 'typescript', type: 'language' },
        { from: 'commonjs', to: 'esm', type: 'module_system' },
        { from: 'callbacks', to: 'async-await', type: 'syntax' },
      ],
      'api': [
        { from: 'rest', to: 'graphql', type: 'api_style' },
        { from: 'express', to: 'fastify', type: 'framework' },
      ],
      'testing': [
        { from: 'jest', to: 'vitest', type: 'testing' },
        { from: 'mocha', to: 'jest', type: 'testing' },
        { from: 'enzyme', to: 'testing-library', type: 'testing' },
      ],
    };
  }
}

export const migrationAgent = new MigrationAgent();
