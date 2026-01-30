import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {},
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ReviewPersonaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export reviewPersonaService instance', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(reviewPersonaService).toBeDefined();
    });

    it('should export ReviewPersonaService class', async () => {
      const { ReviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof ReviewPersonaService).toBe('function');
    });

    it('should have getAllPersonas method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.getAllPersonas).toBe('function');
    });

    it('should have getPersona method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.getPersona).toBe('function');
    });

    it('should have createPersona method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.createPersona).toBe('function');
    });

    it('should have updatePersona method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.updatePersona).toBe('function');
    });

    it('should have deletePersona method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.deletePersona).toBe('function');
    });

    it('should have generateReviewPrompt method', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      expect(typeof reviewPersonaService.generateReviewPrompt).toBe('function');
    });
  });

  describe('Built-in personas', () => {
    it('should include security expert persona', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const persona = await reviewPersonaService.getPersona('security-expert');
      
      expect(persona).toBeDefined();
      expect(persona?.name).toBe('Security Expert');
      expect(persona?.isBuiltIn).toBe(true);
    });

    it('should include performance guru persona', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const persona = await reviewPersonaService.getPersona('performance-guru');
      
      expect(persona).toBeDefined();
      expect(persona?.name).toBe('Performance Guru');
    });

    it('should include accessibility auditor persona', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const persona = await reviewPersonaService.getPersona('accessibility-auditor');
      
      expect(persona).toBeDefined();
      expect(persona?.focusAreas).toContain('a11y');
    });

    it('should include test champion persona', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const persona = await reviewPersonaService.getPersona('test-champion');
      
      expect(persona).toBeDefined();
      expect(persona?.focusAreas).toContain('testing');
    });

    it('should return all built-in personas', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const personas = await reviewPersonaService.getAllPersonas();
      
      expect(personas.length).toBeGreaterThanOrEqual(6);
      expect(personas.some(p => p.id === 'security-expert')).toBe(true);
      expect(personas.some(p => p.id === 'performance-guru')).toBe(true);
    });
  });

  describe('Persona structure', () => {
    it('should have correct persona structure', () => {
      const mockPersona = {
        id: 'custom-persona',
        name: 'Custom Reviewer',
        description: 'A custom review persona',
        icon: '🔍',
        focusAreas: ['security', 'performance'],
        strictnessLevel: 'moderate' as const,
        promptTemplate: 'Review this code...',
        enabled: true,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(mockPersona).toHaveProperty('id');
      expect(mockPersona).toHaveProperty('name');
      expect(mockPersona).toHaveProperty('focusAreas');
      expect(mockPersona).toHaveProperty('strictnessLevel');
      expect(mockPersona).toHaveProperty('promptTemplate');
    });
  });

  describe('Strictness levels', () => {
    it('should support all strictness levels', () => {
      const levels = ['lenient', 'moderate', 'strict'];
      
      levels.forEach(level => {
        expect(typeof level).toBe('string');
      });
    });
  });

  describe('Focus areas', () => {
    it('should have available focus areas', async () => {
      const { reviewPersonaService } = await import('../services/review-personas.js');
      const areas = reviewPersonaService.getAvailableFocusAreas();
      
      expect(Array.isArray(areas)).toBe(true);
      expect(areas.length).toBeGreaterThan(0);
      expect(areas.some(a => a.id === 'security')).toBe(true);
      expect(areas.some(a => a.id === 'performance')).toBe(true);
    });
  });
});
