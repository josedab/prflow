/**
 * @fileoverview Types for Requirements-to-Code Validation feature.
 *
 * This module enables PRFlow to validate that code changes actually
 * implement the specified business requirements from linked tickets
 * (Jira, Linear, GitHub Issues, etc.).
 *
 * @module models/requirements-validation
 */

import type { Severity, ReviewCategory } from './index.js';

// ============================================
// External Ticket Systems
// ============================================

/**
 * Supported ticket/issue tracking systems
 */
export type TicketSystem = 'jira' | 'linear' | 'github' | 'asana' | 'notion' | 'azure_devops' | 'shortcut';

/**
 * A linked ticket from an external system
 */
export interface LinkedTicket {
  /** Ticket ID (e.g., "PROJ-123", "feat-456") */
  id: string;
  /** Source system */
  system: TicketSystem;
  /** Ticket title */
  title: string;
  /** Ticket description/body */
  description?: string;
  /** Acceptance criteria (if any) */
  acceptanceCriteria?: string[];
  /** Additional requirements or user stories */
  requirements?: string[];
  /** Ticket type (feature, bug, task, etc.) */
  type?: string;
  /** Ticket priority */
  priority?: string;
  /** Labels/tags */
  labels?: string[];
  /** URL to the ticket */
  url: string;
  /** Assignee */
  assignee?: string;
  /** Reporter */
  reporter?: string;
  /** Current status */
  status?: string;
}

// ============================================
// Requirement Types
// ============================================

/**
 * A single requirement extracted from a ticket
 */
export interface Requirement {
  /** Unique identifier */
  id: string;
  /** Source ticket */
  sourceTicket: string;
  /** Requirement text */
  text: string;
  /** Type of requirement */
  type: 'functional' | 'non_functional' | 'acceptance_criteria' | 'edge_case' | 'constraint';
  /** Priority level */
  priority: 'must' | 'should' | 'could' | 'wont';
  /** Keywords extracted for matching */
  keywords: string[];
  /** Whether this requirement is testable */
  testable: boolean;
}

/**
 * Status of requirement validation
 */
export type RequirementStatus = 
  | 'implemented'      // Code clearly implements this
  | 'partially'        // Code partially implements this
  | 'not_implemented'  // No evidence of implementation
  | 'uncertain'        // Cannot determine
  | 'out_of_scope';    // Requirement is for different scope

/**
 * Result of validating a single requirement
 */
export interface RequirementValidation {
  /** The requirement being validated */
  requirement: Requirement;
  /** Validation status */
  status: RequirementStatus;
  /** Confidence in the validation (0-1) */
  confidence: number;
  /** Evidence supporting the validation */
  evidence: {
    /** Files that relate to this requirement */
    files: string[];
    /** Specific code snippets that implement this */
    codeSnippets?: Array<{
      file: string;
      startLine: number;
      endLine: number;
      code: string;
      relevance: string;
    }>;
    /** Test coverage for this requirement */
    tests?: string[];
  };
  /** Explanation of the validation result */
  explanation: string;
  /** Suggestions if not implemented */
  suggestions?: string[];
}

// ============================================
// Validation Input/Output
// ============================================

/**
 * Input for the requirements validation agent
 */
export interface RequirementsValidationInput {
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** PR title */
  prTitle: string;
  /** PR description */
  prDescription?: string;
  /** Linked tickets (auto-detected or manually provided) */
  linkedTickets: LinkedTicket[];
  /** Files changed in the PR */
  changedFiles: Array<{
    filename: string;
    patch?: string;
    additions: number;
    deletions: number;
  }>;
  /** Manual requirements (if not from tickets) */
  manualRequirements?: string[];
  /** Configuration */
  config?: Partial<RequirementsValidationConfig>;
}

/**
 * Configuration for requirements validation
 */
