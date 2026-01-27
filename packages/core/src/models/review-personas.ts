import { z } from 'zod';

// ============================================
// Review Personas Types
// ============================================

export const PersonaTypeSchema = z.enum([
  'security_engineer',
  'performance_engineer',
  'senior_architect',
  'junior_developer',
  'qa_engineer',
  'devops_engineer',
  'accessibility_expert',
  'domain_expert',
  'compliance_officer',
  'tech_lead',
]);
export type PersonaType = z.infer<typeof PersonaTypeSchema>;

export const ReviewFocusSchema = z.enum([
  'security',
  'performance',
  'architecture',
  'maintainability',
  'testing',
  'accessibility',
  'compliance',
  'best_practices',
  'documentation',
  'error_handling',
]);
export type ReviewFocus = z.infer<typeof ReviewFocusSchema>;

// ============================================
// Persona Definition
// ============================================

export interface ReviewPersona {
  id: string;
  type: PersonaType;
  name: string;
  title: string;
  description: string;
  avatar?: string;
  expertise: string[];
  focusAreas: ReviewFocus[];
  reviewStyle: ReviewStyle;
  priorities: ReviewPriority[];
  catchPhrases?: string[];
  strictness: 'lenient' | 'moderate' | 'strict';
}

export interface ReviewStyle {
  verbosity: 'concise' | 'detailed' | 'comprehensive';
  tone: 'friendly' | 'professional' | 'direct' | 'educational';
  suggestAlternatives: boolean;
  provideExamples: boolean;
  askQuestions: boolean;
  praiseGoodCode: boolean;
}

export interface ReviewPriority {
  focus: ReviewFocus;
  weight: number;  // 0-100, higher = more emphasis
  blockerThreshold: 'low' | 'medium' | 'high';  // When to mark as blocking
}

// ============================================
// Persona Review Results
// ============================================

export interface PersonaReview {
  personaId: string;
  personaType: PersonaType;
  personaName: string;
  verdict: 'approve' | 'request_changes' | 'comment';
  overallScore: number;  // 0-100
  summary: string;
  focusedFindings: FocusedFinding[];
  questions: ReviewQuestion[];
  praises: string[];
  concerns: string[];
  suggestions: PersonaSuggestion[];
  wouldApprove: boolean;
  blockingIssues: string[];
}

export interface FocusedFinding {
  id: string;
  focus: ReviewFocus;
  severity: 'info' | 'suggestion' | 'warning' | 'error' | 'critical';
  file: string;
  line?: number;
  endLine?: number;
  title: string;
  description: string;
  codeSnippet?: string;
  suggestedFix?: string;
  rationale: string;
  isBlocking: boolean;
}

export interface ReviewQuestion {
  id: string;
  question: string;
  context: string;
  relatedFile?: string;
  importance: 'curiosity' | 'clarification' | 'concern';
}

export interface PersonaSuggestion {
  id: string;
  focus: ReviewFocus;
  title: string;
  description: string;
  benefit: string;
  effort: 'trivial' | 'small' | 'medium' | 'large';
  codeExample?: string;
}

// ============================================
// Multi-Persona Review
// ============================================

export interface MultiPersonaReviewRequest {
  prId: string;
  repositoryFullName: string;
  prTitle: string;
  prDescription: string;
  files: PrFileChange[];
  personas: PersonaType[];
  customPersonas?: ReviewPersona[];
  includeConsensus: boolean;
}

