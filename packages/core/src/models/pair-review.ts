/**
 * @fileoverview AI Pair Review Session Models
 * 
 * Types for real-time collaborative code review with AI assistance.
 * 
 * @module models/pair-review
 */

/**
 * A pair review session between a human and AI
 */
export interface PairReviewSession {
  /** Session ID */
  id: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** PR number */
  prNumber: number;
  /** PR title */
  prTitle: string;
  /** Human reviewer */
  humanReviewer: string;
  /** AI persona */
  aiPersona: AIReviewerPersona;
  /** Session state */
  state: PairSessionState;
  /** Current focus */
  currentFocus: PairReviewFocus;
  /** Conversation history */
  conversation: ConversationMessage[];
  /** Shared findings */
  findings: SharedFinding[];
  /** Review progress */
  progress: ReviewProgress;
  /** Session settings */
  settings: PairSessionSettings;
  /** Started at */
  startedAt: Date;
  /** Last activity */
  lastActivityAt: Date;
}

/**
 * Session states
 */
export type PairSessionState =
  | 'initializing'
  | 'reviewing'
  | 'discussing'
  | 'summarizing'
  | 'paused'
  | 'completed';

/**
 * AI reviewer persona
 */
export interface AIReviewerPersona {
  /** Persona ID */
  id: string;
  /** Name */
  name: string;
  /** Description */
  description: string;
  /** Expertise areas */
  expertise: string[];
  /** Review style */
  style: 'thorough' | 'pragmatic' | 'educational' | 'security-focused' | 'performance-focused';
  /** Personality traits */
  traits: string[];
  /** Avatar emoji */
  avatar: string;
}

/**
 * Current review focus
 */
export interface PairReviewFocus {
  /** File being reviewed */
  file?: string;
  /** Line range */
  lineRange?: { start: number; end: number };
  /** Topic being discussed */
  topic?: string;
  /** Code block */
  codeBlock?: string;
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  /** Message ID */
  id: string;
  /** Sender */
  sender: 'human' | 'ai';
  /** Message type */
  type: MessageType;
  /** Content */
  content: string;
  /** Code references */
  codeReferences?: CodeReference[];
  /** Suggestions */
  suggestions?: ReviewSuggestion[];
  /** Timestamp */
  timestamp: Date;
}

/**
 * Message types
 */
export type MessageType =
  | 'question'
  | 'answer'
  | 'observation'
  | 'suggestion'
  | 'concern'
  | 'approval'
  | 'explanation'
  | 'discussion';

/**
 * Code reference
 */
export interface CodeReference {
  /** File */
  file: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Code snippet */
  snippet: string;
}

/**
 * Review suggestion
 */
export interface ReviewSuggestion {
  /** Suggestion ID */
  id: string;
  /** Type */
  type: 'improvement' | 'fix' | 'refactor' | 'question' | 'nitpick';
  /** Description */
  description: string;
  /** Code suggestion */
  codeSuggestion?: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Agreed by both */
  agreedByBoth: boolean;
}

/**
 * Shared finding between human and AI
 */
export interface SharedFinding {
  /** Finding ID */
  id: string;
  /** Who found it */
  foundBy: 'human' | 'ai' | 'both';
  /** Category */
  category: FindingCategory;
  /** Description */
  description: string;
  /** Location */
  location?: CodeReference;
  /** Severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Status */
  status: 'identified' | 'discussing' | 'agreed' | 'dismissed';
  /** Notes */
  notes: string[];
  /** Created at */
  createdAt: Date;
}

/**
 * Finding categories
 */
export type FindingCategory =
  | 'bug'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'style'
  | 'logic'
  | 'edge_case'
  | 'testing'
  | 'documentation'
  | 'best_practice';

/**
 * Review progress tracking
 */
export interface ReviewProgress {
  /** Files reviewed */
  filesReviewed: string[];
  /** Files total */
  filesTotal: number;
  /** Lines reviewed */
  linesReviewed: number;
  /** Lines total */
  linesTotal: number;
  /** Time spent (minutes) */
  timeSpentMinutes: number;
  /** Coverage areas */
  coverageAreas: CoverageArea[];
}

/**
 * Coverage area
 */
export interface CoverageArea {
  /** Area name */
  area: string;
  /** Coverage percent */
  coveragePercent: number;
  /** Items checked */
  itemsChecked: number;
  /** Items total */
  itemsTotal: number;
}

/**
 * Session settings
 */
export interface PairSessionSettings {
  /** AI proactivity level */
  aiProactivity: 'passive' | 'moderate' | 'proactive';
  /** Auto-suggest enabled */
  autoSuggestEnabled: boolean;
  /** Show AI confidence */
  showAiConfidence: boolean;
  /** Focus areas */
  focusAreas: string[];
  /** Skip areas */
  skipAreas: string[];
  /** Notification preference */
  notifyOnFinding: boolean;
}

/**
 * Predefined AI personas
 */
export const AI_PERSONAS: AIReviewerPersona[] = [
  {
    id: 'sage',
    name: 'Sage',
    description: 'Experienced mentor who explains the "why" behind suggestions',
    expertise: ['architecture', 'design patterns', 'best practices'],
    style: 'educational',
    traits: ['patient', 'thorough', 'explains context'],
    avatar: '🧙',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Security-focused reviewer who catches vulnerabilities',
    expertise: ['security', 'authentication', 'input validation', 'cryptography'],
    style: 'security-focused',
    traits: ['vigilant', 'detail-oriented', 'cautious'],
    avatar: '🛡️',
  },
  {
    id: 'flash',
    name: 'Flash',
    description: 'Performance expert who optimizes for speed and efficiency',
    expertise: ['performance', 'optimization', 'algorithms', 'caching'],
    style: 'performance-focused',
    traits: ['efficient', 'data-driven', 'benchmarks everything'],
    avatar: '⚡',
  },
  {
    id: 'pragmatist',
    name: 'Pragmatist',
    description: 'Practical reviewer focused on shipping quality code',
    expertise: ['code quality', 'testing', 'maintainability'],
    style: 'pragmatic',
    traits: ['practical', 'balanced', 'ship-focused'],
    avatar: '🎯',
  },
  {
    id: 'detective',
    name: 'Detective',
    description: 'Bug hunter who finds edge cases and logic errors',
    expertise: ['debugging', 'edge cases', 'error handling', 'testing'],
    style: 'thorough',
    traits: ['meticulous', 'curious', 'tests assumptions'],
    avatar: '🔍',
  },
];

/**
 * Request to start a pair review session
 */
export interface StartPairSessionRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Human reviewer login */
  humanReviewer: string;
  /** AI persona ID */
  personaId: string;
  /** Settings */
  settings?: Partial<PairSessionSettings>;
}

/**
 * Chat message request
 */
export interface SendMessageRequest {
  /** Session ID */
  sessionId: string;
  /** Message content */
  content: string;
  /** Message type */
  type?: MessageType;
  /** Code references */
  codeReferences?: CodeReference[];
}

/**
 * Session summary
 */
export interface PairSessionSummary {
  /** Session ID */
  sessionId: string;
  /** Duration (minutes) */
  durationMinutes: number;
  /** Files reviewed */
  filesReviewed: number;
  /** Findings */
  findingsCount: {
    total: number;
    byCategory: Record<FindingCategory, number>;
    bySeverity: Record<string, number>;
  };
  /** Suggestions */
  suggestionsCount: {
    total: number;
    agreed: number;
    dismissed: number;
  };
  /** Key insights */
  keyInsights: string[];
  /** Recommended actions */
  recommendedActions: string[];
  /** Generated review */
  generatedReview?: string;
}
