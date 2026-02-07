/**
 * @fileoverview Voice-Activated Review Interface Models
 *
 * Types for voice command processing, hands-free code review,
 * and accessibility-focused review workflows.
 *
 * @module models/voice-review-interface
 */

// ============================================
// Voice Session Types
// ============================================

/**
 * Voice review session
 */
export interface VoiceReviewSession {
  /** Session ID */
  id: string;
  /** User login */
  userLogin: string;
  /** Current context */
  context: VoiceContext;
  /** Session state */
  state: VoiceInterfaceSessionState;
  /** Active PR (if reviewing) */
  activePR?: {
    owner: string;
    repo: string;
    number: number;
    title: string;
  };
  /** Current file being reviewed */
  currentFile?: string;
  /** Current line/region */
  currentRegion?: {
    startLine: number;
    endLine: number;
  };
  /** Pending comments */
  pendingComments: VoiceComment[];
  /** Command history */
  commandHistory: VoiceCommandRecord[];
  /** Session started */
  startedAt: Date;
  /** Last activity */
  lastActivityAt: Date;
  /** Session settings */
  settings: VoiceSessionSettings;
}

/**
 * Voice session state
 */
export type VoiceInterfaceSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'reviewing'
  | 'commenting'
  | 'navigating'
  | 'confirming'
  | 'error';

/**
 * Voice context
 */
export interface VoiceContext {
  /** Current mode */
  mode: 'navigation' | 'review' | 'comment' | 'search' | 'help';
  /** Context stack for nested operations */
  stack: Array<{ mode: string; data: Record<string, unknown> }>;
  /** Variables for templating */
  variables: Record<string, string>;
  /** Last mentioned entities */
  lastMentioned: {
    file?: string;
    line?: number;
    function?: string;
    variable?: string;
    reviewer?: string;
  };
}

/**
 * Voice session settings
 */
export interface VoiceSessionSettings {
  /** Voice speed (0.5-2.0) */
  voiceSpeed: number;
  /** Voice volume (0-1) */
  voiceVolume: number;
  /** Voice name/ID */
  voiceName: string;
  /** Language */
  language: string;
  /** Read code aloud */
  readCodeAloud: boolean;
  /** Verbose mode */
  verboseMode: boolean;
  /** Confirm destructive actions */
  confirmDestructive: boolean;
  /** Wake word enabled */
  wakeWordEnabled: boolean;
  /** Custom wake word */
  wakeWord: string;
  /** Continuous listening */
  continuousListening: boolean;
}

// ============================================
// Voice Command Types
// ============================================

/**
 * Voice command
 */
export interface VoiceInterfaceCommand {
  /** Raw transcription */
  transcription: string;
  /** Parsed intent */
  intent: VoiceInterfaceIntent;
  /** Confidence score */
  confidence: number;
  /** Entities extracted */
  entities: VoiceEntity[];
  /** Timestamp */
  timestamp: Date;
  /** Audio duration (ms) */
  audioDurationMs?: number;
}

/**
 * Voice intent
 */
export interface VoiceInterfaceIntent {
  /** Intent type */
  type: VoiceIntentType;
  /** Sub-action */
  action?: string;
  /** Parameters */
  parameters: Record<string, unknown>;
  /** Requires confirmation */
  requiresConfirmation: boolean;
}

/**
 * Voice intent types
 */
export type VoiceIntentType =
  // Navigation
  | 'navigate_to_pr'
  | 'navigate_to_file'
  | 'navigate_to_line'
  | 'navigate_to_function'
  | 'next_file'
  | 'previous_file'
  | 'next_change'
  | 'previous_change'
  // Review actions
  | 'approve_pr'
  | 'request_changes'
  | 'add_comment'
  | 'add_suggestion'
  | 'mark_as_viewed'
  // Reading
  | 'read_file'
  | 'read_changes'
  | 'read_comments'
  | 'read_description'
  | 'summarize_pr'
  // Search
  | 'search_code'
  | 'find_definition'
  | 'find_references'
  // Session control
  | 'start_session'
  | 'end_session'
  | 'pause'
  | 'resume'
  | 'cancel'
  | 'confirm'
  | 'undo'
  | 'help'
  // Settings
  | 'set_voice_speed'
  | 'toggle_verbose'
  | 'repeat';

