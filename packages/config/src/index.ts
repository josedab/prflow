import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // GitHub App (optional — app starts without them, webhook processing disabled)
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

  // Copilot SDK
  COPILOT_API_KEY: z.string().optional(),

  // Multi-Provider LLM Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GOOGLE_AI_MODEL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  LLM_ROUTING_STRATEGY: z
    .enum(['cost-optimized', 'quality-optimized', 'latency-optimized', 'air-gapped'])
    .optional(),

  // GitLab Integration (optional)
  GITLAB_ACCESS_TOKEN: z.string().optional(),
  GITLAB_BASE_URL: z.string().optional(),

  // Bitbucket Integration (optional)
  BITBUCKET_ACCESS_TOKEN: z.string().optional(),
  BITBUCKET_BASE_URL: z.string().optional(),

  // Session
  SESSION_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

const fieldHelp: Record<string, string> = {
  DATABASE_URL:
    'PostgreSQL connection string. Start Postgres: docker compose -f docker/docker-compose.yml up -d',
  REDIS_URL:
    'Redis connection string. Start Redis: docker compose -f docker/docker-compose.yml up -d',
  SESSION_SECRET:
    "Must be ≥ 32 characters. Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  GITHUB_APP_ID:
    'Your GitHub App ID. Create one at https://github.com/settings/apps (optional for local dev)',
  GITHUB_APP_PRIVATE_KEY: 'GitHub App private key (PEM format). See README.md#github-app-setup',
  GITHUB_WEBHOOK_SECRET: 'GitHub webhook secret. See README.md#github-app-setup',
  GITHUB_CLIENT_ID: 'GitHub App OAuth client ID. See README.md#github-app-setup',
  GITHUB_CLIENT_SECRET: 'GitHub App OAuth client secret. See README.md#github-app-setup',
};

function formatConfigErrors(error: z.ZodError): string {
  const lines = [
    '\n╔══════════════════════════════════════════════════╗',
    '║     PRFlow — Environment Configuration Error     ║',
    '╚══════════════════════════════════════════════════╝\n',
  ];

  for (const issue of error.issues) {
    const field = issue.path.join('.');
    const help = fieldHelp[field];
    lines.push(`  ✗ ${field}: ${issue.message}`);
    if (help) {
      lines.push(`    → ${help}`);
    }
    lines.push('');
  }

  lines.push('  Tip: Copy the example config and edit as needed:');
  lines.push('    cp .env.example .env\n');

  return lines.join('\n');
}

export function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(formatConfigErrors(result.error));
    throw new Error('Invalid environment configuration — see details above');
  }

  return result.data;
}

export function loadConfigSafe(): Partial<Env> {
  return envSchema.partial().parse(process.env);
}

export function isGitHubConfigured(env: Partial<Env>): boolean {
  return !!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_WEBHOOK_SECRET);
}

export const config = {
  get env(): Env {
    return loadConfig();
  },
};