export interface RequirementsValidationConfig {
  /** Minimum confidence to report implementation */
  minConfidence: number;
  /** Whether to extract requirements from PR description */
  extractFromPRDescription: boolean;
  /** Whether to validate edge cases */
  validateEdgeCases: boolean;
  /** Whether to check for test coverage of requirements */
  checkTestCoverage: boolean;
  /** Maximum requirements to validate */
  maxRequirements: number;
  /** Ticket system integrations enabled */
  enabledSystems: TicketSystem[];
}

/**
 * Default configuration
 */
export const DEFAULT_REQUIREMENTS_CONFIG: RequirementsValidationConfig = {
  minConfidence: 0.6,
  extractFromPRDescription: true,
  validateEdgeCases: true,
  checkTestCoverage: true,
  maxRequirements: 20,
  enabledSystems: ['jira', 'linear', 'github'],
};

/**
 * A gap in requirement implementation
 */
export interface RequirementGap {
  /** The unimplemented requirement */
  requirement: Requirement;
  /** Why it's considered a gap */
  reason: string;
  /** Suggested implementation approach */
  suggestedApproach?: string;
  /** Files that should likely implement this */
  suggestedFiles?: string[];
  /** Priority of addressing this gap */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Result of requirements validation
 */
export interface RequirementsValidationResult {
  /** All linked tickets processed */
  tickets: LinkedTicket[];
  /** All requirements extracted */
  requirements: Requirement[];
  /** Validation results for each requirement */
  validations: RequirementValidation[];
  /** Identified gaps */
  gaps: RequirementGap[];
  /** Summary statistics */
  summary: {
    totalRequirements: number;
    implemented: number;
    partiallyImplemented: number;
    notImplemented: number;
    uncertain: number;
    outOfScope: number;
    coveragePercentage: number;
  };
  /** Overall compliance score (0-100) */
  complianceScore: number;
  /** Recommendations */
  recommendations: string[];
  /** Issues to flag in the review */
  reviewIssues: Array<{
    severity: Severity;
    category: ReviewCategory;
    message: string;
    requirement?: string;
  }>;
}

// ============================================
// Ticket Extraction
// ============================================

/**
 * Patterns for extracting ticket IDs from text
 */
export const TICKET_PATTERNS: Record<TicketSystem, RegExp[]> = {
  jira: [/[A-Z][A-Z0-9]+-\d+/g],
  linear: [/[A-Z]+-\d+/g, /[a-z]+-\d+/gi],
  github: [/#(\d+)/g, /issues\/(\d+)/g, /pull\/(\d+)/g],
  asana: [/\d{16}/g],
  notion: [/[a-f0-9]{32}/gi],
  azure_devops: [/AB#\d+/gi, /\d{5,}/g],
  shortcut: [/sc-\d+/gi, /\[sc-\d+\]/gi],
};

/**
 * Extract ticket IDs from text
 */
export function extractTicketIds(text: string): Array<{ system: TicketSystem; id: string }> {
  const results: Array<{ system: TicketSystem; id: string }> = [];
  
  for (const [system, patterns] of Object.entries(TICKET_PATTERNS) as Array<[TicketSystem, RegExp[]]>) {
    for (const pattern of patterns) {
      const matches = text.matchAll(new RegExp(pattern));
      for (const match of matches) {
        results.push({
          system,
          id: match[0],
        });
      }
    }
  }
  
  return results;
}

// ============================================
// Acceptance Criteria Parsing
// ============================================

/**
 * Parse acceptance criteria from text
 */
export function parseAcceptanceCriteria(text: string): string[] {
  const criteria: string[] = [];
  
  // Common patterns for acceptance criteria
  const patterns = [
    /(?:Given|When|Then)\s+.+/gi,                    // Gherkin format
    /(?:AC|Acceptance Criteria)[\s:]+(.+)/gi,       // Labeled format
    /[-•*]\s*(?:User can|System should|The app).+/gi, // List format
    /\d+\.\s+.+/g,                                   // Numbered list
  ];
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const criterion = match[1] || match[0];
      if (criterion.trim().length > 10) {
        criteria.push(criterion.trim());
      }
    }
  }
  
  return criteria;
}
