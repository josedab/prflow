/**
 * @fileoverview AI Pair Programming Mode Models
 *
 * Types for real-time AI-assisted collaborative code review with
 * WebSocket support, streaming responses, and platform integrations.
 *
 * @module models/ai-pair-programming
 */

// ============================================
// Session Types
// ============================================

/**
 * An AI pair programming session
 */
export interface AIPairSession {
  /** Unique session identifier */
  id: string;
  /** Repository context */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** PR being reviewed */
  prNumber: number;
  /** PR title */
  prTitle: string;
  /** PR description */
  prBody: string | null;
  /** Human participant */
  participant: PairProgrammingParticipant;
  /** AI assistant configuration */
  aiAssistant: AIAssistantConfig;
  /** Current session state */
  state: AIPairSessionState;
  /** Active focus context */
  focus: SessionFocus;
  /** Conversation history */
  messages: PairMessage[];
  /** Shared artifacts (code snippets, suggestions) */
  artifacts: SessionArtifact[];
  /** Session metrics */
  metrics: SessionMetrics;
  /** Session settings */
  settings: AIPairSessionSettings;
  /** Connected clients */
  connectedClients: ConnectedClient[];
  /** Creation timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** End timestamp (if ended) */
  endedAt?: Date;
}

/**
 * Session participant
 */
export interface PairProgrammingParticipant {
  /** User ID */
  userId: string;
  /** GitHub login */
  login: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Role in session */
  role: 'author' | 'reviewer' | 'observer';
}

/**
 * AI assistant configuration
 */
export interface AIAssistantConfig {
  /** Assistant persona ID */
  personaId: string;
  /** Persona name */
  personaName: string;
  /** Persona avatar */
  avatar: string;
  /** Expertise areas */
  expertise: string[];
  /** Communication style */
  style: AIPersonaStyle;
  /** Proactivity level */
  proactivity: 'passive' | 'moderate' | 'proactive';
  /** Context window management */
  contextConfig: ContextConfig;
}

/**
 * AI persona styles
 */
export type AIPersonaStyle =
  | 'mentor' // Educational, explains reasoning
  | 'expert' // Direct, authoritative
  | 'collaborator' // Conversational, exploratory
  | 'security-hawk' // Security-focused, thorough
  | 'performance-guru' // Performance-focused
  | 'pragmatist'; // Ship-focused, practical

/**
 * Context configuration for AI
 */
export interface ContextConfig {
  /** Max conversation history to include */
  maxHistoryMessages: number;
  /** Include full PR diff in context */
  includePRDiff: boolean;
  /** Include analysis results */
  includeAnalysis: boolean;
  /** Include review comments */
  includeReviewComments: boolean;
  /** Custom context sources */
  customSources: string[];
}

/**
 * Session states
 */
export type AIPairSessionState =
  | 'initializing'
  | 'active'
  | 'paused'
  | 'summarizing'
  | 'ended';

/**
 * Current focus in the session
 */
export interface SessionFocus {
  /** Currently focused file */
  file?: string;
  /** Line range */
  lineRange?: { start: number; end: number };
  /** Code snippet being discussed */
  codeSnippet?: string;
  /** Review comment being discussed */
  commentId?: string;
  /** Topic being discussed */
  topic?: string;
  /** Focus timestamp */
  focusedAt?: Date;
}

// ============================================
// Message Types
// ============================================

/**
 * A message in the pair session
 */
export interface PairMessage {
  /** Message ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Sender type */
  sender: 'human' | 'ai' | 'system';
  /** Sender info (for human) */
  senderInfo?: {
    userId: string;
    login: string;
    displayName: string;
  };
  /** Message type */
  type: PairMessageType;
  /** Message content */
  content: string;
  /** Rich content (markdown, code blocks) */
  richContent?: RichContent[];
  /** Code references */
  codeReferences?: PairCodeReference[];
  /** Suggested actions */
  suggestedActions?: PairSuggestedAction[];
  /** Reactions */
  reactions?: PairMessageReaction[];
  /** Threading */
  replyTo?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
  /** Edit history */
  editedAt?: Date;
}

/**
 * Message types
 */
export type PairMessageType =
  | 'chat' // General conversation
  | 'question' // Question from human
  | 'answer' // Answer from AI
  | 'code_suggestion' // Code suggestion
  | 'explanation' // Code explanation
  | 'concern' // Raised concern
  | 'approval' // Approval/LGTM
  | 'action_request' // Request for action
  | 'system_event' // System notification
  | 'focus_change'; // Focus changed

/**
 * Rich content block
 */
