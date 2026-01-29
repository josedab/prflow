import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { auditLogger } from './audit.js';

// ============================================
// Enterprise Types
// ============================================

export interface SSOConfig {
  enabled: boolean;
  provider: 'saml' | 'oidc' | 'none';
  saml?: {
    entryPoint: string;
    issuer: string;
    cert: string;
    signatureAlgorithm: 'sha256' | 'sha512';
    wantAssertionsSigned: boolean;
    wantAuthnResponseSigned: boolean;
  };
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl: string;
    scopes: string[];
  };
  attributeMapping: {
    email: string;
    name: string;
    groups?: string;
  };
  allowedDomains: string[];
  enforceSSO: boolean; // If true, disables password/OAuth login
}

export interface ComplianceConfig {
  enabled: boolean;
  dataRetentionDays: number;
  auditLogRetentionDays: number;
  requireMFA: boolean;
  allowedIPRanges: string[];
  sessionTimeoutMinutes: number;
  maxSessionsPerUser: number;
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    preventReuse: number;
    expirationDays: number;
  };
  approvalWorkflow: {
    enabled: boolean;
    minApprovers: number;
    requireCodeOwner: boolean;
    requireSecurityReview: boolean;
    requireComplianceReview: boolean;
  };
}

export interface EnterpriseSettings {
  organizationId: string;
  sso: SSOConfig;
  compliance: ComplianceConfig;
  features: {
    advancedAnalytics: boolean;
    customIntegrations: boolean;
    prioritySupport: boolean;
    slaEnabled: boolean;
    dedicatedInfrastructure: boolean;
  };
  customization: {
    brandingEnabled: boolean;
    logoUrl?: string;
    primaryColor?: string;
    customDomain?: string;
  };
  limits: {
    maxRepositories: number;
    maxUsersPerTeam: number;
    maxPRsPerMonth: number;
    apiRateLimit: number;
  };
}

export interface SLAConfig {
  enabled: boolean;
  targets: {
    analysisLatencyMs: number;
    reviewLatencyMs: number;
    uptimePercentage: number;
    supportResponseMinutes: number;
  };
  alerting: {
    enabled: boolean;
    webhookUrl?: string;
    emailRecipients: string[];
  };
}

// Default settings
const DEFAULT_SSO_CONFIG: SSOConfig = {
  enabled: false,
  provider: 'none',
  attributeMapping: {
    email: 'email',
    name: 'name',
  },
  allowedDomains: [],
  enforceSSO: false,
};

const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
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
};

// ============================================
// Enterprise Service
// ============================================

