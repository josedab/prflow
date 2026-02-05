/**
 * @fileoverview Types for Zero-Trust Security Review Mode.
 *
 * This module provides types for treating AI-generated code with extra
 * scrutiny, implementing security-first review principles, and flagging
 * patterns known to be problematic in AI-generated code.
 *
 * @module models/zero-trust-security
 */

import type { Severity } from './index.js';

// ============================================
// Trust Levels
// ============================================

/**
 * Trust levels for code sources
 */
export type TrustLevel = 
  | 'verified'     // Code from verified human authors
  | 'trusted'      // Code from trusted team members
  | 'standard'     // Normal code requiring standard review
  | 'untrusted'    // Code from external contributors
  | 'ai_generated' // AI-generated code (lowest trust)
  | 'unknown';     // Unknown source

/**
 * AI code generation tools
 */
export type AICodeSource = 
  | 'github_copilot'
  | 'chatgpt'
  | 'claude'
  | 'codewhisperer'
  | 'tabnine'
  | 'codeium'
  | 'cursor'
  | 'unknown_ai'
  | 'not_ai';

// ============================================
// Security Rules
// ============================================

/**
 * Security rule categories
 */
export type SecurityRuleCategory =
  | 'injection'        // SQL, command, LDAP injection
  | 'xss'              // Cross-site scripting
  | 'auth'             // Authentication issues
  | 'crypto'           // Cryptography issues
  | 'secrets'          // Hardcoded secrets
  | 'validation'       // Input validation
  | 'access_control'   // Authorization issues
  | 'data_exposure'    // Sensitive data exposure
  | 'dependencies'     // Vulnerable dependencies
  | 'configuration'    // Security misconfigurations
  | 'ai_pattern';      // Known AI-generated vulnerabilities

/**
 * A zero-trust security rule for detection
 */
export interface ZeroTrustSecurityRule {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule category */
  category: SecurityRuleCategory;
  /** Severity when triggered */
  severity: Severity;
  /** Description of the vulnerability */
  description: string;
  /** Detection patterns (regex) */
  patterns: string[];
  /** File patterns this applies to */
  filePatterns?: string[];
  /** Languages this applies to */
  languages?: string[];
  /** Whether this is AI-specific */
  aiSpecific: boolean;
  /** Remediation guidance */
  remediation: string;
  /** Reference links (CWE, OWASP, etc.) */
  references: string[];
  /** False positive rate (0-1) */
  falsePositiveRate?: number;
}

/**
 * Known AI-generated vulnerable patterns
 */
