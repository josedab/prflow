import { FastifyInstance } from 'fastify';
import { testPrioritizationService } from '../services/test-prioritization.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

interface PrioritizeParams {
  workflowId: string;
}

interface PrioritizeQuery {
  maxTests?: number;
  maxDuration?: number;
  includeTypes?: string[];
  installationId: number;
}

interface RecordTestRunBody {
  results: Array<{
    testPath: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
  }>;
}

export default async function testPrioritizationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get prioritized tests for a workflow
  fastify.get<{ Params: PrioritizeParams; Querystring: PrioritizeQuery }>(
    '/api/workflows/:workflowId/tests/prioritize',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
            maxTests: { type: 'number', minimum: 1, maximum: 1000 },
            maxDuration: { type: 'number', minimum: 1 },
            includeTypes: {
              type: 'array',
              items: { type: 'string', enum: ['unit', 'integration', 'e2e'] },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { workflowId } = request.params;
      const { maxTests, maxDuration, includeTypes, installationId } = request.query;

      logger.info({ workflowId, maxTests, maxDuration }, 'Prioritizing tests');

      try {
        const result = await testPrioritizationService.prioritizeTests(workflowId, installationId, {
          maxTests,
          maxDuration,
          includeTypes: includeTypes as ('unit' | 'integration' | 'e2e')[] | undefined,
        });

        return reply.code(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Workflow not found');
        }
        throw error;
      }
    }
  );

  // Predict test failures for a workflow
  fastify.get<{ Params: PrioritizeParams; Querystring: { installationId: number } }>(
    '/api/workflows/:workflowId/tests/predict-failures',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const { workflowId } = request.params;
      const { installationId } = request.query;

      logger.info({ workflowId }, 'Predicting test failures');

      try {
        const predictions = await testPrioritizationService.predictFailures(workflowId, installationId);

        return reply.code(200).send({
          success: true,
          data: predictions,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Workflow not found');
        }
        throw error;
      }
    }
  );

  // Get test info for a specific test
  fastify.get<{ Params: { testPath: string }; Querystring: { repositoryId: string } }>(
    '/api/tests/:testPath',
    {
      schema: {
        params: {
          type: 'object',
          required: ['testPath'],
          properties: {
            testPath: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['repositoryId'],
          properties: {
            repositoryId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { testPath } = request.params;
      const { repositoryId } = request.query;

      logger.info({ testPath, repositoryId }, 'Getting test info');

      const testInfo = await testPrioritizationService.getTestInfo(repositoryId, decodeURIComponent(testPath));

      if (!testInfo) {
        throw new NotFoundError('Test not found');
      }

      return reply.code(200).send({
        success: true,
        data: testInfo,
      });
    }
  );

  // Record test run results
  fastify.post<{ Querystring: { repositoryId: string }; Body: RecordTestRunBody }>(
    '/api/tests/record',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['repositoryId'],
          properties: {
            repositoryId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['results'],
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                required: ['testPath', 'status', 'duration'],
                properties: {
                  testPath: { type: 'string' },
                  status: { type: 'string', enum: ['passed', 'failed', 'skipped'] },
                  duration: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { repositoryId } = request.query;
      const { results } = request.body;

      logger.info({ repositoryId, testCount: results.length }, 'Recording test runs');

      await testPrioritizationService.recordTestRun(repositoryId, results);

      return reply.code(201).send({
        success: true,
        message: 'Test runs recorded',
      });
    }
  );
}
