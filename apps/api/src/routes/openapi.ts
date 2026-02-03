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
    { name: 'Semver', description: 'Semantic versioning analysis and release management' },
    { name: 'Time Machine', description: 'PR timeline tracking and snapshot comparison' },
    { name: 'Impact Simulator', description: 'Codebase impact prediction and analysis' },
    { name: 'Marketplace', description: 'Review delegation marketplace with gamification' },
    { name: 'Conflict Prevention', description: 'Smart conflict detection between PRs' },
    { name: 'Runbook', description: 'Automated deployment runbook generation' },
    { name: 'Voice Review', description: 'Voice-activated code review commands' },
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
    // Semver Routes
    '/api/semver/{owner}/{repo}/analyze': {
      get: {
        tags: ['Semver'],
        summary: 'Analyze version bump',
        description: 'Analyzes PRs to recommend semantic version bump',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'branch', in: 'query', schema: { type: 'string' } },
          { name: 'sinceTag', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Version bump analysis',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VersionBumpAnalysis' },
              },
            },
          },
        },
      },
    },
    '/api/semver/{owner}/{repo}/release-notes': {
      post: {
        tags: ['Semver'],
        summary: 'Generate release notes',
        description: 'Generates formatted release notes from version analysis',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  version: { type: 'string' },
                  analysis: { $ref: '#/components/schemas/VersionBumpAnalysis' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Generated release notes',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReleaseNotes' },
              },
            },
          },
        },
      },
    },
    // Time Machine Routes
    '/api/time-machine/{owner}/{repo}/{prNumber}/timeline': {
      get: {
        tags: ['Time Machine'],
        summary: 'Get PR timeline',
        description: 'Returns the complete timeline of events and snapshots for a PR',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'prNumber', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'PR timeline',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PRTimeline' },
              },
            },
          },
        },
      },
    },
    '/api/time-machine/{owner}/{repo}/{prNumber}/snapshot': {
      post: {
        tags: ['Time Machine'],
        summary: 'Capture snapshot',
        description: 'Manually captures a snapshot of the current PR state',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'prNumber', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Captured snapshot',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PRSnapshot' },
              },
            },
          },
        },
      },
    },
    // Impact Simulator Routes
    '/api/impact/{owner}/{repo}/{prNumber}/simulate': {
      post: {
        tags: ['Impact Simulator'],
        summary: 'Run impact simulation',
        description: 'Simulates the impact of merging a PR on the codebase',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'prNumber', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  includeTestPredictions: { type: 'boolean' },
                  includeCrossRepo: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Impact simulation results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImpactSimulation' },
              },
            },
          },
        },
      },
    },
    '/api/impact/{owner}/{repo}/{prNumber}/latest': {
      get: {
        tags: ['Impact Simulator'],
        summary: 'Get latest simulation',
        description: 'Returns the most recent impact simulation for a PR',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'prNumber', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Latest simulation',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImpactSimulation' },
              },
            },
          },
          '404': { description: 'No simulation found' },
        },
      },
    },
    // Marketplace Routes
    '/api/marketplace/listings': {
      get: {
        tags: ['Marketplace'],
        summary: 'Get available listings',
        description: 'Returns PR review listings available for claiming',
        parameters: [
          { name: 'skills', in: 'query', schema: { type: 'string' }, description: 'Comma-separated skill filters' },
          { name: 'difficulty', in: 'query', schema: { type: 'string', enum: ['easy', 'medium', 'hard', 'expert'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': {
            description: 'Available listings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    listings: { type: 'array', items: { $ref: '#/components/schemas/ReviewListing' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/marketplace/listings/{listingId}/claim': {
      post: {
        tags: ['Marketplace'],
        summary: 'Claim a listing',
        description: 'Claims a PR review listing for the requesting reviewer',
        parameters: [
          { name: 'listingId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reviewerLogin'],
                properties: {
                  reviewerLogin: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Claim successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReviewClaim' },
              },
            },
          },
          '400': { description: 'Listing unavailable' },
        },
      },
    },
    '/api/marketplace/reviewers/{login}': {
      get: {
        tags: ['Marketplace'],
        summary: 'Get reviewer profile',
        description: 'Returns the gamification profile for a reviewer',
        parameters: [
          { name: 'login', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Reviewer profile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ReviewerProfile' },
              },
            },
          },
        },
      },
    },
    '/api/marketplace/leaderboard': {
      get: {
        tags: ['Marketplace'],
        summary: 'Get leaderboard',
        description: 'Returns the reviewer leaderboard',
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'all_time'] } },
        ],
        responses: {
          '200': {
            description: 'Leaderboard',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/MarketplaceLeaderboard' },
              },
            },
          },
        },
      },
    },
    // Conflict Prevention Routes
    '/api/conflicts/scan/{owner}/{repo}': {
      post: {
        tags: ['Conflict Prevention'],
        summary: 'Scan for conflicts',
        description: 'Scans repository for potential merge conflicts between open PRs',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Conflict scan results',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConflictScan' },
              },
            },
          },
        },
      },
      get: {
        tags: ['Conflict Prevention'],
        summary: 'Get latest scan',
        description: 'Returns the most recent conflict scan for a repository',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Latest scan',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConflictScan' },
              },
            },
          },
          '404': { description: 'No scan found' },
        },
      },
    },
    // Runbook Routes
    '/api/runbook/{owner}/{repo}/{prNumber}/generate': {
      post: {
        tags: ['Runbook'],
        summary: 'Generate runbook',
        description: 'Generates a deployment runbook based on PR changes',
        parameters: [
          { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'prNumber', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Generated runbook',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Runbook' },
              },
            },
          },
        },
      },
    },
    // Voice Review Routes
    '/api/voice/command': {
      post: {
        tags: ['Voice Review'],
        summary: 'Process voice command',
        description: 'Processes a voice command for code review actions',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['transcript'],
                properties: {
                  transcript: { type: 'string' },
                  context: {
                    type: 'object',
                    properties: {
                      owner: { type: 'string' },
                      repo: { type: 'string' },
                      prNumber: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Command result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VoiceCommandResult' },
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
      // New Feature Schemas
      VersionBumpAnalysis: {
        type: 'object',
        properties: {
          recommendedBump: { type: 'string', enum: ['major', 'minor', 'patch', 'none'] },
          currentVersion: { type: 'string', nullable: true },
          suggestedVersion: { type: 'string', nullable: true },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          factors: { type: 'array', items: { $ref: '#/components/schemas/VersionBumpFactor' } },
          changes: { type: 'array', items: { $ref: '#/components/schemas/ChangelogEntry' } },
        },
      },
      VersionBumpFactor: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          description: { type: 'string' },
          impact: { type: 'string', enum: ['major', 'minor', 'patch'] },
          source: { type: 'string' },
        },
      },
      ChangelogEntry: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['breaking', 'feature', 'fix', 'performance', 'refactor', 'documentation', 'test', 'chore', 'security', 'deprecation'] },
          description: { type: 'string' },
          prNumber: { type: 'integer' },
          author: { type: 'string' },
          affectedFiles: { type: 'array', items: { type: 'string' } },
          isBreaking: { type: 'boolean' },
        },
      },
      ReleaseNotes: {
        type: 'object',
        properties: {
          version: { type: 'string' },
          title: { type: 'string' },
          date: { type: 'string' },
          sections: { type: 'array', items: { type: 'object' } },
          markdown: { type: 'string' },
          contributors: { type: 'array', items: { type: 'string' } },
          pullRequests: { type: 'array', items: { type: 'integer' } },
        },
      },
      PRTimeline: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          repository: { type: 'object' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          author: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          currentStatus: { type: 'string' },
          snapshots: { type: 'array', items: { $ref: '#/components/schemas/PRSnapshot' } },
          events: { type: 'array', items: { $ref: '#/components/schemas/TimelineEvent' } },
          milestones: { type: 'array', items: { type: 'object' } },
          stats: { type: 'object' },
        },
      },
      PRSnapshot: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          workflowId: { type: 'string' },
          commitSha: { type: 'string' },
          headBranch: { type: 'string' },
          baseBranch: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'object' } },
          linesAdded: { type: 'integer' },
          linesRemoved: { type: 'integer' },
          capturedAt: { type: 'string', format: 'date-time' },
        },
      },
      TimelineEvent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          workflowId: { type: 'string' },
          type: { type: 'string' },
          actor: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          metadata: { type: 'object' },
          isSignificant: { type: 'boolean' },
        },
      },
      ImpactSimulation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prNumber: { type: 'integer' },
          commitSha: { type: 'string' },
          simulatedAt: { type: 'string', format: 'date-time' },
          impacts: { type: 'array', items: { $ref: '#/components/schemas/PredictedImpact' } },
          testPredictions: { type: 'array', items: { type: 'object' } },
          apiCompatibility: { type: 'array', items: { type: 'object' } },
          dependencyGraph: { type: 'object' },
          summary: { $ref: '#/components/schemas/ImpactSummary' },
        },
      },
      PredictedImpact: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          confidence: { type: 'number' },
          description: { type: 'string' },
          file: { type: 'string' },
          suggestedAction: { type: 'string' },
        },
      },
      ImpactSummary: {
        type: 'object',
        properties: {
          totalImpacts: { type: 'integer' },
          criticalCount: { type: 'integer' },
          highCount: { type: 'integer' },
          mediumCount: { type: 'integer' },
          lowCount: { type: 'integer' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          recommendedActions: { type: 'array', items: { type: 'string' } },
        },
      },
      ReviewListing: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          repository: { type: 'object' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          author: { type: 'string' },
          status: { type: 'string' },
          estimatedMinutes: { type: 'integer' },
          points: { type: 'integer' },
          bonusPoints: { type: 'integer' },
          requiredSkills: { type: 'array', items: { type: 'string' } },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'expert'] },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ReviewClaim: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          listingId: { type: 'string' },
          reviewerLogin: { type: 'string' },
          status: { type: 'string' },
          claimedAt: { type: 'string', format: 'date-time' },
          deadline: { type: 'string', format: 'date-time' },
          pointsEarned: { type: 'integer' },
          bonusEarned: { type: 'integer' },
        },
      },
      ReviewerProfile: {
        type: 'object',
        properties: {
          login: { type: 'string' },
          name: { type: 'string' },
          totalPoints: { type: 'integer' },
          level: { type: 'integer' },
          pointsToNextLevel: { type: 'integer' },
          currentStreak: { type: 'integer' },
          longestStreak: { type: 'integer' },
          totalReviews: { type: 'integer' },
          avgReviewTime: { type: 'number' },
          avgQualityScore: { type: 'number' },
          badges: { type: 'array', items: { type: 'object' } },
          skills: { type: 'array', items: { type: 'object' } },
          availability: { type: 'string' },
        },
      },
      MarketplaceLeaderboard: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'all_time'] },
          entries: { type: 'array', items: { type: 'object' } },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ConflictScan: {
        type: 'object',
        properties: {
          repository: { type: 'object' },
          scannedAt: { type: 'string', format: 'date-time' },
          prsAnalyzed: { type: 'integer' },
          conflicts: { type: 'array', items: { $ref: '#/components/schemas/PredictedConflict' } },
          hotspots: { type: 'array', items: { type: 'object' } },
          mergeOrder: { type: 'object' },
        },
      },
      PredictedConflict: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          probability: { type: 'number' },
          pr1: { type: 'object' },
          pr2: { type: 'object' },
          conflictingFiles: { type: 'array', items: { type: 'string' } },
          suggestedResolution: { type: 'object' },
          detectedAt: { type: 'string', format: 'date-time' },
        },
      },
      Runbook: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prNumber: { type: 'integer' },
          title: { type: 'string' },
          summary: { type: 'string' },
          generatedAt: { type: 'string', format: 'date-time' },
          steps: { type: 'array', items: { type: 'object' } },
          rollbackPlan: { type: 'object' },
          monitoring: { type: 'object' },
          estimatedDuration: { type: 'integer' },
          riskAssessment: { type: 'object' },
        },
      },
      VoiceCommandResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          command: { type: 'string' },
          action: { type: 'string' },
          parameters: { type: 'object' },
          response: { type: 'string' },
          executedActions: { type: 'array', items: { type: 'string' } },
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
