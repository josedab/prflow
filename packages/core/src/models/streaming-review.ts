/**
 * @fileoverview Types for Streaming Review Experience
 */

export type StreamingEventType =
  | 'workflow_started'
  | 'agent_started'
  | 'agent_progress'
  | 'finding_detected'
  | 'agent_completed'
  | 'agent_failed'
  | 'workflow_completed'
  | 'workflow_failed';

export interface StreamingReviewEvent {
  type: StreamingEventType;
  workflowId: string;
  timestamp: Date;
  agent?: string;
  data: Record<string, unknown>;
}

export interface AgentProgressEvent {
  agent: string;
  phase: string;
  progress: number;
  message: string;
  findingsCount?: number;
}

export interface StreamingReviewSession {
  workflowId: string;
  status: 'active' | 'completed' | 'failed';
  agents: Record<
    string,
    {
      status: 'pending' | 'running' | 'completed' | 'failed';
      progress: number;
      findingsCount: number;
      startedAt?: Date;
      completedAt?: Date;
    }
  >;
  events: StreamingReviewEvent[];
  startedAt: Date;
  completedAt?: Date;
}
