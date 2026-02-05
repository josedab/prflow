/**
 * @fileoverview Types for Business Impact Scoring feature.
 *
 * This module provides types for scoring pull requests based on their
 * potential business impact, including revenue risk, customer-facing
 * changes, SLA implications, and compliance requirements.
 *
 * @module models/business-impact
 */

import type { RiskLevel, Severity } from './index.js';

// ============================================
// Business Domain Types
// ============================================

/**
 * Business domains that can be impacted
 */
export type BusinessDomain =
  | 'payment'           // Payment processing, billing
  | 'authentication'    // Auth, login, security
  | 'user_data'         // PII, user profiles
  | 'core_product'      // Core product features
  | 'integration'       // Third-party integrations
  | 'infrastructure'    // System infrastructure
  | 'analytics'         // Data analytics, reporting
  | 'compliance'        // Regulatory compliance
  | 'customer_support'  // Support features
  | 'onboarding'        // User onboarding
  | 'notifications'     // Emails, push, alerts
  | 'search'            // Search functionality
  | 'content'           // CMS, content delivery
  | 'admin'             // Admin panels
  | 'api'               // Public/Partner APIs
  | 'other';

/**
 * Customer segments affected
 */
export type CustomerSegment =
  | 'all'               // All customers
  | 'enterprise'        // Enterprise customers
  | 'premium'           // Premium/paid customers
  | 'free'              // Free tier users
  | 'beta'              // Beta testers
  | 'internal'          // Internal users only
  | 'partners'          // Partners/integrators
  | 'specific';         // Specific customer(s)

/**
 * SLA impact levels
 */
export type SLAImpact = 'none' | 'minor' | 'significant' | 'critical';

// ============================================
// Business Impact Scoring
// ============================================

/**
 * Factors that contribute to business impact
 */
export interface BusinessImpactFactors {
  /** Revenue impact assessment */
  revenue: {
    /** Potential revenue at risk */
    riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    /** Estimated dollar amount (if calculable) */
    estimatedAmount?: number;
    /** Revenue streams affected */
    affectedStreams?: string[];
    /** Explanation */
    explanation: string;
  };

  /** Customer impact assessment */
  customerImpact: {
    /** Segments affected */
    affectedSegments: CustomerSegment[];
    /** Estimated user count affected */
    estimatedUsersAffected?: number;
    /** Percentage of users affected */
    percentageAffected?: number;
    /** Customer-facing change visibility */
    visibility: 'invisible' | 'subtle' | 'noticeable' | 'significant' | 'major';
  };

  /** SLA implications */
  sla: {
    /** SLA impact level */
    impact: SLAImpact;
    /** SLAs potentially affected */
    affectedSLAs?: string[];
    /** Downtime risk in minutes */
    downtimeRisk?: number;
  };

  /** Compliance implications */
  compliance: {
    /** Compliance frameworks affected */
    frameworks: string[]; // e.g., ['GDPR', 'SOC2', 'HIPAA', 'PCI-DSS']
    /** Risk of compliance violation */
    violationRisk: 'none' | 'low' | 'medium' | 'high';
    /** Requires compliance review */
    requiresReview: boolean;
  };

  /** Reputational risk */
  reputation: {
    /** Level of reputational risk */
    riskLevel: 'none' | 'low' | 'medium' | 'high';
    /** Potential PR impact */
    prImpact: boolean;
    /** Social media sensitivity */
    socialMediaSensitivity: boolean;
  };

  /** Operational impact */
  operational: {
    /** Requires on-call involvement */
    requiresOncall: boolean;
    /** Requires specific deployment window */
    requiresDeploymentWindow: boolean;
    /** Rollback complexity */
    rollbackComplexity: 'trivial' | 'easy' | 'moderate' | 'complex' | 'very_complex';
    /** Feature flag recommended */
    featureFlagRecommended: boolean;
  };
}

/**
 * Business impact score for a PR
 */