export const AI_VULNERABILITY_PATTERNS: ZeroTrustSecurityRule[] = [
  {
    id: 'ai-sql-string-concat',
    name: 'AI SQL String Concatenation',
    category: 'ai_pattern',
    severity: 'critical',
    description: 'AI often generates SQL queries with string concatenation, leading to SQL injection vulnerabilities',
    patterns: [
      '\\$\\{.*\\}.*(?:SELECT|INSERT|UPDATE|DELETE)',
      '`SELECT.*\\$\\{',
      '\'\\s*\\+\\s*.*\\+\\s*\'.*(?:SELECT|INSERT|UPDATE|DELETE)',
    ],
    languages: ['javascript', 'typescript', 'python'],
    aiSpecific: true,
    remediation: 'Use parameterized queries or prepared statements',
    references: ['CWE-89', 'OWASP A03:2021'],
  },
  {
    id: 'ai-hardcoded-secret',
    name: 'AI Hardcoded Secret',
    category: 'ai_pattern',
    severity: 'critical',
    description: 'AI often generates example code with placeholder secrets that may be left in production',
    patterns: [
      'api[_-]?key\\s*[=:]\\s*[\'"][a-zA-Z0-9]{20,}[\'"]',
      'secret\\s*[=:]\\s*[\'"][^\\s]{10,}[\'"]',
      'password\\s*[=:]\\s*[\'"][^\\s]+[\'"]',
      'token\\s*[=:]\\s*[\'"][a-zA-Z0-9._-]{20,}[\'"]',
    ],
    aiSpecific: true,
    remediation: 'Move secrets to environment variables or a secrets manager',
    references: ['CWE-798', 'OWASP A07:2021'],
  },
  {
    id: 'ai-eval-usage',
    name: 'AI Eval Usage',
    category: 'ai_pattern',
    severity: 'critical',
    description: 'AI sometimes suggests using eval() or similar dynamic execution',
    patterns: [
      '\\beval\\s*\\(',
      '\\bexec\\s*\\(',
      'new\\s+Function\\s*\\(',
      'setTimeout\\s*\\([^)]*["\']',
    ],
    languages: ['javascript', 'typescript', 'python'],
    aiSpecific: true,
    remediation: 'Avoid dynamic code execution; use safer alternatives',
    references: ['CWE-95'],
  },
  {
    id: 'ai-weak-crypto',
    name: 'AI Weak Cryptography',
    category: 'ai_pattern',
    severity: 'high',
    description: 'AI may suggest outdated or weak cryptographic algorithms',
    patterns: [
      'md5\\s*\\(',
      'sha1\\s*\\(',
      'DES\\.',
      'RC4',
      'createCipher\\s*\\(',
    ],
    aiSpecific: true,
    remediation: 'Use modern cryptographic algorithms (SHA-256, AES-256-GCM)',
    references: ['CWE-327', 'OWASP A02:2021'],
  },
  {
    id: 'ai-disabled-security',
    name: 'AI Disabled Security Feature',
    category: 'ai_pattern',
    severity: 'high',
    description: 'AI often generates code that disables security features for "simplicity"',
    patterns: [
      'verify\\s*[=:]\\s*false',
      'rejectUnauthorized\\s*[=:]\\s*false',
      'secure\\s*[=:]\\s*false',
      'validateStatus\\s*:\\s*\\(\\)\\s*=>\\s*true',
      'ignoreSsl',
      'skipVerification',
    ],
    aiSpecific: true,
    remediation: 'Enable proper security verification; use valid certificates',
    references: ['CWE-295'],
  },
  {
    id: 'ai-innerHTML',
    name: 'AI innerHTML Assignment',
    category: 'ai_pattern',
    severity: 'high',
    description: 'AI frequently uses innerHTML without sanitization',
    patterns: [
      '\\.innerHTML\\s*=',
      '\\.outerHTML\\s*=',
      'dangerouslySetInnerHTML',
    ],
    languages: ['javascript', 'typescript'],
    aiSpecific: true,
    remediation: 'Use textContent or sanitize HTML with DOMPurify',
    references: ['CWE-79'],
  },
  {
    id: 'ai-console-logging',
    name: 'AI Excessive Logging',
    category: 'ai_pattern',
    severity: 'medium',
    description: 'AI often includes debug logging that may expose sensitive data',
    patterns: [
      'console\\.log\\s*\\([^)]*(?:password|token|secret|key|auth)',
      'print\\s*\\([^)]*(?:password|token|secret|key|auth)',
      'logger\\.(?:info|debug)\\s*\\([^)]*(?:password|token|secret|key|auth)',
    ],
    aiSpecific: true,
    remediation: 'Remove sensitive data from logs; use appropriate log levels',
    references: ['CWE-532'],
  },
  {
    id: 'ai-missing-error-handling',
    name: 'AI Missing Error Handling',
    category: 'ai_pattern',
    severity: 'medium',
    description: 'AI-generated code often has empty catch blocks or ignores errors',
    patterns: [
      'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}',
      'catch\\s*\\{\\s*\\}',
      '\\.catch\\s*\\(\\s*\\(\\)\\s*=>\\s*\\{\\s*\\}\\s*\\)',
    ],
    aiSpecific: true,
    remediation: 'Implement proper error handling and logging',
    references: ['CWE-390'],
  },
];

// ============================================
// Zero-Trust Review Types
// ============================================

/**
 * AI detection result for a file or code block
 */
export interface AIDetectionResult {
  /** Whether AI-generated code is detected */
  isAIGenerated: boolean;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** Detected AI source (if identifiable) */
  source: AICodeSource;
  /** Indicators that suggest AI generation */
  indicators: string[];
  /** Specific lines suspected to be AI-generated */
  suspectedLines?: Array<{
    line: number;
    reason: string;
  }>;
}

/**
 * A security finding from zero-trust review
 */
export interface ZeroTrustFinding {
  /** Unique finding ID */
  id: string;
  /** Rule that triggered */
  rule: ZeroTrustSecurityRule;
  /** File where found */
  file: string;
  /** Line number */
  line: number;
  /** End line (if spans multiple) */
  endLine?: number;
  /** The problematic code */
  code: string;
  /** AI detection for this code */
  aiDetection?: AIDetectionResult;
  /** Trust level assigned */
  trustLevel: TrustLevel;
  /** Whether manual review is required */
  requiresManualReview: boolean;
  /** Suggested fix */
  suggestedFix?: string;
  /** Additional context */
  context?: string;
}

/**
 * Input for zero-trust security review
 */
export interface ZeroTrustReviewInput {
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** PR author */
  author: string;
  /** Files to review */
  files: Array<{
    filename: string;
    patch?: string;
    content?: string;
    additions: number;
    deletions: number;
  }>;
  /** Author trust level (if known) */
  authorTrustLevel?: TrustLevel;
  /** Configuration */
  config?: Partial<ZeroTrustConfig>;
}

