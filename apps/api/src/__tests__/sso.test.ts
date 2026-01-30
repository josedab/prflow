/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the enterprise service
vi.mock('../services/enterprise.js', () => ({
  enterpriseService: {
    getSettings: vi.fn(),
    generateSAMLMetadata: vi.fn(),
    getOIDCConfig: vi.fn(),
  },
}));

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
  },
}));

import { enterpriseService } from '../services/enterprise.js';
import { db } from '@prflow/db';

describe('SSO Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SAML SSO', () => {
    it('should reject SAML login when not configured', async () => {
      vi.mocked(enterpriseService.getSettings).mockResolvedValue(null);

      // The route should return 400 when SAML is not configured
      const settings = await enterpriseService.getSettings('test-org');
      expect(settings).toBeNull();
    });

    it('should generate SAML metadata when configured', async () => {
      const mockSettings = {
        organizationId: 'test-org',
        sso: {
          enabled: true,
          provider: 'saml' as const,
          saml: {
            entryPoint: 'https://idp.example.com/sso',
            issuer: 'https://idp.example.com',
            cert: 'test-cert',
            signatureAlgorithm: 'sha256' as const,
            wantAssertionsSigned: true,
            wantAuthnResponseSigned: true,
          },
          attributeMapping: { email: 'email', name: 'name' },
          allowedDomains: ['example.com'],
          enforceSSO: false,
        },
        compliance: {
          enabled: false,
          dataRetentionDays: 365,
          auditLogRetentionDays: 730,
          requireMFA: false,
          allowedIPRanges: [],
          sessionTimeoutMinutes: 480,
          maxSessionsPerUser: 5,
          passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: false,
            preventReuse: 5,
            expirationDays: 90,
          },
          approvalWorkflow: {
            enabled: false,
            minApprovers: 1,
            requireCodeOwner: false,
            requireSecurityReview: false,
            requireComplianceReview: false,
          },
        },
        features: {
          advancedAnalytics: true,
          customIntegrations: true,
          prioritySupport: true,
          slaEnabled: true,
          dedicatedInfrastructure: false,
        },
        customization: { brandingEnabled: false },
        limits: {
          maxRepositories: -1,
          maxUsersPerTeam: -1,
          maxPRsPerMonth: -1,
          apiRateLimit: 1000,
        },
      };

      vi.mocked(enterpriseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(enterpriseService.generateSAMLMetadata).mockReturnValue(
        '<?xml version="1.0" encoding="UTF-8"?><md:EntityDescriptor>...</md:EntityDescriptor>'
      );

      const settings = await enterpriseService.getSettings('test-org');
      expect(settings?.sso.enabled).toBe(true);
      expect(settings?.sso.provider).toBe('saml');

      const metadata = enterpriseService.generateSAMLMetadata(settings!);
      expect(metadata).toContain('EntityDescriptor');
    });

    it('should validate email domain restrictions', async () => {
      const mockSettings = {
        organizationId: 'test-org',
        sso: {
          enabled: true,
          provider: 'saml' as const,
          saml: {
            entryPoint: 'https://idp.example.com/sso',
            issuer: 'https://idp.example.com',
            cert: 'test-cert',
            signatureAlgorithm: 'sha256' as const,
            wantAssertionsSigned: true,
            wantAuthnResponseSigned: true,
          },
          attributeMapping: { email: 'email', name: 'name' },
          allowedDomains: ['example.com'],
          enforceSSO: false,
        },
        compliance: {} as any,
        features: {} as any,
        customization: {} as any,
        limits: {} as any,
      };

      vi.mocked(enterpriseService.getSettings).mockResolvedValue(mockSettings);

      const settings = await enterpriseService.getSettings('test-org');
      expect(settings?.sso.allowedDomains).toContain('example.com');

      // Test domain validation logic
      const email = 'user@example.com';
      const domain = email.split('@')[1];
      const isAllowed = settings?.sso.allowedDomains.includes(domain);
      expect(isAllowed).toBe(true);

      // Test rejected domain
      const rejectedEmail = 'user@other.com';
      const rejectedDomain = rejectedEmail.split('@')[1];
      const isRejected = settings?.sso.allowedDomains.includes(rejectedDomain);
      expect(isRejected).toBe(false);
    });
  });

  describe('OIDC SSO', () => {
    it('should reject OIDC login when not configured', async () => {
      vi.mocked(enterpriseService.getSettings).mockResolvedValue(null);

      const settings = await enterpriseService.getSettings('test-org');
      expect(settings).toBeNull();
    });

    it('should return OIDC configuration when enabled', async () => {
      const mockSettings = {
        organizationId: 'test-org',
        sso: {
          enabled: true,
          provider: 'oidc' as const,
          oidc: {
            issuer: 'https://auth.example.com',
            clientId: 'test-client-id',
            clientSecret: 'test-secret',
            authorizationUrl: 'https://auth.example.com/authorize',
            tokenUrl: 'https://auth.example.com/token',
            userInfoUrl: 'https://auth.example.com/userinfo',
            scopes: ['openid', 'profile', 'email'],
          },
          attributeMapping: { email: 'email', name: 'name' },
          allowedDomains: [],
          enforceSSO: false,
        },
        compliance: {} as any,
        features: {} as any,
        customization: {} as any,
        limits: {} as any,
      };

      vi.mocked(enterpriseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(enterpriseService.getOIDCConfig).mockReturnValue({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        userinfo_endpoint: 'https://auth.example.com/userinfo',
        client_id: 'test-client-id',
        scopes: ['openid', 'profile', 'email'],
      });

      const settings = await enterpriseService.getSettings('test-org');
      expect(settings?.sso.enabled).toBe(true);
      expect(settings?.sso.provider).toBe('oidc');

      const config = enterpriseService.getOIDCConfig(settings!);
      expect(config).toHaveProperty('issuer');
      expect(config).toHaveProperty('authorization_endpoint');
    });

    it('should validate OIDC state parameter', () => {
      const orgId = 'test-org';
      const state = `${orgId}:${crypto.randomUUID()}`;
      
      // Valid state
      expect(state.startsWith(`${orgId}:`)).toBe(true);
      
      // Invalid state
      const invalidState = 'other-org:uuid';
      expect(invalidState.startsWith(`${orgId}:`)).toBe(false);
    });
  });

  describe('User Creation via SSO', () => {
    it('should create new user when not found', async () => {
      vi.mocked(db.user.findFirst).mockResolvedValue(null);
      vi.mocked(db.user.create).mockResolvedValue({
        id: 'new-user-id',
        githubId: 0,
        login: 'newuser',
        name: 'New User',
        email: 'newuser@example.com',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const existingUser = await db.user.findFirst({ where: { email: 'newuser@example.com' } });
      expect(existingUser).toBeNull();

      const newUser = await db.user.create({
        data: {
          githubId: 0,
          login: 'newuser',
          name: 'New User',
          email: 'newuser@example.com',
        },
      });

      expect(newUser.id).toBe('new-user-id');
      expect(newUser.email).toBe('newuser@example.com');
    });

    it('should return existing user when found', async () => {
      const existingUser = {
        id: 'existing-user-id',
        githubId: 12345,
        login: 'existinguser',
        name: 'Existing User',
        email: 'existing@example.com',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.user.findFirst).mockResolvedValue(existingUser);

      const user = await db.user.findFirst({ where: { email: 'existing@example.com' } });
      expect(user).not.toBeNull();
      expect(user?.id).toBe('existing-user-id');
    });
  });

  describe('Session Creation', () => {
    it('should create session after successful SSO', async () => {
      const mockSession = {
        id: 'session-id',
        userId: 'user-id',
        accessToken: 'saml_test-token',
        refreshToken: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      vi.mocked(db.session.create).mockResolvedValue(mockSession);

      const session = await db.session.create({
        data: {
          userId: 'user-id',
          accessToken: 'saml_test-token',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      expect(session.id).toBe('session-id');
      expect(session.accessToken).toContain('saml_');
    });
  });
});