export interface BusinessImpactScore {
  /** Overall impact score (0-100) */
  overallScore: number;
  /** Impact level */
  level: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
  /** Business domains affected */
  affectedDomains: BusinessDomain[];
  /** Detailed impact factors */
  factors: BusinessImpactFactors;
  /** Required approvals based on impact */
  requiredApprovals: {
    /** Roles required to approve */
    roles: string[];
    /** Minimum approval count */
    minCount: number;
    /** Specific users required */
    specificUsers?: string[];
  };
  /** Recommended actions */
  recommendations: BusinessImpactRecommendation[];
  /** Alerts to display */
  alerts: BusinessImpactAlert[];
  /** Calculated at */
  calculatedAt: Date;
}

/**
 * A recommendation based on business impact
 */
export interface BusinessImpactRecommendation {
  /** Recommendation type */
  type: 'deploy_strategy' | 'testing' | 'monitoring' | 'communication' | 'approval' | 'documentation';
  /** Priority */
  priority: 'required' | 'strongly_recommended' | 'recommended' | 'optional';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Action to take */
  action?: string;
}

/**
 * An alert about business impact
 */
export interface BusinessImpactAlert {
  /** Alert severity */
  severity: Severity;
  /** Alert title */
  title: string;
  /** Alert message */
  message: string;
  /** Business domain */
  domain?: BusinessDomain;
  /** Link to more info */
  learnMoreUrl?: string;
}

// ============================================
// Business Context Configuration
// ============================================

/**
 * File patterns that indicate business domain
 */
export interface DomainPattern {
  /** Business domain */
  domain: BusinessDomain;
  /** File path patterns */
  patterns: string[];
  /** Keywords in code */
  keywords?: string[];
  /** Impact weight (1-10) */
  weight: number;
}

/**
 * Configuration for business impact scoring
 */
export interface BusinessImpactConfig {
  /** Domain patterns for detection */
  domainPatterns: DomainPattern[];
  /** Customer segment mapping */
  customerSegments: {
    segment: CustomerSegment;
    estimatedCount: number;
  }[];
  /** Revenue thresholds */
  revenueThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Compliance frameworks in use */
  complianceFrameworks: string[];
  /** Required approvers by domain */
  domainApprovers: {
    domain: BusinessDomain;
    roles: string[];
    users?: string[];
  }[];
  /** SLA definitions */
  slaDefinitions: {
    name: string;
    uptimeTarget: number;
    responseTime?: number;
  }[];
}

/**
 * Default domain patterns
 */
export const DEFAULT_DOMAIN_PATTERNS: DomainPattern[] = [
  {
    domain: 'payment',
    patterns: ['**/payment/**', '**/billing/**', '**/checkout/**', '**/stripe/**', '**/invoice/**'],
    keywords: ['payment', 'charge', 'refund', 'subscription', 'billing', 'invoice', 'stripe', 'paypal'],
    weight: 10,
  },
  {
    domain: 'authentication',
    patterns: ['**/auth/**', '**/login/**', '**/session/**', '**/oauth/**', '**/jwt/**'],
    keywords: ['password', 'token', 'session', 'login', 'logout', 'authenticate', 'authorize'],
    weight: 9,
  },
  {
    domain: 'user_data',
    patterns: ['**/user/**', '**/profile/**', '**/account/**', '**/pii/**'],
    keywords: ['email', 'phone', 'address', 'ssn', 'password', 'personal', 'pii', 'gdpr'],
    weight: 9,
  },
  {
    domain: 'compliance',
    patterns: ['**/compliance/**', '**/audit/**', '**/gdpr/**', '**/hipaa/**'],
    keywords: ['audit', 'compliance', 'gdpr', 'hipaa', 'pci', 'soc2', 'regulation'],
    weight: 10,
  },
  {
    domain: 'api',
    patterns: ['**/api/**', '**/rest/**', '**/graphql/**', '**/webhook/**'],
    keywords: ['endpoint', 'api', 'rest', 'graphql', 'webhook', 'v1', 'v2'],
    weight: 7,
  },
  {
    domain: 'infrastructure',
    patterns: ['**/infra/**', '**/deploy/**', '**/k8s/**', '**/terraform/**', '**/docker/**'],
    keywords: ['deploy', 'kubernetes', 'docker', 'terraform', 'aws', 'gcp', 'azure'],
    weight: 8,
  },
  {
    domain: 'integration',
    patterns: ['**/integration/**', '**/third-party/**', '**/external/**'],
    keywords: ['integration', 'webhook', 'callback', 'third-party', 'external'],
    weight: 6,
  },
  {
    domain: 'notifications',
    patterns: ['**/notification/**', '**/email/**', '**/sms/**', '**/push/**'],
    keywords: ['email', 'sms', 'notification', 'push', 'alert', 'sendgrid', 'twilio'],
    weight: 5,
  },
  {
    domain: 'search',
    patterns: ['**/search/**', '**/elastic/**', '**/algolia/**'],
    keywords: ['search', 'index', 'elastic', 'algolia', 'query'],
    weight: 5,
  },
  {
    domain: 'analytics',
    patterns: ['**/analytics/**', '**/metrics/**', '**/tracking/**'],
    keywords: ['analytics', 'tracking', 'metrics', 'events', 'segment', 'mixpanel'],
    weight: 4,
  },
];

