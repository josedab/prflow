/**
 * @fileoverview Types for Real-Time Collaborative Review
 *
 * WebSocket presence, live inline discussions, session management,
 * and AI-assisted summaries.
 */

export type CollabSessionStatus = 'waiting' | 'active' | 'paused' | 'completed';

export interface CollabSession {
  id: string;
  repositoryId: string;
  pullRequestNumber: number;
  title: string;
  status: CollabSessionStatus;
  hostId: string;
  participants: CollabParticipant[];
  threads: DiscussionThread[];
  decisions: ReviewDecision[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CollabParticipant {
  userId: string;
  displayName: string;
  role: 'host' | 'reviewer' | 'observer';
  joinedAt: Date;
  cursor?: CollabCursorPosition;
  isActive: boolean;
  lastActivityAt: Date;
}

export interface CollabCursorPosition {
  filePath: string;
  line: number;
  column: number;
  viewportStart: number;
  viewportEnd: number;
  updatedAt: Date;
}

export interface DiscussionThread {
  id: string;
  sessionId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  messages: ThreadMessage[];
  status: 'open' | 'resolved' | 'deferred';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  content: string;
  isAISuggestion: boolean;
  timestamp: Date;
  reactions: Record<string, string[]>;
}

export interface ReviewDecision {
  id: string;
  sessionId: string;
  threadId?: string;
  type: 'approve' | 'request_changes' | 'defer' | 'action_item';
  description: string;
  assignee?: string;
  decidedBy: string;
  decidedAt: Date;
}

export interface CollabEvent {
  type:
    | 'join'
    | 'leave'
    | 'cursor_move'
    | 'thread_create'
    | 'message'
    | 'decision'
    | 'status_change'
    | 'ai_summary';
  sessionId: string;
  userId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export interface CollabSessionSummary {
  sessionId: string;
  duration: number;
  participantCount: number;
  threadsCreated: number;
  threadsResolved: number;
  decisionsCount: number;
  actionItems: ReviewDecision[];
  aiGeneratedNotes: string;
  keyDiscussionPoints: string[];
}

export interface CollabConfig {
  maxParticipants: number;
  sessionTimeoutMinutes: number;
  enableAISummaries: boolean;
  enableCursorSharing: boolean;
  requireHostToStart: boolean;
  autoRecordSessions: boolean;
}
