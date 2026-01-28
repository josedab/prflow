import { logger } from './logger.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  responseFormat?: { type: 'json_object' } | { type: 'text' };
}

export interface LLMProvider {
  name: string;
  call(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
  isAvailable(): boolean;
}

// OpenAI-compatible provider (works with OpenAI, Azure OpenAI, etc.)
export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.defaultModel = config.model || 'gpt-4-turbo-preview';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async call(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
        tools: options?.tools?.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: options?.toolChoice,
        response_format: options?.responseFormat,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    
    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      finishReason: choice.finish_reason as LLMResponse['finishReason'],
    };
  }
}

// Anthropic Claude provider
export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string;
  private defaultModel: string;

  constructor(config: { apiKey: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.defaultModel = config.model || 'claude-3-sonnet-20240229';
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async call(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
    // Extract system message
    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        tools: options?.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      content: Array<{
        type: 'text' | 'tool_use';
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      stop_reason: string;
      usage: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    const textContent = data.content.find((c) => c.type === 'text');
    const toolUses = data.content.filter((c) => c.type === 'tool_use');

    return {
      content: textContent?.text || '',
      toolCalls: toolUses.map((tc) => ({
        id: tc.id!,
        name: tc.name!,
        arguments: tc.input!,
      })),
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
      finishReason: data.stop_reason === 'end_turn' ? 'stop' : 
                    data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }
}

// Mock provider for testing and development
export class MockLLMProvider implements LLMProvider {
  name = 'mock';
  private responses: Map<string, string> = new Map();

  isAvailable(): boolean {
    return true;
  }

  setResponse(pattern: string, response: string): void {
    this.responses.set(pattern, response);
  }

  async call(messages: LLMMessage[], _options?: LLMOptions): Promise<LLMResponse> {
    const lastMessage = messages[messages.length - 1].content;
    
    // Check for matching patterns
    for (const [pattern, response] of this.responses) {
      if (lastMessage.includes(pattern)) {
        return { content: response };
      }
    }

    // Default mock response
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate latency
    
    return {
      content: `Mock response for: ${lastMessage.substring(0, 100)}...`,
      usage: {
        promptTokens: Math.ceil(lastMessage.length / 4),
        completionTokens: 50,
        totalTokens: Math.ceil(lastMessage.length / 4) + 50,
      },
    };
  }
}

// LLM Manager - handles provider selection and fallbacks
class LLMManager {
  private providers: LLMProvider[] = [];
  private defaultProvider: LLMProvider | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize OpenAI provider if configured
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const openai = new OpenAIProvider({ 
        apiKey: openaiKey,
        model: process.env.OPENAI_MODEL,
      });
      this.providers.push(openai);
      if (!this.defaultProvider) this.defaultProvider = openai;
    }

    // Initialize Anthropic provider if configured
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const anthropic = new AnthropicProvider({ 
        apiKey: anthropicKey,
        model: process.env.ANTHROPIC_MODEL,
      });
      this.providers.push(anthropic);
      if (!this.defaultProvider) this.defaultProvider = anthropic;
    }

    // Always have mock provider as fallback
    const mock = new MockLLMProvider();
    this.providers.push(mock);
    if (!this.defaultProvider) this.defaultProvider = mock;

    logger.info({ 
      providers: this.providers.map((p) => p.name),
      default: this.defaultProvider?.name,
    }, 'LLM providers initialized');
  }

  getProvider(name?: string): LLMProvider {
    if (name) {
      const provider = this.providers.find((p) => p.name === name && p.isAvailable());
      if (provider) return provider;
    }
    return this.defaultProvider!;
  }

  async call(messages: LLMMessage[], options?: LLMOptions & { provider?: string }): Promise<LLMResponse> {
    const provider = this.getProvider(options?.provider);
    
    logger.debug({ 
      provider: provider.name, 
      messageCount: messages.length,
      hasTools: !!options?.tools?.length,
    }, 'LLM call');

    const startTime = Date.now();
    
    try {
      const response = await provider.call(messages, options);
      
      logger.debug({ 
        provider: provider.name,
        latencyMs: Date.now() - startTime,
        usage: response.usage,
      }, 'LLM call completed');
      
      return response;
    } catch (error) {
      logger.error({ error, provider: provider.name }, 'LLM call failed');
      
      // Try fallback to mock provider
      if (provider.name !== 'mock') {
        logger.info('Falling back to mock provider');
        const mock = this.providers.find((p) => p.name === 'mock')!;
        return mock.call(messages, options);
      }
      
      throw error;
    }
  }
}

// Singleton instance
let llmManager: LLMManager | null = null;

export function getLLMManager(): LLMManager {
  if (!llmManager) {
    llmManager = new LLMManager();
  }
  return llmManager;
}

// Convenience function
export async function callLLM(
  messages: LLMMessage[], 
  options?: LLMOptions & { provider?: string }
): Promise<LLMResponse> {
  return getLLMManager().call(messages, options);
}
