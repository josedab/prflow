/**
 * @fileoverview Runbook Generator Models
 * 
 * Types for generating deployment runbooks from PR changes.
 * 
 * @module models/runbook
 */

import { z } from 'zod';

/**
 * Runbook step types
 */
export const RunbookStepTypeSchema = z.enum([
  'pre_deployment',
  'deployment',
  'post_deployment',
  'verification',
  'rollback',
  'notification',
  'manual',
]);
export type RunbookStepType = z.infer<typeof RunbookStepTypeSchema>;

/**
 * Step risk level
 */
export const StepRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type StepRiskLevel = z.infer<typeof StepRiskLevelSchema>;

/**
 * A runbook step
 */
export interface RunbookStep {
  /** Step ID */
  id: string;
  /** Step number */
  order: number;
  /** Step type */
  type: RunbookStepType;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Commands to run */
  commands?: string[];
  /** Environment variables needed */
  envVars?: Record<string, string>;
  /** Expected output */
  expectedOutput?: string;
  /** Verification steps */
  verification?: string[];
  /** Rollback commands */
  rollback?: string[];
  /** Risk level */
  riskLevel: StepRiskLevel;
  /** Estimated duration (minutes) */
  estimatedMinutes: number;
  /** Requires manual approval */
  requiresApproval: boolean;
  /** Notes */
  notes?: string[];
  /** Links to documentation */
  docLinks?: string[];
}

/**
 * A complete deployment runbook
 */
export interface DeploymentRunbook {
  /** Runbook ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** PR title */
  prTitle: string;
  /** Generated at */
  generatedAt: Date;
  /** Target environment */
  environment: string;
  /** Overall risk assessment */
  riskAssessment: RiskAssessment;
  /** Pre-requisites */
  prerequisites: string[];
  /** Steps */
  steps: RunbookStep[];
  /** Rollback plan */
  rollbackPlan: RunbookRollbackPlan;
  /** Contacts */
  contacts: RunbookContact[];
  /** Estimated total duration (minutes) */
  estimatedTotalMinutes: number;
  /** Checklist items */
  checklist: ChecklistItem[];
}

/**
 * Risk assessment for deployment
 */
export interface RiskAssessment {
  /** Overall risk level */
  level: StepRiskLevel;
  /** Risk factors */
  factors: RiskFactor[];
  /** Mitigations */
  mitigations: string[];
  /** Recommended deployment window */
  recommendedWindow: string;
  /** Required approvers */
  requiredApprovers: string[];
}

/**
 * Individual risk factor
 */
export interface RiskFactor {
  /** Factor name */
  name: string;
  /** Description */
  description: string;
  /** Severity */
  severity: StepRiskLevel;
  /** Source (file, commit, etc.) */
  source?: string;
}

/**
 * Rollback plan
 */
export interface RunbookRollbackPlan {
  /** Can auto-rollback */
  canAutoRollback: boolean;
  /** Rollback triggers */
  triggers: string[];
  /** Rollback steps */
  steps: RunbookStep[];
  /** Estimated rollback time (minutes) */
  estimatedMinutes: number;
  /** Data recovery notes */
  dataRecovery?: string;
}

/**
 * Contact for runbook
 */
export interface RunbookContact {
  /** Role */
  role: string;
  /** Name */
  name: string;
  /** Contact method */
  contact: string;
  /** When to contact */
  escalation?: string;
}

/**
 * Checklist item
 */
export interface ChecklistItem {
  /** Item ID */
  id: string;
  /** Description */
  description: string;
  /** Category */
  category: 'pre' | 'during' | 'post';
  /** Required */
  required: boolean;
  /** Checked */
  checked: boolean;
}

/**
 * Runbook template
 */
export interface RunbookTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Target environment */
  environment: string;
  /** Default steps */
  defaultSteps: Partial<RunbookStep>[];
  /** Default checklist */
  defaultChecklist: Omit<ChecklistItem, 'id' | 'checked'>[];
  /** Required approvers */
  requiredApprovers: string[];
  /** Active */
  active: boolean;
}

/**
 * Runbook generation request
 */
export interface RunbookGenerationRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Target environment */
  environment: string;
  /** Template ID to use */
  templateId?: string;
  /** Custom notes */
  notes?: string;
}
