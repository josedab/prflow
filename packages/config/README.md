# @prflow/config

Configuration management for PRFlow with runtime validation.

## Installation

This is an internal package. It's automatically available in the monorepo workspace:

```typescript
import { loadConfig, loadConfigSafe, type Config } from '@prflow/config';
```

## Features

- **Environment Variable Loading**: Reads from process.env
- **Runtime Validation**: Uses Zod for type-safe validation
- **Safe Loading**: Returns undefined instead of throwing
- **Type Safety**: Full TypeScript support

## Usage

### Loading Configuration

```typescript
import { loadConfig, loadConfigSafe } from '@prflow/config';

// Throws if required variables are missing
const config = loadConfig();

// Returns undefined if invalid
const configSafe = loadConfigSafe();
if (!configSafe) {
  console.error('Invalid configuration');
  process.exit(1);
}
```

### Accessing Config Values

```typescript
import { loadConfig } from '@prflow/config';

const config = loadConfig();

// Application
console.log(config.NODE_ENV);       // 'development' | 'production' | 'test'
console.log(config.PORT);           // number
console.log(config.LOG_LEVEL);      // 'debug' | 'info' | 'warn' | 'error'

// Database
console.log(config.DATABASE_URL);   // PostgreSQL connection string

// Redis
console.log(config.REDIS_URL);      // Redis connection string

// GitHub App
console.log(config.GITHUB_APP_ID);
console.log(config.GITHUB_APP_PRIVATE_KEY);
console.log(config.GITHUB_WEBHOOK_SECRET);
console.log(config.GITHUB_CLIENT_ID);
console.log(config.GITHUB_CLIENT_SECRET);

// Copilot SDK
console.log(config.COPILOT_API_KEY);

// Session
console.log(config.SESSION_SECRET);

// URLs
console.log(config.API_URL);
console.log(config.DASHBOARD_URL);
```

## Configuration Schema

```typescript
interface Config {
  // Application
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';

  // Database
  DATABASE_URL: string;

  // Redis
  REDIS_URL: string;

  // GitHub App (required)
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;

  // Copilot SDK (optional)
  COPILOT_API_KEY?: string;

  // Session
  SESSION_SECRET: string;

  // URLs (optional, have defaults)
  API_URL?: string;
  DASHBOARD_URL?: string;
}
```

## Environment Variables

Create a `.env` file in the project root:

```bash
# Application
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://prflow:prflow@localhost:5432/prflow

# Redis
REDIS_URL=redis://localhost:6379

# GitHub App
GITHUB_APP_ID=your-app-id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Copilot SDK
COPILOT_API_KEY=your-copilot-api-key

# Session
SESSION_SECRET=your-session-secret-at-least-32-chars

# URLs
API_URL=http://localhost:3001
DASHBOARD_URL=http://localhost:3000
```

## Validation

The configuration is validated at load time using Zod:

```typescript
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  COPILOT_API_KEY: z.string().optional(),

  SESSION_SECRET: z.string().min(32),

  API_URL: z.string().url().optional(),
  DASHBOARD_URL: z.string().url().optional(),
});
```

## Error Handling

```typescript
import { loadConfig } from '@prflow/config';

try {
  const config = loadConfig();
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Configuration validation failed:');
    error.errors.forEach(e => {
      console.error(`  ${e.path.join('.')}: ${e.message}`);
    });
  }
  process.exit(1);
}
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Lint
pnpm lint
```

## Dependencies

- `zod` - Schema validation
