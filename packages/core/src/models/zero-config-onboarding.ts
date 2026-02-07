/**
 * @fileoverview Zero-Config Onboarding Models
 *
 * Types for automated tech stack detection, configuration
 * generation, guided installation wizard, and onboarding
 * analytics.
 *
 * @module models/zero-config-onboarding
 */

import { z } from 'zod';

// ============================================
// Tech Stack Detection Types
// ============================================

/**
 * Detection confidence level
 */
export const DetectionConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type DetectionConfidence = z.infer<typeof DetectionConfidenceSchema>;

/**
 * Detected technology in the repository
 */
export interface DetectedTechnology {
  /** Technology name */
  name: string;
  /** Category */
  category: 'language' | 'framework' | 'test_framework' | 'linter' | 'bundler' | 'ci' | 'database' | 'package_manager';
  /** Version (if detectable) */
  version?: string;
  /** Detection confidence */
  confidence: DetectionConfidence;
  /** How it was detected */
  detectedFrom: string;
  /** Configuration file path */
  configFile?: string;
}

/**
 * Complete tech stack detection result
 */
export interface TechStackDetection {
  /** Detection ID */
  id: string;
  /** Repository */
  repository: { owner: string; name: string };
  /** Detected languages */
  languages: DetectedTechnology[];
  /** Detected frameworks */
  frameworks: DetectedTechnology[];
  /** Detected test framework */
  testFramework: DetectedTechnology | null;
  /** Detected linter */
  linter: DetectedTechnology | null;
  /** Detected CI system */
  ci: DetectedTechnology | null;
  /** Detected package manager */
  packageManager: DetectedTechnology | null;
  /** Project type */
  projectType: 'monorepo' | 'single_package' | 'multi_project';
  /** Repository structure hints */
  structureHints: {
    hasSourceDir: boolean;
    hasTestDir: boolean;
    hasDocsDir: boolean;
    hasCIConfig: boolean;
    hasDockerfile: boolean;
  };
  /** Detected at */
  detectedAt: Date;
  /** Detection duration (ms) */
  detectionDurationMs: number;
}

// ============================================
// Configuration Generation Types
// ============================================

/**
 * Generated PRFlow configuration
 */
export interface GeneratedConfig {
  /** Config ID */
  id: string;
  /** Repository */
  repository: { owner: string; name: string };
  /** Based on tech stack detection */
  basedOnDetectionId: string;
  /** YAML content */
  yamlContent: string;
  /** Config sections */
  sections: ConfigSection[];
  /** Template used (if any) */
  templateId?: string;
  /** Customizations applied */
  customizations: string[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * A section of the configuration
 */
export interface ConfigSection {
  /** Section key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Description */
  description: string;
  /** Whether it was auto-detected vs default */
  source: 'auto_detected' | 'template_default' | 'user_customized';
  /** Editable by user */
  editable: boolean;
}

// ============================================
// Onboarding Wizard Types
// ============================================

/**
 * Onboarding wizard state
 */
export type OnboardingStep =
  | 'app_install'
  | 'repo_scan'
  | 'config_review'
  | 'first_analysis'
  | 'completed';

/**
 * Onboarding session
 */
export interface OnboardingSession {
  /** Session ID */
  id: string;
  /** User login */
  userLogin: string;
  /** Current step */
  currentStep: OnboardingStep;
  /** Steps completed */
  completedSteps: OnboardingStep[];
  /** Repository being onboarded */
  repository: { owner: string; name: string };
  /** Tech stack detection result */
  techStack?: TechStackDetection;
  /** Generated config */
  generatedConfig?: GeneratedConfig;
  /** First analysis PR number (for tutorial) */
  firstAnalysisPR?: number;
  /** Time spent per step (ms) */
  stepDurations: Record<string, number>;
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt?: Date;
}

// ============================================
// Config Template Types
// ============================================

/**
 * Pre-built configuration template
 */
export interface ConfigTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Tech stack this template is for */
  techStack: string[];
  /** YAML content */
  yamlContent: string;
  /** Usage count */
  usageCount: number;
  /** Rating */
  rating: number;
  /** Author */
  author: string;
  /** Tags */
  tags: string[];
}

// ============================================
// Onboarding Analytics Types
// ============================================

/**
 * Onboarding funnel metrics
 */
export interface OnboardingMetrics {
  /** Period */
  period: { start: Date; end: Date };
  /** Total starts */
  totalStarts: number;
  /** Total completions */
  totalCompletions: number;
  /** Completion rate */
  completionRate: number;
  /** Average duration (ms) */
  avgDurationMs: number;
  /** Drop-off by step */
  dropOffByStep: Record<OnboardingStep, number>;
  /** Config modification rate */
  configModificationRate: number;
  /** First analysis success rate */
  firstAnalysisSuccessRate: number;
}
