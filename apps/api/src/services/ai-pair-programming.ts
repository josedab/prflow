import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { streamLLM, type StreamingChunk } from '../lib/llm-streaming.js';
import { callLLM, type LLMMessage } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  AIPairSession,
  AIAssistantConfig,
  PairMessage,
  PairMessageType,
  SessionFocus,
  SessionArtifact,
  SessionMetrics,
  AIPairSessionSettings,
  AIPairSessionSummary,
  PairCodeReference,
  PairSuggestedAction,
  WSMessage,
  AIStreamingChunk,
  AI_PAIR_PERSONAS,
} from '@prflow/core';

// Re-export personas constant
const AI_PAIR_PERSONAS_DEFAULT: AIAssistantConfig[] = [
  {
    personaId: 'mentor',
    personaName: 'Mentor',
    avatar: '👨‍🏫',
    expertise: ['architecture', 'design patterns', 'best practices', 'code quality'],
    style: 'mentor',
    proactivity: 'moderate',
    contextConfig: {
      maxHistoryMessages: 20,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: true,
      customSources: [],
    },
  },
  {
    personaId: 'security-expert',
    personaName: 'Security Expert',
    avatar: '🔐',
    expertise: ['security', 'authentication', 'encryption', 'OWASP', 'vulnerability analysis'],
    style: 'security-hawk',
    proactivity: 'proactive',
    contextConfig: {
      maxHistoryMessages: 15,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: true,
      customSources: ['security-rules'],
    },
  },
  {
    personaId: 'pragmatist',
    personaName: 'Pragmatist',
    avatar: '🎯',
    expertise: ['shipping', 'trade-offs', 'MVPs', 'testing', 'maintainability'],
    style: 'pragmatist',
    proactivity: 'passive',
    contextConfig: {
      maxHistoryMessages: 10,
      includePRDiff: true,
      includeAnalysis: true,
      includeReviewComments: false,
      customSources: [],
    },
  },
];

type PairSessionState = 'initializing' | 'active' | 'paused' | 'summarizing' | 'ended';

interface SessionStore {
  sessions: Map<string, AIPairSession>;
  messageCallbacks: Map<string, Set<(message: WSMessage) => void>>;
}

const store: SessionStore = {
  sessions: new Map(),
  messageCallbacks: new Map(),
};

