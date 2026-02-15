/**
 * @fileoverview Streaming Review Service
 *
 * Manages streaming review sessions that emit incremental events
 * as agents process PRs, enabling progressive UI updates.
 */

import { logger } from '../lib/logger.js';
import type {
  StreamingEventType,
  StreamingReviewEvent,
  StreamingReviewSession,
  AgentProgressEvent,
} from '@prflow/core';

type EventHandler = (event: StreamingReviewEvent) => void;

export class StreamingReviewService {
  private sessions = new Map<string, StreamingReviewSession>();
  private subscribers = new Map<string, Set<EventHandler>>();
  private readonly maxEventsPerSession = 500;

  /**
   * Create a new streaming review session for a workflow.
   */
  createSession(workflowId: string, agents: string[]): StreamingReviewSession {
    const agentStates: StreamingReviewSession['agents'] = {};
    for (const agent of agents) {
      agentStates[agent] = {
        status: 'pending',
        progress: 0,
        findingsCount: 0,
      };
    }

    const session: StreamingReviewSession = {
      workflowId,
      status: 'active',
      agents: agentStates,
      events: [],
      startedAt: new Date(),
    };

    this.sessions.set(workflowId, session);
    this.emit(workflowId, 'workflow_started', { agents });
    return session;
  }

  /**
   * Emit an event for a workflow session.
   */
  emit(
    workflowId: string,
    type: StreamingEventType,
    data: Record<string, unknown>,
    agent?: string
  ): void {
    const session = this.sessions.get(workflowId);
    if (!session) return;

    const event: StreamingReviewEvent = {
      type,
      workflowId,
      timestamp: new Date(),
      agent,
      data,
    };

    // Keep bounded event history
    session.events.push(event);
    if (session.events.length > this.maxEventsPerSession) {
      session.events = session.events.slice(-this.maxEventsPerSession);
    }

    // Update agent state
    if (agent && session.agents[agent]) {
      switch (type) {
        case 'agent_started':
          session.agents[agent].status = 'running';
          session.agents[agent].startedAt = new Date();
          break;
        case 'agent_progress':
          session.agents[agent].progress = (data as unknown as AgentProgressEvent).progress || 0;
          break;
        case 'finding_detected':
          session.agents[agent].findingsCount++;
          break;
        case 'agent_completed':
          session.agents[agent].status = 'completed';
          session.agents[agent].progress = 100;
          session.agents[agent].completedAt = new Date();
          break;
        case 'agent_failed':
          session.agents[agent].status = 'failed';
          session.agents[agent].completedAt = new Date();
          break;
      }
    }

    if (type === 'workflow_completed') {
      session.status = 'completed';
      session.completedAt = new Date();
    } else if (type === 'workflow_failed') {
      session.status = 'failed';
      session.completedAt = new Date();
    }

    // Notify subscribers
    const subs = this.subscribers.get(workflowId);
    if (subs) {
      for (const handler of subs) {
        try {
          handler(event);
        } catch (error) {
          logger.error({ error, workflowId }, 'Streaming subscriber error');
        }
      }
    }
  }

  /**
   * Subscribe to events for a workflow.
   */
  subscribe(workflowId: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(workflowId)) {
      this.subscribers.set(workflowId, new Set());
    }
    this.subscribers.get(workflowId)!.add(handler);

    return () => {
      this.subscribers.get(workflowId)?.delete(handler);
    };
  }

  /**
   * Get the current session state.
   */
  getSession(workflowId: string): StreamingReviewSession | null {
    return this.sessions.get(workflowId) || null;
  }

  /**
   * Get events since a specific index (for polling).
   */
  getEventsSince(workflowId: string, sinceIndex: number): StreamingReviewEvent[] {
    const session = this.sessions.get(workflowId);
    if (!session) return [];
    return session.events.slice(sinceIndex);
  }

  /**
   * Clean up completed sessions older than the given age.
   */
  cleanup(maxAgeMs: number = 30 * 60 * 1000): number {
    let cleaned = 0;
    const cutoff = Date.now() - maxAgeMs;

    for (const [id, session] of this.sessions) {
      if (session.completedAt && session.completedAt.getTime() < cutoff) {
        this.sessions.delete(id);
        this.subscribers.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const streamingReviewService = new StreamingReviewService();
