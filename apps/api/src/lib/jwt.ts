import crypto from 'crypto';
import { logger } from './logger.js';

// JWT Configuration - JWT_SECRET is required in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  logger.warn('JWT_SECRET not set - using random secret. Sessions will not persist across restarts.');
}
const jwtSecret = JWT_SECRET || crypto.randomBytes(32).toString('hex');

const JWT_ISSUER = process.env.JWT_ISSUER || 'prflow';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'prflow-api';
const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

export interface JWTPayload {
  sub: string; // User ID
  iss: string; // Issuer
  aud: string; // Audience
  exp: number; // Expiration timestamp
  iat: number; // Issued at timestamp
  type: 'access' | 'refresh';
  email?: string;
  login?: string;
  name?: string;
  roles?: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// Base64URL encoding/decoding
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(data: string): string {
  const padded = data + '='.repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

// Create HMAC signature
function createSignature(header: string, payload: string): string {
  const data = `${header}.${payload}`;
  const hmac = crypto.createHmac('sha256', jwtSecret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest('base64'));
}

// Verify signature
function verifySignature(header: string, payload: string, signature: string): boolean {
  const expectedSignature = createSignature(header, payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Generate a JWT token
 */
export function generateToken(
  userId: string,
  type: 'access' | 'refresh',
  additionalClaims: Partial<Pick<JWTPayload, 'email' | 'login' | 'name' | 'roles'>> = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const expiry = type === 'access' ? ACCESS_TOKEN_EXPIRY : REFRESH_TOKEN_EXPIRY;

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: JWTPayload = {
    sub: userId,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    exp: now + expiry,
    iat: now,
    type,
    ...additionalClaims,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(headerEncoded, payloadEncoded);

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.debug('Invalid JWT format');
      return null;
    }

    const [headerEncoded, payloadEncoded, signature] = parts;

    // Verify signature
    if (!verifySignature(headerEncoded, payloadEncoded, signature)) {
      logger.debug('Invalid JWT signature');
      return null;
    }

    // Decode payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadEncoded));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      logger.debug('JWT token expired');
      return null;
    }

    // Check issuer and audience
    if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
      logger.debug('Invalid JWT issuer or audience');
      return null;
    }

    return payload;
  } catch (error) {
    logger.error({ error }, 'Failed to verify JWT');
    return null;
  }
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(
  userId: string,
  claims: Partial<Pick<JWTPayload, 'email' | 'login' | 'name' | 'roles'>> = {}
): TokenPair {
  return {
    accessToken: generateToken(userId, 'access', claims),
    refreshToken: generateToken(userId, 'refresh', claims),
    expiresIn: ACCESS_TOKEN_EXPIRY,
    tokenType: 'Bearer',
  };
}

/**
 * Refresh tokens using a valid refresh token
 */
export function refreshTokens(refreshToken: string): TokenPair | null {
  const payload = verifyToken(refreshToken);
  
  if (!payload) {
    return null;
  }

  if (payload.type !== 'refresh') {
    logger.debug('Token is not a refresh token');
    return null;
  }

  return generateTokenPair(payload.sub, {
    email: payload.email,
    login: payload.login,
    name: payload.name,
    roles: payload.roles,
  });
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware-style function to authenticate requests
 */
export async function authenticateRequest(
  authHeader: string | undefined
): Promise<{ authenticated: boolean; payload?: JWTPayload; error?: string }> {
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return { authenticated: false, error: 'No token provided' };
  }

  const payload = verifyToken(token);
  
  if (!payload) {
    return { authenticated: false, error: 'Invalid or expired token' };
  }

  if (payload.type !== 'access') {
    return { authenticated: false, error: 'Invalid token type' };
  }

  return { authenticated: true, payload };
}

/**
 * Check if a token is about to expire (within 5 minutes)
 */
export function isTokenExpiringSoon(token: string): boolean {
  const payload = verifyToken(token);
  if (!payload) return true;

  const now = Math.floor(Date.now() / 1000);
  const fiveMinutes = 5 * 60;
  
  return payload.exp - now < fiveMinutes;
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}
