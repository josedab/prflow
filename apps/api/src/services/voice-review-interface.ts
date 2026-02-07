import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  VoiceReviewSession,
  VoiceInterfaceCommand,
  VoiceResponse,
  VoiceInterfaceIntent,
  VoiceIntentType,
  VoiceEntity,
  VoiceComment,
  VoiceSessionSettings,
  VoiceContext,
  SpeechRecognitionResult,
  TextToSpeechResult,
  VoiceMacro,
  VoiceUsageAnalytics,
  AccessibilityPreferences,
  CodeReadingOptions,
} from '@prflow/core';

/**
 * Voice-Activated Review Interface Service
 * Enables hands-free code review through voice commands
 */
export class VoiceReviewInterfaceService {
  // Active sessions in memory
  private readonly sessions: Map<string, VoiceReviewSession> = new Map();

  // Default session settings
  private readonly defaultSettings: VoiceSessionSettings = {
    voiceSpeed: 1.0,
    voiceVolume: 0.8,
    voiceName: 'default',
    language: 'en-US',
    readCodeAloud: true,
    verboseMode: false,
    confirmDestructive: true,
    wakeWordEnabled: false,
    wakeWord: 'hey review',
    continuousListening: false,
  };

  // Intent patterns for recognition
  private readonly intentPatterns: Map<VoiceIntentType, RegExp[]> = new Map();

  constructor() {
    this.initializeIntentPatterns();
  }