export interface RichContent {
  /** Content type */
  type: 'text' | 'code' | 'diff' | 'table' | 'list' | 'callout';
  /** Content value */
  content: string;
  /** Language (for code) */
  language?: string;
  /** Callout type */
  calloutType?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Code reference in message
 */
export interface PairCodeReference {
  /** File path */
  file: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Code snippet */
  snippet: string;
  /** Highlight ranges */
  highlights?: Array<{ start: number; end: number }>;
}

/**
 * Suggested action
 */
export interface PairSuggestedAction {
  /** Action ID */
  id: string;
  /** Action type */
  type: 'apply_fix' | 'create_issue' | 'add_comment' | 'request_review' | 'navigate' | 'custom';
  /** Action label */
  label: string;
  /** Action description */
  description?: string;
  /** Action payload */
  payload: Record<string, unknown>;
  /** Whether action is destructive */
  destructive?: boolean;
}

/**
 * Message reaction
 */
export interface PairMessageReaction {
  /** Reaction emoji */
  emoji: string;
  /** User IDs who reacted */
  userIds: string[];
  /** Count */
  count: number;
}

// ============================================
// Artifact Types
// ============================================

/**
 * Shared artifact in session
 */
export interface SessionArtifact {
  /** Artifact ID */
  id: string;
  /** Artifact type */
  type: ArtifactType;
  /** Title */
  title: string;
  /** Content */
  content: string;
  /** File path (if applicable) */
  file?: string;
  /** Line range (if applicable) */
  lineRange?: { start: number; end: number };
  /** Creator */
  createdBy: 'human' | 'ai';
  /** Status */
  status: 'draft' | 'shared' | 'applied' | 'dismissed';
  /** Timestamp */
  createdAt: Date;
}

/**
 * Artifact types
 */
export type ArtifactType =
  | 'code_snippet'
  | 'code_suggestion'
  | 'review_comment'
  | 'test_case'
  | 'documentation'
  | 'diagram'
  | 'checklist';

// ============================================
// WebSocket Types
// ============================================

/**
 * Connected client info
 */
export interface ConnectedClient {
  /** Client ID */
  clientId: string;
  /** User ID */
  userId: string;
  /** Connection type */
  connectionType: 'websocket' | 'sse' | 'polling';
  /** Platform */
  platform: 'web' | 'vscode' | 'slack' | 'teams' | 'mobile';
  /** Connected at */
  connectedAt: Date;
  /** Last ping */
  lastPingAt: Date;
}

/**
 * WebSocket event types
 */
export type WSEventType =
  | 'session:joined'
  | 'session:left'
  | 'session:state_changed'
  | 'message:new'
  | 'message:updated'
  | 'message:deleted'
  | 'message:reaction'
  | 'focus:changed'
  | 'artifact:created'
  | 'artifact:updated'
  | 'typing:started'
  | 'typing:stopped'
  | 'ai:streaming_start'
  | 'ai:streaming_chunk'
  | 'ai:streaming_end'
  | 'error';

/**
 * WebSocket message
 */
export interface WSMessage<T = unknown> {
  /** Event type */
  type: WSEventType;
  /** Session ID */
  sessionId: string;
  /** Payload */
  payload: T;
  /** Timestamp */
  timestamp: Date;
  /** Sender client ID */
  senderClientId?: string;
}

/**
 * Typing indicator payload
 */
export interface TypingIndicator {
  /** User ID */
  userId: string;
  /** User login */
  login: string;
  /** Is typing */
  isTyping: boolean;
}

/**
 * AI streaming chunk
 */
export interface AIStreamingChunk {
  /** Chunk index */
  index: number;
  /** Content delta */
  content: string;
  /** Is final chunk */
  isFinal: boolean;
  /** Message ID being streamed */
  messageId: string;
}

// ============================================
// Settings & Metrics
// ============================================

/**
 * Session settings
 */
export interface AIPairSessionSettings {
  /** AI proactivity */
  aiProactivity: 'passive' | 'moderate' | 'proactive';
  /** Auto-suggest enabled */
  autoSuggest: boolean;
  /** Show AI confidence scores */
  showConfidence: boolean;
  /** Focus areas */
  focusAreas: string[];
  /** Skip areas */
  skipAreas: string[];
  /** Notification preferences */
  notifications: {
    onNewFinding: boolean;
    onSuggestion: boolean;
    onMention: boolean;
  };
  /** Voice input enabled */
  voiceInput: boolean;
  /** Language preference */
  language: string;
}

/**
 * Session metrics
 */
export interface SessionMetrics {
  /** Session duration (minutes) */
  durationMinutes: number;
  /** Total messages */
  totalMessages: number;
  /** Human messages */
  humanMessages: number;
  /** AI messages */
  aiMessages: number;
  /** Files discussed */
  filesDiscussed: string[];
  /** Suggestions made */
  suggestionsCount: number;
  /** Suggestions applied */
  suggestionsApplied: number;
  /** Issues identified */
  issuesIdentified: number;
  /** Issues resolved */
  issuesResolved: number;
  /** Code changes made */
  codeChangesMade: number;
  /** Average response time (seconds) */
  avgResponseTime: number;
}

// ============================================
// Platform Integration Types
// ============================================

/**
 * Slack integration config
 */
export interface SlackIntegration {
  /** Workspace ID */
  workspaceId: string;
  /** Channel ID */
  channelId: string;
  /** Thread timestamp */
  threadTs?: string;
  /** Bot token */
  botToken: string;
  /** Enabled */
  enabled: boolean;
}

/**
 * Teams integration config
 */
export interface TeamsIntegration {
  /** Tenant ID */
  tenantId: string;
  /** Team ID */
  teamId: string;
  /** Channel ID */
  channelId: string;
  /** Conversation ID */
  conversationId?: string;
  /** Enabled */
  enabled: boolean;
}

/**
 * Platform notification
 */
export interface PlatformNotification {
  /** Platform */
  platform: 'slack' | 'teams' | 'email' | 'push';
  /** Notification type */
  type: 'session_started' | 'mention' | 'finding' | 'summary';
  /** Recipient */
  recipient: string;
  /** Message */
  message: string;
  /** Deep link */
  deepLink?: string;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Start session request
 */
export interface StartAIPairSessionRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** AI persona ID */
  personaId?: string;
  /** Session settings */
  settings?: Partial<AIPairSessionSettings>;
  /** Platform integrations */
  integrations?: {
    slack?: Partial<SlackIntegration>;
    teams?: Partial<TeamsIntegration>;
  };
}

/**
 * Send message request
 */
export interface SendPairMessageRequest {
  /** Session ID */
  sessionId: string;
  /** Message content */
  content: string;
  /** Message type */
  type?: PairMessageType;
  /** Code references */
  codeReferences?: PairCodeReference[];
  /** Reply to message ID */
  replyTo?: string;
}

/**
 * Update focus request
 */
export interface UpdateFocusRequest {
  /** Session ID */
  sessionId: string;
  /** New focus */
  focus: Partial<SessionFocus>;
}

/**
 * Session summary
 */
export interface AIPairSessionSummary {
  /** Session ID */
  sessionId: string;
  /** Duration */
  durationMinutes: number;
  /** Key topics discussed */
  topicsDiscussed: string[];
  /** Files reviewed */
  filesReviewed: string[];
  /** Issues found */
  issuesFound: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    file?: string;
    line?: number;
    resolved: boolean;
  }>;
  /** Suggestions made */
  suggestions: Array<{
    description: string;
    applied: boolean;
  }>;
  /** Key insights */
  keyInsights: string[];
  /** Recommended actions */
  recommendedActions: string[];
  /** Generated review comment */
  reviewComment?: string;
  /** Participation stats */
  participationStats: {
    humanMessageCount: number;
    aiMessageCount: number;
    avgResponseTimeSec: number;
  };
}

