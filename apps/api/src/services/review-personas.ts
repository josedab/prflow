// import { db } from '@prflow/db';  // Reserved for database persistence
import { logger } from '../lib/logger.js';

export interface ReviewPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  focusAreas: string[];
  strictnessLevel: 'lenient' | 'moderate' | 'strict';
  promptTemplate: string;
  enabled: boolean;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonaConfig {
  focusAreas: FocusArea[];
  strictnessLevel: 'lenient' | 'moderate' | 'strict';
  customRules?: string[];
  ignorePatterns?: string[];
}

export interface FocusArea {
  id: string;
  name: string;
  description: string;
  patterns: string[];
  weight: number;
}

// Built-in personas
const BUILT_IN_PERSONAS: ReviewPersona[] = [
  {
    id: 'security-expert',
    name: 'Security Expert',
    description: 'Focuses on security vulnerabilities, authentication, authorization, and data protection',
    icon: '🔒',
    focusAreas: ['security', 'authentication', 'authorization', 'injection', 'xss', 'secrets'],
    strictnessLevel: 'strict',
    promptTemplate: `You are a security-focused code reviewer. Look for:
- SQL injection, XSS, and command injection vulnerabilities
- Hardcoded credentials or secrets
- Improper authentication/authorization
- Sensitive data exposure
- Insecure cryptography
- Input validation issues
Be thorough and flag all potential security concerns.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'performance-guru',
    name: 'Performance Guru',
    description: 'Analyzes code for performance bottlenecks, memory leaks, and optimization opportunities',
    icon: '⚡',
    focusAreas: ['performance', 'memory', 'caching', 'complexity', 'database', 'api'],
    strictnessLevel: 'moderate',
    promptTemplate: `You are a performance-focused code reviewer. Look for:
- N+1 query problems and inefficient database access
- Memory leaks and unnecessary allocations
- Unoptimized loops and algorithms
- Missing caching opportunities
- Blocking operations that should be async
- Resource cleanup issues
Suggest specific optimizations with benchmarking guidance.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'accessibility-auditor',
    name: 'Accessibility Auditor',
    description: 'Reviews UI code for WCAG compliance and accessibility best practices',
    icon: '♿',
    focusAreas: ['a11y', 'aria', 'keyboard', 'screen-reader', 'contrast', 'focus'],
    strictnessLevel: 'moderate',
    promptTemplate: `You are an accessibility-focused code reviewer. Look for:
- Missing ARIA labels and roles
- Insufficient color contrast
- Keyboard navigation issues
- Missing alt text for images
- Focus management problems
- Screen reader compatibility
Reference WCAG 2.1 guidelines when providing feedback.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'clean-code-advocate',
    name: 'Clean Code Advocate',
    description: 'Enforces clean code principles, naming conventions, and code organization',
    icon: '✨',
    focusAreas: ['naming', 'structure', 'dry', 'solid', 'complexity', 'comments'],
    strictnessLevel: 'moderate',
    promptTemplate: `You are a clean code advocate. Look for:
- Unclear or inconsistent naming
- Functions that are too long or do too much
- Code duplication (DRY violations)
- SOLID principle violations
- Complex conditional logic
- Missing or excessive comments
Focus on readability and maintainability.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'test-champion',
    name: 'Test Champion',
    description: 'Ensures proper test coverage and testing best practices',
    icon: '🧪',
    focusAreas: ['testing', 'coverage', 'mocking', 'assertions', 'edge-cases'],
    strictnessLevel: 'strict',
    promptTemplate: `You are a testing-focused code reviewer. Look for:
- Missing test cases for new functionality
- Untested edge cases and error conditions
- Improper mocking or test isolation
- Weak assertions that don't catch bugs
- Flaky or slow tests
- Missing integration tests
Suggest specific test cases to add.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'documentation-reviewer',
    name: 'Documentation Reviewer',
    description: 'Reviews documentation quality, API docs, and code comments',
    icon: '📚',
    focusAreas: ['docs', 'api', 'comments', 'readme', 'examples'],
    strictnessLevel: 'lenient',
    promptTemplate: `You are a documentation-focused code reviewer. Look for:
- Missing or outdated documentation
- Undocumented public APIs
- Missing JSDoc/docstrings for complex functions
- Outdated README or examples
- Missing changelog entries
- Unclear error messages
Suggest improvements for developer experience.`,
    enabled: true,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// In-memory store for custom personas (would use database in production)
const customPersonas = new Map<string, ReviewPersona>();

export class ReviewPersonaService {
  
  /**
   * Get all available personas
   */
  async getAllPersonas(repositoryId?: string): Promise<ReviewPersona[]> {
    const personas = [...BUILT_IN_PERSONAS];
    
    // Add custom personas
    if (repositoryId) {
      customPersonas.forEach((persona) => {
        if (persona.id.startsWith(repositoryId)) {
          personas.push(persona);
        }
      });
    }
    
    return personas;
  }

  /**
   * Get a specific persona by ID
   */
  async getPersona(personaId: string): Promise<ReviewPersona | null> {
    // Check built-in first
    const builtIn = BUILT_IN_PERSONAS.find(p => p.id === personaId);
    if (builtIn) return builtIn;

    // Check custom
    return customPersonas.get(personaId) || null;
  }

  /**
   * Create a custom persona
   */
  async createPersona(
    repositoryId: string,
    data: {
      name: string;
      description: string;
      icon?: string;
      focusAreas: string[];
      strictnessLevel: 'lenient' | 'moderate' | 'strict';
      promptTemplate?: string;
    }
  ): Promise<ReviewPersona> {
    const id = `${repositoryId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    const persona: ReviewPersona = {
      id,
      name: data.name,
      description: data.description,
      icon: data.icon || '🔍',
      focusAreas: data.focusAreas,
      strictnessLevel: data.strictnessLevel,
      promptTemplate: data.promptTemplate || this.generatePromptTemplate(data),
      enabled: true,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    customPersonas.set(id, persona);
    
    logger.info({ personaId: id, repositoryId }, 'Custom persona created');
    
    return persona;
  }

  /**
   * Update a custom persona
   */
  async updatePersona(
    personaId: string,
    updates: Partial<Omit<ReviewPersona, 'id' | 'isBuiltIn' | 'createdAt'>>
  ): Promise<ReviewPersona | null> {
    const persona = customPersonas.get(personaId);
    
    if (!persona) {
      // Can't update built-in personas
      return null;
    }

    const updated: ReviewPersona = {
      ...persona,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    customPersonas.set(personaId, updated);
    
    return updated;
  }

  /**
   * Delete a custom persona
   */
  async deletePersona(personaId: string): Promise<boolean> {
    // Can't delete built-in
    if (BUILT_IN_PERSONAS.some(p => p.id === personaId)) {
      return false;
    }

    return customPersonas.delete(personaId);
  }

  /**
   * Get repository's enabled personas
   */
  async getEnabledPersonas(repositoryId: string): Promise<ReviewPersona[]> {
    const all = await this.getAllPersonas(repositoryId);
    return all.filter(p => p.enabled);
  }

  /**
   * Set which personas are enabled for a repository
   */
  async setEnabledPersonas(
    repositoryId: string,
    personaIds: string[]
  ): Promise<void> {
    // In production, this would update a database table
    logger.info({ repositoryId, personaIds }, 'Updated enabled personas');
  }

  /**
   * Generate review prompt for a set of personas
   */
  async generateReviewPrompt(
    personaIds: string[],
    codeContext: string
  ): Promise<string> {
    const personas = await Promise.all(
      personaIds.map(id => this.getPersona(id))
    );

    const validPersonas = personas.filter((p): p is ReviewPersona => p !== null);

    if (validPersonas.length === 0) {
      return 'Review this code for issues and suggest improvements.';
    }

    const promptParts = validPersonas.map(persona => {
      const strictness = this.getStrictnessModifier(persona.strictnessLevel);
      return `
## ${persona.icon} ${persona.name} Review

${persona.promptTemplate}

Strictness: ${strictness}
Focus areas: ${persona.focusAreas.join(', ')}
`;
    });

    return `You are reviewing code with the following personas:

${promptParts.join('\n---\n')}

---

Code to review:
${codeContext}

Provide feedback organized by persona. Be specific with line numbers and suggestions.`;
  }

  /**
   * Get focus areas for a persona type
   */
  getAvailableFocusAreas(): FocusArea[] {
    return [
      { id: 'security', name: 'Security', description: 'Security vulnerabilities and best practices', patterns: ['auth', 'crypt', 'password', 'secret'], weight: 1.0 },
      { id: 'performance', name: 'Performance', description: 'Performance and optimization', patterns: ['loop', 'query', 'cache', 'async'], weight: 0.9 },
      { id: 'a11y', name: 'Accessibility', description: 'Accessibility and WCAG compliance', patterns: ['aria', 'role', 'alt', 'focus'], weight: 0.8 },
      { id: 'testing', name: 'Testing', description: 'Test coverage and quality', patterns: ['test', 'spec', 'mock', 'assert'], weight: 0.9 },
      { id: 'docs', name: 'Documentation', description: 'Documentation and comments', patterns: ['comment', 'jsdoc', 'readme'], weight: 0.7 },
      { id: 'style', name: 'Code Style', description: 'Code style and formatting', patterns: ['naming', 'indent', 'format'], weight: 0.6 },
      { id: 'architecture', name: 'Architecture', description: 'Design patterns and architecture', patterns: ['pattern', 'module', 'coupling'], weight: 0.8 },
      { id: 'api', name: 'API Design', description: 'API design and REST conventions', patterns: ['endpoint', 'route', 'http'], weight: 0.8 },
    ];
  }

  // Private helpers

  private generatePromptTemplate(data: {
    name: string;
    focusAreas: string[];
    strictnessLevel: 'lenient' | 'moderate' | 'strict';
  }): string {
    return `You are a ${data.name} code reviewer focusing on ${data.focusAreas.join(', ')}.
Review the code carefully and provide feedback with ${data.strictnessLevel} strictness.
Be specific and provide actionable suggestions.`;
  }

  private getStrictnessModifier(level: 'lenient' | 'moderate' | 'strict'): string {
    switch (level) {
      case 'lenient':
        return 'Flag only critical issues. Be forgiving of minor imperfections.';
      case 'moderate':
        return 'Flag important issues and suggest improvements. Balance thoroughness with pragmatism.';
      case 'strict':
        return 'Flag all issues, even minor ones. Enforce best practices rigorously.';
    }
  }
}

export const reviewPersonaService = new ReviewPersonaService();