export interface PrFileChange {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

export interface MultiPersonaReviewResult {
  prId: string;
  reviews: PersonaReview[];
  consensus: ReviewConsensus;
  timeline: PersonaReviewEvent[];
  executionTime: number;
}

export interface ReviewConsensus {
  overallVerdict: 'approve' | 'request_changes' | 'needs_discussion';
  confidenceScore: number;  // 0-100
  agreementLevel: 'unanimous' | 'majority' | 'split' | 'divided';
  summary: string;
  commonConcerns: string[];
  uniqueInsights: Array<{
    personaType: PersonaType;
    insight: string;
    relevance: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
  prioritizedIssues: Array<{
    issue: string;
    raisedBy: PersonaType[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

export interface PersonaReviewEvent {
  timestamp: Date;
  personaType: PersonaType;
  event: 'started' | 'analyzing' | 'completed' | 'error';
  details?: string;
}

// ============================================
// Built-in Persona Templates
// ============================================

export const PERSONA_TEMPLATES: Record<PersonaType, Omit<ReviewPersona, 'id'>> = {
  security_engineer: {
    type: 'security_engineer',
    name: 'Alex Security',
    title: 'Senior Security Engineer',
    description: 'Focuses on identifying vulnerabilities, injection attacks, auth issues, and data exposure risks.',
    expertise: ['OWASP Top 10', 'cryptography', 'authentication', 'authorization', 'input validation'],
    focusAreas: ['security', 'compliance', 'error_handling'],
    reviewStyle: {
      verbosity: 'detailed',
      tone: 'professional',
      suggestAlternatives: true,
      provideExamples: true,
      askQuestions: true,
      praiseGoodCode: false,
    },
    priorities: [
      { focus: 'security', weight: 100, blockerThreshold: 'low' },
      { focus: 'compliance', weight: 80, blockerThreshold: 'medium' },
      { focus: 'error_handling', weight: 60, blockerThreshold: 'medium' },
    ],
    catchPhrases: ['Have you considered...', 'This could be exploited by...', 'Security best practice suggests...'],
    strictness: 'strict',
  },
  performance_engineer: {
    type: 'performance_engineer',
    name: 'Pat Performance',
    title: 'Performance Engineer',
    description: 'Optimizes for speed, memory efficiency, and scalability. Catches N+1 queries and inefficient algorithms.',
    expertise: ['algorithm optimization', 'database tuning', 'caching', 'profiling', 'memory management'],
    focusAreas: ['performance', 'architecture', 'best_practices'],
    reviewStyle: {
      verbosity: 'detailed',
      tone: 'educational',
      suggestAlternatives: true,
      provideExamples: true,
      askQuestions: false,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'performance', weight: 100, blockerThreshold: 'medium' },
      { focus: 'architecture', weight: 70, blockerThreshold: 'high' },
    ],
    catchPhrases: ['This has O(n²) complexity...', 'Consider batching...', 'This could be cached...'],
    strictness: 'moderate',
  },
  senior_architect: {
    type: 'senior_architect',
    name: 'Sam Architect',
    title: 'Principal Software Architect',
    description: 'Reviews for design patterns, SOLID principles, scalability, and long-term maintainability.',
    expertise: ['design patterns', 'SOLID principles', 'microservices', 'DDD', 'system design'],
    focusAreas: ['architecture', 'maintainability', 'best_practices'],
    reviewStyle: {
      verbosity: 'comprehensive',
      tone: 'professional',
      suggestAlternatives: true,
      provideExamples: false,
      askQuestions: true,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'architecture', weight: 100, blockerThreshold: 'medium' },
      { focus: 'maintainability', weight: 90, blockerThreshold: 'medium' },
      { focus: 'best_practices', weight: 70, blockerThreshold: 'high' },
    ],
    catchPhrases: ['Consider the long-term implications...', 'This violates the single responsibility principle...', 'Have you thought about how this scales?'],
    strictness: 'moderate',
  },
  junior_developer: {
    type: 'junior_developer',
    name: 'Jamie Junior',
    title: 'Junior Developer',
    description: 'Asks clarifying questions, flags confusing code, and identifies areas that need better documentation.',
    expertise: ['documentation', 'readability', 'learning'],
    focusAreas: ['documentation', 'maintainability', 'best_practices'],
    reviewStyle: {
      verbosity: 'concise',
      tone: 'friendly',
      suggestAlternatives: false,
      provideExamples: false,
      askQuestions: true,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'documentation', weight: 100, blockerThreshold: 'high' },
      { focus: 'maintainability', weight: 80, blockerThreshold: 'high' },
    ],
    catchPhrases: ['I\'m not sure I understand...', 'Could you explain why...', 'This is really clear!'],
    strictness: 'lenient',
  },
  qa_engineer: {
    type: 'qa_engineer',
    name: 'Quinn QA',
    title: 'QA Engineer',
    description: 'Focuses on test coverage, edge cases, error handling, and validation logic.',
    expertise: ['testing', 'edge cases', 'test automation', 'quality assurance'],
    focusAreas: ['testing', 'error_handling', 'best_practices'],
    reviewStyle: {
      verbosity: 'detailed',
      tone: 'direct',
      suggestAlternatives: true,
      provideExamples: true,
      askQuestions: true,
      praiseGoodCode: false,
    },
    priorities: [
      { focus: 'testing', weight: 100, blockerThreshold: 'low' },
      { focus: 'error_handling', weight: 90, blockerThreshold: 'medium' },
    ],
    catchPhrases: ['What happens when...', 'Is there a test for...', 'This edge case could cause...'],
    strictness: 'strict',
  },
  devops_engineer: {
    type: 'devops_engineer',
    name: 'Devon DevOps',
    title: 'DevOps Engineer',
    description: 'Reviews for deployment, configuration, logging, monitoring, and infrastructure concerns.',
    expertise: ['CI/CD', 'infrastructure', 'monitoring', 'logging', 'containerization'],
    focusAreas: ['best_practices', 'error_handling', 'performance'],
    reviewStyle: {
      verbosity: 'concise',
      tone: 'direct',
      suggestAlternatives: true,
      provideExamples: false,
      askQuestions: false,
      praiseGoodCode: false,
    },
    priorities: [
      { focus: 'error_handling', weight: 90, blockerThreshold: 'medium' },
      { focus: 'performance', weight: 70, blockerThreshold: 'high' },
    ],
    catchPhrases: ['This will cause issues in prod...', 'Add logging here...', 'Consider the deployment impact...'],
    strictness: 'moderate',
  },
  accessibility_expert: {
    type: 'accessibility_expert',
    name: 'Ari Accessibility',
    title: 'Accessibility Specialist',
    description: 'Ensures UI changes meet WCAG guidelines and are usable by people with disabilities.',
    expertise: ['WCAG', 'screen readers', 'keyboard navigation', 'color contrast', 'ARIA'],
    focusAreas: ['accessibility', 'best_practices', 'documentation'],
    reviewStyle: {
      verbosity: 'detailed',
      tone: 'educational',
      suggestAlternatives: true,
      provideExamples: true,
      askQuestions: false,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'accessibility', weight: 100, blockerThreshold: 'low' },
    ],
    catchPhrases: ['This needs an aria-label...', 'Screen reader users won\'t be able to...', 'WCAG requires...'],
    strictness: 'strict',
  },
  domain_expert: {
    type: 'domain_expert',
    name: 'Dana Domain',
    title: 'Domain Expert',
    description: 'Validates business logic, domain rules, and ensures code matches requirements.',
    expertise: ['business logic', 'domain modeling', 'requirements', 'user stories'],
    focusAreas: ['best_practices', 'documentation', 'maintainability'],
    reviewStyle: {
      verbosity: 'comprehensive',
      tone: 'professional',
      suggestAlternatives: false,
      provideExamples: false,
      askQuestions: true,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'best_practices', weight: 100, blockerThreshold: 'medium' },
      { focus: 'documentation', weight: 80, blockerThreshold: 'high' },
    ],
    catchPhrases: ['Does this match the requirements?', 'The business rule states...', 'Users expect...'],
    strictness: 'moderate',
  },
  compliance_officer: {
    type: 'compliance_officer',
    name: 'Casey Compliance',
    title: 'Compliance Officer',
    description: 'Ensures code meets regulatory requirements like GDPR, HIPAA, SOX, and PCI-DSS.',
    expertise: ['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'data privacy', 'audit trails'],
    focusAreas: ['compliance', 'security', 'documentation'],
    reviewStyle: {
      verbosity: 'comprehensive',
      tone: 'professional',
      suggestAlternatives: true,
      provideExamples: false,
      askQuestions: true,
      praiseGoodCode: false,
    },
    priorities: [
      { focus: 'compliance', weight: 100, blockerThreshold: 'low' },
      { focus: 'security', weight: 90, blockerThreshold: 'low' },
      { focus: 'documentation', weight: 70, blockerThreshold: 'medium' },
    ],
    catchPhrases: ['This data handling may violate...', 'Audit trail required for...', 'PII must be...'],
    strictness: 'strict',
  },
  tech_lead: {
    type: 'tech_lead',
    name: 'Taylor TechLead',
    title: 'Technical Lead',
    description: 'Balances pragmatism with quality. Considers team velocity, technical debt, and mentoring.',
    expertise: ['code review', 'team leadership', 'technical debt', 'mentoring'],
    focusAreas: ['maintainability', 'best_practices', 'documentation', 'architecture'],
    reviewStyle: {
      verbosity: 'detailed',
      tone: 'friendly',
      suggestAlternatives: true,
      provideExamples: true,
      askQuestions: true,
      praiseGoodCode: true,
    },
    priorities: [
      { focus: 'maintainability', weight: 90, blockerThreshold: 'medium' },
      { focus: 'best_practices', weight: 80, blockerThreshold: 'high' },
      { focus: 'architecture', weight: 70, blockerThreshold: 'high' },
    ],
    catchPhrases: ['Good work on...', 'Let\'s discuss this approach...', 'For the team\'s understanding...'],
    strictness: 'moderate',
  },
};

// ============================================
// Agent Input/Output
// ============================================

export interface ReviewPersonasInput {
  operation: 'review' | 'list_personas' | 'create_persona' | 'get_consensus';
  reviewRequest?: MultiPersonaReviewRequest;
  customPersona?: ReviewPersona;
  reviewResults?: PersonaReview[];
}

export interface ReviewPersonasResult {
  operation: string;
  success: boolean;
  data?: {
    personas?: ReviewPersona[];
    reviews?: PersonaReview[];
    consensus?: ReviewConsensus;
    multiPersonaResult?: MultiPersonaReviewResult;
  };
  error?: string;
}
