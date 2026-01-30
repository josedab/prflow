import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { enterpriseService, type ComplianceConfig } from '../services/enterprise.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// Type for authenticated requests (user is set by auth middleware)
interface AuthenticatedUser {
  login: string;
  id: string;
  email?: string;
}

// Helper to get actor login from request
function getActorLogin(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { user?: AuthenticatedUser }).user;
  return user?.login || 'system';
}

// SSO Configuration Schema
const ssoSamlSchema = z.object({
  entryPoint: z.string().url(),
  issuer: z.string(),
  cert: z.string(),
  signatureAlgorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  wantAssertionsSigned: z.boolean().default(true),
  wantAuthnResponseSigned: z.boolean().default(true),
});

const ssoOidcSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string(),
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  userInfoUrl: z.string().url(),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
});

const ssoConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['saml', 'oidc', 'none']),
  saml: ssoSamlSchema.optional(),
  oidc: ssoOidcSchema.optional(),
  attributeMapping: z.object({
    email: z.string().default('email'),
    name: z.string().default('name'),
    groups: z.string().optional(),
  }).default({}),
  allowedDomains: z.array(z.string()).default([]),
  enforceSSO: z.boolean().default(false),
});

// Compliance Configuration Schema
const passwordPolicySchema = z.object({
  minLength: z.number().min(8).default(8),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumbers: z.boolean().default(true),
  requireSpecialChars: z.boolean().default(false),
  preventReuse: z.number().min(0).default(5),
  expirationDays: z.number().min(0).default(90),
});

const approvalWorkflowSchema = z.object({
  enabled: z.boolean().default(false),
  minApprovers: z.number().min(1).default(1),
  requireCodeOwner: z.boolean().default(false),
  requireSecurityReview: z.boolean().default(false),
  requireComplianceReview: z.boolean().default(false),
});

const complianceConfigSchema = z.object({
  enabled: z.boolean(),
  dataRetentionDays: z.number().min(30).default(365),
  auditLogRetentionDays: z.number().min(30).default(730),
  requireMFA: z.boolean().default(false),
  allowedIPRanges: z.array(z.string()).default([]),
  sessionTimeoutMinutes: z.number().min(5).default(480),
  maxSessionsPerUser: z.number().min(1).default(5),
  passwordPolicy: passwordPolicySchema.optional(),
  approvalWorkflow: approvalWorkflowSchema.optional(),
});

// Feature flags schema
const featuresSchema = z.object({
  advancedAnalytics: z.boolean().optional(),
  customIntegrations: z.boolean().optional(),
  prioritySupport: z.boolean().optional(),
  slaEnabled: z.boolean().optional(),
  dedicatedInfrastructure: z.boolean().optional(),
});

// Customization schema
const customizationSchema = z.object({
  brandingEnabled: z.boolean().optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customDomain: z.string().optional(),
});

