import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface CanvasParticipant {
  login: string;
  displayName: string;
  avatarUrl?: string;
  role: 'host' | 'reviewer' | 'observer';
  connectionStatus: 'connected' | 'disconnected' | 'idle';
  cursor?: { file: string; line: number; column: number };
  activeFile?: string;
  joinedAt: Date;
  lastActiveAt: Date;
}

interface CanvasAnnotation {
  id: string;
  author: string;
  file: string;
  startLine: number;
  endLine: number;
  type: 'highlight' | 'question' | 'suggestion' | 'approval' | 'concern';
  color: string;
  content: string;
  resolved: boolean;
  createdAt: Date;
}

interface CanvasThread {
  id: string;
  file: string;
  line: number;
  status: 'open' | 'resolved' | 'wontfix';
  messages: Array<{
    id: string;
    author: string;
    content: string;
    type: 'comment' | 'suggestion' | 'ai_insight';
    createdAt: Date;
  }>;
  createdAt: Date;
}

interface CanvasSession {
  id: string;
  prNumber: number;
  repository: { owner: string; name: string };
  status: 'waiting' | 'active' | 'paused' | 'concluded' | 'archived';
  createdBy: string;
  participants: CanvasParticipant[];
  files: string[];
  annotations: CanvasAnnotation[];
  threads: CanvasThread[];
  aiSummary?: {
    summary: string;
    keyPoints: string[];
    consensusItems: string[];
    actionItems: Array<{ description: string; assignee?: string; priority: string }>;
  };
  conclusion?: {
    outcome: string;
    votes: Array<{ participant: string; vote: string }>;
    summary: string;
  };
  createdAt: Date;
  updatedAt: Date;
  concludedAt?: Date;
}

/**
 * Real-Time Collaborative Review Canvas Service
 * Provides multiplayer review sessions with cursor presence,
 * annotations, threaded discussions, and AI moderation.
 */
export class CollaborativeCanvasService {
  private activeSessions = new Map<string, CanvasSession>();

  /**
   * Create a new canvas session
   */
  async createSession(params: {
    prNumber: number;
    repository: { owner: string; name: string };
    createdBy: string;
    files: string[];
    invitees?: string[];
  }): Promise<CanvasSession> {
    const { prNumber, repository, createdBy, files } = params;

    logger.info({ prNumber, repository, createdBy }, 'Creating collaborative canvas session');

    const session: CanvasSession = {
      id: uuidv4(),
      prNumber,
      repository,
      status: 'waiting',
      createdBy,
      participants: [
        {
          login: createdBy,
          displayName: createdBy,
          role: 'host',
          connectionStatus: 'connected',
          joinedAt: new Date(),
          lastActiveAt: new Date(),
        },
      ],
      files,
      annotations: [],
      threads: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.activeSessions.set(session.id, session);

    return session;
  }

  /**
   * Join an existing session
   */
  async joinSession(sessionId: string, participant: {
    login: string;
    displayName: string;
    avatarUrl?: string;
    role?: 'reviewer' | 'observer';
  }): Promise<CanvasSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const existing = session.participants.find(p => p.login === participant.login);
    if (existing) {
      existing.connectionStatus = 'connected';
      existing.lastActiveAt = new Date();
    } else {
      session.participants.push({
        login: participant.login,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
        role: participant.role || 'reviewer',
        connectionStatus: 'connected',
        joinedAt: new Date(),
        lastActiveAt: new Date(),
      });
    }

    if (session.status === 'waiting' && session.participants.filter(p => p.connectionStatus === 'connected').length >= 2) {
      session.status = 'active';
    }

    session.updatedAt = new Date();
    return session;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<CanvasSession | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * List active sessions for a repository
   */
  async listSessions(params: {
    owner: string;
    repo: string;
    status?: string;
  }): Promise<CanvasSession[]> {
    const sessions: CanvasSession[] = [];
    for (const session of this.activeSessions.values()) {
      if (session.repository.owner === params.owner && session.repository.name === params.repo) {
        if (!params.status || session.status === params.status) {
          sessions.push(session);
        }
      }
    }
    return sessions;
  }

  /**
   * Add an annotation to the canvas
   */
  async addAnnotation(sessionId: string, annotation: {
    author: string;
    file: string;
    startLine: number;
    endLine: number;
    type: 'highlight' | 'question' | 'suggestion' | 'approval' | 'concern';
    content: string;
  }): Promise<CanvasAnnotation> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const colors: Record<string, string> = {
      highlight: '#FFD700',
      question: '#4169E1',
      suggestion: '#32CD32',
      approval: '#00FF00',
      concern: '#FF4500',
    };

    const newAnnotation: CanvasAnnotation = {
      id: uuidv4(),
      ...annotation,
      color: colors[annotation.type] || '#808080',
      resolved: false,
      createdAt: new Date(),
    };

    session.annotations.push(newAnnotation);
    session.updatedAt = new Date();

    return newAnnotation;
  }