export class AIPairProgrammingService {
  /**
   * Start a new pair programming session
   */
  async startSession(params: {
    owner: string;
    repo: string;
    prNumber: number;
    userId: string;
    userLogin: string;
    displayName: string;
    personaId?: string;
    settings?: Partial<AIPairSessionSettings>;
  }): Promise<AIPairSession> {
    const sessionId = uuidv4();

    // Get PR details
    const workflow = await db.pRWorkflow.findFirst({
      where: {
        prNumber: params.prNumber,
        repository: {
          fullName: `${params.owner}/${params.repo}`,
        },
      },
      include: {
        repository: true,
        analysis: true,
        reviewComments: true,
      },
    });

    // Select AI persona
    const persona = AI_PAIR_PERSONAS_DEFAULT.find(p => p.personaId === params.personaId)
      || AI_PAIR_PERSONAS_DEFAULT[0];

    const session: AIPairSession = {
      id: sessionId,
      repository: {
        owner: params.owner,
        name: params.repo,
        fullName: `${params.owner}/${params.repo}`,
      },
      prNumber: params.prNumber,
      prTitle: workflow?.prTitle || `PR #${params.prNumber}`,
      prBody: (workflow as { prBody?: string | null } | null)?.prBody || null,
      participant: {
        userId: params.userId,
        login: params.userLogin,
        displayName: params.displayName,
        role: 'reviewer',
      },
      aiAssistant: persona,
      state: 'initializing',
      focus: {},
      messages: [],
      artifacts: [],
      metrics: {
        durationMinutes: 0,
        totalMessages: 0,
        humanMessages: 0,
        aiMessages: 0,
        filesDiscussed: [],
        suggestionsCount: 0,
        suggestionsApplied: 0,
        issuesIdentified: 0,
        issuesResolved: 0,
        codeChangesMade: 0,
        avgResponseTime: 0,
      },
      settings: {
        aiProactivity: persona.proactivity,
        autoSuggest: true,
        showConfidence: true,
        focusAreas: [],
        skipAreas: [],
        notifications: {
          onNewFinding: true,
          onSuggestion: true,
          onMention: true,
        },
        voiceInput: false,
        language: 'en',
        ...params.settings,
      },
      connectedClients: [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Store session
    store.sessions.set(sessionId, session);

    // Generate welcome message from AI
    const welcomeMessage = await this.generateWelcomeMessage(session, workflow);
    session.messages.push(welcomeMessage);
    session.state = 'active';

    logger.info({ sessionId, prNumber: params.prNumber }, 'AI pair programming session started');

    // Store in database for persistence
    await this.persistSession(session);

    return session;
  }

  /**
   * Send a message in the session
   */
  async sendMessage(params: {
    sessionId: string;
    userId: string;
    content: string;
    type?: PairMessageType;
    codeReferences?: PairCodeReference[];
    replyTo?: string;
  }): Promise<PairMessage> {
    const session = await this.getSession(params.sessionId);
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
    }

    // Create human message
    const humanMessage: PairMessage = {
      id: uuidv4(),
      sessionId: params.sessionId,
      sender: 'human',
      senderInfo: {
        userId: params.userId,
        login: session.participant.login,
        displayName: session.participant.displayName,
      },
      type: params.type || 'chat',
      content: params.content,
      codeReferences: params.codeReferences,
      replyTo: params.replyTo,
      reactions: [],
      timestamp: new Date(),
    };

    session.messages.push(humanMessage);
    session.metrics.humanMessages++;
    session.metrics.totalMessages++;
    session.lastActivityAt = new Date();

    // Update files discussed
    if (params.codeReferences) {
      for (const ref of params.codeReferences) {
        if (!session.metrics.filesDiscussed.includes(ref.file)) {
          session.metrics.filesDiscussed.push(ref.file);
        }
      }
    }

    // Broadcast message
    this.broadcast(params.sessionId, {
      type: 'message:new',
      sessionId: params.sessionId,
      payload: humanMessage,
      timestamp: new Date(),
    });

    return humanMessage;
  }

  /**
   * Generate AI response (streaming)
   */
  async generateAIResponse(
    sessionId: string,
    onChunk: (chunk: AIStreamingChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<PairMessage> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messageId = uuidv4();
    const startTime = Date.now();
    let fullContent = '';

    // Broadcast streaming start
    this.broadcast(sessionId, {
      type: 'ai:streaming_start',
      sessionId,
      payload: { messageId },
      timestamp: new Date(),
    });

    try {
      const messages = this.buildLLMContext(session);

      await streamLLM(messages, {
        temperature: 0.7,
        maxTokens: 2000,
        onChunk: (chunk: StreamingChunk) => {
          if (chunk.type === 'content' && chunk.content) {
            fullContent += chunk.content;

            const streamChunk: AIStreamingChunk = {
              index: fullContent.length,
              content: chunk.content,
              isFinal: false,
              messageId,
            };

            onChunk(streamChunk);

            this.broadcast(sessionId, {
              type: 'ai:streaming_chunk',
              sessionId,
              payload: streamChunk,
              timestamp: new Date(),
            });
          }
        },
        abortSignal,
      });
    } catch (error) {
      logger.error({ error, sessionId }, 'AI response generation failed');
      fullContent = "I apologize, but I encountered an issue generating a response. Could you please rephrase your question?";
    }

    // Final chunk
    onChunk({
      index: fullContent.length,
      content: '',
      isFinal: true,
      messageId,
    });

    // Create AI message
    const aiMessage: PairMessage = {
      id: messageId,
      sessionId,
      sender: 'ai',
      type: this.classifyMessageType(fullContent),
      content: fullContent,
      suggestedActions: this.extractPairSuggestedActions(fullContent),
      reactions: [],
      timestamp: new Date(),
    };

    session.messages.push(aiMessage);
    session.metrics.aiMessages++;
    session.metrics.totalMessages++;

    // Update average response time
    const responseTime = (Date.now() - startTime) / 1000;
    const totalResponses = session.metrics.aiMessages;
    session.metrics.avgResponseTime =
      (session.metrics.avgResponseTime * (totalResponses - 1) + responseTime) / totalResponses;

    session.lastActivityAt = new Date();

    // Broadcast message complete
    this.broadcast(sessionId, {
      type: 'ai:streaming_end',
      sessionId,
      payload: aiMessage,
      timestamp: new Date(),
    });

    return aiMessage;
  }

  /**
   * Generate non-streaming AI response
   */
  async generateAIResponseSync(sessionId: string): Promise<PairMessage> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messageId = uuidv4();
    const startTime = Date.now();

    const messages = this.buildLLMContext(session);

    let content: string;
    try {
      const response = await callLLM(messages, {
        temperature: 0.7,
        maxTokens: 2000,
      });
      content = response.content;
    } catch (error) {
      logger.error({ error, sessionId }, 'AI response generation failed');
      content = "I apologize, but I encountered an issue generating a response. Could you please rephrase your question?";
    }

    const aiMessage: PairMessage = {
      id: messageId,
      sessionId,
      sender: 'ai',
      type: this.classifyMessageType(content),
      content,
      suggestedActions: this.extractPairSuggestedActions(content),
      reactions: [],
      timestamp: new Date(),
    };

    session.messages.push(aiMessage);
    session.metrics.aiMessages++;
    session.metrics.totalMessages++;

    const responseTime = (Date.now() - startTime) / 1000;
    const totalResponses = session.metrics.aiMessages;
    session.metrics.avgResponseTime =
      (session.metrics.avgResponseTime * (totalResponses - 1) + responseTime) / totalResponses;

    session.lastActivityAt = new Date();

    this.broadcast(sessionId, {
      type: 'message:new',
      sessionId,
      payload: aiMessage,
      timestamp: new Date(),
    });

    return aiMessage;
  }

  /**
   * Update session focus
   */
  async updateFocus(sessionId: string, focus: Partial<SessionFocus>): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.focus = { ...session.focus, ...focus, focusedAt: new Date() };
    session.lastActivityAt = new Date();

    // Track file discussions
    if (focus.file && !session.metrics.filesDiscussed.includes(focus.file)) {
      session.metrics.filesDiscussed.push(focus.file);
    }

    // Broadcast focus change
    this.broadcast(sessionId, {
      type: 'focus:changed',
      sessionId,
      payload: session.focus,
      timestamp: new Date(),
    });

    // System message about focus change
    const systemMessage: PairMessage = {
      id: uuidv4(),
      sessionId,
      sender: 'system',
      type: 'focus_change',
      content: focus.file
        ? `Focus changed to ${focus.file}${focus.lineRange ? `:${focus.lineRange.start}-${focus.lineRange.end}` : ''}`
        : 'Focus cleared',
      timestamp: new Date(),
      reactions: [],
    };

    session.messages.push(systemMessage);

    this.broadcast(sessionId, {
      type: 'message:new',
      sessionId,
      payload: systemMessage,
      timestamp: new Date(),
    });
  }

