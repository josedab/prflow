import { describe, it, expect } from 'vitest';
import { MockLLMProvider, OpenAIProvider, AnthropicProvider, callLLM } from '../lib/llm.js';

describe('LLM Provider', () => {
  describe('MockLLMProvider', () => {
    it('should return mock response', async () => {
      const provider = new MockLLMProvider();
      
      const response = await provider.call([
        { role: 'user', content: 'Hello, world!' }
      ]);
      
      expect(response.content).toContain('Mock response');
      expect(response.usage).toBeDefined();
    });

    it('should return custom response when pattern matches', async () => {
      const provider = new MockLLMProvider();
      provider.setResponse('test pattern', 'Custom response for test');
      
      const response = await provider.call([
        { role: 'user', content: 'This contains test pattern inside' }
      ]);
      
      expect(response.content).toBe('Custom response for test');
    });

    it('should always be available', () => {
      const provider = new MockLLMProvider();
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('OpenAIProvider', () => {
    it('should not be available without API key', () => {
      const provider = new OpenAIProvider({ apiKey: '' });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should be available with API key', () => {
      const provider = new OpenAIProvider({ apiKey: 'test-key' });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('AnthropicProvider', () => {
    it('should not be available without API key', () => {
      const provider = new AnthropicProvider({ apiKey: '' });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should be available with API key', () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('LLMManager', () => {
    it('should fallback to mock provider when no API keys configured', async () => {
      // Without API keys, should use mock provider
      const response = await callLLM([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Test message' }
      ]);
      
      expect(response.content).toBeDefined();
    });
  });
});
