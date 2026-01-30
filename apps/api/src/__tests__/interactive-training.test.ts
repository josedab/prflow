import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InteractiveTrainingService } from '../services/interactive-training.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findMany: vi.fn(),
    },
    reviewComment: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// Mock review replay learning service
vi.mock('../services/review-replay-learning.js', () => ({
  reviewReplayLearningService: {
    getDecisions: vi.fn().mockResolvedValue({
      decisions: [
        {
          id: 'd1',
          action: 'accepted',
          context: {
            category: 'SECURITY',
            severity: 'critical',
            codeContext: 'const query = `SELECT * FROM users WHERE id = ${id}`;',
            language: 'typescript',
            line: 1,
          },
          aiSuggestion: 'SQL injection vulnerability',
          humanResponse: 'Use parameterized queries',
        },
      ],
    }),
  },
}));

// Mock LLM - disable for predictable tests
vi.mock('../agents/base.js', () => ({
  callLLM: vi.fn().mockRejectedValue(new Error('LLM disabled in tests')),
  buildSystemPrompt: vi.fn().mockReturnValue('Test prompt'),
}));

// db imported for type checking only
import '@prflow/db';

describe('InteractiveTrainingService', () => {
  let service: InteractiveTrainingService;

  beforeEach(() => {
    process.env.ENABLE_LLM_TRAINING = 'false';
    service = new InteractiveTrainingService();
    vi.clearAllMocks();
  });

  describe('generateScenarios', () => {
    it('should generate training scenarios from repository data', async () => {
      const scenarios = await service.generateScenarios('repo-1', {
        count: 5,
      });

      expect(scenarios.length).toBeGreaterThan(0);
      expect(scenarios[0]).toHaveProperty('id');
      expect(scenarios[0]).toHaveProperty('title');
      expect(scenarios[0]).toHaveProperty('difficulty');
      expect(scenarios[0]).toHaveProperty('codeSnippet');
      expect(scenarios[0]).toHaveProperty('correctIssues');
    });

    it('should filter scenarios by difficulty', async () => {
      const scenarios = await service.generateScenarios('repo-1', {
        difficulty: 'beginner',
      });

      // Beginner scenarios should come from high/critical severity
      expect(scenarios.every(s => 
        s.difficulty === 'beginner' || s.correctIssues.some(i => 
          i.severity === 'high' || i.severity === 'critical'
        )
      )).toBe(true);
    });
  });

  describe('evaluateResponse', () => {
    it('should score a correct response highly', async () => {
      const scenario = {
        id: 'scenario-1',
        title: 'Test Scenario',
        description: 'Find the issue',
        difficulty: 'beginner' as const,
        category: 'SECURITY',
        codeSnippet: 'const x = 1;',
        language: 'typescript',
        correctIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'SQL injection vulnerability',
            explanation: 'Use parameterized queries',
          },
        ],
        hints: ['Look at line 10'],
        tags: ['SECURITY'],
      };

      const response = {
        scenarioId: 'scenario-1',
        userId: 'user-1',
        identifiedIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'Found SQL injection',
          },
        ],
        timeSpentSeconds: 60,
        completedAt: new Date(),
      };

      const score = await service.evaluateResponse(scenario, response);

      expect(score.score).toBeGreaterThan(70);
      expect(score.issuesFound).toBe(1);
      expect(score.issuesMissed).toBe(0);
    });

    it('should penalize missed issues', async () => {
      const scenario = {
        id: 'scenario-1',
        title: 'Test Scenario',
        description: 'Find the issues',
        difficulty: 'intermediate' as const,
        category: 'SECURITY',
        codeSnippet: 'const x = 1;',
        language: 'typescript',
        correctIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'SQL injection',
            explanation: 'Fix it',
          },
          {
            line: 20,
            type: 'PERFORMANCE',
            severity: 'MEDIUM',
            message: 'N+1 query',
            explanation: 'Use caching',
          },
        ],
        hints: [],
        tags: [],
      };

      const response = {
        scenarioId: 'scenario-1',
        userId: 'user-1',
        identifiedIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'Found SQL injection',
          },
        ],
        timeSpentSeconds: 60,
        completedAt: new Date(),
      };

      const score = await service.evaluateResponse(scenario, response);

      expect(score.score).toBeLessThan(100);
      expect(score.issuesMissed).toBe(1);
    });

    it('should penalize false positives', async () => {
      const scenario = {
        id: 'scenario-1',
        title: 'Test Scenario',
        description: 'Find the issue',
        difficulty: 'beginner' as const,
        category: 'SECURITY',
        codeSnippet: 'const x = 1;',
        language: 'typescript',
        correctIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'SQL injection',
            explanation: 'Fix it',
          },
        ],
        hints: [],
        tags: [],
      };

      const response = {
        scenarioId: 'scenario-1',
        userId: 'user-1',
        identifiedIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'Found SQL injection',
          },
          {
            line: 50,
            type: 'BUG',
            severity: 'HIGH',
            message: 'Non-existent bug',
          },
        ],
        timeSpentSeconds: 60,
        completedAt: new Date(),
      };

      const score = await service.evaluateResponse(scenario, response);

      expect(score.falsePositives).toBe(1);
      // Accuracy is returned as 0-100 percentage
      expect(score.accuracy).toBeLessThan(100);
    });

    it('should provide improvement suggestions when missing issues', async () => {
      const scenario = {
        id: 'scenario-1',
        title: 'Test Scenario',
        description: 'Find the issue',
        difficulty: 'beginner' as const,
        category: 'SECURITY',
        codeSnippet: 'const x = 1;',
        language: 'typescript',
        correctIssues: [
          {
            line: 10,
            type: 'SECURITY',
            severity: 'CRITICAL',
            message: 'SQL injection',
            explanation: 'Use parameterized queries to fix it',
          },
        ],
        hints: [],
        tags: [],
      };

      const response = {
        scenarioId: 'scenario-1',
        userId: 'user-1',
        identifiedIssues: [],
        timeSpentSeconds: 30,
        completedAt: new Date(),
      };

      const score = await service.evaluateResponse(scenario, response);

      expect(score.improvement).toBeDefined();
      // When issues are missed, improvement should include the missed issue explanation
      expect(score.improvement.some(i => i.includes('Missed'))).toBe(true);
    });
  });

  describe('getUserProgress', () => {
    it('should return default progress structure', async () => {
      // The current implementation returns default values
      const progress = await service.getUserProgress('user-1', 'repo-1');

      expect(progress.userId).toBe('user-1');
      expect(progress.repositoryId).toBe('repo-1');
      expect(progress.completedScenarios).toBe(0);
      expect(progress.avgScore).toBe(0);
      expect(progress.badges).toHaveLength(0);
    });
  });

  describe('updateProgress', () => {
    it('should update user progress after completing scenario', async () => {
      const score = {
        scenarioId: 'scenario-1',
        score: 85,
        issuesFound: 2,
        issuesMissed: 0,
        falsePositives: 0,
        accuracy: 1,
        feedback: ['Good job!'],
        improvement: [],
      };

      const progress = await service.updateProgress('user-1', 'repo-1', score);

      expect(progress.completedScenarios).toBe(1);
      expect(progress.avgScore).toBe(85);
    });

    it('should update streak when activity is within 1 day', async () => {
      const score = {
        scenarioId: 'scenario-1',
        score: 85,
        issuesFound: 1,
        issuesMissed: 0,
        falsePositives: 0,
        accuracy: 1,
        feedback: [],
        improvement: [],
      };

      // First update
      const progress1 = await service.updateProgress('user-1', 'repo-1', score);
      expect(progress1.streak).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getLeaderboard', () => {
    it('should return leaderboard array', async () => {
      const leaderboard = await service.getLeaderboard('repo-1');

      expect(leaderboard).toBeDefined();
      expect(Array.isArray(leaderboard)).toBe(true);
    });
  });

  describe('getRecommendations', () => {
    it('should provide recommendations based on progress', async () => {
      const recommendations = await service.getRecommendations('user-1', 'repo-1');

      expect(recommendations).toBeDefined();
      expect(recommendations).toHaveProperty('nextScenarios');
      expect(recommendations).toHaveProperty('focus');
      expect(recommendations).toHaveProperty('tips');
    });
  });
});