  /**
   * Add artifact to session
   */
  async addArtifact(
    sessionId: string,
    artifact: Omit<SessionArtifact, 'id' | 'createdAt'>
  ): Promise<SessionArtifact> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const newArtifact: SessionArtifact = {
      ...artifact,
      id: uuidv4(),
      createdAt: new Date(),
    };

    session.artifacts.push(newArtifact);
    session.lastActivityAt = new Date();

    if (artifact.type === 'code_suggestion') {
      session.metrics.suggestionsCount++;
    }

    this.broadcast(sessionId, {
      type: 'artifact:created',
      sessionId,
      payload: newArtifact,
      timestamp: new Date(),
    });

    return newArtifact;
  }

  /**
   * End session and generate summary
   */
  async endSession(sessionId: string): Promise<AIPairSessionSummary> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.state = 'summarizing';

    // Calculate final metrics
    session.metrics.durationMinutes = Math.round(
      (Date.now() - session.createdAt.getTime()) / 60000
    );

    // Generate summary using AI
    const summary = await this.generateSessionSummary(session);

    session.state = 'ended';
    session.endedAt = new Date();

    // Broadcast session end
    this.broadcast(sessionId, {
      type: 'session:state_changed',
      sessionId,
      payload: { state: 'ended', summary },
      timestamp: new Date(),
    });

    // Persist final state
    await this.persistSession(session);

    // Clean up in-memory session after a delay
    setTimeout(() => {
      store.sessions.delete(sessionId);
      store.messageCallbacks.delete(sessionId);
    }, 60000);

    logger.info({ sessionId, summary }, 'AI pair programming session ended');

    return summary;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AIPairSession | null> {
    // Check in-memory first
    const memSession = store.sessions.get(sessionId);
    if (memSession) {
      return memSession;
    }

    // Try to load from database
    const dbSession = await db.analyticsEvent.findFirst({
      where: {
        eventType: 'pair_session',
        eventData: {
          path: ['sessionId'],
          equals: sessionId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (dbSession) {
      const session = dbSession.eventData as unknown as AIPairSession;
      store.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * List active sessions for a user
   */
  async listUserSessions(userId: string): Promise<AIPairSession[]> {
    const sessions: AIPairSession[] = [];

    for (const session of store.sessions.values()) {
      if (session.participant.userId === userId && session.state !== 'ended') {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Subscribe to session events
   */
  subscribe(sessionId: string, callback: (message: WSMessage) => void): () => void {
    if (!store.messageCallbacks.has(sessionId)) {
      store.messageCallbacks.set(sessionId, new Set());
    }

    store.messageCallbacks.get(sessionId)!.add(callback);

    return () => {
      store.messageCallbacks.get(sessionId)?.delete(callback);
    };
  }

  /**
   * Get available AI personas
   */
  getAvailablePersonas(): AIAssistantConfig[] {
    return AI_PAIR_PERSONAS_DEFAULT;
  }

  // Private helper methods

  private broadcast(sessionId: string, message: WSMessage): void {
    const callbacks = store.messageCallbacks.get(sessionId);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(message);
        } catch (error) {
          logger.error({ error, sessionId }, 'Broadcast callback error');
        }
      }
    }
  }

  private async generateWelcomeMessage(
    session: AIPairSession,
    workflow: { analysis?: { riskLevel: string } | null } | null
  ): Promise<PairMessage> {
    const persona = session.aiAssistant;
    const riskLevel = workflow?.analysis?.riskLevel || 'unknown';

    let content = `${persona.avatar} **Welcome to your pair review session!**\n\n`;
    content += `I'm **${persona.personaName}**, your AI pair reviewer. `;
    content += `I specialize in ${persona.expertise.slice(0, 3).join(', ')}.\n\n`;
    content += `**PR #${session.prNumber}:** ${session.prTitle}\n`;

    if (riskLevel !== 'unknown') {
      content += `**Risk Level:** ${riskLevel}\n`;
    }

    content += `\nI'm here to help you review this PR. You can:\n`;
    content += `- Ask me questions about the code changes\n`;
    content += `- Request explanations for complex logic\n`;
    content += `- Get suggestions for improvements\n`;
    content += `- Navigate to specific files or lines\n\n`;
    content += `How would you like to start?`;

    return {
      id: uuidv4(),
      sessionId: session.id,
      sender: 'ai',
      type: 'chat',
      content,
      timestamp: new Date(),
      reactions: [],
    };
  }

  private buildLLMContext(session: AIPairSession): LLMMessage[] {
    const persona = session.aiAssistant;
    const config = persona.contextConfig;

    let systemPrompt = `You are ${persona.personaName}, an AI pair reviewer with expertise in ${persona.expertise.join(', ')}.

## Your Style
You communicate in a ${persona.style} manner. ${this.getStyleDescription(persona.style)}

## Current Context
- Repository: ${session.repository.fullName}
- PR #${session.prNumber}: ${session.prTitle}
${session.prBody ? `- Description: ${session.prBody.substring(0, 500)}` : ''}
`;

    if (session.focus.file) {
      systemPrompt += `
## Current Focus
- File: ${session.focus.file}
${session.focus.lineRange ? `- Lines: ${session.focus.lineRange.start}-${session.focus.lineRange.end}` : ''}
${session.focus.codeSnippet ? `- Code:\n\`\`\`\n${session.focus.codeSnippet}\n\`\`\`` : ''}
`;
    }

    systemPrompt += `
## Guidelines
- Be helpful, specific, and actionable
- Reference file names and line numbers when discussing code
- Provide code examples when suggesting fixes
- Ask clarifying questions when needed
- Keep responses focused and concise
`;

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    // Add conversation history (limited by config)
    const recentMessages = session.messages
      .filter(m => m.sender !== 'system')
      .slice(-config.maxHistoryMessages);

    for (const msg of recentMessages) {
      messages.push({
        role: msg.sender === 'human' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    return messages;
  }

  private getStyleDescription(style: string): string {
    const descriptions: Record<string, string> = {
      mentor: 'You explain concepts thoroughly and help developers learn.',
      expert: 'You provide direct, authoritative guidance.',
      collaborator: 'You explore ideas together and encourage discussion.',
      'security-hawk': 'You are vigilant about security issues and thorough in analysis.',
      'performance-guru': 'You focus on optimization and efficiency.',
      pragmatist: 'You balance perfection with practicality and shipping.',
    };
    return descriptions[style] || '';
  }

  private classifyMessageType(content: string): PairMessageType {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('```')) return 'code_suggestion';
    if (lowerContent.includes('?')) return 'answer';
    if (lowerContent.includes('concern') || lowerContent.includes('issue')) return 'concern';
    if (lowerContent.includes('lgtm') || lowerContent.includes('looks good')) return 'approval';

    return 'chat';
  }

  private extractPairSuggestedActions(content: string): PairSuggestedAction[] {
    const actions: PairSuggestedAction[] = [];

    // Look for code blocks that might be fixable
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    let match;
    let index = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      actions.push({
        id: `action-${index++}`,
        type: 'apply_fix',
        label: 'Apply this code',
        payload: { code: match[1].trim() },
      });
    }

    // Look for file references
    const fileRegex = /([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)/g;
    while ((match = fileRegex.exec(content)) !== null) {
      actions.push({
        id: `action-${index++}`,
        type: 'navigate',
        label: `Go to ${match[1]}:${match[2]}`,
        payload: { file: match[1], line: parseInt(match[2], 10) },
      });
    }

    return actions.slice(0, 5);
  }

  private async generateSessionSummary(session: AIPairSession): Promise<AIPairSessionSummary> {
    // Build summary from conversation
    const topics = new Set<string>();
    const issues: AIPairSessionSummary['issuesFound'] = [];
    const suggestions: AIPairSessionSummary['suggestions'] = [];

    for (const message of session.messages) {
      // Extract topics from messages
      if (message.codeReferences) {
        for (const ref of message.codeReferences) {
          topics.add(ref.file);
        }
      }

      // Extract issues mentioned
      if (message.content.toLowerCase().includes('issue') ||
          message.content.toLowerCase().includes('bug') ||
          message.content.toLowerCase().includes('problem')) {
        issues.push({
          severity: 'medium',
          description: message.content.substring(0, 100),
          resolved: false,
        });
      }
    }

    // Generate AI summary
    const summaryPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: 'Summarize this pair review session in a concise way. Extract key insights and recommended actions.',
      },
      {
        role: 'user',
        content: `Session for PR #${session.prNumber}: ${session.prTitle}\n\nConversation:\n${
          session.messages.map(m => `${m.sender}: ${m.content}`).join('\n\n')
        }`,
      },
    ];

    let aiSummary = '';
    try {
      const response = await callLLM(summaryPrompt, { maxTokens: 500 });
      aiSummary = response.content;
    } catch {
      aiSummary = 'Session summary generation failed.';
    }

    return {
      sessionId: session.id,
      durationMinutes: session.metrics.durationMinutes,
      topicsDiscussed: Array.from(topics),
      filesReviewed: session.metrics.filesDiscussed,
      issuesFound: issues,
      suggestions,
      keyInsights: [aiSummary],
      recommendedActions: session.artifacts
        .filter(a => a.status === 'shared')
        .map(a => a.title),
      participationStats: {
        humanMessageCount: session.metrics.humanMessages,
        aiMessageCount: session.metrics.aiMessages,
        avgResponseTimeSec: session.metrics.avgResponseTime,
      },
    };
  }

  private async persistSession(session: AIPairSession): Promise<void> {
    try {
      await db.analyticsEvent.create({
        data: {
          repositoryId: '', // Would need repo ID
          eventType: 'pair_session',
          eventData: JSON.parse(JSON.stringify({
            sessionId: session.id,
            repository: session.repository,
            prNumber: session.prNumber,
            state: session.state,
            metrics: session.metrics,
            messagesCount: session.messages.length,
            updatedAt: new Date().toISOString(),
          })),
        },
      });
    } catch (error) {
      logger.warn({ error, sessionId: session.id }, 'Failed to persist session');
    }
  }
}

export const aiPairProgrammingService = new AIPairProgrammingService();