// ============================================
// Business Impact Input/Output
// ============================================

/**
 * Input for business impact scoring
 */
export interface BusinessImpactInput {
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** PR title */
  prTitle: string;
  /** PR description */
  prDescription?: string;
  /** Changed files */
  changedFiles: Array<{
    filename: string;
    patch?: string;
    additions: number;
    deletions: number;
  }>;
  /** Technical risk level (from other agents) */
  technicalRisk?: RiskLevel;
  /** Configuration overrides */
  config?: Partial<BusinessImpactConfig>;
}

/**
 * Complete business impact analysis result
 */
export interface BusinessImpactResult {
  /** The calculated score */
  score: BusinessImpactScore;
  /** Detected business domains */
  detectedDomains: Array<{
    domain: BusinessDomain;
    confidence: number;
    evidence: string[];
  }>;
  /** File-to-domain mapping */
  fileMapping: Array<{
    file: string;
    domains: BusinessDomain[];
    impactScore: number;
  }>;
  /** Summary for PR comment */
  summary: string;
  /** Whether this PR should be escalated */
  shouldEscalate: boolean;
  /** Escalation reason (if applicable) */
  escalationReason?: string;
}

// ============================================
// Scoring Functions
// ============================================

/**
 * Calculate overall business impact score from factors
 */
export function calculateOverallScore(factors: BusinessImpactFactors): number {
  const weights = {
    revenue: 25,
    customerImpact: 20,
    sla: 15,
    compliance: 20,
    reputation: 10,
    operational: 10,
  };

  const revenueScore = {
    none: 0,
    low: 25,
    medium: 50,
    high: 75,
    critical: 100,
  }[factors.revenue.riskLevel];

  const customerScore = {
    invisible: 0,
    subtle: 20,
    noticeable: 40,
    significant: 70,
    major: 100,
  }[factors.customerImpact.visibility];

  const slaScore = {
    none: 0,
    minor: 30,
    significant: 70,
    critical: 100,
  }[factors.sla.impact];

  const complianceScore = {
    none: 0,
    low: 25,
    medium: 60,
    high: 100,
  }[factors.compliance.violationRisk];

  const reputationScore = {
    none: 0,
    low: 25,
    medium: 60,
    high: 100,
  }[factors.reputation.riskLevel];

  const operationalScore = 
    (factors.operational.requiresOncall ? 30 : 0) +
    (factors.operational.requiresDeploymentWindow ? 20 : 0) +
    { trivial: 0, easy: 10, moderate: 20, complex: 35, very_complex: 50 }[factors.operational.rollbackComplexity];

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  return Math.min(100, Math.round(
    (revenueScore * weights.revenue +
     customerScore * weights.customerImpact +
     slaScore * weights.sla +
     complianceScore * weights.compliance +
     reputationScore * weights.reputation +
     operationalScore * weights.operational) / totalWeight
  ));
}

/**
 * Determine impact level from score
 */
export function getImpactLevel(score: number): BusinessImpactScore['level'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'low';
  return 'minimal';
}
