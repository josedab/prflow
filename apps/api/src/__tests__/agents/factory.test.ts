import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFactory } from '../../agents/factory.js';
import { AnalyzerAgent } from '../../agents/analyzer.js';
import { ReviewerAgent } from '../../agents/reviewer.js';
import { TestGeneratorAgent } from '../../agents/test-generator.js';
import { DocumentationAgent } from '../../agents/documentation.js';
import { SynthesisAgent } from '../../agents/synthesis.js';

describe('AgentFactory', () => {
  let factory: AgentFactory;

  beforeEach(() => {
    factory = new AgentFactory();
  });

  describe('create', () => {
    it('should create analyzer agent', () => {
      const agent = factory.create('analyzer');
      expect(agent).toBeInstanceOf(AnalyzerAgent);
    });

    it('should create reviewer agent', () => {
      const agent = factory.create('reviewer');
      expect(agent).toBeInstanceOf(ReviewerAgent);
    });

    it('should create test-generator agent', () => {
      const agent = factory.create('test-generator');
      expect(agent).toBeInstanceOf(TestGeneratorAgent);
    });

    it('should create documentation agent', () => {
      const agent = factory.create('documentation');
      expect(agent).toBeInstanceOf(DocumentationAgent);
    });

    it('should create synthesis agent', () => {
      const agent = factory.create('synthesis');
      expect(agent).toBeInstanceOf(SynthesisAgent);
    });

    it('should throw for unknown agent type', () => {
      expect(() => factory.create('unknown' as 'analyzer')).toThrow('Unknown agent type');
    });
  });

  describe('convenience methods', () => {
    it('should create analyzer via createAnalyzer', () => {
      const agent = factory.createAnalyzer();
      expect(agent).toBeInstanceOf(AnalyzerAgent);
    });

    it('should create reviewer via createReviewer', () => {
      const agent = factory.createReviewer();
      expect(agent).toBeInstanceOf(ReviewerAgent);
    });

    it('should create test generator via createTestGenerator', () => {
      const agent = factory.createTestGenerator();
      expect(agent).toBeInstanceOf(TestGeneratorAgent);
    });

    it('should create documentation via createDocumentation', () => {
      const agent = factory.createDocumentation();
      expect(agent).toBeInstanceOf(DocumentationAgent);
    });

    it('should create synthesis via createSynthesis', () => {
      const agent = factory.createSynthesis();
      expect(agent).toBeInstanceOf(SynthesisAgent);
    });
  });

  describe('custom agent registration', () => {
    it('should allow registering custom agent', () => {
      const customAgent = new AnalyzerAgent();
      factory.register('analyzer', () => customAgent);
      
      const agent = factory.create('analyzer');
      expect(agent).toBe(customAgent);
    });

    it('should use default agent after clear', () => {
      const customAgent = new AnalyzerAgent();
      factory.register('analyzer', () => customAgent);
      factory.clear();
      
      const agent = factory.create('analyzer');
      expect(agent).not.toBe(customAgent);
      expect(agent).toBeInstanceOf(AnalyzerAgent);
    });

    it('should not affect other agent types', () => {
      const customAnalyzer = new AnalyzerAgent();
      factory.register('analyzer', () => customAnalyzer);
      
      const reviewer = factory.create('reviewer');
      expect(reviewer).toBeInstanceOf(ReviewerAgent);
    });
  });
});
