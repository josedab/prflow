import type { AgentResult } from '@prflow/core';
import { BaseAgent, callLLM, type LLMMessage } from './base.js';
import { streamLLM, type StreamingChunk } from '../lib/llm-streaming.js';
import { logger } from '../lib/logger.js';

/**
 * Simplified context for pair review (doesn't require full PR data)
 */
export interface PairReviewContext {
  repositoryId: string;
}

export interface PairReviewInput {
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  userMessage: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  focusedComment?: {
    id: string;
    file: string;
    line: number;
    message: string;
    severity: string;
    code?: string;
    suggestion?: string;
  };
  analysisContext?: {
    riskLevel: string;
    prType: string;
    risks: string[];
    semanticChanges: Array<{
      type: string;
      name: string;
      file: string;
      impact: string;
    }>;
  };
  codeContext?: {
    file: string;
    startLine: number;
    endLine: number;
    code: string;
  };
}

export interface PairReviewOutput {
  response: string;
  suggestions?: Array<{
    type: 'code_change' | 'question' | 'action';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
  relatedComments?: string[];
  confidenceScore: number;
}

type StreamCallback = (chunk: StreamingChunk) => void;

/**
 * AI Pair Review Agent - enables conversational code review
 * with real-time streaming responses.
 */
export class PairReviewAgent extends BaseAgent<PairReviewInput, PairReviewOutput> {
  readonly name = 'pair-reviewer';
  readonly description = 'Interactive AI pair reviewer for conversational code review';

