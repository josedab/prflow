import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { logger } from './logger.js';
import {
  PRFlowError,
  ValidationError,
  RateLimitError,
  isPRFlowError,
} from './errors.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

/**
 * Setup global error handling for Fastify
 */
export function setupErrorHandler(app: FastifyInstance): void {
  // Add request ID to all requests
  app.addHook('onRequest', async (request) => {
    request.requestId = request.headers['x-request-id'] as string || crypto.randomUUID();
  });

  // Global error handler
  app.setErrorHandler(async (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;

    // Handle PRFlow custom errors
    if (isPRFlowError(error)) {
      const prflowError = error as PRFlowError;
      
      logger.warn({
        requestId,
        error: prflowError.code,
        message: prflowError.message,
        details: prflowError.details,
        path: request.url,
        method: request.method,
      }, 'Application error');

      const response: ErrorResponse = {
        error: {
          code: prflowError.code,
          message: prflowError.message,
          details: prflowError.details,
          requestId,
        },
      };

      // Add retry-after header for rate limit errors
      if (error instanceof RateLimitError && error.retryAfter) {
        reply.header('Retry-After', error.retryAfter);
      }

      return reply.status(prflowError.statusCode).send(response);
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const validationError = new ValidationError(
        'Validation failed',
        undefined,
        {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        }
      );

      logger.warn({
        requestId,
        error: 'VALIDATION_ERROR',
        issues: error.issues,
        path: request.url,
        method: request.method,
      }, 'Validation error');

      return reply.status(400).send({
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
          requestId,
        },
      });
    }

    // Handle Fastify specific errors
    if ('statusCode' in error && typeof (error as FastifyError).statusCode === 'number') {
      const fastifyError = error as FastifyError;
      const statusCode = fastifyError.statusCode || 500;

      // Map common status codes to appropriate error types
      let code = 'INTERNAL_ERROR';
      if (statusCode === 400) code = 'BAD_REQUEST';
      else if (statusCode === 401) code = 'UNAUTHORIZED';
      else if (statusCode === 403) code = 'FORBIDDEN';
      else if (statusCode === 404) code = 'NOT_FOUND';
      else if (statusCode === 429) code = 'RATE_LIMITED';
      else if (statusCode >= 500) code = 'INTERNAL_ERROR';

      logger.warn({
        requestId,
        error: code,
        message: fastifyError.message,
        statusCode,
        path: request.url,
        method: request.method,
      }, 'Fastify error');

      return reply.status(statusCode).send({
        error: {
          code,
          message: fastifyError.message,
          requestId,
        },
      });
    }

    // Handle unknown errors
    logger.error({
      requestId,
      error: error.message,
      stack: error.stack,
      path: request.url,
      method: request.method,
    }, 'Unhandled error');

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
        requestId,
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (request, reply) => {
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;
    
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId,
      },
    });
  });
}

// Extend FastifyRequest to include requestId
declare module 'fastify' {
  interface FastifyRequest {
    requestId?: string;
  }
}
