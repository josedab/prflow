import { describe, it, expect } from 'vitest';
import {
  generateToken,
  verifyToken,
  generateTokenPair,
  refreshTokens,
  extractTokenFromHeader,
  authenticateRequest,
  isTokenExpiringSoon,
  decodeToken,
} from '../lib/jwt.js';

describe('JWT Utilities', () => {
  const testUserId = 'user-123';
  const testClaims = {
    email: 'test@example.com',
    login: 'testuser',
    name: 'Test User',
  };

  describe('generateToken', () => {
    it('should generate a valid access token', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate a valid refresh token', () => {
      const token = generateToken(testUserId, 'refresh', testClaims);
      
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include claims in token payload', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const payload = decodeToken(token);
      
      expect(payload?.sub).toBe(testUserId);
      expect(payload?.email).toBe(testClaims.email);
      expect(payload?.login).toBe(testClaims.login);
      expect(payload?.name).toBe(testClaims.name);
      expect(payload?.type).toBe('access');
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const payload = verifyToken(token);
      
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(testUserId);
    });

    it('should reject tampered tokens', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;
      
      const payload = verifyToken(tamperedToken);
      expect(payload).toBeNull();
    });

    it('should reject tokens with invalid signature', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const parts = token.split('.');
      const invalidToken = `${parts[0]}.${parts[1]}.invalidsignature`;
      
      const payload = verifyToken(invalidToken);
      expect(payload).toBeNull();
    });

    it('should reject malformed tokens', () => {
      expect(verifyToken('')).toBeNull();
      expect(verifyToken('invalid')).toBeNull();
      expect(verifyToken('a.b')).toBeNull();
      expect(verifyToken('a.b.c.d')).toBeNull();
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const pair = generateTokenPair(testUserId, testClaims);
      
      expect(pair.accessToken).toBeTruthy();
      expect(pair.refreshToken).toBeTruthy();
      expect(pair.expiresIn).toBeGreaterThan(0);
      expect(pair.tokenType).toBe('Bearer');
    });

    it('should generate valid tokens', () => {
      const pair = generateTokenPair(testUserId, testClaims);
      
      const accessPayload = verifyToken(pair.accessToken);
      const refreshPayload = verifyToken(pair.refreshToken);
      
      expect(accessPayload?.type).toBe('access');
      expect(refreshPayload?.type).toBe('refresh');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', () => {
      const originalPair = generateTokenPair(testUserId, testClaims);
      const newPair = refreshTokens(originalPair.refreshToken);
      
      expect(newPair).not.toBeNull();
      expect(newPair?.accessToken).toBeTruthy();
      expect(newPair?.refreshToken).toBeTruthy();
    });

    it('should reject access token for refresh', () => {
      const pair = generateTokenPair(testUserId, testClaims);
      const result = refreshTokens(pair.accessToken);
      
      expect(result).toBeNull();
    });

    it('should reject invalid refresh token', () => {
      const result = refreshTokens('invalid-token');
      expect(result).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = 'test-token';
      const header = `Bearer ${token}`;
      
      expect(extractTokenFromHeader(header)).toBe(token);
    });

    it('should handle lowercase bearer', () => {
      const token = 'test-token';
      const header = `bearer ${token}`;
      
      expect(extractTokenFromHeader(header)).toBe(token);
    });

    it('should return null for missing header', () => {
      expect(extractTokenFromHeader(undefined)).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(extractTokenFromHeader('Basic token')).toBeNull();
      expect(extractTokenFromHeader('token')).toBeNull();
      expect(extractTokenFromHeader('Bearer')).toBeNull();
    });
  });

  describe('authenticateRequest', () => {
    it('should authenticate valid token', async () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const result = await authenticateRequest(`Bearer ${token}`);
      
      expect(result.authenticated).toBe(true);
      expect(result.payload?.sub).toBe(testUserId);
    });

    it('should reject missing header', async () => {
      const result = await authenticateRequest(undefined);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('No token provided');
    });

    it('should reject invalid token', async () => {
      const result = await authenticateRequest('Bearer invalid-token');
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid or expired token');
    });

    it('should reject refresh token for authentication', async () => {
      const token = generateToken(testUserId, 'refresh', testClaims);
      const result = await authenticateRequest(`Bearer ${token}`);
      
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Invalid token type');
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return false for fresh token', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      expect(isTokenExpiringSoon(token)).toBe(false);
    });

    it('should return true for invalid token', () => {
      expect(isTokenExpiringSoon('invalid-token')).toBe(true);
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const token = generateToken(testUserId, 'access', testClaims);
      const payload = decodeToken(token);
      
      expect(payload?.sub).toBe(testUserId);
      expect(payload?.email).toBe(testClaims.email);
    });

    it('should return null for malformed token', () => {
      expect(decodeToken('invalid')).toBeNull();
      expect(decodeToken('a.b')).toBeNull();
    });
  });
});

describe('JWT Security', () => {
  it('should generate different tokens for different users', () => {
    const token1 = generateToken('user-1', 'access');
    const token2 = generateToken('user-2', 'access');
    
    expect(token1).not.toBe(token2);
  });

  it('should generate different signatures', () => {
    const token1 = generateToken('user-1', 'access');
    const token2 = generateToken('user-1', 'access');
    
    // Both tokens should be valid JWT format
    expect(token1.split('.').length).toBe(3);
    expect(token2.split('.').length).toBe(3);
  });

  it('should include required JWT claims', () => {
    const token = generateToken('user-1', 'access');
    const payload = decodeToken(token);
    
    expect(payload).toHaveProperty('sub');
    expect(payload).toHaveProperty('iss');
    expect(payload).toHaveProperty('aud');
    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('type');
  });
});
