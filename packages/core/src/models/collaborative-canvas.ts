/**
 * @fileoverview Real-Time Collaborative Review Canvas Models
 *
 * Types for multiplayer review sessions with cursor presence,
 * CRDT-based annotations, AI-moderated consensus, and
 * session recording for async replay.
 *
 * @module models/collaborative-canvas
 */

// ============================================
// Session Types
// ============================================

/**
 * Canvas session status
 */
export type CanvasSessionStatus = 'waiting' | 'active' | 'paused' | 'concluded' | 'archived';

/**
 * A collaborative review canvas session
 */
export interface CanvasSession {
  /** Session ID */
  id: string;
  /** PR number being reviewed */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Session status */
  status: CanvasSessionStatus;
  /** Session creator */
  createdBy: string;
  /** Participants */
  participants: CanvasParticipant[];
  /** Files under review */
  files: string[];
  /** Annotations */
  annotations: CanvasAnnotation[];
  /** Discussion threads */
  threads: CanvasThread[];
  /** AI moderator summary */
  aiSummary?: CanvasAISummary;
  /** Conclusion */
  conclusion?: CanvasConclusion;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
  /** Concluded at */
  concludedAt?: Date;
}

// ============================================
// Participant Types
// ============================================

/**
 * A participant in the canvas session
 */
export interface CanvasParticipant {
  /** User login */
  login: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Role in the review */
  role: 'host' | 'reviewer' | 'observer';
  /** Current cursor position */
  cursor?: CanvasCursorPosition;
  /** Currently viewing file */
  activeFile?: string;
  /** Connection status */
  connectionStatus: 'connected' | 'disconnected' | 'idle';
  /** Joined at */
  joinedAt: Date;
  /** Last active at */
  lastActiveAt: Date;
}

/**
 * Cursor position in the canvas
 */
export interface CanvasCursorPosition {
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Selection range (if selecting text) */
  selection?: { startLine: number; startCol: number; endLine: number; endCol: number };
}

// ============================================
// Annotation Types
// ============================================

/**
 * An annotation on the canvas
 */
export interface CanvasAnnotation {
  /** Annotation ID */
  id: string;
  /** Author login */
  author: string;
  /** File path */
  file: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Annotation type */
  type: 'highlight' | 'question' | 'suggestion' | 'approval' | 'concern';
  /** Color (hex) */
  color: string;
  /** Content text */
  content: string;
  /** CRDT version clock */
  vectorClock: Record<string, number>;
  /** Created at */
  createdAt: Date;
  /** Resolved */
  resolved: boolean;
}

// ============================================
// Discussion Types
// ============================================

/**
 * A threaded discussion on the canvas
 */
export interface CanvasThread {
  /** Thread ID */
  id: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** Thread status */
  status: 'open' | 'resolved' | 'wontfix';
  /** Messages */
  messages: CanvasMessage[];
  /** Related annotation IDs */
  annotationIds: string[];
  /** Created at */
  createdAt: Date;
}

/**
 * A message in a canvas thread
 */
export interface CanvasMessage {
  /** Message ID */
  id: string;
  /** Author login */
  author: string;
  /** Content */
  content: string;
  /** Message type */
  type: 'comment' | 'suggestion' | 'ai_insight';
  /** Code suggestion (if type is suggestion) */
  codeSuggestion?: { original: string; suggested: string };
  /** Reactions */
  reactions: Array<{ emoji: string; users: string[] }>;
  /** Created at */
  createdAt: Date;
}

// ============================================
// AI Moderator Types
// ============================================

/**
 * AI-generated summary of the review session
 */
export interface CanvasAISummary {
  /** Summary text */
  summary: string;
  /** Key discussion points */
  keyPoints: string[];
  /** Unresolved disagreements */
  disagreements: CanvasDisagreement[];
  /** Consensus items */
  consensusItems: string[];
  /** Suggested action items */
  actionItems: CanvasActionItem[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * A disagreement detected by the AI moderator
 */
export interface CanvasDisagreement {
  /** Topic */
  topic: string;
  /** File and line */
  location: { file: string; line: number };
  /** Positions held by participants */
  positions: Array<{ participant: string; position: string }>;
  /** AI recommendation */
  aiRecommendation?: string;
}

/**
 * An action item from the review
 */
export interface CanvasActionItem {
  /** Item description */
  description: string;
  /** Assignee */
  assignee?: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Related file */
  file?: string;
  /** Related line */
  line?: number;
}

// ============================================
// Conclusion Types
// ============================================

/**
 * Review session conclusion
 */
export interface CanvasConclusion {
  /** Outcome */
  outcome: 'approved' | 'changes_requested' | 'needs_discussion' | 'no_consensus';
  /** Votes */
  votes: Array<{ participant: string; vote: 'approve' | 'request_changes' | 'abstain' }>;
  /** Summary */
  summary: string;
  /** Action items */
  actionItems: CanvasActionItem[];
  /** Auto-sync to GitHub PR review */
  syncedToGitHub: boolean;
}

// ============================================
// Recording Types
// ============================================

/**
 * Session recording for async replay
 */
export interface CanvasRecording {
  /** Recording ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Duration (ms) */
  durationMs: number;
  /** Events recorded */
  eventCount: number;
  /** Key moments */
  keyMoments: Array<{
    timestampMs: number;
    type: 'annotation' | 'discussion' | 'resolution' | 'conclusion';
    summary: string;
  }>;
  /** Created at */
  createdAt: Date;
}