  async execute(input: PairReviewInput, context: PairReviewContext): Promise<AgentResult<PairReviewOutput>> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.generateResponse(input, context);
    });

    if (!result) {
      return this.createErrorResult('Pair review generation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  /**
   * Execute with streaming for real-time responses
   */
  async executeStreaming(
    input: PairReviewInput,
    context: PairReviewContext,
    onChunk: StreamCallback,
    abortSignal?: AbortSignal
  ): Promise<AgentResult<PairReviewOutput>> {
    const startTime = Date.now();
    let fullResponse = '';

    try {
      const messages = this.buildMessages(input);

      await streamLLM(messages, {
        temperature: 0.7,
        maxTokens: 2000,
        onChunk: (chunk) => {
          if (chunk.type === 'content' && chunk.content) {
            fullResponse += chunk.content;
          }
          onChunk(chunk);
        },
        abortSignal,
      });

      const latencyMs = Date.now() - startTime;

      // Parse suggestions from the response
      const suggestions = this.extractSuggestions(fullResponse);
      const relatedComments = this.extractRelatedComments(fullResponse, input);

      return this.createSuccessResult({
        response: fullResponse,
        suggestions,
        relatedComments,
        confidenceScore: this.calculateConfidence(input, fullResponse),
      }, latencyMs);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error({ error }, 'Pair review streaming failed');
      return this.createErrorResult(
        error instanceof Error ? error.message : 'Streaming failed',
        latencyMs
      );
    }
  }

  private async generateResponse(
    input: PairReviewInput,
    _context: PairReviewContext
  ): Promise<PairReviewOutput> {
    const messages = this.buildMessages(input);

    const response = await callLLM(messages, {
      temperature: 0.7,
      maxTokens: 2000,
    });

    const suggestions = this.extractSuggestions(response.content);
    const relatedComments = this.extractRelatedComments(response.content, input);

    return {
      response: response.content,
      suggestions,
      relatedComments,
      confidenceScore: this.calculateConfidence(input, response.content),
    };
  }

  private buildMessages(input: PairReviewInput): LLMMessage[] {
    const systemPrompt = this.buildSystemPrompt(input);
    
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of input.conversationHistory.slice(-10)) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: input.userMessage });

    return messages;
  }

  private buildSystemPrompt(input: PairReviewInput): string {
    let prompt = `You are PRFlow's AI Pair Reviewer, an expert code review partner.

## Your Capabilities
- Explain code changes and their implications
- Identify potential bugs, security issues, and performance problems
- Suggest improvements and best practices
- Answer questions about code architecture and design
- Help understand complex logic and edge cases

## Communication Style
- Be conversational and collaborative
- Use specific file names and line numbers when referencing code
- Provide code examples when suggesting changes
- Ask clarifying questions when needed
- Acknowledge uncertainty when you don't have enough context

## Current PR Context
**PR #${input.prNumber}:** ${input.prTitle}
`;

    if (input.prBody) {
      prompt += `**Description:** ${input.prBody.substring(0, 500)}${input.prBody.length > 500 ? '...' : ''}\n`;
    }

    if (input.analysisContext) {
      prompt += `
**Analysis Summary:**
- Risk Level: ${input.analysisContext.riskLevel}
- PR Type: ${input.analysisContext.prType}
- Risks: ${input.analysisContext.risks.join(', ') || 'None identified'}
`;
      
      if (input.analysisContext.semanticChanges.length > 0) {
        prompt += '\n**Key Changes:**\n';
        for (const change of input.analysisContext.semanticChanges.slice(0, 5)) {
          prompt += `- ${change.type}: ${change.name} in ${change.file} (${change.impact} impact)\n`;
        }
      }
    }

    if (input.focusedComment) {
      prompt += `
## Currently Discussing Issue
**File:** ${input.focusedComment.file}
**Line:** ${input.focusedComment.line}
**Severity:** ${input.focusedComment.severity}
**Issue:** ${input.focusedComment.message}
`;
      
      if (input.focusedComment.code) {
        prompt += `\n**Code in Question:**
\`\`\`
${input.focusedComment.code}
\`\`\`
`;
      }

      if (input.focusedComment.suggestion) {
        prompt += `\n**Suggested Fix:**
\`\`\`
${input.focusedComment.suggestion}
\`\`\`
`;
      }
    }

    if (input.codeContext) {
      prompt += `
## Additional Code Context
**File:** ${input.codeContext.file} (lines ${input.codeContext.startLine}-${input.codeContext.endLine})
\`\`\`
${input.codeContext.code}
\`\`\`
`;
    }

    prompt += `
## Response Guidelines
1. Address the user's question directly
2. Reference specific code when applicable
3. If suggesting a fix, provide the code
4. Format code with appropriate markdown
5. Keep responses focused and actionable`;

    return prompt;
  }

  private extractSuggestions(response: string): PairReviewOutput['suggestions'] {
    const suggestions: PairReviewOutput['suggestions'] = [];

    // Look for code blocks that might be suggestions
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    
    while ((match = codeBlockRegex.exec(response)) !== null) {
      // Check if the text before suggests this is a fix
      const textBefore = response.substring(Math.max(0, match.index - 100), match.index).toLowerCase();
      
      if (textBefore.includes('suggest') || textBefore.includes('fix') || 
          textBefore.includes('replace') || textBefore.includes('change to')) {
        suggestions.push({
          type: 'code_change',
          content: match[1].trim(),
        });
      }
    }

    // Look for questions the AI is asking
    const questionRegex = /(?:^|\n)([^.!?\n]*\?)/g;
    let questionMatch: RegExpExecArray | null;
    while ((questionMatch = questionRegex.exec(response)) !== null) {
      if (questionMatch[1].trim().length > 10) {
        suggestions.push({
          type: 'question',
          content: questionMatch[1].trim(),
        });
      }
    }

    // Look for action items
    const actionPhrases = ['should', 'consider', 'recommend', 'would be better'];
    for (const phrase of actionPhrases) {
      const phraseRegex = new RegExp(`[^.!?]*${phrase}[^.!?]*[.!?]`, 'gi');
      let actionMatch: RegExpExecArray | null;
      while ((actionMatch = phraseRegex.exec(response)) !== null) {
        if (!suggestions.some((s) => s.content === actionMatch![0].trim())) {
          suggestions.push({
            type: 'action',
            content: actionMatch[0].trim(),
          });
        }
      }
    }

    return suggestions.slice(0, 5); // Limit to 5 suggestions
  }

  private extractRelatedComments(response: string, input: PairReviewInput): string[] {
    const relatedIds: string[] = [];
    
    // Check if any comment IDs or files are mentioned in the response
    if (input.focusedComment) {
      relatedIds.push(input.focusedComment.id);
    }

    // Look for file:line references that match known comments
    const fileLineRegex = /([a-zA-Z0-9_\-./]+):(\d+)/g;
    let match;
    
    while ((match = fileLineRegex.exec(response)) !== null) {
      const file = match[1];
      const line = parseInt(match[2], 10);
      
      // Check if this matches the focused comment
      if (input.focusedComment && 
          input.focusedComment.file.includes(file) && 
          Math.abs(input.focusedComment.line - line) <= 5) {
        if (!relatedIds.includes(input.focusedComment.id)) {
          relatedIds.push(input.focusedComment.id);
        }
      }
    }

    return relatedIds;
  }

  private calculateConfidence(input: PairReviewInput, response: string): number {
    let confidence = 0.7; // Base confidence

    // Increase confidence if we have focused context
    if (input.focusedComment) {
      confidence += 0.1;
    }

    // Increase if we have analysis context
    if (input.analysisContext) {
      confidence += 0.05;
    }

    // Increase if we have code context
    if (input.codeContext) {
      confidence += 0.05;
    }

    // Decrease if response contains uncertainty phrases
    const uncertaintyPhrases = ["i'm not sure", "might be", "could be", "possibly", "uncertain"];
    for (const phrase of uncertaintyPhrases) {
      if (response.toLowerCase().includes(phrase)) {
        confidence -= 0.05;
      }
    }

    // Decrease for short responses (might indicate lack of understanding)
    if (response.length < 100) {
      confidence -= 0.1;
    }

    return Math.max(0.3, Math.min(0.95, confidence));
  }
}

export const pairReviewAgent = new PairReviewAgent();
