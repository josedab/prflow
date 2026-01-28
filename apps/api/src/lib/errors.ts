/**
 * Custom error classes for PRFlow application
 */

export class PRFlowError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PRFlowError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export class NotFoundError extends PRFlowError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier ? `${resource} '${identifier}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, identifier }
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends PRFlowError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, { field, ...details });
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class AuthenticationError extends PRFlowError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends PRFlowError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends PRFlowError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class GitHubAPIError extends PRFlowError {
  public readonly gitHubMessage?: string;
  public readonly gitHubStatus?: number;

  constructor(
    message: string,
    gitHubStatus?: number,
    gitHubMessage?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'GITHUB_API_ERROR', 502, { gitHubStatus, gitHubMessage, ...details });
    this.name = 'GitHubAPIError';
    this.gitHubStatus = gitHubStatus;
    this.gitHubMessage = gitHubMessage;
  }
}

export class LLMError extends PRFlowError {
  public readonly provider?: string;
  public readonly originalError?: Error;

  constructor(message: string, provider?: string, originalError?: Error) {
    super(message, 'LLM_ERROR', 503, {
      provider,
      originalMessage: originalError?.message,
    });
    this.name = 'LLMError';
    this.provider = provider;
    this.originalError = originalError;
  }
}

export class DatabaseError extends PRFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class QueueError extends PRFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'QUEUE_ERROR', 500, details);
    this.name = 'QueueError';
  }
}

export class ConflictError extends PRFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT_ERROR', 409, details);
    this.name = 'ConflictError';
  }
}

export class BadRequestError extends PRFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BAD_REQUEST', 400, details);
    this.name = 'BadRequestError';
  }
}

export class WebhookError extends PRFlowError {
  public readonly event?: string;
  public readonly deliveryId?: string;

  constructor(message: string, event?: string, deliveryId?: string) {
    super(message, 'WEBHOOK_ERROR', 400, { event, deliveryId });
    this.name = 'WebhookError';
    this.event = event;
    this.deliveryId = deliveryId;
  }
}

export class AgentError extends PRFlowError {
  public readonly agentName: string;
  public readonly agentInput?: Record<string, unknown>;

  constructor(
    message: string,
    agentName: string,
    agentInput?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message, 'AGENT_ERROR', 500, {
      agentName,
      originalMessage: originalError?.message,
    });
    this.name = 'AgentError';
    this.agentName = agentName;
    this.agentInput = agentInput;
  }
}

export class ConfigurationError extends PRFlowError {
  constructor(message: string, missingConfig?: string[]) {
    super(message, 'CONFIGURATION_ERROR', 500, { missingConfig });
    this.name = 'ConfigurationError';
  }
}

/**
 * Check if an error is a PRFlowError
 */
export function isPRFlowError(error: unknown): error is PRFlowError {
  return error instanceof PRFlowError;
}

/**
 * Convert unknown error to PRFlowError
 */
export function toPRFlowError(error: unknown, defaultMessage?: string): PRFlowError {
  if (isPRFlowError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new PRFlowError(
      error.message || defaultMessage || 'An unexpected error occurred',
      'UNKNOWN_ERROR',
      500,
      { originalName: error.name, stack: error.stack }
    );
  }

  return new PRFlowError(
    defaultMessage || 'An unexpected error occurred',
    'UNKNOWN_ERROR',
    500,
    { originalError: String(error) }
  );
}

/**
 * Error handler for async operations with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Safe async wrapper that returns Result type
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export async function trySafe<T>(fn: () => Promise<T>): Promise<Result<T, PRFlowError>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toPRFlowError(error) };
  }
}

/**
 * Sync version of trySafe
 */
export function trySafeSync<T>(fn: () => T): Result<T, PRFlowError> {
  try {
    const data = fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toPRFlowError(error) };
  }
}
