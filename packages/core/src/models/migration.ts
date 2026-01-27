import { z } from 'zod';

// ============================================
// Code Migration Types
// ============================================

export const MigrationTypeSchema = z.enum([
  'framework',      // React → Vue, Angular → React
  'api_style',      // REST → GraphQL, SOAP → REST
  'module_system',  // CommonJS → ESM, AMD → ESM
  'syntax',         // Class → Functional, Callbacks → Async/Await
  'state_management', // Redux → Zustand, MobX → Redux
  'testing',        // Jest → Vitest, Mocha → Jest
  'styling',        // CSS → Tailwind, SCSS → CSS-in-JS
  'language',       // JavaScript → TypeScript, Flow → TypeScript
]);
export type MigrationType = z.infer<typeof MigrationTypeSchema>;

export const MigrationStatusSchema = z.enum([
  'pending',
  'analyzing',
  'transforming',
  'validating',
  'completed',
  'failed',
  'partial',
]);
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;

export interface MigrationPattern {
  id: string;
  name: string;
  type: MigrationType;
  sourcePattern: string;
  targetPattern: string;
  description: string;
  examples: MigrationExample[];
  complexity: 'low' | 'medium' | 'high';
  automatable: boolean;
}

export interface MigrationExample {
  before: string;
  after: string;
  language: string;
  explanation?: string;
}

export interface MigrationTarget {
  from: string;
  to: string;
  type: MigrationType;
  version?: string;
}

export interface FileMigration {
  sourceFile: string;
  targetFile: string;
  originalCode: string;
  migratedCode: string;
  changes: MigrationChange[];
  status: MigrationStatus;
  confidence: number;
  warnings: string[];
  requiresManualReview: boolean;
}

export interface MigrationChange {
  type: 'addition' | 'deletion' | 'modification' | 'rename';
  location: {
    startLine: number;
    endLine: number;
    startColumn?: number;
    endColumn?: number;
  };
  before: string;
  after: string;
  pattern?: string;
  description: string;
}

export interface MigrationValidation {
  syntaxValid: boolean;
  typesValid: boolean;
  testsPass: boolean | null;
  lintPass: boolean | null;
  errors: MigrationError[];
  warnings: string[];
}

export interface MigrationError {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
  fixable: boolean;
  suggestedFix?: string;
}

export interface MigrationPlan {
  id: string;
  target: MigrationTarget;
  files: string[];
  estimatedChanges: number;
  complexity: 'low' | 'medium' | 'high';
  phases: MigrationPhase[];
  dependencies: string[];
  breakingChanges: string[];
  rollbackPossible: boolean;
}

export interface MigrationPhase {
  name: string;
  description: string;
  files: string[];
  order: number;
  dependencies: string[];
  canRunInParallel: boolean;
}

export interface MigrationResult {
  planId: string;
  status: MigrationStatus;
  target: MigrationTarget;
  files: FileMigration[];
  validation: MigrationValidation;
  prUrl?: string;
  prNumber?: number;
  summary: MigrationSummary;
  startedAt: Date;
  completedAt?: Date;
}

export interface MigrationSummary {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  partialFiles: number;
  totalChanges: number;
  linesAdded: number;
  linesRemoved: number;
  avgConfidence: number;
  manualReviewRequired: string[];
}

// ============================================
// Migration Agent Interfaces
// ============================================

export interface MigrationAgentInput {
  repositoryId: string;
  target: MigrationTarget;
  files?: string[];
  dryRun?: boolean;
  createPR?: boolean;
  branchName?: string;
}

export interface MigrationAgentConfig {
  maxFilesPerBatch: number;
  confidenceThreshold: number;
  autoFixEnabled: boolean;
  preserveComments: boolean;
  generateTests: boolean;
}

// ============================================
// Supported Migration Paths
// ============================================

export const SUPPORTED_MIGRATIONS: Record<string, MigrationTarget[]> = {
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
  'state': [
    { from: 'redux', to: 'zustand', type: 'state_management' },
    { from: 'mobx', to: 'redux-toolkit', type: 'state_management' },
  ],
  'styling': [
    { from: 'css', to: 'tailwind', type: 'styling' },
    { from: 'scss', to: 'css-modules', type: 'styling' },
    { from: 'styled-components', to: 'tailwind', type: 'styling' },
  ],
};
