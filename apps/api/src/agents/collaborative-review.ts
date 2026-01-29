import type {
  CollaborativeReviewInput,
  CollaborativeReviewResult,
  ReviewSession,
  SessionParticipant,
  SessionAnnotation,
  ChatMessage,
  SessionEvent,
  SessionSummary,
  ParticipantRole,
} from '@prflow/core';
import { BaseAgent } from './base.js';
import { logger } from '../lib/logger.js';

export class CollaborativeReviewAgent extends BaseAgent<CollaborativeReviewInput, CollaborativeReviewResult> {
  readonly name = 'collaborative-review';
  readonly description = 'Manages real-time collaborative code review sessions';

  private sessions: Map<string, ReviewSession> = new Map();
  private eventHandlers: Map<string, Array<(event: SessionEvent) => void>> = new Map();

  async execute(input: CollaborativeReviewInput, _context: unknown): Promise<{
    success: boolean;
    data?: CollaborativeReviewResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result) {
      return this.createErrorResult('Collaborative review operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: CollaborativeReviewInput): Promise<CollaborativeReviewResult> {
    const { operation, sessionId, prNumber, repositoryId, userId, data } = input;

    switch (operation) {
      case 'create':
        if (!prNumber || !repositoryId) {
          return { operation, success: false, error: 'prNumber and repositoryId are required' };
        }
        return this.createSession(prNumber, repositoryId, userId, data?.settings);
      
      case 'join':
        if (!sessionId) {
          return { operation, success: false, error: 'sessionId is required' };
        }
        return this.joinSession(sessionId, userId);
      
      case 'leave':
        if (!sessionId) {
          return { operation, success: false, error: 'sessionId is required' };
        }
        return this.leaveSession(sessionId, userId);
      
      case 'navigate':
        if (!sessionId || !data?.file) {
          return { operation, success: false, error: 'sessionId and file are required' };
        }
        return this.navigateTo(sessionId, userId, data.file, data.line);
      
      case 'annotate':
        if (!sessionId || !data?.annotation) {
          return { operation, success: false, error: 'sessionId and annotation are required' };
        }
        return this.addAnnotation(sessionId, userId, data.annotation);
      
      case 'chat':
        if (!sessionId || !data?.message) {
          return { operation, success: false, error: 'sessionId and message are required' };
        }
        return this.sendMessage(sessionId, userId, data.message);
      
      case 'summarize':
        if (!sessionId) {
          return { operation, success: false, error: 'sessionId is required' };
        }
        return this.summarizeSession(sessionId);
      
      default:
        return { operation, success: false, error: `Unknown operation: ${operation}` };
    }
  }

  private createSession(
    prNumber: number,
    repositoryId: string,
    hostId: string,
    settings?: Partial<{
      maxParticipants: number;
      allowObservers: boolean;
      recordSession: boolean;
      autoFollow: boolean;
      requireApproval: boolean;
      notifyOnJoin: boolean;
    }>
  ): CollaborativeReviewResult {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const host: SessionParticipant = {
      id: hostId,
      login: hostId,
      role: 'moderator',
      status: 'online',
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      permissions: {
        canComment: true,
        canAnnotate: true,
        canNavigate: true,
        canApprove: true,
        canMerge: true,
      },
    };

    const session: ReviewSession = {
      id: sessionId,
      prNumber,
      repositoryId,
      title: `Review Session for PR #${prNumber}`,
      status: 'waiting',
      host: hostId,
      participants: [host],
      settings: {
        maxParticipants: settings?.maxParticipants || 10,
        allowObservers: settings?.allowObservers ?? true,
        recordSession: settings?.recordSession ?? false,
        autoFollow: settings?.autoFollow ?? true,
        requireApproval: settings?.requireApproval ?? true,
        notifyOnJoin: settings?.notifyOnJoin ?? true,
      },
      chat: [],
      annotations: [],
      createdAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    logger.info({ sessionId, prNumber, host: hostId }, 'Created collaborative review session');

    return {
      operation: 'create',
      success: true,
      data: { session },
    };
  }

  private joinSession(sessionId: string, userId: string): CollaborativeReviewResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'join', success: false, error: 'Session not found' };
    }

    // Check if already a participant
    const existing = session.participants.find(p => p.id === userId);
    if (existing) {
      existing.status = 'online';
      existing.lastActiveAt = new Date();
      return { operation: 'join', success: true, data: { session } };
    }

    // Check capacity
    if (session.participants.length >= session.settings.maxParticipants) {
      return { operation: 'join', success: false, error: 'Session is full' };
    }

    // Determine role based on settings
    let role: ParticipantRole = 'reviewer';
    if (userId === session.host) {
      role = 'moderator';
    } else if (session.settings.allowObservers && session.participants.length > session.settings.maxParticipants / 2) {
      // Excess participants become observers
      role = 'observer';
    }