/**
 * Voice entity
 */
export interface VoiceEntity {
  /** Entity type */
  type: 'file' | 'line' | 'function' | 'variable' | 'pr_number' | 'user' | 'severity' | 'text';
  /** Entity value */
  value: string;
  /** Start position in transcription */
  start: number;
  /** End position in transcription */
  end: number;
  /** Confidence */
  confidence: number;
}

/**
 * Voice command record
 */
export interface VoiceCommandRecord {
  /** Command */
  command: VoiceInterfaceCommand;
  /** Response */
  response: VoiceResponse;
  /** Execution result */
  result: 'success' | 'failure' | 'cancelled' | 'pending';
  /** Error if failed */
  error?: string;
  /** Executed at */
  executedAt: Date;
}

// ============================================
// Voice Response Types
// ============================================

/**
 * Voice response
 */
export interface VoiceResponse {
  /** Response ID */
  id: string;
  /** Response type */
  type: VoiceResponseType;
  /** Text to speak */
  speech: string;
  /** Display text (may differ from speech) */
  displayText?: string;
  /** SSML for advanced speech control */
  ssml?: string;
  /** Actions to perform */
  actions?: VoiceAction[];
  /** Follow-up prompts */
  followUp?: string;
  /** Suggestions for next commands */
  suggestions?: string[];
  /** Priority */
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * Voice response type
 */
export type VoiceResponseType =
  | 'acknowledgment'
  | 'information'
  | 'confirmation_request'
  | 'error'
  | 'help'
  | 'reading'
  | 'summary'
  | 'navigation'
  | 'completion';

/**
 * Voice action
 */
export interface VoiceAction {
  /** Action type */
  type: 'navigate' | 'scroll' | 'highlight' | 'comment' | 'approve' | 'submit';
  /** Action data */
  data: Record<string, unknown>;
}

// ============================================
// Voice Comment Types
// ============================================

/**
 * Voice comment (pending)
 */
export interface VoiceComment {
  /** Comment ID */
  id: string;
  /** File path */
  file: string;
  /** Line number */
  line: number;
  /** End line (for multi-line) */
  endLine?: number;
  /** Comment body */
  body: string;
  /** Severity */
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'nitpick';
  /** Is suggestion */
  isSuggestion: boolean;
  /** Suggested code (if suggestion) */
  suggestedCode?: string;
  /** Created via voice at */
  createdAt: Date;
  /** Status */
  status: 'draft' | 'confirmed' | 'submitted' | 'cancelled';
}

// ============================================
// Speech Recognition Types
// ============================================

/**
 * Speech recognition result
 */
export interface SpeechRecognitionResult {
  /** Transcription */
  transcription: string;
  /** Alternatives */
  alternatives: Array<{
    transcription: string;
    confidence: number;
  }>;
  /** Is final */
  isFinal: boolean;
  /** Confidence */
  confidence: number;
  /** Language detected */
  languageDetected?: string;
  /** Audio duration (ms) */
  durationMs: number;
}

/**
 * Speech recognition config
 */
export interface SpeechRecognitionConfig {
  /** Language */
  language: string;
  /** Enable interim results */
  interimResults: boolean;
  /** Max alternatives */
  maxAlternatives: number;
  /** Profanity filter */
  profanityFilter: boolean;
  /** Custom vocabulary */
  customVocabulary?: string[];
  /** Boost phrases */
  boostPhrases?: Array<{ phrase: string; boost: number }>;
}

// ============================================
// Text-to-Speech Types
// ============================================

/**
 * Text-to-speech options
 */
export interface TextToSpeechOptions {
  /** Voice name */
  voice: string;
  /** Language */
  language: string;
  /** Speed (0.5-2.0) */
  speed: number;
  /** Pitch (-20 to 20) */
  pitch: number;
  /** Volume (0-1) */
  volume: number;
  /** Audio format */
  format: 'mp3' | 'wav' | 'ogg';
}

/**
 * Text-to-speech result
 */
export interface TextToSpeechResult {
  /** Audio data (base64) */
  audioData: string;
  /** Audio format */
  format: string;
  /** Duration (ms) */
  durationMs: number;
  /** Word timings */
  wordTimings?: Array<{
    word: string;
    startMs: number;
    endMs: number;
  }>;
}

// ============================================
// Accessibility Types
// ============================================

/**
 * Accessibility preferences
 */
export interface AccessibilityPreferences {
  /** User ID */
  userId: string;
  /** Voice navigation enabled */
  voiceNavigationEnabled: boolean;
  /** Screen reader mode */
  screenReaderMode: boolean;
  /** High contrast mode */
  highContrastMode: boolean;
  /** Reduced motion */
  reducedMotion: boolean;
  /** Font size */
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  /** Keyboard shortcuts enabled */
  keyboardShortcuts: boolean;
  /** Custom keybindings */
  customKeybindings?: Record<string, string>;
  /** Audio descriptions */
  audioDescriptions: boolean;
  /** Caption preferences */
  captions: {
    enabled: boolean;
    fontSize: number;
    background: string;
    color: string;
  };
}

/**
 * Code reading options
 */
export interface CodeReadingOptions {
  /** Read line numbers */
  readLineNumbers: boolean;
  /** Spell out symbols */
  spellOutSymbols: boolean;
  /** Announce indentation */
  announceIndentation: boolean;
  /** Read comments */
  readComments: boolean;
  /** Summarize blocks */
  summarizeBlocks: boolean;
  /** Max lines per chunk */
  maxLinesPerChunk: number;
  /** Pause between chunks (ms) */
  pauseBetweenChunks: number;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Start voice session request
 */
export interface StartVoiceSessionRequest {
  /** User login */
  userLogin: string;
  /** Initial context */
  initialContext?: {
    prOwner?: string;
    prRepo?: string;
    prNumber?: number;
  };
  /** Settings */
  settings?: Partial<VoiceSessionSettings>;
}

/**
 * Process voice command request
 */
export interface ProcessVoiceCommandRequest {
  /** Session ID */
  sessionId: string;
  /** Audio data (base64) or transcription */
  audio?: string;
  transcription?: string;
  /** Audio format */
  audioFormat?: 'wav' | 'webm' | 'ogg';
}

/**
 * Voice command response
 */
export interface VoiceCommandResponse {
  /** Session updated */
  session: VoiceReviewSession;
  /** Command parsed */
  command: VoiceInterfaceCommand;
  /** Response */
  response: VoiceResponse;
  /** Audio response (base64) */
  audioResponse?: string;
  /** Success */
  success: boolean;
}

/**
 * Speak text request
 */
export interface SpeakTextRequest {
  /** Session ID */
  sessionId: string;
  /** Text to speak */
  text: string;
  /** Options */
  options?: Partial<TextToSpeechOptions>;
}

// ============================================
// Voice Macro Types
// ============================================

/**
 * Voice macro
 */
export interface VoiceMacro {
  /** Macro ID */
  id: string;
  /** User ID */
  userId: string;
  /** Trigger phrase */
  triggerPhrase: string;
  /** Commands to execute */
  commands: VoiceInterfaceCommand[];
  /** Description */
  description: string;
  /** Enabled */
  enabled: boolean;
  /** Created at */
  createdAt: Date;
}

/**
 * Voice shortcut
 */
export interface VoiceShortcut {
  /** Shortcut ID */
  id: string;
  /** Phrase */
  phrase: string;
  /** Intent it maps to */
  intent: VoiceIntentType;
  /** Parameters */
  parameters?: Record<string, unknown>;
  /** Is system shortcut */
  isSystem: boolean;
}

// ============================================
// Analytics Types
// ============================================

/**
 * Voice usage analytics
 */
export interface VoiceUsageAnalytics {
  /** User ID */
  userId: string;
  /** Period */
  period: { start: Date; end: Date };
  /** Total sessions */
  totalSessions: number;
  /** Total commands */
  totalCommands: number;
  /** Successful commands */
  successfulCommands: number;
  /** Average recognition confidence */
  avgRecognitionConfidence: number;
  /** Most used commands */
  topCommands: Array<{ intent: VoiceIntentType; count: number }>;
  /** Common errors */
  commonErrors: Array<{ error: string; count: number }>;
  /** PRs reviewed via voice */
  prsReviewedViaVoice: number;
  /** Comments added via voice */
  commentsAddedViaVoice: number;
  /** Average session duration (ms) */
  avgSessionDurationMs: number;
}