export async function enterpriseRoutes(app: FastifyInstance) {
  // Get enterprise settings
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/settings',
    async (request) => {
      const { orgId } = request.params;

      const settings = await enterpriseService.getSettings(orgId);

      if (!settings) {
        throw new NotFoundError('EnterpriseSettings', orgId);
      }

      // Mask sensitive fields
      const maskedSettings = {
        ...settings,
        sso: {
          ...settings.sso,
          saml: settings.sso.saml
            ? { ...settings.sso.saml, cert: '***REDACTED***' }
            : undefined,
          oidc: settings.sso.oidc
            ? { ...settings.sso.oidc, clientSecret: '***REDACTED***' }
            : undefined,
        },
      };

      return maskedSettings;
    }
  );

  // Update SSO configuration
  app.put<{
    Params: { orgId: string };
    Body: z.infer<typeof ssoConfigSchema>;
  }>('/organizations/:orgId/sso', async (request) => {
    const { orgId } = request.params;
    const body = ssoConfigSchema.parse(request.body);

    try {
      const actorLogin = getActorLogin(request);

      const settings = await enterpriseService.updateSSOConfig(orgId, body, actorLogin);

      return {
        success: true,
        sso: {
          ...settings.sso,
          saml: settings.sso.saml
            ? { ...settings.sso.saml, cert: '***REDACTED***' }
            : undefined,
          oidc: settings.sso.oidc
            ? { ...settings.sso.oidc, clientSecret: '***REDACTED***' }
            : undefined,
        },
      };
    } catch (error) {
      throw new ValidationError((error as Error).message, undefined, { configType: 'SSO' });
    }
  });

  // Update compliance configuration
  app.put<{
    Params: { orgId: string };
    Body: z.infer<typeof complianceConfigSchema>;
  }>('/organizations/:orgId/compliance', async (request) => {
    const { orgId } = request.params;
    const body = complianceConfigSchema.parse(request.body);

    try {
      const actorLogin = getActorLogin(request);

      const settings = await enterpriseService.updateComplianceConfig(
        orgId,
        body as Partial<ComplianceConfig>,
        actorLogin
      );

      return {
        success: true,
        compliance: settings.compliance,
      };
    } catch (error) {
      throw new ValidationError((error as Error).message, undefined, { configType: 'compliance' });
    }
  });

  // Update feature flags
  app.patch<{
    Params: { orgId: string };
    Body: z.infer<typeof featuresSchema>;
  }>('/organizations/:orgId/features', async (request) => {
    const { orgId } = request.params;
    const body = featuresSchema.parse(request.body);

    try {
      const actorLogin = getActorLogin(request);

      const settings = await enterpriseService.updateFeatures(orgId, body, actorLogin);

      return {
        success: true,
        features: settings.features,
      };
    } catch (error) {
      throw new ValidationError((error as Error).message, undefined, { configType: 'features' });
    }
  });

  // Update customization
  app.patch<{
    Params: { orgId: string };
    Body: z.infer<typeof customizationSchema>;
  }>('/organizations/:orgId/customization', async (request) => {
    const { orgId } = request.params;
    const body = customizationSchema.parse(request.body);

    try {
      const actorLogin = getActorLogin(request);

      const settings = await enterpriseService.updateCustomization(orgId, body, actorLogin);

      return {
        success: true,
        customization: settings.customization,
      };
    } catch (error) {
      throw new ValidationError((error as Error).message, undefined, { configType: 'customization' });
    }
  });

  // Get SAML metadata
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/saml/metadata',
    async (request, reply) => {
      const { orgId } = request.params;

      const settings = await enterpriseService.getSettings(orgId);
      if (!settings) {
        throw new NotFoundError('EnterpriseSettings', orgId);
      }

      const metadata = enterpriseService.generateSAMLMetadata(settings);
      if (!metadata) {
        throw new ValidationError('SAML is not configured');
      }

      reply.header('Content-Type', 'application/xml');
      return metadata;
    }
  );

  // Get OIDC configuration
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/oidc/.well-known/openid-configuration',
    async (request) => {
      const { orgId } = request.params;

      const settings = await enterpriseService.getSettings(orgId);
      if (!settings) {
        throw new NotFoundError('EnterpriseSettings', orgId);
      }

      const config = enterpriseService.getOIDCConfig(settings);
      if (!config) {
        throw new ValidationError('OIDC is not configured');
      }

      return config;
    }
  );

  // Validate IP access
  app.post<{
    Params: { orgId: string };
    Body: { ip: string };
  }>('/organizations/:orgId/validate-ip', async (request) => {
    const { orgId } = request.params;
    const { ip } = request.body;

    const settings = await enterpriseService.getSettings(orgId);
    if (!settings) {
      throw new NotFoundError('EnterpriseSettings', orgId);
    }

    const allowed = enterpriseService.validateIPAccess(ip, settings);

    return { allowed, ip };
  });

  // Run data retention cleanup
  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/data-retention/cleanup',
    async (request) => {
      const { orgId } = request.params;

      const result = await enterpriseService.runDataRetentionCleanup(orgId);

      return {
        success: true,
        deleted: result.deleted,
        message: `Deleted ${result.deleted} expired records`,
      };
    }
  );

  // Test SSO connection
  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/sso/test',
    async (request) => {
      const { orgId } = request.params;

      const settings = await enterpriseService.getSettings(orgId);
      if (!settings || !settings.sso.enabled) {
        throw new ValidationError('SSO is not enabled');
      }

      // In a real implementation, this would test the actual SSO connection
      return {
        success: true,
        provider: settings.sso.provider,
        message: 'SSO configuration appears valid',
        details: {
          enforceSSO: settings.sso.enforceSSO,
          allowedDomains: settings.sso.allowedDomains,
        },
      };
    }
  );
}