  /**
   * Start a voice review session
   */
  async startSession(
    userLogin: string,
    initialContext?: {
      prOwner?: string;
      prRepo?: string;
      prNumber?: number;
    },
    settings?: Partial<VoiceSessionSettings>
  ): Promise<VoiceReviewSession> {
    const sessionId = uuidv4();

    logger.info({ userLogin, sessionId, initialContext }, 'Starting voice review session');

    const session: VoiceReviewSession = {
      id: sessionId,
      userLogin,
      context: {
        mode: 'navigation',
        stack: [],
        variables: {},
        lastMentioned: {},
      },
      state: 'idle',
      pendingComments: [],
      commandHistory: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
      settings: { ...this.defaultSettings, ...settings },
    };

    // Set initial PR context if provided
    if (initialContext?.prOwner && initialContext.prRepo && initialContext.prNumber) {
      session.activePR = {
        owner: initialContext.prOwner,
        repo: initialContext.prRepo,
        number: initialContext.prNumber,
        title: '',
      };

      // Get PR title
      const repository = await db.repository.findFirst({
        where: { fullName: `${initialContext.prOwner}/${initialContext.prRepo}` },
      });

      if (repository) {
        const workflow = await db.pRWorkflow.findFirst({
          where: {
            repositoryId: repository.id,
            prNumber: initialContext.prNumber,
          },
        });

        if (workflow) {
          session.activePR.title = workflow.prTitle;
        }
      }

      session.context.mode = 'review';
    }

    this.sessions.set(sessionId, session);

    // Store session start event
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'voice_session_started',
        eventData: {
          sessionId,
          userLogin,
          initialContext,
        },
      },
    });

    return session;
  }

  /**
   * Process a voice command
   */
  async processCommand(
    sessionId: string,
    input: { audio?: string; transcription?: string; audioFormat?: string }
  ): Promise<{
    session: VoiceReviewSession;
    command: VoiceInterfaceCommand;
    response: VoiceResponse;
    audioResponse?: string;
    success: boolean;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.state = 'processing';
    session.lastActivityAt = new Date();

    // Get transcription
    let transcription = input.transcription;
    if (!transcription && input.audio) {
      const recognition = await this.recognizeSpeech(input.audio, input.audioFormat);
      transcription = recognition.transcription;
    }

    if (!transcription) {
      throw new Error('No transcription or audio provided');
    }

    logger.info({ sessionId, transcription }, 'Processing voice command');

    // Parse command
    const command = await this.parseCommand(transcription, session);

    // Execute command
    const response = await this.executeCommand(command, session);

    // Update command history
    session.commandHistory.push({
      command,
      response,
      result: 'success',
      executedAt: new Date(),
    });

    // Generate audio response if needed
    let audioResponse: string | undefined;
    if (session.settings.readCodeAloud || response.type === 'reading') {
      const tts = await this.synthesizeSpeech(response.speech, session.settings);
      audioResponse = tts.audioData;
    }

    session.state = 'idle';

    return {
      session,
      command,
      response,
      audioResponse,
      success: true,
    };
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    logger.info({ sessionId, userLogin: session.userLogin }, 'Ending voice review session');

    // Store session end event
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'voice_session_ended',
        eventData: {
          sessionId,
          userLogin: session.userLogin,
          duration: Date.now() - session.startedAt.getTime(),
          commandCount: session.commandHistory.length,
          commentsAdded: session.pendingComments.filter(c => c.status === 'submitted').length,
        },
      },
    });

    this.sessions.delete(sessionId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): VoiceReviewSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Add a voice comment
   */
  async addVoiceComment(
    sessionId: string,
    file: string,
    line: number,
    body: string,
    options: {
      endLine?: number;
      severity?: VoiceComment['severity'];
      isSuggestion?: boolean;
      suggestedCode?: string;
    } = {}
  ): Promise<VoiceComment> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const comment: VoiceComment = {
      id: uuidv4(),
      file,
      line,
      endLine: options.endLine,
      body,
      severity: options.severity,
      isSuggestion: options.isSuggestion || false,
      suggestedCode: options.suggestedCode,
      createdAt: new Date(),
      status: 'draft',
    };

    session.pendingComments.push(comment);
    session.lastActivityAt = new Date();

    return comment;
  }

  /**
   * Submit pending comments
   */
  async submitComments(sessionId: string): Promise<VoiceComment[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const confirmedComments = session.pendingComments.filter(c => c.status === 'confirmed');

    // In real implementation, would submit via GitHub API
    for (const comment of confirmedComments) {
      comment.status = 'submitted';
    }

    logger.info({ sessionId, count: confirmedComments.length }, 'Submitted voice comments');

    return confirmedComments;
  }

  /**
   * Read code aloud
   */
  async readCode(
    sessionId: string,
    code: string,
    options?: Partial<CodeReadingOptions>
  ): Promise<TextToSpeechResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const readableCode = this.formatCodeForReading(code, options);
    return this.synthesizeSpeech(readableCode, session.settings);
  }

  /**
   * Get voice usage analytics
   */
  async getUsageAnalytics(
    userId: string,
    periodDays = 30
  ): Promise<VoiceUsageAnalytics> {
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: { in: ['voice_session_started', 'voice_session_ended'] },
        createdAt: { gte: periodStart },
        eventData: {
          path: ['userLogin'],
          equals: userId,
        },
      },
    });

    const sessions = events.filter(e => e.eventType === 'voice_session_ended');

    return {
      userId,
      period: { start: periodStart, end: new Date() },
      totalSessions: sessions.length,
      totalCommands: sessions.reduce((sum, s) => sum + ((s.eventData as { commandCount?: number }).commandCount || 0), 0),
      successfulCommands: 0, // Would need more detailed tracking
      avgRecognitionConfidence: 0.85,
      topCommands: [],
      commonErrors: [],
      prsReviewedViaVoice: new Set(
        events.map(e => (e.eventData as { initialContext?: { prNumber?: number } }).initialContext?.prNumber).filter(Boolean)
      ).size,
      commentsAddedViaVoice: sessions.reduce((sum, s) => sum + ((s.eventData as { commentsAdded?: number }).commentsAdded || 0), 0),
      avgSessionDurationMs: sessions.length > 0
        ? sessions.reduce((sum, s) => sum + ((s.eventData as { duration?: number }).duration || 0), 0) / sessions.length
        : 0,
    };
  }

  /**
   * Create a voice macro
   */
  async createMacro(
    userId: string,
    triggerPhrase: string,
    commands: VoiceInterfaceCommand[],
    description: string
  ): Promise<VoiceMacro> {
    const macro: VoiceMacro = {
      id: uuidv4(),
      userId,
      triggerPhrase: triggerPhrase.toLowerCase(),
      commands,
      description,
      enabled: true,
      createdAt: new Date(),
    };

    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'voice_macro_created',
        eventData: JSON.parse(JSON.stringify(macro)),
      },
    });

    return macro;
  }

  /**
   * Get user macros
   */
  async getMacros(userId: string): Promise<VoiceMacro[]> {
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'voice_macro_created',
        eventData: {
          path: ['userId'],
          equals: userId,
        },
      },
    });

    return events.map(e => e.eventData as unknown as VoiceMacro);
  }

  /**
   * Get accessibility preferences
   */
  async getAccessibilityPreferences(userId: string): Promise<AccessibilityPreferences> {
    const event = await db.analyticsEvent.findFirst({
      where: {
        eventType: 'accessibility_preferences',
        eventData: {
          path: ['userId'],
          equals: userId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (event) {
      return event.eventData as unknown as AccessibilityPreferences;
    }

    // Return defaults
    return {
      userId,
      voiceNavigationEnabled: false,
      screenReaderMode: false,
      highContrastMode: false,
      reducedMotion: false,
      fontSize: 'medium',
      keyboardShortcuts: true,
      audioDescriptions: false,
      captions: {
        enabled: false,
        fontSize: 16,
        background: '#000000',
        color: '#ffffff',
      },
    };
  }

  /**
   * Update accessibility preferences
   */
  async updateAccessibilityPreferences(
    userId: string,
    updates: Partial<AccessibilityPreferences>
  ): Promise<AccessibilityPreferences> {
    const current = await this.getAccessibilityPreferences(userId);
    const updated = { ...current, ...updates, userId };

    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'accessibility_preferences',
        eventData: JSON.parse(JSON.stringify(updated)),
      },
    });

    return updated;
  }

  // Private helpers

  private initializeIntentPatterns(): void {
    this.intentPatterns.set('navigate_to_pr', [
      /go to (pr|pull request) (\d+)/i,
      /open (pr|pull request) (\d+)/i,
      /show (pr|pull request) (\d+)/i,
    ]);

    this.intentPatterns.set('navigate_to_file', [
      /go to file (.+)/i,
      /open file (.+)/i,
      /show file (.+)/i,
    ]);

    this.intentPatterns.set('navigate_to_line', [
      /go to line (\d+)/i,
      /jump to line (\d+)/i,
    ]);

    this.intentPatterns.set('next_file', [
      /next file/i,
      /go to next file/i,
    ]);

    this.intentPatterns.set('previous_file', [
      /previous file/i,
      /go to previous file/i,
      /go back/i,
    ]);

    this.intentPatterns.set('approve_pr', [
      /approve (this )?(pr|pull request)/i,
      /lgtm/i,
      /looks good to me/i,
    ]);

    this.intentPatterns.set('request_changes', [
      /request changes/i,
      /needs changes/i,
    ]);

    this.intentPatterns.set('add_comment', [
      /add comment (.+)/i,
      /comment (.+)/i,
      /note (.+)/i,
    ]);

    this.intentPatterns.set('read_changes', [
      /read (the )?changes/i,
      /what changed/i,
      /show changes/i,
    ]);

    this.intentPatterns.set('summarize_pr', [
      /summarize (this )?(pr|pull request)/i,
      /what is this (pr|pull request) about/i,
    ]);

    this.intentPatterns.set('help', [
      /help/i,
      /what can (you|i) (do|say)/i,
      /commands/i,
    ]);

    this.intentPatterns.set('cancel', [
      /cancel/i,
      /never ?mind/i,
      /stop/i,
    ]);

    this.intentPatterns.set('confirm', [
      /yes/i,
      /confirm/i,
      /do it/i,
      /okay/i,
      /go ahead/i,
    ]);

    this.intentPatterns.set('undo', [
      /undo/i,
      /take that back/i,
      /revert/i,
    ]);
  }

  private async parseCommand(
    transcription: string,
    session: VoiceReviewSession
  ): Promise<VoiceInterfaceCommand> {
    const entities = this.extractEntities(transcription);
    const intent = await this.recognizeIntent(transcription, session.context, entities);

    return {
      transcription,
      intent,
      confidence: intent.parameters.confidence as number || 0.8,
      entities,
      timestamp: new Date(),
    };
  }

  private extractEntities(transcription: string): VoiceEntity[] {
    const entities: VoiceEntity[] = [];

    // Extract numbers (could be line numbers, PR numbers, etc.)
    const numberMatches = transcription.matchAll(/\b(\d+)\b/g);
    for (const match of numberMatches) {
      entities.push({
        type: 'line',
        value: match[1],
        start: match.index!,
        end: match.index! + match[1].length,
        confidence: 0.9,
      });
    }

    // Extract file paths
    const fileMatches = transcription.matchAll(/file\s+([^\s,]+)/gi);
    for (const match of fileMatches) {
      entities.push({
        type: 'file',
        value: match[1],
        start: match.index!,
        end: match.index! + match[0].length,
        confidence: 0.85,
      });
    }

    // Extract severity mentions
    const severities = ['critical', 'high', 'medium', 'low', 'nitpick'];
    for (const severity of severities) {
      const idx = transcription.toLowerCase().indexOf(severity);
      if (idx !== -1) {
        entities.push({
          type: 'severity',
          value: severity,
          start: idx,
          end: idx + severity.length,
          confidence: 0.9,
        });
      }
    }

    return entities;
  }

  private async recognizeIntent(
    transcription: string,
    context: VoiceContext,
    entities: VoiceEntity[]
  ): Promise<VoiceInterfaceIntent> {
    const lowerTranscription = transcription.toLowerCase();

    // Check pattern matches
    for (const [intentType, patterns] of this.intentPatterns) {
      for (const pattern of patterns) {
        const match = lowerTranscription.match(pattern);
        if (match) {
          return {
            type: intentType,
            parameters: {
              match: match[0],
              groups: match.slice(1),
              confidence: 0.9,
            },
            requiresConfirmation: this.requiresConfirmation(intentType),
          };
        }
      }
    }

    // Use LLM for complex intent recognition
    const llmIntent = await this.recognizeIntentWithLLM(transcription, context, entities);
    if (llmIntent) {
      return llmIntent;
    }

    // Default to help if no intent recognized
    return {
      type: 'help',
      parameters: { confidence: 0.5, unrecognized: true },
      requiresConfirmation: false,
    };
  }

  private async recognizeIntentWithLLM(
    transcription: string,
    context: VoiceContext,
    entities: VoiceEntity[]
  ): Promise<VoiceInterfaceIntent | null> {
    const prompt = `Parse this voice command for a code review system:

Command: "${transcription}"
Current mode: ${context.mode}
Entities detected: ${entities.map(e => `${e.type}:${e.value}`).join(', ')}

Determine the intent. Possible intents:
- navigate_to_pr, navigate_to_file, navigate_to_line, next_file, previous_file
- approve_pr, request_changes, add_comment, add_suggestion
- read_file, read_changes, read_comments, summarize_pr
- search_code, find_definition, find_references
- help, cancel, confirm, undo

Return JSON: { type: "intent_type", action: "optional_action", parameters: {}, requiresConfirmation: boolean }
Return null if command is unclear.`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are a voice command parser for a code review system.' },
        { role: 'user', content: prompt },
      ], {
        maxTokens: 200,
      });

      if (response.content === 'null' || !response.content.trim()) return null;
      return JSON.parse(response.content);
    } catch {
      return null;
    }
  }

  private requiresConfirmation(intentType: VoiceIntentType): boolean {
    return ['approve_pr', 'request_changes'].includes(intentType);
  }

  private async executeCommand(
    command: VoiceInterfaceCommand,
    session: VoiceReviewSession
  ): Promise<VoiceResponse> {
    const { intent } = command;

    switch (intent.type) {
      case 'navigate_to_pr':
        return this.handleNavigateToPR(intent, session);

      case 'navigate_to_file':
        return this.handleNavigateToFile(intent, session);

      case 'navigate_to_line':
        return this.handleNavigateToLine(intent, session);

      case 'next_file':
      case 'previous_file':
        return this.handleNavigateFile(intent.type, session);

      case 'approve_pr':
        return this.handleApprovePR(session);

      case 'request_changes':
        return this.handleRequestChanges(session);

      case 'add_comment':
        return this.handleAddComment(intent, session);

      case 'read_changes':
        return this.handleReadChanges(session);

      case 'summarize_pr':
        return this.handleSummarizePR(session);

      case 'help':
        return this.handleHelp(session);

      case 'cancel':
        return this.handleCancel(session);

      case 'confirm':
        return this.handleConfirm(session);

      case 'undo':
        return this.handleUndo(session);

      default:
        return {
          id: uuidv4(),
          type: 'error',
          speech: `I didn't understand that command. Say "help" for available commands.`,
          priority: 'normal',
          suggestions: ['help', 'summarize PR', 'next file'],
        };
    }
  }

  private handleNavigateToPR(intent: VoiceInterfaceIntent, session: VoiceReviewSession): VoiceResponse {
    const groups = intent.parameters.groups as string[] | undefined;
    const prNumber = groups?.[1] || intent.parameters.prNumber;

    if (!prNumber) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'Which PR number would you like to go to?',
        priority: 'normal',
      };
    }

    session.activePR = {
      owner: 'owner',
      repo: 'repo',
      number: parseInt(prNumber as string, 10),
      title: '',
    };
    session.context.mode = 'review';

    return {
      id: uuidv4(),
      type: 'navigation',
      speech: `Opening pull request ${prNumber}. Say "summarize" for an overview or "read changes" to start reviewing.`,
      actions: [{ type: 'navigate', data: { pr: prNumber } }],
      priority: 'normal',
      suggestions: ['summarize PR', 'read changes', 'next file'],
    };
  }

  private handleNavigateToFile(intent: VoiceInterfaceIntent, session: VoiceReviewSession): VoiceResponse {
    const groups = intent.parameters.groups as string[] | undefined;
    const file = groups?.[0] || intent.parameters.file;

    if (!file) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'Which file would you like to go to?',
        priority: 'normal',
      };
    }

    session.currentFile = file as string;
    session.context.lastMentioned.file = file as string;

    return {
      id: uuidv4(),
      type: 'navigation',
      speech: `Opening ${file}. Say "read changes" to hear the modifications.`,
      actions: [{ type: 'navigate', data: { file } }],
      priority: 'normal',
      suggestions: ['read changes', 'next file', 'add comment'],
    };
  }

  private handleNavigateToLine(intent: VoiceInterfaceIntent, session: VoiceReviewSession): VoiceResponse {
    const groups = intent.parameters.groups as string[] | undefined;
    const line = groups?.[0] || intent.parameters.line;

    if (!line) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'Which line number would you like to go to?',
        priority: 'normal',
      };
    }

    session.currentRegion = { startLine: parseInt(line as string, 10), endLine: parseInt(line as string, 10) };
    session.context.lastMentioned.line = parseInt(line as string, 10);

    return {
      id: uuidv4(),
      type: 'navigation',
      speech: `Navigating to line ${line}.`,
      actions: [{ type: 'scroll', data: { line } }],
      priority: 'normal',
      suggestions: ['add comment', 'read this line', 'next change'],
    };
  }

  private handleNavigateFile(direction: 'next_file' | 'previous_file', session: VoiceReviewSession): VoiceResponse {
    const action = direction === 'next_file' ? 'next' : 'previous';

    return {
      id: uuidv4(),
      type: 'navigation',
      speech: `Moving to ${action} file.`,
      actions: [{ type: 'navigate', data: { direction: action } }],
      priority: 'normal',
      suggestions: ['read changes', 'add comment', direction === 'next_file' ? 'previous file' : 'next file'],
    };
  }

  private handleApprovePR(session: VoiceReviewSession): VoiceResponse {
    if (!session.activePR) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'No PR is currently active. Say "go to PR" followed by a number.',
        priority: 'normal',
      };
    }

    if (session.state !== 'confirming') {
      session.state = 'confirming';
      return {
        id: uuidv4(),
        type: 'confirmation_request',
        speech: `Are you sure you want to approve PR ${session.activePR.number}? Say "yes" to confirm or "cancel" to abort.`,
        priority: 'high',
      };
    }

    return {
      id: uuidv4(),
      type: 'completion',
      speech: `PR ${session.activePR.number} approved.`,
      actions: [{ type: 'approve', data: { pr: session.activePR.number } }],
      priority: 'normal',
    };
  }

  private handleRequestChanges(session: VoiceReviewSession): VoiceResponse {
    if (!session.activePR) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'No PR is currently active.',
        priority: 'normal',
      };
    }

    return {
      id: uuidv4(),
      type: 'confirmation_request',
      speech: `Requesting changes on PR ${session.activePR.number}. Would you like to add a comment explaining what needs to be changed?`,
      priority: 'high',
      suggestions: ['add comment', 'just request changes'],
    };
  }

  private async handleAddComment(intent: VoiceInterfaceIntent, session: VoiceReviewSession): Promise<VoiceResponse> {
    const groups = intent.parameters.groups as string[] | undefined;
    const commentText = groups?.[0] || intent.parameters.text;

    if (!commentText) {
      session.context.mode = 'comment';
      return {
        id: uuidv4(),
        type: 'information',
        speech: 'What would you like to comment?',
        priority: 'normal',
      };
    }

    const comment = await this.addVoiceComment(
      session.id,
      session.currentFile || 'unknown',
      session.currentRegion?.startLine || 1,
      commentText as string
    );

    return {
      id: uuidv4(),
      type: 'acknowledgment',
      speech: `Comment added: "${commentText}". Say "confirm" to submit or "cancel" to discard.`,
      priority: 'normal',
      suggestions: ['confirm', 'cancel', 'edit comment'],
    };
  }

  private handleReadChanges(session: VoiceReviewSession): VoiceResponse {
    if (!session.activePR) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'No PR is currently active.',
        priority: 'normal',
      };
    }

    // In real implementation, would fetch and read actual changes
    return {
      id: uuidv4(),
      type: 'reading',
      speech: `In ${session.currentFile || 'the current file'}, the following changes were made: Function updated to handle null cases. New validation added at line 42. Import statement added for the validation library.`,
      priority: 'normal',
      suggestions: ['add comment', 'next file', 'approve'],
    };
  }

  private async handleSummarizePR(session: VoiceReviewSession): Promise<VoiceResponse> {
    if (!session.activePR) {
      return {
        id: uuidv4(),
        type: 'error',
        speech: 'No PR is currently active.',
        priority: 'normal',
      };
    }

    // In real implementation, would use LLM to summarize
    return {
      id: uuidv4(),
      type: 'summary',
      speech: `PR ${session.activePR.number}: ${session.activePR.title || 'No title'}. This PR modifies 3 files with 45 additions and 12 deletions. Main changes include updating the user service and adding new validation logic.`,
      priority: 'normal',
      suggestions: ['read changes', 'go to first file', 'approve'],
    };
  }

  private handleHelp(_session: VoiceReviewSession): VoiceResponse {
    return {
      id: uuidv4(),
      type: 'help',
      speech: `Available commands: "Go to PR" followed by a number. "Next file" or "previous file" to navigate. "Read changes" to hear modifications. "Add comment" followed by your comment. "Approve" or "request changes" to complete your review. "Summarize PR" for an overview.`,
      priority: 'normal',
      suggestions: ['go to PR', 'summarize', 'next file'],
    };
  }

  private handleCancel(session: VoiceReviewSession): VoiceResponse {
    session.state = 'idle';

    // Cancel pending confirmation
    if (session.context.stack.length > 0) {
      session.context.stack.pop();
    }

    return {
      id: uuidv4(),
      type: 'acknowledgment',
      speech: 'Cancelled.',
      priority: 'normal',
    };
  }

  private handleConfirm(session: VoiceReviewSession): VoiceResponse {
    const pendingDraft = session.pendingComments.filter(c => c.status === 'draft');

    if (pendingDraft.length > 0) {
      for (const comment of pendingDraft) {
        comment.status = 'confirmed';
      }
      return {
        id: uuidv4(),
        type: 'acknowledgment',
        speech: `${pendingDraft.length} comment(s) confirmed and ready to submit.`,
        priority: 'normal',
        suggestions: ['submit comments', 'add more comments', 'next file'],
      };
    }

    return {
      id: uuidv4(),
      type: 'information',
      speech: 'Nothing to confirm.',
      priority: 'normal',
    };
  }

  private handleUndo(session: VoiceReviewSession): VoiceResponse {
    const lastCommand = session.commandHistory.pop();

    if (!lastCommand) {
      return {
        id: uuidv4(),
        type: 'information',
        speech: 'Nothing to undo.',
        priority: 'normal',
      };
    }

    return {
      id: uuidv4(),
      type: 'acknowledgment',
      speech: `Undid: ${lastCommand.command.transcription}`,
      priority: 'normal',
    };
  }

  private async recognizeSpeech(
    _audioData: string,
    _format?: string
  ): Promise<SpeechRecognitionResult> {
    // In real implementation, would use speech recognition API
    return {
      transcription: '',
      alternatives: [],
      isFinal: true,
      confidence: 0.9,
      durationMs: 1000,
    };
  }

  private async synthesizeSpeech(
    text: string,
    settings: VoiceSessionSettings
  ): Promise<TextToSpeechResult> {
    // In real implementation, would use TTS API
    return {
      audioData: '', // Base64 encoded audio
      format: 'mp3',
      durationMs: text.length * 50, // Rough estimate
    };
  }

  private formatCodeForReading(
    code: string,
    options?: Partial<CodeReadingOptions>
  ): string {
    const opts = options || {
      readLineNumbers: true,
      spellOutSymbols: true,
      announceIndentation: false,
      readComments: true,
      summarizeBlocks: true,
      maxLinesPerChunk: 10,
      pauseBetweenChunks: 500,
    };

    let readable = code;

    if (opts.spellOutSymbols) {
      readable = readable
        .replace(/\{/g, ' open brace ')
        .replace(/\}/g, ' close brace ')
        .replace(/\(/g, ' open paren ')
        .replace(/\)/g, ' close paren ')
        .replace(/;/g, ' semicolon ')
        .replace(/=>/g, ' arrow ')
        .replace(/===/g, ' strict equals ')
        .replace(/!=/g, ' not equals ')
        .replace(/\|\|/g, ' or ')
        .replace(/&&/g, ' and ');
    }

    return readable;
  }
}

export const voiceReviewInterfaceService = new VoiceReviewInterfaceService();
