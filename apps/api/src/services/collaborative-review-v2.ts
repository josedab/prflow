/**
 * @fileoverview Real-Time Collaborative Review Service
 *
 * Session management, participant tracking, threaded discussions,
 * decision recording, and AI-assisted session summaries.
 */

import { logger } from '../lib/logger.js';
import type {
  CollabSession,
  CollabParticipant,
  DiscussionThread,
  ThreadMessage,
  ReviewDecision,
  CollabEvent,
  CollabSessionSummary,
  CollabConfig,
  CollabSessionStatus,
} from '@prflow/core';

export class CollaborativeReviewV2Service {
  private sessions = new Map<string, CollabSession>();
  private events: CollabEvent[] = [];
  private config: CollabConfig = {
    maxParticipants: 10,
    sessionTimeoutMinutes: 120,
    enableAISummaries: true,
    enableCursorSharing: true,
    requireHostToStart: true,
    autoRecordSessions: true,
  };

  getConfig(): CollabConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<CollabConfig>): CollabConfig {
    Object.assign(this.config, updates);
    return { ...this.config };
  }

  /**
   * Create a new collaborative review session.
   */
  createSession(params: {
    repositoryId: string;
    pullRequestNumber: number;
    title: string;
    hostId: string;
    hostName: string;
  }): CollabSession {
    const session: CollabSession = {
      id: `collab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      repositoryId: params.repositoryId,
      pullRequestNumber: params.pullRequestNumber,
      title: params.title,
      status: 'waiting',
      hostId: params.hostId,
      participants: [
        {
          userId: params.hostId,
          displayName: params.hostName,
          role: 'host',
          joinedAt: new Date(),
          isActive: true,
          lastActivityAt: new Date(),
        },
      ],
      threads: [],
      decisions: [],
      createdAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.emitEvent(session.id, params.hostId, 'join', { role: 'host' });
    logger.info(
      { sessionId: session.id, pr: params.pullRequestNumber },
      'Collaborative session created'
    );
    return session;
  }

  /**
   * Join an existing session.
   */
  joinSession(
    sessionId: string,
    userId: string,
    displayName: string,
    role: 'reviewer' | 'observer' = 'reviewer'
  ): CollabParticipant | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.participants.length >= this.config.maxParticipants) return null;

    const existing = session.participants.find((p) => p.userId === userId);
    if (existing) {
      existing.isActive = true;
      existing.lastActivityAt = new Date();
      return existing;
    }

    const participant: CollabParticipant = {
      userId,
      displayName,
      role,
      joinedAt: new Date(),
      isActive: true,
      lastActivityAt: new Date(),
    };

    session.participants.push(participant);
    this.emitEvent(sessionId, userId, 'join', { role });
    return participant;
  }

  /**
   * Leave a session.
   */
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) return false;

    participant.isActive = false;
    this.emitEvent(sessionId, userId, 'leave', {});
    return true;
  }

  /**
   * Start the session (host only).
   */
  startSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (this.config.requireHostToStart && session.hostId !== userId) return false;

    session.status = 'active';
    session.startedAt = new Date();
    this.emitEvent(sessionId, userId, 'status_change', { status: 'active' });
    return true;
  }

  /**
   * Create a new discussion thread on a code location.
   */
  createThread(
    sessionId: string,
    params: {
      filePath: string;
      startLine: number;
      endLine: number;
      authorId: string;
      authorName: string;
      initialMessage: string;
    }
  ): DiscussionThread | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const thread: DiscussionThread = {
      id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      filePath: params.filePath,
      startLine: params.startLine,
      endLine: params.endLine,
      messages: [
        {
          id: `msg-${Date.now()}`,
          threadId: '',
          authorId: params.authorId,
          authorName: params.authorName,
          content: params.initialMessage,
          isAISuggestion: false,
          timestamp: new Date(),
          reactions: {},
        },
      ],
      status: 'open',
      createdAt: new Date(),
    };

    thread.messages[0]!.threadId = thread.id;
    session.threads.push(thread);
    this.emitEvent(sessionId, params.authorId, 'thread_create', {
      threadId: thread.id,
      filePath: params.filePath,
    });
    return thread;
  }

  /**
   * Add a message to a thread.
   */
  addMessage(
    sessionId: string,
    threadId: string,
    params: {
      authorId: string;
      authorName: string;
      content: string;
      isAISuggestion?: boolean;
    }
  ): ThreadMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const thread = session.threads.find((t) => t.id === threadId);
    if (!thread) return null;

    const message: ThreadMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      threadId,
      authorId: params.authorId,
      authorName: params.authorName,
      content: params.content,
      isAISuggestion: params.isAISuggestion ?? false,
      timestamp: new Date(),
      reactions: {},
    };

    thread.messages.push(message);
    this.emitEvent(sessionId, params.authorId, 'message', { threadId, messageId: message.id });
    return message;
  }

  /**
   * Resolve a thread.
   */
  resolveThread(sessionId: string, threadId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const thread = session.threads.find((t) => t.id === threadId);
    if (!thread) return false;

    thread.status = 'resolved';
    thread.resolvedAt = new Date();
    return true;
  }

  /**
   * Record a review decision.
   */
  recordDecision(
    sessionId: string,
    params: {
      threadId?: string;
      type: 'approve' | 'request_changes' | 'defer' | 'action_item';
      description: string;
      decidedBy: string;
      assignee?: string;
    }
  ): ReviewDecision | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const decision: ReviewDecision = {
      id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      threadId: params.threadId,
      type: params.type,
      description: params.description,
      assignee: params.assignee,
      decidedBy: params.decidedBy,
      decidedAt: new Date(),
    };

    session.decisions.push(decision);
    this.emitEvent(sessionId, params.decidedBy, 'decision', {
      decisionId: decision.id,
      type: params.type,
    });
    return decision;
  }

  /**
   * Complete a session and generate summary.
   */
  completeSession(sessionId: string): CollabSessionSummary | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.status = 'completed';
    session.completedAt = new Date();

    const duration = session.startedAt
      ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 60000)
      : 0;

    const actionItems = session.decisions.filter((d) => d.type === 'action_item');
    const keyPoints = session.threads
      .filter((t) => t.messages.length > 2)
      .map((t) => `${t.filePath}:${t.startLine} - ${t.messages[0]?.content.slice(0, 80)}`);

    const summary: CollabSessionSummary = {
      sessionId,
      duration,
      participantCount: session.participants.length,
      threadsCreated: session.threads.length,
      threadsResolved: session.threads.filter((t) => t.status === 'resolved').length,
      decisionsCount: session.decisions.length,
      actionItems,
      aiGeneratedNotes: `Review session for PR #${session.pullRequestNumber} completed in ${duration} minutes with ${session.participants.length} participants. ${session.threads.length} discussion threads opened, ${session.threads.filter((t) => t.status === 'resolved').length} resolved.`,
      keyDiscussionPoints: keyPoints,
    };

    this.emitEvent(sessionId, session.hostId, 'status_change', { status: 'completed' });
    return summary;
  }

  getSession(sessionId: string): CollabSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(repositoryId?: string, status?: CollabSessionStatus): CollabSession[] {
    let sessions = Array.from(this.sessions.values());
    if (repositoryId) sessions = sessions.filter((s) => s.repositoryId === repositoryId);
    if (status) sessions = sessions.filter((s) => s.status === status);
    return sessions;
  }

  getEvents(sessionId: string, since?: Date): CollabEvent[] {
    let events = this.events.filter((e) => e.sessionId === sessionId);
    if (since) events = events.filter((e) => e.timestamp > since);
    return events;
  }

  private emitEvent(
    sessionId: string,
    userId: string,
    type: CollabEvent['type'],
    payload: Record<string, unknown>
  ): void {
    this.events.push({ type, sessionId, userId, payload, timestamp: new Date() });
  }
}

export const collaborativeReviewV2Service = new CollaborativeReviewV2Service();