    // Permission flags based on role
    const canModerate = role === 'moderator';
    const canFullyParticipate = role !== 'observer';

    const participant: SessionParticipant = {
      id: userId,
      login: userId,
      role,
      status: 'online',
      joinedAt: new Date(),
      lastActiveAt: new Date(),
      permissions: {
        canComment: true,
        canAnnotate: canFullyParticipate,
        canNavigate: canFullyParticipate,
        canApprove: role === 'reviewer' || canModerate,
        canMerge: canModerate,
      },
    };

    session.participants.push(participant);

    // Update status if this is the first reviewer joining
    if (session.status === 'waiting' && role === 'reviewer') {
      session.status = 'active';
      session.startedAt = new Date();
    }

    // Emit event
    this.emitEvent(sessionId, {
      id: `evt-${Date.now()}`,
      sessionId,
      type: 'participant_joined',
      payload: { participant },
      userId,
      timestamp: new Date(),
    });

    logger.info({ sessionId, userId, role }, 'Participant joined session');

    return { operation: 'join', success: true, data: { session } };
  }

  private leaveSession(sessionId: string, userId: string): CollaborativeReviewResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'leave', success: false, error: 'Session not found' };
    }

    const participantIndex = session.participants.findIndex(p => p.id === userId);
    if (participantIndex === -1) {
      return { operation: 'leave', success: false, error: 'Not a participant' };
    }

    const participant = session.participants[participantIndex];
    participant.status = 'offline';

    // Emit event
    this.emitEvent(sessionId, {
      id: `evt-${Date.now()}`,
      sessionId,
      type: 'participant_left',
      payload: { userId },
      userId,
      timestamp: new Date(),
    });

    // Check if session should end (host left)
    if (userId === session.host) {
      const onlineParticipants = session.participants.filter(p => p.status === 'online');
      if (onlineParticipants.length === 0) {
        session.status = 'completed';
        session.endedAt = new Date();
      } else {
        // Transfer host to next available participant
        const newHost = onlineParticipants.find(p => p.role !== 'observer');
        if (newHost) {
          session.host = newHost.id;
          newHost.role = 'moderator';
        }
      }
    }

    logger.info({ sessionId, userId }, 'Participant left session');

    return { operation: 'leave', success: true, data: { session } };
  }

  private navigateTo(
    sessionId: string,
    userId: string,
    file: string,
    line?: number
  ): CollaborativeReviewResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'navigate', success: false, error: 'Session not found' };
    }

    const participant = session.participants.find(p => p.id === userId);
    if (!participant) {
      return { operation: 'navigate', success: false, error: 'Not a participant' };
    }

    if (!participant.permissions.canNavigate) {
      return { operation: 'navigate', success: false, error: 'No navigation permission' };
    }

    // Update cursor position
    participant.cursor = {
      file,
      line: line || 1,
      column: 1,
      timestamp: new Date(),
    };
    participant.lastActiveAt = new Date();

    // If host or autoFollow is on, update session position
    if (userId === session.host || session.settings.autoFollow) {
      session.currentFile = file;
      session.currentLine = line;
    }

    // Emit event
    this.emitEvent(sessionId, {
      id: `evt-${Date.now()}`,
      sessionId,
      type: 'file_changed',
      payload: { userId, file, line },
      userId,
      timestamp: new Date(),
    });

    return { operation: 'navigate', success: true, data: { session } };
  }

  private addAnnotation(
    sessionId: string,
    userId: string,
    annotation: Partial<SessionAnnotation>
  ): CollaborativeReviewResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'annotate', success: false, error: 'Session not found' };
    }

    const participant = session.participants.find(p => p.id === userId);
    if (!participant || !participant.permissions.canAnnotate) {
      return { operation: 'annotate', success: false, error: 'No annotation permission' };
    }

    const newAnnotation: SessionAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      authorId: userId,
      authorLogin: participant.login,
      type: annotation.type || 'comment',
      file: annotation.file || session.currentFile || '',
      startLine: annotation.startLine || session.currentLine || 1,
      endLine: annotation.endLine,
      content: annotation.content || '',
      suggestion: annotation.suggestion,
      priority: annotation.priority || 'medium',
      status: 'open',
      replies: [],
      createdAt: new Date(),
    };

    session.annotations.push(newAnnotation);

    // Emit event
    this.emitEvent(sessionId, {
      id: `evt-${Date.now()}`,
      sessionId,
      type: 'annotation_added',
      payload: { annotation: newAnnotation },
      userId,
      timestamp: new Date(),
    });

    return {
      operation: 'annotate',
      success: true,
      data: {
        session,
        event: {
          id: `evt-${Date.now()}`,
          sessionId,
          type: 'annotation_added',
          payload: { annotation: newAnnotation },
          userId,
          timestamp: new Date(),
        },
      },
    };
  }

  private sendMessage(
    sessionId: string,
    userId: string,
    content: string
  ): CollaborativeReviewResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'chat', success: false, error: 'Session not found' };
    }

    const participant = session.participants.find(p => p.id === userId);
    if (!participant || !participant.permissions.canComment) {
      return { operation: 'chat', success: false, error: 'No comment permission' };
    }

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      senderId: userId,
      senderLogin: participant.login,
      type: 'text',
      content,
      reactions: [],
      timestamp: new Date(),
    };

    session.chat.push(message);
    participant.lastActiveAt = new Date();

    // Emit event
    this.emitEvent(sessionId, {
      id: `evt-${Date.now()}`,
      sessionId,
      type: 'chat_message',
      payload: { message },
      userId,
      timestamp: new Date(),
    });

    return { operation: 'chat', success: true, data: { session } };
  }

  private async summarizeSession(sessionId: string): Promise<CollaborativeReviewResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { operation: 'summarize', success: false, error: 'Session not found' };
    }

    // Calculate stats
    const duration = session.startedAt && session.endedAt
      ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60000)
      : session.startedAt
        ? Math.round((Date.now() - session.startedAt.getTime()) / 60000)
        : 0;

    const stats = {
      totalMessages: session.chat.length,
      totalAnnotations: session.annotations.length,
      resolvedAnnotations: session.annotations.filter(a => a.status === 'resolved').length,
      filesReviewed: [...new Set(session.annotations.map(a => a.file))].length,
      linesDiscussed: session.annotations.reduce((sum, a) => sum + (a.endLine || a.startLine) - a.startLine + 1, 0),
      avgResponseTime: 30, // Placeholder
    };

    // Use LLM to generate summary
    const highlights = await this.generateHighlights(session);

    const summary: SessionSummary = {
      sessionId,
      prNumber: session.prNumber,
      duration,
      participants: session.participants.map(p => ({
        login: p.login,
        role: p.role,
        activeTime: duration, // Simplified
      })),
      stats,
      outcomes: [],
      highlights,
      nextSteps: this.generateNextSteps(session),
      generatedAt: new Date(),
    };

    return { operation: 'summarize', success: true, data: { summary } };
  }

  private async generateHighlights(session: ReviewSession): Promise<string[]> {
    const highlights: string[] = [];

    if (session.annotations.length > 0) {
      const highPriority = session.annotations.filter(a => a.priority === 'high');
      if (highPriority.length > 0) {
        highlights.push(`${highPriority.length} high-priority issues identified`);
      }

      const resolved = session.annotations.filter(a => a.status === 'resolved');
      if (resolved.length > 0) {
        highlights.push(`${resolved.length} of ${session.annotations.length} annotations resolved`);
      }
    }

    if (session.chat.length > 0) {
      highlights.push(`${session.chat.length} messages exchanged during review`);
    }

    const filesDiscussed = [...new Set(session.annotations.map(a => a.file))];
    if (filesDiscussed.length > 0) {
      highlights.push(`${filesDiscussed.length} files discussed in detail`);
    }

    return highlights;
  }

  private generateNextSteps(session: ReviewSession): string[] {
    const nextSteps: string[] = [];

    const openAnnotations = session.annotations.filter(a => a.status === 'open');
    if (openAnnotations.length > 0) {
      nextSteps.push(`Address ${openAnnotations.length} open annotations`);
    }

    const suggestions = session.annotations.filter(a => a.type === 'suggestion' && a.status === 'open');
    if (suggestions.length > 0) {
      nextSteps.push(`Review ${suggestions.length} code suggestions`);
    }

    const issues = session.annotations.filter(a => a.type === 'issue' && a.priority === 'high');
    if (issues.length > 0) {
      nextSteps.push(`Fix ${issues.length} high-priority issues before merge`);
    }

    if (openAnnotations.length === 0) {
      nextSteps.push('All annotations resolved - PR is ready for approval');
    }

    return nextSteps;
  }

  private emitEvent(sessionId: string, event: SessionEvent): void {
    const handlers = this.eventHandlers.get(sessionId) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.warn({ error, sessionId, eventType: event.type }, 'Event handler error');
      }
    }
  }

  // Public methods for WebSocket integration
  subscribeToSession(sessionId: string, handler: (event: SessionEvent) => void): () => void {
    if (!this.eventHandlers.has(sessionId)) {
      this.eventHandlers.set(sessionId, []);
    }
    this.eventHandlers.get(sessionId)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(sessionId);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  getSession(sessionId: string): ReviewSession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(repositoryId?: string): ReviewSession[] {
    const sessions = Array.from(this.sessions.values()).filter(
      s => s.status === 'active' || s.status === 'waiting'
    );

    if (repositoryId) {
      return sessions.filter(s => s.repositoryId === repositoryId);
    }

    return sessions;
  }

  endSession(sessionId: string): ReviewSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.endedAt = new Date();
    }
    return session;
  }
}

export const collaborativeReviewAgent = new CollaborativeReviewAgent();
