/**
 * @fileoverview Voice-Activated Review Models
 * 
 * Types for voice-controlled code review interface.
 * 
 * @module models/voice-review
 */

import { z } from 'zod';

/**
 * Voice command categories
 */
export const VoiceCommandCategorySchema = z.enum([
  'navigation',   // Move around the PR
  'review',       // Review actions
  'comment',      // Comment actions
  'query',        // Ask questions
  'control',      // Control playback/session
  'system',       // System commands
]);
export type VoiceCommandCategory = z.infer<typeof VoiceCommandCategorySchema>;

/**
 * A parsed voice command
 */
export interface VoiceCommand {
  /** Raw transcription */
  transcription: string;
  /** Parsed intent */
  intent: VoiceIntent;
  /** Confidence score */
  confidence: number;
  /** Extracted parameters */
  parameters: Record<string, any>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Voice command intents
 */
export type VoiceIntent =
  // Navigation
  | 'goto_file'
  | 'goto_line'
  | 'next_file'
  | 'previous_file'
  | 'next_change'
  | 'previous_change'
  | 'scroll_up'
  | 'scroll_down'
  | 'show_overview'
  // Review
  | 'approve'
  | 'request_changes'
  | 'add_comment'
  | 'add_suggestion'
  | 'highlight_issue'
  | 'mark_reviewed'
  // Query
  | 'explain_code'
  | 'find_usage'
  | 'show_history'
  | 'check_tests'
  | 'summarize_changes'
  // Control
  | 'start_session'
  | 'end_session'
  | 'pause'
  | 'resume'
  | 'undo'
  | 'redo'
  // System
  | 'help'
  | 'repeat'
  | 'cancel'
  | 'unknown';

/**
 * Voice session state
 */
export interface VoiceSession {
  /** Session ID */
  id: string;
  /** User */
  user: string;
  /** PR being reviewed */
  pullRequest: {
    owner: string;
    repo: string;
    number: number;
  };
  /** Current state */
  state: VoiceSessionState;
  /** Current file being viewed */
  currentFile?: string;
  /** Current line */
  currentLine?: number;
  /** Command history */
  commandHistory: VoiceCommand[];
  /** Pending comments */
  pendingComments: PendingVoiceComment[];
  /** Started at */
  startedAt: Date;
  /** Last activity */
  lastActivityAt: Date;
}

/**
 * Voice session states
 */
export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'waiting_for_confirmation'
  | 'dictating_comment'
  | 'paused';

/**
 * A comment being composed via voice
 */
export interface PendingVoiceComment {
  /** Comment ID */
  id: string;
  /** File */
  file: string;
  /** Line */
  line: number;
  /** Body */
  body: string;
  /** Is suggestion */
  isSuggestion: boolean;
  /** Created at */
  createdAt: Date;
}

/**
 * Voice feedback response
 */
export interface VoiceFeedback {
  /** Text to speak */
  speech: string;
  /** Display text (may differ from speech) */
  display: string;
  /** Action taken */
  action?: string;
  /** Requires confirmation */
  requiresConfirmation: boolean;
  /** Options for confirmation */
  options?: string[];
}

/**
 * Voice command pattern for recognition
 */
export interface VoicePattern {
  /** Intent */
  intent: VoiceIntent;
  /** Pattern variations */
  patterns: string[];
  /** Parameter extractors */
  parameters: ParameterExtractor[];
  /** Example usage */
  examples: string[];
  /** Category */
  category: VoiceCommandCategory;
}

/**
 * Parameter extractor
 */
export interface ParameterExtractor {
  /** Parameter name */
  name: string;
  /** Type */
  type: 'string' | 'number' | 'file' | 'line';
  /** Required */
  required: boolean;
  /** Regex pattern */
  pattern?: string;
}

/**
 * Voice service configuration
 */
export interface VoiceConfig {
  /** Speech recognition language */
  language: string;
  /** Wake word (optional) */
  wakeWord?: string;
  /** Confirmation required for destructive actions */
  confirmDestructive: boolean;
  /** Voice feedback enabled */
  voiceFeedbackEnabled: boolean;
  /** Continuous listening */
  continuousListening: boolean;
  /** Speech rate */
  speechRate: number;
}

/**
 * Transcription result from speech-to-text
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Confidence */
  confidence: number;
  /** Alternatives */
  alternatives: Array<{ text: string; confidence: number }>;
  /** Is final */
  isFinal: boolean;
  /** Duration (ms) */
  durationMs: number;
}

/**
 * Voice analytics
 */
export interface VoiceAnalytics {
  /** Total sessions */
  totalSessions: number;
  /** Average session duration (minutes) */
  avgSessionMinutes: number;
  /** Most used commands */
  topCommands: Array<{ intent: VoiceIntent; count: number }>;
  /** Recognition accuracy */
  avgRecognitionConfidence: number;
  /** Commands requiring retry */
  retryRate: number;
}