  /**
   * Add a discussion thread
   */
  async addThread(sessionId: string, thread: {
    author: string;
    file: string;
    line: number;
    content: string;
  }): Promise<CanvasThread> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const newThread: CanvasThread = {
      id: uuidv4(),
      file: thread.file,
      line: thread.line,
      status: 'open',
      messages: [
        {
          id: uuidv4(),
          author: thread.author,
          content: thread.content,
          type: 'comment',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
    };

    session.threads.push(newThread);
    session.updatedAt = new Date();

    return newThread;
  }

  /**
   * Reply to a thread
   */
  async replyToThread(sessionId: string, threadId: string, message: {
    author: string;
    content: string;
    type?: 'comment' | 'suggestion' | 'ai_insight';
  }): Promise<CanvasThread> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const thread = session.threads.find(t => t.id === threadId);
    if (!thread) throw new Error(`Thread ${threadId} not found`);

    thread.messages.push({
      id: uuidv4(),
      author: message.author,
      content: message.content,
      type: message.type || 'comment',
      createdAt: new Date(),
    });

    session.updatedAt = new Date();
    return thread;
  }

  /**
   * Update cursor position for a participant
   */
  async updateCursor(sessionId: string, login: string, cursor: {
    file: string;
    line: number;
    column: number;
  }): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.login === login);
    if (participant) {
      participant.cursor = cursor;
      participant.activeFile = cursor.file;
      participant.lastActiveAt = new Date();
    }
  }

  /**
   * Generate AI summary of the session
   */
  async generateAISummary(sessionId: string): Promise<CanvasSession['aiSummary']> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const openThreads = session.threads.filter(t => t.status === 'open');
    const resolvedThreads = session.threads.filter(t => t.status === 'resolved');

    const summary = {
      summary: `Review session for PR #${session.prNumber} with ${session.participants.length} participants. ${session.annotations.length} annotations and ${session.threads.length} discussion threads.`,
      keyPoints: openThreads.map(t => t.messages[0]?.content || '').filter(Boolean).slice(0, 5),
      consensusItems: resolvedThreads.map(t => `Resolved: ${t.messages[0]?.content || ''}`).slice(0, 5),
      actionItems: openThreads
        .filter(t => t.messages.some(m => m.type === 'suggestion'))
        .map(t => ({
          description: t.messages.find(m => m.type === 'suggestion')?.content || t.messages[0]?.content || '',
          assignee: undefined,
          priority: 'medium' as const,
        })),
    };

    session.aiSummary = summary;
    session.updatedAt = new Date();

    return summary;
  }

  /**
   * Conclude a session
   */
  async concludeSession(sessionId: string, conclusion: {
    outcome: 'approved' | 'changes_requested' | 'needs_discussion' | 'no_consensus';
    votes: Array<{ participant: string; vote: 'approve' | 'request_changes' | 'abstain' }>;
    summary: string;
    syncToGitHub?: boolean;
  }): Promise<CanvasSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.conclusion = {
      outcome: conclusion.outcome,
      votes: conclusion.votes,
      summary: conclusion.summary,
    };
    session.status = 'concluded';
    session.concludedAt = new Date();
    session.updatedAt = new Date();

    logger.info({ sessionId, outcome: conclusion.outcome }, 'Canvas session concluded');

    return session;
  }
}

export const collaborativeCanvasService = new CollaborativeCanvasService();
