/**
 * @fileoverview Types for the Conversational PR Copilot feature.
 *
 * This module defines the types for interactive, conversational AI assistance
 * within pull requests. Developers can ask questions, get explanations, and
 * receive contextual help directly in PR comments.
 *
 * @module models/conversational-copilot
 */

import type { Severity, ReviewCategory, PRDiff, PullRequest } from './index.js';

// ============================================
// Conversation Types
// ============================================

/**
 * Types of questions/commands the copilot can handle
 */
export type ConversationIntent =
  | 'explain_change'        // "Why was this change made?"
  | 'security_check'        // "Are there any security issues?"
  | 'suggest_alternative'   // "Can you suggest a better approach?"
  | 'generate_tests'        // "Generate tests for this code"
  | 'explain_impact'        // "What's the impact of this change?"
  | 'find_similar'          // "Show me similar code patterns"
  | 'help_review'           // "Help me review this PR"
  | 'summarize'             // "Summarize this PR"
  | 'ask_question'          // General question about the code
  | 'request_fix'           // "Fix this issue"
  | 'compare_approaches'    // "Compare these two approaches"
  | 'check_requirements'    // "Does this meet the requirements?"
  | 'unknown';

/**
 * Role in the conversation
 */
export type CopilotConversationRole = 'user' | 'assistant' | 'system';

/**
 * A single message in a copilot conversation thread
 */
export interface CopilotMessage {
  /** Unique message identifier */
  id: string;
  /** Role of the message sender */
  role: CopilotConversationRole;
  /** Message content */
  content: string;
  /** Detected intent (for user messages) */
  intent?: ConversationIntent;
  /** File context if the message is about specific code */
  fileContext?: {
    file: string;
    startLine?: number;
    endLine?: number;
    code?: string;
  };
  /** Metadata about the message */
  metadata?: {
    confidence?: number;
    processingTimeMs?: number;
    tokensUsed?: number;
    model?: string;
  };
  /** Timestamp when the message was created */
  createdAt: Date;
}

/**
 * A conversation thread about a PR or specific code
 */
export interface CopilotConversationThread {
  /** Unique thread identifier */
  id: string;
  /** Repository identifier */
  repositoryId: string;
  /** PR number this thread is about */
  prNumber: number;
  /** File this thread is about (optional) */
  file?: string;
  /** Line range this thread is about (optional) */
  lineRange?: {
    start: number;
    end: number;
  };
  /** All messages in the thread */
  messages: CopilotMessage[];
  /** Thread status */
  status: 'active' | 'resolved' | 'archived';
  /** User who started the thread */
  startedBy: string;
  /** When the thread was created */
  createdAt: Date;
  /** When the thread was last updated */
  updatedAt: Date;
}

// ============================================
// Copilot Input/Output Types
// ============================================

/**
 * Input for the conversational copilot agent
 */
export interface ConversationalCopilotInput {
  /** The user's message/question */
  message: string;
  /** PR context */
  pr: PullRequest;
  /** Diff context */
  diff: PRDiff;
  /** Specific file context (optional) */
  fileContext?: {
    file: string;
    startLine?: number;
    endLine?: number;
  };
  /** Previous conversation history (for multi-turn) */
  conversationHistory?: CopilotMessage[];
  /** Thread ID if continuing a conversation */
  threadId?: string;
  /** User who is asking */
  userId: string;
  /** Maximum response tokens */
  maxResponseTokens?: number;
}

/**
 * A code example or suggestion in the response
 */
export interface CodeExample {
  /** Programming language */
  language: string;
  /** The code snippet */
  code: string;
  /** Explanation of the code */
  explanation?: string;
  /** File where this applies */
  file?: string;
  /** Line range where this applies */
  lineRange?: {
    start: number;
    end: number;
  };
}

/**
 * A reference to related code or documentation
 */
export interface RelatedReference {
  /** Type of reference */
  type: 'file' | 'function' | 'class' | 'test' | 'doc' | 'issue' | 'pr' | 'external';
  /** Name or title of the reference */
  name: string;
  /** Path or URL to the reference */
  path: string;
  /** Brief description of relevance */
  relevance: string;
  /** Relevance score (0-1) */
  score?: number;
}

/**
 * An action the user can take based on the response
 */
export interface SuggestedAction {
  /** Type of action */
  type: 'apply_fix' | 'generate_tests' | 'add_comment' | 'request_review' | 'create_issue' | 'view_docs';
  /** Human-readable label */
  label: string;
  /** Description of what the action does */
  description: string;
  /** Data needed to execute the action */
  actionData?: Record<string, unknown>;
  /** Whether the action is available */
  available: boolean;
  /** Reason if not available */
  unavailableReason?: string;
}

