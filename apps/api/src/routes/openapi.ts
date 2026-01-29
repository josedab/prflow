import type { FastifyInstance } from 'fastify';

/**
 * OpenAPI specification for PRFlow API
 */
export function registerOpenAPI(app: FastifyInstance) {
  app.get('/api/openapi.json', async () => {
    return openAPISpec;
  });

  app.get('/api/docs', async (_request, reply) => {
    reply.header('Content-Type', 'text/html');
    return `<!DOCTYPE html>
<html>
<head>
  <title>PRFlow API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout"
    });
  </script>
</body>
</html>`;
  });
}

const openAPISpec = {
  openapi: '3.0.3',
  info: {
    title: 'PRFlow API',
    description: 'Intelligent Pull Request Automation Platform API',
    version: '1.0.0',
    contact: {
      name: 'PRFlow Support',
      url: 'https://prflow.dev/support',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Development server',
    },
    {
      url: 'https://api.prflow.dev',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Repositories', description: 'Repository management' },
    { name: 'Workflows', description: 'PR workflow operations' },
    { name: 'Rules', description: 'Custom rules management' },
    { name: 'Analytics', description: 'Metrics and reporting' },
    { name: 'Audit', description: 'Audit logging' },
    { name: 'Webhooks', description: 'GitHub webhook handling' },
    { name: 'Dependencies', description: 'PR dependency graph and merge ordering' },
    { name: 'Query', description: 'Natural language PR queries' },
    { name: 'ML Training', description: 'Machine learning model training' },
    { name: 'Training', description: 'Interactive review training' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns the health status of the API',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string', example: '1.0.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/repositories': {
      get: {
        tags: ['Repositories'],
        summary: 'List repositories',
        description: 'Returns a list of repositories the user has access to',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of repositories',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    repositories: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Repository' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/repositories/{owner}/{repo}': {
      get: {
        tags: ['Repositories'],
        summary: 'Get repository',
        description: 'Returns details of a specific repository',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Repository details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Repository' },
              },
            },
          },
          '404': { description: 'Repository not found' },
        },
      },
    },
    '/api/workflows': {
      get: {
        tags: ['Workflows'],
        summary: 'List workflows',
        description: 'Returns a list of PR workflows',
        parameters: [
          { name: 'repositoryId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'analyzing', 'reviewing', 'completed', 'failed'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'List of workflows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflows: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Workflow' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/workflows/{id}': {
      get: {
        tags: ['Workflows'],
        summary: 'Get workflow',
        description: 'Returns details of a specific workflow',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Workflow details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Workflow' },
              },
            },
          },
          '404': { description: 'Workflow not found' },
        },
      },
    },
    '/api/rules': {
      get: {
        tags: ['Rules'],
        summary: 'List rules',
        description: 'Returns a list of custom review rules',
        parameters: [
          { name: 'repositoryId', in: 'query', schema: { type: 'string' } },
          { name: 'enabled', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': {
            description: 'List of rules',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    rules: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Rule' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Rules'],
        summary: 'Create rule',
        description: 'Creates a new custom review rule',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateRuleRequest' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Rule created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Rule' },
              },
            },
          },
          '400': { description: 'Invalid rule definition' },
        },
      },
    },
    '/api/analytics/metrics': {
      get: {
        tags: ['Analytics'],
        summary: 'Get metrics',
        description: 'Returns analytics metrics for a repository',
        parameters: [
          { name: 'repositoryId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Analytics metrics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Metrics' },
              },
            },
          },
        },
      },
    },
    '/api/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Get audit log',
        description: 'Returns audit log entries',
        parameters: [
          { name: 'repositoryId', in: 'query', schema: { type: 'string' } },
          { name: 'eventTypes', in: 'query', schema: { type: 'string' }, description: 'Comma-separated event types' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          '200': {
            description: 'Audit log entries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    entries: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AuditEntry' },
                    },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/webhooks/github': {
      post: {
        tags: ['Webhooks'],
        summary: 'GitHub webhook',
        description: 'Receives webhook events from GitHub',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          '200': { description: 'Webhook processed' },
          '400': { description: 'Invalid webhook' },
        },
      },
    },
    // PR Dependency Graph endpoints
    '/api/dependencies/{repositoryId}/graph': {
      get: {
        tags: ['Dependencies'],
        summary: 'Get PR dependency graph',
        description: 'Returns the dependency graph for all active PRs in a repository',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Dependency graph',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DependencyGraph' },
              },
            },
          },
          '404': { description: 'Repository not found' },
        },
      },
    },
    '/api/dependencies/{repositoryId}/merge-order': {
      get: {
        tags: ['Dependencies'],
        summary: 'Get optimal merge order',
        description: 'Returns the optimal order to merge PRs based on dependencies',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Merge order',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MergeOrder' },
              },
            },
          },
        },
      },
    },
    '/api/dependencies/{prId}/impact': {
      get: {
        tags: ['Dependencies'],
        summary: 'Get PR impact analysis',
        description: 'Analyzes the impact of a specific PR on other PRs',
        parameters: [
          { name: 'prId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Impact analysis',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImpactAnalysis' },
              },
            },
          },
          '404': { description: 'PR not found' },
        },
      },
    },
    '/api/dependencies/{prId}/simulate-merge': {
      post: {
        tags: ['Dependencies'],
        summary: 'Simulate PR merge',
        description: 'Simulates merging a PR and shows the impact on other PRs',
        parameters: [
          { name: 'prId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Simulation result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MergeSimulation' },
              },
            },
          },
        },
      },
    },
    // Natural Language Query endpoints
    '/api/query/execute': {
      post: {
        tags: ['Query'],
        summary: 'Execute natural language query',
        description: 'Parses and executes a natural language query against PRs',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query', 'repositoryId'],
                properties: {
                  query: { type: 'string', description: 'Natural language query', example: 'show open high risk PRs' },
                  repositoryId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Query results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QueryResult' },
              },
            },
          },
          '400': { description: 'Invalid query' },
        },
      },
    },
    '/api/query/autocomplete': {
      get: {
        tags: ['Query'],
        summary: 'Get query autocomplete suggestions',
        description: 'Returns autocomplete suggestions for a partial query',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, description: 'Partial query' },
          { name: 'repositoryId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Autocomplete suggestions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    suggestions: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/QuerySuggestion' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ML Training endpoints
    '/api/ml/{repositoryId}/train': {
      post: {
        tags: ['ML Training'],
        summary: 'Train predictive model',
        description: 'Trains a machine learning model for PR predictions',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  minDataPoints: { type: 'integer', default: 50 },
                  maxAgeDays: { type: 'integer', default: 365 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Training result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TrainingResult' },
              },
            },
          },
          '400': { description: 'Insufficient training data' },
        },
      },
    },
    '/api/ml/{repositoryId}/model': {
      get: {
        tags: ['ML Training'],
        summary: 'Get model info',
        description: 'Returns information about the trained model for a repository',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Model information',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ModelInfo' },
              },
            },
          },
          '404': { description: 'No model found' },
        },
      },
    },
    '/api/ml/{repositoryId}/predict': {
      post: {
        tags: ['ML Training'],
        summary: 'Make prediction',
        description: 'Uses the trained model to make predictions for PR features',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PredictionRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Prediction result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PredictionResult' },
              },
            },
          },
        },
      },
    },
    // Interactive Training endpoints
    '/api/training/{repositoryId}/scenarios': {
      get: {
        tags: ['Training'],
        summary: 'Get training scenarios',
        description: 'Returns training scenarios for code review practice',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] } },
          { name: 'count', in: 'query', schema: { type: 'integer', default: 5 } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Training scenarios',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scenarios: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TrainingScenario' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/training/evaluate': {
      post: {
        tags: ['Training'],
        summary: 'Evaluate training response',
        description: 'Evaluates a user response to a training scenario',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['scenarioId', 'userId', 'repositoryId', 'identifiedIssues'],
                properties: {
                  scenarioId: { type: 'string' },
                  userId: { type: 'string' },
                  repositoryId: { type: 'string' },
                  identifiedIssues: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        line: { type: 'integer' },
                        type: { type: 'string' },
                        severity: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                  timeSpentSeconds: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Evaluation result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TrainingScore' },
              },
            },
          },
        },
      },
    },
    '/api/training/{repositoryId}/progress/{userId}': {
      get: {
        tags: ['Training'],
        summary: 'Get user progress',
        description: 'Returns training progress for a user',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'User progress',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserProgress' },
              },
            },
          },
        },
      },
    },
    '/api/training/{repositoryId}/leaderboard': {
      get: {
        tags: ['Training'],
        summary: 'Get leaderboard',
        description: 'Returns the training leaderboard for a repository',
        parameters: [
          { name: 'repositoryId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          '200': {
            description: 'Leaderboard',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    leaderboard: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/LeaderboardEntry' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Repository: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fullName: { type: 'string', example: 'owner/repo' },
          name: { type: 'string' },
          owner: { type: 'string' },
          defaultBranch: { type: 'string', example: 'main' },
          isActive: { type: 'boolean' },
          settings: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Workflow: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          prNumber: { type: 'integer' },
          prTitle: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'analyzing', 'reviewing', 'completed', 'failed'] },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          analysis: { $ref: '#/components/schemas/Analysis' },
          reviewComments: { type: 'array', items: { $ref: '#/components/schemas/ReviewComment' } },
          generatedTests: { type: 'array', items: { $ref: '#/components/schemas/GeneratedTest' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Analysis: {
        type: 'object',
        properties: {
          prType: { type: 'string', enum: ['feature', 'bugfix', 'refactor', 'docs', 'chore'] },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          filesChanged: { type: 'integer' },
          linesAdded: { type: 'integer' },
          linesRemoved: { type: 'integer' },
          semanticChanges: { type: 'array', items: { type: 'object' } },
          risks: { type: 'array', items: { type: 'string' } },
        },
      },
      ReviewComment: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'nitpick'] },
          category: { type: 'string', enum: ['security', 'bug', 'performance', 'error_handling', 'testing', 'documentation', 'style'] },
          message: { type: 'string' },
          suggestion: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      GeneratedTest: {
        type: 'object',
        properties: {
          testFile: { type: 'string' },
          targetFile: { type: 'string' },
          framework: { type: 'string', enum: ['jest', 'vitest', 'mocha', 'pytest', 'go_test'] },
          testCode: { type: 'string' },
          coverageTargets: { type: 'array', items: { type: 'string' } },
        },
      },
      Rule: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          enabled: { type: 'boolean' },
          conditions: { type: 'array', items: { $ref: '#/components/schemas/RuleCondition' } },
          actions: { type: 'array', items: { $ref: '#/components/schemas/RuleAction' } },
          priority: { type: 'integer' },
        },
      },
      RuleCondition: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['file_pattern', 'content_match', 'file_extension', 'change_type', 'line_count'] },
          value: { type: 'string' },
          operator: { type: 'string', enum: ['matches', 'contains', 'equals', 'greater_than', 'less_than'] },
        },
      },
      RuleAction: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['warn', 'error', 'block', 'require_reviewer', 'add_label', 'suggest'] },
          params: { type: 'object' },
        },
      },
      CreateRuleRequest: {
        type: 'object',
        required: ['name', 'repositoryId', 'conditions', 'actions'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          repositoryId: { type: 'string' },
          conditions: { type: 'array', items: { $ref: '#/components/schemas/RuleCondition' } },
          actions: { type: 'array', items: { $ref: '#/components/schemas/RuleAction' } },
          priority: { type: 'integer', default: 0 },
        },
      },
      Metrics: {
        type: 'object',
        properties: {
          totalPRs: { type: 'integer' },
          averageReviewTime: { type: 'number' },
          averageTimeToMerge: { type: 'number' },
          prsByRiskLevel: { type: 'object' },
          prsByType: { type: 'object' },
          commentAcceptanceRate: { type: 'number' },
          testCoverageImprovement: { type: 'number' },
        },
      },
      AuditEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          eventType: { type: 'string' },
          actorLogin: { type: 'string' },
          resourceType: { type: 'string' },
          resourceId: { type: 'string' },
          success: { type: 'boolean' },
          data: { type: 'object' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
      // PR Dependency Graph schemas
      DependencyGraph: {
        type: 'object',
        properties: {
          repositoryId: { type: 'string' },
          nodes: {
            type: 'array',
            items: { $ref: '#/components/schemas/DependencyNode' },
          },
          edges: {
            type: 'array',
            items: { $ref: '#/components/schemas/DependencyEdge' },
          },
          cycles: {
            type: 'array',
            items: { $ref: '#/components/schemas/CycleInfo' },
          },
          criticalPath: {
            type: 'array',
            items: { type: 'string' },
          },
          generatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DependencyNode: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          author: { type: 'string' },
          status: { type: 'string' },
          branch: { type: 'string' },
          baseBranch: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          affectedFiles: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      DependencyEdge: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
          type: { type: 'string', enum: ['branch_dependency', 'file_conflict', 'semantic_dependency'] },
          strength: { type: 'number' },
          conflictFiles: { type: 'array', items: { type: 'string' } },
        },
      },
      CycleInfo: {
        type: 'object',
        properties: {
          nodes: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
      },
      MergeOrder: {
        type: 'object',
        properties: {
          hasConflicts: { type: 'boolean' },
          order: {
            type: 'array',
            items: { $ref: '#/components/schemas/MergeOrderItem' },
          },
          conflictDetails: { type: 'array', items: { type: 'string' } },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
      },
      MergeOrderItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          priority: { type: 'integer' },
          blockedBy: { type: 'array', items: { type: 'string' } },
          blocks: { type: 'array', items: { type: 'string' } },
          estimatedRisk: { type: 'string' },
        },
      },
      ImpactAnalysis: {
        type: 'object',
        properties: {
          prId: { type: 'string' },
          directlyAffected: { type: 'array', items: { type: 'string' } },
          indirectlyAffected: { type: 'array', items: { type: 'string' } },
          blockedPRs: { type: 'array', items: { type: 'string' } },
          impactScore: { type: 'number' },
          recommendations: { type: 'array', items: { type: 'string' } },
        },
      },
      MergeSimulation: {
        type: 'object',
        properties: {
          prId: { type: 'string' },
          wouldUnblock: { type: 'array', items: { type: 'string' } },
          newConflicts: { type: 'array', items: { type: 'string' } },
          updatedCriticalPath: { type: 'array', items: { type: 'string' } },
        },
      },
      // Natural Language Query schemas
      QueryResult: {
        type: 'object',
        properties: {
          query: { $ref: '#/components/schemas/ParsedQuery' },
          results: {
            type: 'array',
            items: { $ref: '#/components/schemas/PRQueryResult' },
          },
          aggregation: { $ref: '#/components/schemas/AggregationResult' },
          totalCount: { type: 'integer' },
          executionTimeMs: { type: 'integer' },
          suggestions: { type: 'array', items: { type: 'string' } },
        },
      },
      ParsedQuery: {
        type: 'object',
        properties: {
          originalQuery: { type: 'string' },
          type: { type: 'string' },
          intent: { type: 'string' },
          filters: { type: 'object' },
          aggregation: { type: 'string' },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer' },
          confidence: { type: 'number' },
        },
      },
      PRQueryResult: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          author: { type: 'string' },
          status: { type: 'string' },
          riskLevel: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          relevanceScore: { type: 'number' },
          matchedFilters: { type: 'array', items: { type: 'string' } },
        },
      },
      AggregationResult: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: { oneOf: [{ type: 'number' }, { type: 'object' }] },
          details: { type: 'string' },
        },
      },
      QuerySuggestion: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string' },
        },
      },
      // ML Training schemas
      TrainingResult: {
        type: 'object',
        properties: {
          modelVersion: { type: 'string' },
          trainedAt: { type: 'string', format: 'date-time' },
          dataPoints: { type: 'integer' },
          metrics: {
            type: 'object',
            properties: {
              mergeTimeMSE: { type: 'number' },
              mergeTimeR2: { type: 'number' },
              mergeProbabilityAUC: { type: 'number' },
              blockerProbabilityAUC: { type: 'number' },
            },
          },
          featureImportance: { type: 'object' },
        },
      },
      ModelInfo: {
        type: 'object',
        properties: {
          exists: { type: 'boolean' },
          version: { type: 'string' },
          trainedAt: { type: 'string', format: 'date-time' },
          metrics: { type: 'object' },
        },
      },
      PredictionRequest: {
        type: 'object',
        properties: {
          filesChanged: { type: 'integer' },
          linesAdded: { type: 'integer' },
          linesRemoved: { type: 'integer' },
          riskScore: { type: 'number' },
          criticalIssues: { type: 'integer' },
          highIssues: { type: 'integer' },
          hasTests: { type: 'boolean' },
          hasDescription: { type: 'boolean' },
        },
      },
      PredictionResult: {
        type: 'object',
        properties: {
          predictedMergeTimeHours: { type: 'number' },
          mergeProbability: { type: 'number' },
          blockerProbability: { type: 'number' },
          confidence: { type: 'number' },
          factors: { type: 'array', items: { type: 'string' } },
        },
      },
      // Interactive Training schemas
      TrainingScenario: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
          category: { type: 'string' },
          codeSnippet: { type: 'string' },
          language: { type: 'string' },
          correctIssues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                line: { type: 'integer' },
                type: { type: 'string' },
                severity: { type: 'string' },
                message: { type: 'string' },
                explanation: { type: 'string' },
              },
            },
          },
          hints: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      TrainingScore: {
        type: 'object',
        properties: {
          scenarioId: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          issuesFound: { type: 'integer' },
          issuesMissed: { type: 'integer' },
          falsePositives: { type: 'integer' },
          accuracy: { type: 'integer' },
          feedback: { type: 'array', items: { type: 'string' } },
          improvement: { type: 'array', items: { type: 'string' } },
          badge: { type: 'string' },
        },
      },
      UserProgress: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          repositoryId: { type: 'string' },
          totalScenarios: { type: 'integer' },
          completedScenarios: { type: 'integer' },
          avgScore: { type: 'number' },
          strengthAreas: { type: 'array', items: { type: 'string' } },
          improvementAreas: { type: 'array', items: { type: 'string' } },
          badges: { type: 'array', items: { type: 'string' } },
          streak: { type: 'integer' },
          lastActivityAt: { type: 'string', format: 'date-time' },
        },
      },
      LeaderboardEntry: {
        type: 'object',
        properties: {
          rank: { type: 'integer' },
          userId: { type: 'string' },
          username: { type: 'string' },
          avatarUrl: { type: 'string' },
          score: { type: 'integer' },
          scenariosCompleted: { type: 'integer' },
          badges: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      githubOAuth: {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            scopes: {
              'repo': 'Access repositories',
              'read:org': 'Read organization data',
            },
          },
        },
      },
    },
  },
  security: [
    { bearerAuth: [] },
  ],
};