// ============================================
// AI Personas
// ============================================

/**
 * Predefined AI personas for pair programming
 */
export const AI_PAIR_PERSONAS: AIAssistantConfig[] = [
  {
    personaId: 'mentor',
    personaName: 'Mentor',
    avatar: '👨‍🏫',
    expertise: ['architecture', 'design patterns', 'best practices', 'code quality'],
    style: 'mentor',
    proactivity: 'moderate',
    contextConfig: {
      maxHistoryMessages: 20,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: true,
      customSources: [],
    },
  },
  {
    personaId: 'security-expert',
    personaName: 'Security Expert',
    avatar: '🔐',
    expertise: ['security', 'authentication', 'encryption', 'OWASP', 'vulnerability analysis'],
    style: 'security-hawk',
    proactivity: 'proactive',
    contextConfig: {
      maxHistoryMessages: 15,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: true,
      customSources: ['security-rules'],
    },
  },
  {
    personaId: 'performance-expert',
    personaName: 'Performance Expert',
    avatar: '⚡',
    expertise: ['performance', 'optimization', 'algorithms', 'caching', 'database'],
    style: 'performance-guru',
    proactivity: 'moderate',
    contextConfig: {
      maxHistoryMessages: 15,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: false,
      customSources: [],
    },
  },
  {
    personaId: 'pragmatist',
    personaName: 'Pragmatist',
    avatar: '🎯',
    expertise: ['shipping', 'trade-offs', 'MVPs', 'testing', 'maintainability'],
    style: 'pragmatist',
    proactivity: 'passive',
    contextConfig: {
      maxHistoryMessages: 10,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: false,
      customSources: [],
    },
  },
  {
    personaId: 'collaborator',
    personaName: 'Collaborator',
    avatar: '🤝',
    expertise: ['code review', 'discussion', 'exploration', 'brainstorming'],
    style: 'collaborator',
    proactivity: 'moderate',
    contextConfig: {
      maxHistoryMessages: 25,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: true,
      customSources: [],
    },
  },
];