/**
 * A detected issue or finding mentioned in the response
 */
export interface MentionedIssue {
  /** Issue severity */
  severity: Severity;
  /** Issue category */
  category: ReviewCategory;
  /** Description of the issue */
  description: string;
  /** File where the issue was found */
  file?: string;
  /** Line number */
  line?: number;
  /** Suggested fix if available */
  suggestedFix?: string;
}

/**
 * Result from the conversational copilot
 */
export interface ConversationalCopilotResult {
  /** The response message */
  response: string;
  /** Detected intent of the user's message */
  intent: ConversationIntent;
  /** Confidence in the response (0-1) */
  confidence: number;
  /** Code examples included in the response */
  codeExamples: CodeExample[];
  /** Related references */
  relatedReferences: RelatedReference[];
  /** Suggested follow-up actions */
  suggestedActions: SuggestedAction[];
  /** Any issues mentioned in the response */
  mentionedIssues: MentionedIssue[];
  /** Suggested follow-up questions */
  followUpQuestions: string[];
  /** Processing metadata */
  metadata: {
    processingTimeMs: number;
    tokensUsed: number;
    model: string;
    threadId: string;
  };
}

// ============================================
// Copilot Configuration
// ============================================

/**
 * Configuration for the conversational copilot
 */
export interface ConversationalCopilotConfig {
  /** Maximum conversation history to include */
  maxHistoryMessages: number;
  /** Maximum tokens for response */
  maxResponseTokens: number;
  /** Temperature for LLM (0-1) */
  temperature: number;
  /** Whether to include code examples */
  includeCodeExamples: boolean;
  /** Whether to suggest follow-up actions */
  suggestActions: boolean;
  /** Whether to find related references */
  findRelatedReferences: boolean;
  /** Persona/style of the copilot */
  persona: 'helpful' | 'concise' | 'detailed' | 'mentor';
  /** Languages to prioritize for code examples */
  preferredLanguages?: string[];
}

/**
 * Default configuration for the conversational copilot
 */
export const DEFAULT_COPILOT_CONFIG: ConversationalCopilotConfig = {
  maxHistoryMessages: 10,
  maxResponseTokens: 2000,
  temperature: 0.7,
  includeCodeExamples: true,
  suggestActions: true,
  findRelatedReferences: true,
  persona: 'helpful',
};

// ============================================
// Intent Detection Types
// ============================================

/**
 * Pattern for detecting user intent
 */
export interface IntentPattern {
  /** Intent type */
  intent: ConversationIntent;
  /** Keywords that suggest this intent */
  keywords: string[];
  /** Regex patterns that suggest this intent */
  patterns: RegExp[];
  /** Base confidence for this intent */
  baseConfidence: number;
}

/**
 * Result of intent detection
 */
export interface IntentDetectionResult {
  /** Primary detected intent */
  primaryIntent: ConversationIntent;
  /** Confidence in the primary intent (0-1) */
  confidence: number;
  /** Alternative possible intents */
  alternativeIntents: Array<{
    intent: ConversationIntent;
    confidence: number;
  }>;
  /** Extracted entities from the message */
  entities: {
    files?: string[];
    functions?: string[];
    lineNumbers?: number[];
    issues?: string[];
    keywords?: string[];
  };
}

// ============================================
// Mention/Command Types
// ============================================

/**
 * A mention of @prflow or command in a comment
 */
export interface CopilotMention {
  /** The raw mention text */
  raw: string;
  /** The command/question after @prflow */
  command: string;
  /** Parsed intent */
  intent: ConversationIntent;
  /** Any arguments or modifiers */
  args?: Record<string, string>;
  /** File context if mentioned */
  fileContext?: {
    file: string;
    startLine?: number;
    endLine?: number;
  };
}

/**
 * Parses @prflow mentions from comment text
 */
export function parseCopilotMention(text: string): CopilotMention | null {
  const mentionRegex = /@prflow\s+(.+?)(?:\n|$)/i;
  const match = text.match(mentionRegex);
  
  if (!match) return null;
  
  const command = match[1].trim();
  
  return {
    raw: match[0],
    command,
    intent: 'unknown', // Will be detected by the agent
  };
}

// ============================================
// Conversation Analytics
// ============================================

/**
 * Analytics for copilot usage
 */
export interface CopilotAnalytics {
  /** Total conversations */
  totalConversations: number;
  /** Total messages */
  totalMessages: number;
  /** Messages by intent */
  messagesByIntent: Record<ConversationIntent, number>;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** User satisfaction (if collected) */
  avgSatisfaction?: number;
  /** Most common questions */
  topQuestions: Array<{
    question: string;
    count: number;
  }>;
  /** Resolution rate */
  resolutionRate: number;
}
