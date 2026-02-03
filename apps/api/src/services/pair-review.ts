/**
 * @fileoverview AI Pair Review Service
 * 
 * Service for real-time collaborative code review sessions with AI.
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { callLLM, type LLMMessage } from '../lib/llm.js';
import { parseLLMJsonOrThrow } from '../lib/llm-parser.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  PairReviewSession,
  AIReviewerPersona,
  ConversationMessage,
  SharedFinding,
  PairReviewFocus,
  PairSessionSettings,
  PairSessionSummary,
  StartPairSessionRequest,
  SendMessageRequest,
  MessageType,
  AI_PERSONAS,
  CodeReference,
  ReviewSuggestion,
} from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

interface GitHubFile {
  filename: string;
  additions: number;
  deletions: number;
}

// Predefined AI personas
const PERSONAS: AIReviewerPersona[] = [
  {
    id: 'sage',
    name: 'Sage',
    description: 'Experienced mentor who explains the "why" behind suggestions',
    expertise: ['architecture', 'design patterns', 'best practices'],
    style: 'educational',
    traits: ['patient', 'thorough', 'explains context'],
    avatar: '🧙',
  },
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Security-focused reviewer who catches vulnerabilities',
    expertise: ['security', 'authentication', 'input validation', 'cryptography'],
    style: 'security-focused',
    traits: ['vigilant', 'detail-oriented', 'cautious'],
    avatar: '🛡️',
  },
  {
    id: 'flash',
    name: 'Flash',
    description: 'Performance expert who optimizes for speed and efficiency',
    expertise: ['performance', 'optimization', 'algorithms', 'caching'],
    style: 'performance-focused',
    traits: ['efficient', 'data-driven', 'benchmarks everything'],
    avatar: '⚡',
  },
  {
    id: 'pragmatist',
    name: 'Pragmatist',
    description: 'Practical reviewer focused on shipping quality code',
    expertise: ['code quality', 'testing', 'maintainability'],
    style: 'pragmatic',
    traits: ['practical', 'balanced', 'ship-focused'],
    avatar: '🎯',
  },
  {
    id: 'detective',
    name: 'Detective',
    description: 'Bug hunter who finds edge cases and logic errors',
    expertise: ['debugging', 'edge cases', 'error handling', 'testing'],
    style: 'thorough',
    traits: ['meticulous', 'curious', 'tests assumptions'],
    avatar: '🔍',
  },
];

export class PairReviewService {
  private sessions = new Map<string, PairReviewSession>();

  /**
   * Start a new pair review session
   */
  async startSession(request: StartPairSessionRequest): Promise<PairReviewSession> {
    const { owner, repo, prNumber, humanReviewer, personaId, settings } = request;

    // Get persona
    const persona = PERSONAS.find((p) => p.id === personaId);
    if (!persona) {
      throw new Error(`Unknown persona: ${personaId}`);
    }

    // Get repository for installationId
    const repoFullName = `${owner}/${repo}`;
    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });
    
    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }
    
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    // Get PR details
    const { data: pr } = await getOctokit(github).pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get PR files
    const { data: files } = await getOctokit(github).pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const sessionId = crypto.randomUUID();
    const session: PairReviewSession = {
      id: sessionId,
      repository: { owner, name: repo },
      prNumber,
      prTitle: pr.title,
      humanReviewer,
      aiPersona: persona,
      state: 'reviewing',
      currentFocus: {
        file: (files as GitHubFile[])[0]?.filename,
      },
      conversation: [],
      findings: [],
      progress: {
        filesReviewed: [],
        filesTotal: (files as GitHubFile[]).length,
        linesReviewed: 0,
        linesTotal: (files as GitHubFile[]).reduce((sum: number, f: GitHubFile) => sum + f.additions + f.deletions, 0),
        timeSpentMinutes: 0,
        coverageAreas: [],
      },
      settings: {
        aiProactivity: 'moderate',
        autoSuggestEnabled: true,
        showAiConfidence: true,
        focusAreas: persona.expertise,
        skipAreas: [],
        notifyOnFinding: true,
        ...settings,
      },
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Store in DB
    await dbAny.pairReviewSession.create({
      data: {
        id: sessionId,
        owner,
        repo,
        prNumber,
        prTitle: pr.title,
        humanReviewer,
        personaId: persona.id,
        state: 'reviewing',
        conversation: [],
        findings: [],
        progress: session.progress as any,
        settings: session.settings as any,
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
      },
    });

    // Generate AI's opening message
    const openingMessage = await this.generateOpeningMessage(session, pr, files);
    session.conversation.push(openingMessage);

    return session;
  }

  /**
   * Generate AI's opening message
   */
  private async generateOpeningMessage(
    session: PairReviewSession,
    pr: any,
    files: any[]
  ): Promise<ConversationMessage> {
    const persona = session.aiPersona;
    const fileList = files.map((f) => f.filename).slice(0, 5).join(', ');
    const moreFiles = files.length > 5 ? ` and ${files.length - 5} more` : '';

    // Construct greeting based on persona
    let greeting = '';
    switch (persona.style) {
      case 'educational':
        greeting = `Hello! I'm ${persona.name} ${persona.avatar}, and I'll be reviewing this PR with you. I love explaining the reasoning behind suggestions, so feel free to ask "why" at any time.`;
        break;
      case 'security-focused':
        greeting = `Greetings! I'm ${persona.name} ${persona.avatar}, your security-focused review partner. I'll be particularly attentive to any potential vulnerabilities or security concerns.`;
        break;
      case 'performance-focused':
        greeting = `Hey! ${persona.name} ${persona.avatar} here. I'll be watching for any performance optimization opportunities as we review this code together.`;
        break;
      case 'pragmatic':
        greeting = `Hi there! I'm ${persona.name} ${persona.avatar}. Let's efficiently review this PR together, focusing on what matters most for shipping quality code.`;
        break;
      default:
        greeting = `Hello! I'm ${persona.name} ${persona.avatar}. Let's review this PR together!`;
    }

    const content = `${greeting}

**PR: ${pr.title}**
- ${files.length} files changed: ${fileList}${moreFiles}
- ${files.reduce((s, f) => s + f.additions, 0)} additions, ${files.reduce((s, f) => s + f.deletions, 0)} deletions

I'll start by giving the changes a quick overview. Feel free to point me to specific files or areas you'd like to discuss, or ask me anything about the code!

What would you like to focus on first?`;

    return {
      id: crypto.randomUUID(),
      sender: 'ai',
      type: 'discussion',
      content,
      timestamp: new Date(),
    };
  }

  /**
   * Send a message in the session
   */
  async sendMessage(request: SendMessageRequest): Promise<ConversationMessage> {
    const { sessionId, content, type, codeReferences } = request;

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add human message
    const humanMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      sender: 'human',
      type: type || 'discussion',
      content,
      codeReferences,
      timestamp: new Date(),
    };
    session.conversation.push(humanMessage);
    session.lastActivityAt = new Date();

    // Generate AI response
    const aiResponse = await this.generateAIResponse(session, humanMessage);
    session.conversation.push(aiResponse);

    // Update DB
    await this.updateSessionInDB(session);

    return aiResponse;
  }

  /**
   * Generate AI response to human message
   */
  private async generateAIResponse(
    session: PairReviewSession,
    humanMessage: ConversationMessage
  ): Promise<ConversationMessage> {
    const persona = session.aiPersona;
    const recentConversation = session.conversation.slice(-10);

    // Build context for LLM
    const systemPrompt = `You are ${persona.name}, an AI code reviewer with the following characteristics:
- Style: ${persona.style}
- Expertise: ${persona.expertise.join(', ')}
- Traits: ${persona.traits.join(', ')}
- Description: ${persona.description}

You are pair-reviewing PR #${session.prNumber}: "${session.prTitle}"

Guidelines:
- Stay in character as ${persona.name}
- Focus on ${session.settings.focusAreas.join(', ')}
- Be helpful and collaborative
- Ask clarifying questions when needed
- Point out issues constructively
- Acknowledge good code practices when you see them
- Keep responses focused and actionable`;

    const conversationHistory: LLMMessage[] = recentConversation.map((m) => ({
      role: (m.sender === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await callLLM([
        { role: 'system' as const, content: systemPrompt },
        ...conversationHistory,
        { role: 'user' as const, content: humanMessage.content },
      ], {
        maxTokens: 1000,
        temperature: 0.7,
      });

      // Extract suggestions from response
      const suggestions = this.extractSuggestions(response.content);

      return {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: this.categorizeResponse(humanMessage.type, response.content),
        content: response.content,
        suggestions,
        timestamp: new Date(),
      };
    } catch (error) {
      // Fallback response if LLM fails
      return {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: 'discussion',
        content: `I understand you're asking about "${humanMessage.content.substring(0, 50)}...". Let me think about that. Could you provide more context about which specific aspect you'd like me to focus on?`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Extract suggestions from AI response
   */
  private extractSuggestions(content: string): ReviewSuggestion[] {
    const suggestions: ReviewSuggestion[] = [];

    // Look for suggestion patterns
    const suggestionPatterns = [
      /suggest(?:ion)?:?\s*(.+?)(?:\n|$)/gi,
      /recommend(?:ation)?:?\s*(.+?)(?:\n|$)/gi,
      /consider:?\s*(.+?)(?:\n|$)/gi,
    ];

    for (const pattern of suggestionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'improvement',
          description: match[1].trim(),
          priority: 'medium',
          agreedByBoth: false,
        });
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Categorize response type based on content
   */
  private categorizeResponse(inputType: MessageType | undefined, content: string): MessageType {
    const lowerContent = content.toLowerCase();

    if (inputType === 'question') return 'answer';
    if (lowerContent.includes('suggest') || lowerContent.includes('recommend')) return 'suggestion';
    if (lowerContent.includes('concern') || lowerContent.includes('issue') || lowerContent.includes('problem')) return 'concern';
    if (lowerContent.includes('explain') || lowerContent.includes('because')) return 'explanation';
    if (lowerContent.includes('looks good') || lowerContent.includes('lgtm')) return 'approval';

    return 'discussion';
  }

  /**
   * Add a finding
   */
  async addFinding(
    sessionId: string,
    finding: Omit<SharedFinding, 'id' | 'createdAt'>
  ): Promise<SharedFinding> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const newFinding: SharedFinding = {
      id: crypto.randomUUID(),
      ...finding,
      createdAt: new Date(),
    };

    session.findings.push(newFinding);
    await this.updateSessionInDB(session);

    return newFinding;
  }

  /**
   * Update finding status
   */
  async updateFindingStatus(
    sessionId: string,
    findingId: string,
    status: SharedFinding['status'],
    note?: string
  ): Promise<SharedFinding | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const finding = session.findings.find((f) => f.id === findingId);
    if (!finding) return null;

    finding.status = status;
    if (note) finding.notes.push(note);

    await this.updateSessionInDB(session);
    return finding;
  }

  /**
   * Update review focus
   */
  async updateFocus(sessionId: string, focus: PairReviewFocus): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.currentFocus = focus;
    session.lastActivityAt = new Date();

    // Mark file as reviewed
    if (focus.file && !session.progress.filesReviewed.includes(focus.file)) {
      session.progress.filesReviewed.push(focus.file);
    }

    await this.updateSessionInDB(session);
  }

  /**
   * Complete session and generate summary
   */
  async completeSession(sessionId: string): Promise<PairSessionSummary> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.state = 'completed';
    const durationMinutes = Math.round(
      (new Date().getTime() - session.startedAt.getTime()) / 60000
    );

    // Calculate findings breakdown
    const findingsCount = {
      total: session.findings.length,
      byCategory: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
    };

    for (const finding of session.findings) {
      findingsCount.byCategory[finding.category] = (findingsCount.byCategory[finding.category] || 0) + 1;
      findingsCount.bySeverity[finding.severity] = (findingsCount.bySeverity[finding.severity] || 0) + 1;
    }

    // Calculate suggestions breakdown
    const allSuggestions = session.conversation
      .flatMap((m) => m.suggestions || []);
    const suggestionsCount = {
      total: allSuggestions.length,
      agreed: allSuggestions.filter((s) => s.agreedByBoth).length,
      dismissed: allSuggestions.filter((s) => !s.agreedByBoth).length,
    };

    // Generate key insights
    const keyInsights = this.extractKeyInsights(session);

    // Generate recommended actions
    const recommendedActions = session.findings
      .filter((f) => f.status === 'agreed' && f.severity !== 'info')
      .map((f) => `Address ${f.severity} ${f.category}: ${f.description}`);

    const summary: PairSessionSummary = {
      sessionId,
      durationMinutes,
      filesReviewed: session.progress.filesReviewed.length,
      findingsCount,
      suggestionsCount,
      keyInsights,
      recommendedActions,
    };

    // Update DB
    await dbAny.pairReviewSession.update({
      where: { id: sessionId },
      data: {
        state: 'completed',
        completedAt: new Date(),
        summary: summary as any,
      },
    });

    this.sessions.delete(sessionId);

    return summary;
  }

  /**
   * Extract key insights from session
   */
  private extractKeyInsights(session: PairReviewSession): string[] {
    const insights: string[] = [];

    // Add finding-based insights
    const criticalFindings = session.findings.filter((f) => f.severity === 'critical' || f.severity === 'error');
    if (criticalFindings.length > 0) {
      insights.push(`Found ${criticalFindings.length} critical/error-level issues that need attention`);
    }

    const securityFindings = session.findings.filter((f) => f.category === 'security');
    if (securityFindings.length > 0) {
      insights.push(`Identified ${securityFindings.length} security-related concerns`);
    }

    // Coverage insight
    const coveragePercent = Math.round(
      (session.progress.filesReviewed.length / session.progress.filesTotal) * 100
    );
    insights.push(`Reviewed ${coveragePercent}% of changed files (${session.progress.filesReviewed.length}/${session.progress.filesTotal})`);

    return insights;
  }

  /**
   * Get session
   */
  async getSession(sessionId: string): Promise<PairReviewSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get available personas
   */
  getPersonas(): AIReviewerPersona[] {
    return PERSONAS;
  }

  /**
   * Update session in database
   */
  private async updateSessionInDB(session: PairReviewSession): Promise<void> {
    await dbAny.pairReviewSession.update({
      where: { id: session.id },
      data: {
        state: session.state,
        conversation: session.conversation as any,
        findings: session.findings as any,
        progress: session.progress as any,
        lastActivityAt: session.lastActivityAt,
      },
    });
  }
}
