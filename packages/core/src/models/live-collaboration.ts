/**
 * @fileoverview Types for Live Collaborative Review Sessions.
 *
 * This module provides types for real-time collaborative code review,
 * enabling multiple reviewers to work together on a PR with features
 * like cursor sharing, live comments, and voice notes.
 *
 * @module models/live-collaboration
 */

// ============================================
// Session Types
// ============================================

/**
 * Status of a live collaboration session
 */
export type LiveSessionStatus = 'waiting' | 'active' | 'paused' | 'ended';

/**
 * Role of a participant in a live session
 */
export type LiveParticipantRole = 'host' | 'reviewer' | 'observer' | 'author';

/**
 * A participant in a live collaboration session
 */
export interface LiveSessionParticipant {
  /** User ID */
  userId: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Role in the session */
  role: LiveParticipantRole;
  /** Current cursor position */
  cursor?: LiveCursorPosition;
  /** Current status */
  status: 'active' | 'idle' | 'away' | 'disconnected';
  /** When they joined */
  joinedAt: Date;
  /** Last activity */
  lastActiveAt: Date;
  /** Color assigned for their cursor */
  cursorColor: string;
}

/**
 * Cursor position in a file for live sessions
 */
export interface LiveCursorPosition {
  /** File path */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** Selection range (if any) */
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

/**
 * A live collaboration session
 */
export interface LiveCollaborationSession {
  /** Session ID */
  id: string;
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** Session name */
  name: string;
  /** Session status */
  status: LiveSessionStatus;
  /** Host user ID */
  hostId: string;
  /** All participants */
  participants: LiveSessionParticipant[];
  /** Session settings */
  settings: LiveSessionSettings;
  /** Files being reviewed */
  activeFiles: string[];
  /** Current focus file */
  focusFile?: string;
  /** When session was created */
  createdAt: Date;
  /** When session started */
  startedAt?: Date;
  /** When session ended */
  endedAt?: Date;
  /** Join URL */
  joinUrl: string;
  /** Access code (if required) */
  accessCode?: string;
}

/**
 * Settings for a live collaboration session
 */
export interface LiveSessionSettings {
  /** Maximum participants */
  maxParticipants: number;
  /** Whether to allow observers */
  allowObservers: boolean;
  /** Whether voice is enabled */
  voiceEnabled: boolean;
  /** Whether cursor sharing is enabled */
  cursorSharingEnabled: boolean;
  /** Whether auto-follow host is enabled */
  autoFollowHost: boolean;
  /** Require access code to join */
  requireAccessCode: boolean;
  /** Record session */
  recordSession: boolean;
  /** Allow participants to post comments */
  allowParticipantComments: boolean;
}

/**
 * Default session settings
 */
export const DEFAULT_LIVE_SESSION_SETTINGS: LiveSessionSettings = {
  maxParticipants: 10,
  allowObservers: true,
  voiceEnabled: true,
  cursorSharingEnabled: true,
  autoFollowHost: true,
  requireAccessCode: false,
  recordSession: false,
  allowParticipantComments: true,
};

// ============================================
// Real-time Events
// ============================================

/**
 * Types of real-time events in a live session
 */
export type LiveSessionEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'cursor_moved'
  | 'selection_changed'
  | 'file_changed'
  | 'comment_added'
  | 'comment_resolved'
  | 'highlight_added'
  | 'highlight_removed'
  | 'voice_started'
  | 'voice_ended'
  | 'reaction_added'
  | 'session_paused'
  | 'session_resumed'
  | 'session_ended'
  | 'focus_requested';

/**
 * A real-time event in the live session
 */
export interface LiveSessionEvent {
  /** Event ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Event type */
  type: LiveSessionEventType;
  /** User who triggered the event */
  userId: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

// ============================================
// Live Comments & Annotations
// ============================================

/**
 * A live comment during the session
 */
export interface LiveSessionComment {
  /** Comment ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Author user ID */
  authorId: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** End line (if range) */
  endLine?: number;
  /** Comment content */
  content: string;
  /** Comment type */
  type: 'comment' | 'suggestion' | 'question' | 'issue';
  /** Whether resolved */
  resolved: boolean;
  /** Resolved by */
  resolvedBy?: string;
  /** Replies */
  replies: LiveCommentReply[];
  /** When created */
  createdAt: Date;
  /** When updated */
  updatedAt: Date;
}

/**
 * A reply to a live comment
 */
export interface LiveCommentReply {
  /** Reply ID */
  id: string;
  /** Author user ID */
  authorId: string;
  /** Reply content */
  content: string;
  /** When created */
  createdAt: Date;
}

/**
 * A temporary highlight during the session
 */
export interface LiveHighlight {
  /** Highlight ID */
  id: string;
  /** User who created it */
  userId: string;
  /** File path */
  file: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Highlight color */
  color: string;
  /** Optional label */
  label?: string;
  /** Auto-remove after seconds (0 = permanent until removed) */
  duration: number;
  /** When created */
  createdAt: Date;
}

/**
 * A reaction to code or comment
 */
export interface LiveReaction {
  /** Reaction ID */
  id: string;
  /** User who reacted */
  userId: string;
  /** Reaction emoji */
  emoji: string;
  /** Target type */
  targetType: 'line' | 'comment' | 'file';
  /** Target ID (line number, comment ID, or file path) */
  targetId: string;
  /** File context */
  file?: string;
  /** When created */
  createdAt: Date;
}

// ============================================
// Voice Notes
// ============================================

/**
 * A voice note attached to code
 */
export interface VoiceNote {
  /** Note ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Author user ID */
  authorId: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** End line (if range) */
  endLine?: number;
  /** Audio URL */
  audioUrl: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** Transcript (if available) */
  transcript?: string;
  /** When created */
  createdAt: Date;
}

// ============================================
// Session Recording
// ============================================

/**
 * A recorded live collaboration session
 */
export interface LiveSessionRecording {
  /** Recording ID */
  id: string;
  /** Session ID */
  sessionId: string;
  /** Recording URL */
  url: string;
  /** Duration in seconds */
  durationSeconds: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Format */
  format: 'video' | 'events' | 'both';
  /** Events timeline */
  eventsTimeline?: LiveSessionEvent[];
  /** When created */
  createdAt: Date;
  /** Expiration date */
  expiresAt?: Date;
}

// ============================================
// Session Summary
// ============================================

/**
 * Summary of a completed live session
 */
export interface LiveSessionSummary {
  /** Session ID */
  sessionId: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Participants who joined */
  participants: Array<{
    userId: string;
    displayName: string;
    role: LiveParticipantRole;
    activeMinutes: number;
  }>;
  /** Files reviewed */
  filesReviewed: string[];
  /** Comments made */
  commentsCount: number;
  /** Comments resolved */
  commentsResolved: number;
  /** Issues identified */
  issuesIdentified: number;
  /** Highlights made */
  highlightsCount: number;
  /** Reactions count */
  reactionsCount: number;
  /** Voice notes count */
  voiceNotesCount: number;
  /** Key decisions made */
  keyDecisions: string[];
  /** Follow-up actions */
  followUpActions: Array<{
    action: string;
    assignee?: string;
    deadline?: Date;
  }>;
  /** Generated at */
  generatedAt: Date;
}

// ============================================
// API Types
// ============================================

/**
 * Input for creating a new session
 */
export interface CreateSessionInput {
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** Session name */
  name?: string;
  /** Initial participants to invite */
  invitees?: string[];
  /** Session settings */
  settings?: Partial<LiveSessionSettings>;
  /** Scheduled start time */
  scheduledFor?: Date;
}

/**
 * Input for joining a session
 */
export interface JoinSessionInput {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Access code (if required) */
  accessCode?: string;
  /** Preferred role */
  preferredRole?: LiveParticipantRole;
}

/**
 * Available colors for cursors
 */
export const CURSOR_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky
];

/**
 * Get a cursor color for a participant index
 */
export function getCursorColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}
