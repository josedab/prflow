import { z } from 'zod';

// ============================================
// Collaborative Review Types
// ============================================

export const ParticipantRoleSchema = z.enum([
  'author',
  'reviewer',
  'observer',
  'moderator',
]);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

export const ParticipantStatusSchema = z.enum([
  'online',
  'away',
  'busy',
  'offline',
]);
export type ParticipantStatus = z.infer<typeof ParticipantStatusSchema>;

export const ReviewSessionStatusSchema = z.enum([
  'scheduled',
  'waiting',
  'active',
  'paused',
  'completed',
  'cancelled',
]);
export type ReviewSessionStatus = z.infer<typeof ReviewSessionStatusSchema>;

// ============================================
// Review Session
// ============================================

export interface ReviewSession {
  id: string;
  prNumber: number;
  repositoryId: string;
  title: string;
  description?: string;
  status: ReviewSessionStatus;
  host: string;
  participants: SessionParticipant[];
  settings: SessionSettings;
  currentFile?: string;
  currentLine?: number;
  chat: ChatMessage[];
  annotations: SessionAnnotation[];
  recordings?: SessionRecording[];
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

export interface SessionParticipant {
  id: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  joinedAt: Date;
  lastActiveAt: Date;
  permissions: ParticipantPermissions;
}

export interface ParticipantPermissions {
  canComment: boolean;
  canAnnotate: boolean;
  canNavigate: boolean;
  canApprove: boolean;
  canMerge: boolean;
}

export interface CursorPosition {
  file: string;
  line: number;
  column: number;
  timestamp: Date;
}

export interface SelectionRange {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface SessionSettings {
  maxParticipants: number;
  allowObservers: boolean;
  recordSession: boolean;
  autoFollow: boolean;  // Participants auto-follow host navigation
  requireApproval: boolean;
  notifyOnJoin: boolean;
  timezone?: string;
}

// ============================================
// Chat & Communication
// ============================================

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderLogin: string;
  type: 'text' | 'code' | 'reaction' | 'system';
  content: string;
  codeContext?: CodeContext;
  reactions: MessageReaction[];
  replyTo?: string;
  timestamp: Date;
}

export interface CodeContext {
  file: string;
  startLine: number;
  endLine: number;
  code: string;
  language: string;
}

export interface MessageReaction {
  emoji: string;
  users: string[];
}

// ============================================
// Annotations
// ============================================

export interface SessionAnnotation {
  id: string;
  sessionId: string;
  authorId: string;
  authorLogin: string;
  type: 'comment' | 'question' | 'suggestion' | 'issue' | 'highlight';
  file: string;
  startLine: number;
  endLine?: number;
  content: string;
  suggestion?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'dismissed';
  replies: AnnotationReply[];
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface AnnotationReply {
  id: string;
  authorId: string;
  authorLogin: string;
  content: string;
  timestamp: Date;
}

// ============================================
// Session Events (Real-time)
// ============================================

export type SessionEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'participant_status_changed'
  | 'cursor_moved'
  | 'selection_changed'
  | 'file_changed'
  | 'annotation_added'
  | 'annotation_updated'
  | 'annotation_resolved'
  | 'chat_message'
  | 'session_status_changed'
  | 'recording_started'
  | 'recording_stopped';

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: SessionEventType;
  payload: unknown;
  userId: string;
  timestamp: Date;
}

export interface CursorMovedEvent {
  userId: string;
  position: CursorPosition;
}

export interface SelectionChangedEvent {
  userId: string;
  selection: SelectionRange | null;
}

export interface FileChangedEvent {
  userId: string;
  file: string;
  line?: number;
}

// ============================================
// Recording
// ============================================

export interface SessionRecording {
  id: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;  // seconds
  events: SessionEvent[];
  url?: string;
  size?: number;  // bytes
}

// ============================================
// Session Summary
// ============================================

export interface SessionSummary {
  sessionId: string;
  prNumber: number;
  duration: number;  // minutes
  participants: Array<{
    login: string;
    role: ParticipantRole;
    activeTime: number;  // minutes
  }>;
  stats: SessionStats;
  outcomes: SessionOutcome[];
  highlights: string[];
  nextSteps: string[];
  generatedAt: Date;
}

export interface SessionStats {
  totalMessages: number;
  totalAnnotations: number;
  resolvedAnnotations: number;
  filesReviewed: number;
  linesDiscussed: number;
  avgResponseTime: number;  // seconds
}

export interface SessionOutcome {
  type: 'approved' | 'changes_requested' | 'deferred' | 'escalated';
  description: string;
  actionItems: ActionItem[];
}

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  status: 'pending' | 'in_progress' | 'completed';
}

// ============================================
// Agent Input/Output
// ============================================

export interface CollaborativeReviewInput {
  operation: 'create' | 'join' | 'leave' | 'navigate' | 'annotate' | 'chat' | 'summarize';
  sessionId?: string;
  prNumber?: number;
  repositoryId?: string;
  userId: string;
  data?: {
    file?: string;
    line?: number;
    message?: string;
    annotation?: Partial<SessionAnnotation>;
    settings?: Partial<SessionSettings>;
  };
}

export interface CollaborativeReviewResult {
  operation: string;
  success: boolean;
  data?: {
    session?: ReviewSession;
    event?: SessionEvent;
    summary?: SessionSummary;
  };
  error?: string;
}
