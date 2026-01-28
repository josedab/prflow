import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { authenticateRequest, type JWTPayload } from './jwt.js';
import { AuthenticationError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      login?: string;
      email?: string;
      name?: string;
      roles?: string[];
    };
    jwtPayload?: JWTPayload;
  }
}

/**
 * Authentication middleware that verifies JWT tokens
 * and attaches user information to the request
 */
export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;

  const authResult = await authenticateRequest(authHeader);

  if (!authResult.authenticated || !authResult.payload) {
    const error = new AuthenticationError(authResult.error || 'Authentication required');
    return reply.status(error.statusCode).send(error.toJSON());
  }

  // Attach user info to request
  request.user = {
    id: authResult.payload.sub,
    login: authResult.payload.login,
    email: authResult.payload.email,
    name: authResult.payload.name,
    roles: authResult.payload.roles,
  };
  request.jwtPayload = authResult.payload;
};

/**
 * Optional authentication middleware - continues even if auth fails
 * but attaches user info if auth succeeds
 */
export const optionalAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return;
  }

  const authResult = await authenticateRequest(authHeader);

  if (authResult.authenticated && authResult.payload) {
    request.user = {
      id: authResult.payload.sub,
      login: authResult.payload.login,
      email: authResult.payload.email,
      name: authResult.payload.name,
      roles: authResult.payload.roles,
    };
    request.jwtPayload = authResult.payload;
  }
};

/**
 * Role-based authorization middleware
 * Must be used after requireAuth
 */
export function requireRole(...allowedRoles: string[]): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      const error = new AuthenticationError('Authentication required');
      return reply.status(error.statusCode).send(error.toJSON());
    }

    const userRoles = request.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          requiredRoles: allowedRoles,
        },
      });
    }
  };
}