export class EnterpriseService {
  // Get enterprise settings for an organization
  async getSettings(organizationId: string): Promise<EnterpriseSettings | null> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        teams: {
          include: { subscription: true },
        },
      },
    });

    if (!org) {
      return null;
    }

    // Check if any team has enterprise subscription
    const hasEnterprise = org.teams.some(
      (t) => t.subscription?.tier === 'ENTERPRISE' && t.subscription?.status === 'ACTIVE'
    );

    if (!hasEnterprise) {
      return null;
    }

    // Get settings from team.settings JSON field
    const enterpriseTeam = org.teams.find(
      (t) => t.subscription?.tier === 'ENTERPRISE' && t.subscription?.status === 'ACTIVE'
    );

    const settings = (enterpriseTeam?.settings || {}) as Partial<EnterpriseSettings>;

    return {
      organizationId,
      sso: settings.sso || DEFAULT_SSO_CONFIG,
      compliance: settings.compliance || DEFAULT_COMPLIANCE_CONFIG,
      features: settings.features || {
        advancedAnalytics: true,
        customIntegrations: true,
        prioritySupport: true,
        slaEnabled: true,
        dedicatedInfrastructure: false,
      },
      customization: settings.customization || {
        brandingEnabled: false,
      },
      limits: settings.limits || {
        maxRepositories: -1, // Unlimited
        maxUsersPerTeam: -1,
        maxPRsPerMonth: -1,
        apiRateLimit: 1000,
      },
    };
  }

  // Update SSO configuration
  async updateSSOConfig(
    organizationId: string,
    ssoConfig: Partial<SSOConfig>,
    actorLogin: string
  ): Promise<EnterpriseSettings> {
    const settings = await this.getSettings(organizationId);
    if (!settings) {
      throw new Error('Enterprise settings not found');
    }

    const previousConfig = settings.sso;
    const newSSOConfig = { ...settings.sso, ...ssoConfig };

    // Validate SSO config
    this.validateSSOConfig(newSSOConfig);

    // Update in database
    await this.updateTeamSettings(organizationId, { sso: newSSOConfig });

    // Audit log
    await auditLogger.log({
      eventType: 'admin.settings_changed',
      actorLogin,
      organizationId,
      resourceType: 'sso_config',
      resourceId: organizationId,
      success: true,
      data: {
        previousProvider: previousConfig.provider,
        newProvider: newSSOConfig.provider,
        ssoEnabled: newSSOConfig.enabled,
      },
    });

    logger.info(
      { organizationId, provider: newSSOConfig.provider },
      'SSO configuration updated'
    );

    return { ...settings, sso: newSSOConfig };
  }

  // Update compliance configuration
  async updateComplianceConfig(
    organizationId: string,
    complianceConfig: Partial<ComplianceConfig>,
    actorLogin: string
  ): Promise<EnterpriseSettings> {
    const settings = await this.getSettings(organizationId);
    if (!settings) {
      throw new Error('Enterprise settings not found');
    }

    const newComplianceConfig = {
      ...settings.compliance,
      ...complianceConfig,
      passwordPolicy: {
        ...settings.compliance.passwordPolicy,
        ...(complianceConfig.passwordPolicy || {}),
      },
      approvalWorkflow: {
        ...settings.compliance.approvalWorkflow,
        ...(complianceConfig.approvalWorkflow || {}),
      },
    };

    // Validate compliance config
    this.validateComplianceConfig(newComplianceConfig);

    // Update in database
    await this.updateTeamSettings(organizationId, { compliance: newComplianceConfig });

    // Audit log
    await auditLogger.log({
      eventType: 'admin.settings_changed',
      actorLogin,
      organizationId,
      resourceType: 'compliance_config',
      resourceId: organizationId,
      success: true,
      data: {
        complianceEnabled: newComplianceConfig.enabled,
        mfaRequired: newComplianceConfig.requireMFA,
        dataRetentionDays: newComplianceConfig.dataRetentionDays,
      },
    });

    logger.info(
      { organizationId, complianceEnabled: newComplianceConfig.enabled },
      'Compliance configuration updated'
    );

    return { ...settings, compliance: newComplianceConfig };
  }

  // Update feature flags
  async updateFeatures(
    organizationId: string,
    features: Partial<EnterpriseSettings['features']>,
    actorLogin: string
  ): Promise<EnterpriseSettings> {
    const settings = await this.getSettings(organizationId);
    if (!settings) {
      throw new Error('Enterprise settings not found');
    }

    const newFeatures = { ...settings.features, ...features };

    await this.updateTeamSettings(organizationId, { features: newFeatures });

    await auditLogger.log({
      eventType: 'admin.settings_changed',
      actorLogin,
      organizationId,
      resourceType: 'enterprise_features',
      resourceId: organizationId,
      success: true,
      data: { features: newFeatures },
    });

    return { ...settings, features: newFeatures };
  }

  // Update customization settings
  async updateCustomization(
    organizationId: string,
    customization: Partial<EnterpriseSettings['customization']>,
    actorLogin: string
  ): Promise<EnterpriseSettings> {
    const settings = await this.getSettings(organizationId);
    if (!settings) {
      throw new Error('Enterprise settings not found');
    }

    const newCustomization = { ...settings.customization, ...customization };

    await this.updateTeamSettings(organizationId, { customization: newCustomization });

    await auditLogger.log({
      eventType: 'admin.settings_changed',
      actorLogin,
      organizationId,
      resourceType: 'customization',
      resourceId: organizationId,
      success: true,
      data: { customization: newCustomization },
    });

    return { ...settings, customization: newCustomization };
  }

  // Validate IP address against allowed ranges
  validateIPAccess(ip: string, settings: EnterpriseSettings): boolean {
    if (!settings.compliance.enabled || settings.compliance.allowedIPRanges.length === 0) {
      return true; // No restrictions
    }

    return settings.compliance.allowedIPRanges.some((range) => this.ipInRange(ip, range));
  }

  // Check session validity
  async validateSession(
    sessionId: string,
    settings: EnterpriseSettings
  ): Promise<{ valid: boolean; reason?: string }> {
    const session = await db.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      return { valid: false, reason: 'Session expired' };
    }

    // Check timeout (if compliance enabled)
    if (settings.compliance.enabled) {
      const timeoutMs = settings.compliance.sessionTimeoutMinutes * 60 * 1000;
      const lastActivity = session.createdAt; // Would need to track last activity
      if (Date.now() - lastActivity.getTime() > timeoutMs) {
        return { valid: false, reason: 'Session timed out due to inactivity' };
      }

      // Check max sessions per user
      const userSessions = await db.session.count({
        where: {
          userId: session.userId,
          expiresAt: { gt: new Date() },
        },
      });

      if (userSessions > settings.compliance.maxSessionsPerUser) {
        return { valid: false, reason: 'Maximum sessions exceeded' };
      }
    }

    return { valid: true };
  }

  // Generate SAML metadata
  generateSAMLMetadata(settings: EnterpriseSettings): string | null {
    if (!settings.sso.enabled || settings.sso.provider !== 'saml' || !settings.sso.saml) {
      return null;
    }

    const entityId = `https://prflow.io/saml/${settings.organizationId}`;
    const acsUrl = `https://prflow.io/api/auth/saml/callback`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="${settings.sso.saml.wantAssertionsSigned}" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  // Get OIDC configuration
  getOIDCConfig(settings: EnterpriseSettings): object | null {
    if (!settings.sso.enabled || settings.sso.provider !== 'oidc' || !settings.sso.oidc) {
      return null;
    }

    return {
      issuer: settings.sso.oidc.issuer,
      authorization_endpoint: settings.sso.oidc.authorizationUrl,
      token_endpoint: settings.sso.oidc.tokenUrl,
      userinfo_endpoint: settings.sso.oidc.userInfoUrl,
      client_id: settings.sso.oidc.clientId,
      scopes: settings.sso.oidc.scopes,
    };
  }

  // Data retention cleanup
  async runDataRetentionCleanup(organizationId: string): Promise<{ deleted: number }> {
    const settings = await this.getSettings(organizationId);
    if (!settings || !settings.compliance.enabled) {
      return { deleted: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.compliance.dataRetentionDays);

    // Get organization's repositories
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      include: { repositories: true },
    });

    if (!org) {
      return { deleted: 0 };
    }

    const repositoryIds = org.repositories.map((r) => r.id);

    // Delete old workflows and related data
    const result = await db.pRWorkflow.deleteMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { lt: cutoffDate },
      },
    });

    // Delete old audit logs
    const auditCutoff = new Date();
    auditCutoff.setDate(auditCutoff.getDate() - settings.compliance.auditLogRetentionDays);

    await db.analyticsEvent.deleteMany({
      where: {
        repositoryId: { in: repositoryIds },
        eventType: { startsWith: 'audit.' },
        createdAt: { lt: auditCutoff },
      },
    });

    logger.info(
      { organizationId, deletedWorkflows: result.count },
      'Data retention cleanup completed'
    );

    return { deleted: result.count };
  }

  // Private helper methods
  private async updateTeamSettings(
    organizationId: string,
    settingsUpdate: Partial<EnterpriseSettings>
  ): Promise<void> {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        teams: { include: { subscription: true } },
      },
    });

    const enterpriseTeam = org?.teams.find(
      (t) => t.subscription?.tier === 'ENTERPRISE' && t.subscription?.status === 'ACTIVE'
    );

    if (!enterpriseTeam) {
      throw new Error('Enterprise team not found');
    }

    const currentSettings = (enterpriseTeam.settings || {}) as Record<string, unknown>;
    const newSettings = { ...currentSettings, ...settingsUpdate };

    await db.team.update({
      where: { id: enterpriseTeam.id },
      data: { settings: JSON.parse(JSON.stringify(newSettings)) },
    });
  }

  private validateSSOConfig(config: SSOConfig): void {
    if (!config.enabled) return;

    if (config.provider === 'saml' && config.saml) {
      if (!config.saml.entryPoint) {
        throw new Error('SAML entry point URL is required');
      }
      if (!config.saml.issuer) {
        throw new Error('SAML issuer is required');
      }
      if (!config.saml.cert) {
        throw new Error('SAML certificate is required');
      }
    }

    if (config.provider === 'oidc' && config.oidc) {
      if (!config.oidc.issuer) {
        throw new Error('OIDC issuer is required');
      }
      if (!config.oidc.clientId) {
        throw new Error('OIDC client ID is required');
      }
      if (!config.oidc.clientSecret) {
        throw new Error('OIDC client secret is required');
      }
    }

    if (config.enforceSSO && config.allowedDomains.length === 0) {
      throw new Error('Allowed domains must be specified when SSO is enforced');
    }
  }

  private validateComplianceConfig(config: ComplianceConfig): void {
    if (config.dataRetentionDays < 30) {
      throw new Error('Data retention must be at least 30 days');
    }
    if (config.auditLogRetentionDays < config.dataRetentionDays) {
      throw new Error('Audit log retention must be >= data retention');
    }
    if (config.sessionTimeoutMinutes < 5) {
      throw new Error('Session timeout must be at least 5 minutes');
    }
    if (config.passwordPolicy.minLength < 8) {
      throw new Error('Password minimum length must be at least 8');
    }
  }

  private ipInRange(ip: string, cidr: string): boolean {
    // Simple CIDR check - in production use a proper library
    if (cidr === ip) return true;
    
    const [range, bits] = cidr.split('/');
    if (!bits) {
      return ip === cidr;
    }

    const ipParts = ip.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);
    const mask = parseInt(bits, 10);

    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    const maskNum = ~(Math.pow(2, 32 - mask) - 1);

    return (ipNum & maskNum) === (rangeNum & maskNum);
  }
}

export const enterpriseService = new EnterpriseService();
