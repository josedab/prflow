/* eslint-disable no-constant-condition */
import { logger } from './logger.js';
import type { LLMMessage, LLMOptions } from './llm.js';

export interface StreamingChunk {
  type: 'content' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  finishReason?: string;
  error?: string;
}

export type StreamCallback = (chunk: StreamingChunk) => void;

export interface StreamingLLMOptions extends LLMOptions {
  onChunk: StreamCallback;
  abortSignal?: AbortSignal;
}

/**
 * Stream LLM responses for real-time chat experience.
 * Supports both OpenAI and Anthropic streaming APIs.
 */
export async function streamLLM(
  messages: LLMMessage[],
  options: StreamingLLMOptions
): Promise<void> {
  const provider = process.env.OPENAI_API_KEY ? 'openai' : 
                   process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock';

  try {
    switch (provider) {
      case 'openai':
        await streamOpenAI(messages, options);
        break;
      case 'anthropic':
        await streamAnthropic(messages, options);
        break;
      default:
        await streamMock(messages, options);
    }
  } catch (error) {
    if (options.abortSignal?.aborted) {
      options.onChunk({ type: 'done', finishReason: 'aborted' });
      return;
    }
    
    logger.error({ error }, 'LLM streaming failed');
    options.onChunk({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown streaming error' 
    });
  }
}

async function streamOpenAI(
  messages: LLMMessage[],
  options: StreamingLLMOptions
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      stream: true,
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        options.onChunk({ type: 'done', finishReason: 'stop' });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            options.onChunk({ type: 'done', finishReason: 'stop' });
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{
                delta: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
                finish_reason: string | null;
              }>;
            };
            
            const choice = parsed.choices[0];
            
            if (choice.delta.content) {
              options.onChunk({ type: 'content', content: choice.delta.content });
            }
            
            if (choice.delta.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                options.onChunk({
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                  },
                });
              }
            }
            
            if (choice.finish_reason) {
              options.onChunk({ type: 'done', finishReason: choice.finish_reason });
            }
          } catch {
            // Ignore parse errors for incomplete JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamAnthropic(
  messages: LLMMessage[],
  options: StreamingLLMOptions
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229';

  const systemMessage = messages.find((m) => m.role === 'system');
  const otherMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: options.maxTokens || 4096,
      system: systemMessage?.content,
      messages: otherMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream: true,
    }),
    signal: options.abortSignal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        options.onChunk({ type: 'done', finishReason: 'stop' });
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as {
              type: string;
              delta?: { type: string; text?: string };
            };
            
            if (data.type === 'content_block_delta' && data.delta?.text) {
              options.onChunk({ type: 'content', content: data.delta.text });
            }
            
            if (data.type === 'message_stop') {
              options.onChunk({ type: 'done', finishReason: 'stop' });
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamMock(
  messages: LLMMessage[],
  options: StreamingLLMOptions
): Promise<void> {
  const lastMessage = messages[messages.length - 1].content;
  const mockResponse = `I understand you're asking about: "${lastMessage.substring(0, 100)}..."\n\nHere's my analysis:\n\n1. The code change looks reasonable\n2. Consider adding error handling\n3. Tests would be beneficial\n\nWould you like me to elaborate on any of these points?`;
  
  // Simulate streaming by sending chunks
  const words = mockResponse.split(' ');
  
  for (const word of words) {
    if (options.abortSignal?.aborted) {
      options.onChunk({ type: 'done', finishReason: 'aborted' });
      return;
    }
    
    await new Promise((resolve) => setTimeout(resolve, 30));
    options.onChunk({ type: 'content', content: word + ' ' });
  }
  
  options.onChunk({ type: 'done', finishReason: 'stop' });
}

/**
 * Accumulates streaming chunks into a complete response
 */
export class StreamAccumulator {
  private content = '';
  private toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  private finishReason: string | undefined;
  private error: string | undefined;

  handleChunk(chunk: StreamingChunk): void {
    switch (chunk.type) {
      case 'content':
        if (chunk.content) {
          this.content += chunk.content;
        }
        break;
      case 'tool_call':
        if (chunk.toolCall) {
          this.toolCalls.push(chunk.toolCall);
        }
        break;
      case 'done':
        this.finishReason = chunk.finishReason;
        break;
      case 'error':
        this.error = chunk.error;
        break;
    }
  }

  getResult(): {
    content: string;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    finishReason: string | undefined;
    error: string | undefined;
  } {
    return {
      content: this.content,
      toolCalls: this.toolCalls,
      finishReason: this.finishReason,
      error: this.error,
    };
  }

  reset(): void {
    this.content = '';
    this.toolCalls = [];
    this.finishReason = undefined;
    this.error = undefined;
  }
}