/**
 * Configuration for zero-trust review
 */
export interface ZeroTrustConfig {
  /** Enable AI code detection */
  detectAICode: boolean;
  /** Trust level for AI code */
  aiCodeTrustLevel: TrustLevel;
  /** Additional security rules */
  customRules: ZeroTrustSecurityRule[];
  /** Files to always require manual review */
  alwaysReviewPatterns: string[];
  /** Minimum trust level to skip AI detection */
  skipAIDetectionForTrust: TrustLevel;
  /** Severity threshold for blocking */
  blockingSeverity: Severity;
  /** Require security team approval for AI code */
  requireSecurityApprovalForAI: boolean;
}

/**
 * Default zero-trust configuration
 */
export const DEFAULT_ZERO_TRUST_CONFIG: ZeroTrustConfig = {
  detectAICode: true,
  aiCodeTrustLevel: 'ai_generated',
  customRules: [],
  alwaysReviewPatterns: [
    '**/auth/**',
    '**/security/**',
    '**/payment/**',
    '**/crypto/**',
  ],
  skipAIDetectionForTrust: 'verified',
  blockingSeverity: 'critical',
  requireSecurityApprovalForAI: true,
};

/**
 * Result of zero-trust security review
 */
export interface ZeroTrustReviewResult {
  /** All findings */
  findings: ZeroTrustFinding[];
  /** Summary by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  /** AI detection results per file */
  aiDetection: Array<{
    file: string;
    result: AIDetectionResult;
  }>;
  /** Overall trust assessment */
  trustAssessment: {
    overallTrust: TrustLevel;
    aiCodePercentage: number;
    requiresSecurityReview: boolean;
    canAutoApprove: boolean;
  };
  /** Required reviewers */
  requiredReviewers: {
    securityTeam: boolean;
    specificUsers?: string[];
    reason: string;
  };
  /** Blocking issues */
  blockingIssues: ZeroTrustFinding[];
  /** Processing time */
  processingTimeMs: number;
}

// ============================================
// AI Detection Heuristics
// ============================================

/**
 * Patterns that suggest AI-generated code
 */
export const AI_CODE_INDICATORS = {
  /** Comments patterns common in AI code */
  commentPatterns: [
    /\/\/\s*TODO:?\s*implement/i,
    /\/\/\s*Example\s*(usage|code)/i,
    /\/\/\s*This\s+(function|method|class)\s+/i,
    /\/\*\*?\s*\n\s*\*\s*@(description|param|returns)/i,
    /\/\/\s*Note:\s*This\s+is\s+a\s+(simple|basic)/i,
  ],
  /** Code structure patterns */
  structurePatterns: [
    /function\s+example\w*/i,
    /const\s+(?:example|sample|test|demo)\w*/i,
    /class\s+(?:Example|Sample|Demo)\w*/i,
  ],
  /** Common AI placeholder values */
  placeholderPatterns: [
    /'your-api-key-here'/i,
    /'xxx+'/i,
    /'placeholder'/i,
    /'example\.com'/i,
    /'user@example\.com'/i,
    /1234567890/,
    /password123/i,
  ],
  /** Verbose variable naming patterns */
  namingPatterns: [
    /[a-z]+(?:[A-Z][a-z]+){4,}/,  // Very long camelCase
    /result_of_\w+/i,
    /temp_\w+_variable/i,
  ],
};

/**
 * Detect if code is likely AI-generated
 */
export function detectAICode(code: string): AIDetectionResult {
  const indicators: string[] = [];
  let score = 0;

  // Check comment patterns
  for (const pattern of AI_CODE_INDICATORS.commentPatterns) {
    if (pattern.test(code)) {
      indicators.push('AI-style comment detected');
      score += 0.15;
    }
  }

  // Check placeholder patterns
  for (const pattern of AI_CODE_INDICATORS.placeholderPatterns) {
    if (pattern.test(code)) {
      indicators.push('Placeholder value detected');
      score += 0.2;
    }
  }

  // Check structure patterns
  for (const pattern of AI_CODE_INDICATORS.structurePatterns) {
    if (pattern.test(code)) {
      indicators.push('Example/demo naming detected');
      score += 0.1;
    }
  }

  // Check naming patterns
  for (const pattern of AI_CODE_INDICATORS.namingPatterns) {
    if (pattern.test(code)) {
      indicators.push('Verbose naming pattern');
      score += 0.05;
    }
  }

  const confidence = Math.min(score, 1);
  
  return {
    isAIGenerated: confidence > 0.3,
    confidence,
    source: confidence > 0.3 ? 'unknown_ai' : 'not_ai',
    indicators,
  };
}
