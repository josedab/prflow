import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { enterpriseService } from '../services/enterprise.js';
import {
  generateTokenPair,
  refreshTokens,
  authenticateRequest,
} from '../lib/jwt.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const oauthCallbackSchema = z.object({
  code: z.string(),
  state: z.string().optional(),
});

const samlResponseSchema = z.object({
  SAMLResponse: z.string(),
  RelayState: z.string().optional(),
});

const oidcCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // GitHub OAuth initiation
  app.get('/login', async (_request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return reply.status(500).send({ error: 'GitHub OAuth not configured' });
    }

    const state = crypto.randomUUID();
    const redirectUri = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/callback`;
    
    const authUrl = new URL('https://github.com/login/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'read:user user:email read:org');
    authUrl.searchParams.set('state', state);

    return reply.redirect(authUrl.toString());
  });

  // GitHub OAuth callback
  app.get<{ Querystring: z.infer<typeof oauthCallbackSchema> }>(
    '/callback',
    async (request, reply) => {
      const { code } = oauthCallbackSchema.parse(request.query);

      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return reply.status(500).send({ error: 'GitHub OAuth not configured' });
      }

      try {
        // Exchange code for token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        });

        const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

        if (tokenData.error || !tokenData.access_token) {
          logger.error({ error: tokenData.error }, 'OAuth token exchange failed');
          return reply.status(401).send({ error: 'Authentication failed' });
        }

        // Get user info
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        const userData = await userResponse.json() as {
          id: number;
          login: string;
          name?: string;
          email?: string;
          avatar_url?: string;
        };

        // Upsert user in database
        const user = await db.user.upsert({
          where: { githubId: userData.id },
          update: {
            login: userData.login,
            name: userData.name,
            email: userData.email,
            avatarUrl: userData.avatar_url,
          },
          create: {
            githubId: userData.id,
            login: userData.login,
            name: userData.name,
            email: userData.email,
            avatarUrl: userData.avatar_url,
          },
        });

        logger.info({ userId: user.id, login: user.login }, 'User authenticated');

        // Generate JWT tokens
        const tokens = generateTokenPair(user.id, {
          email: user.email || undefined,
          login: user.login,
          name: user.name || undefined,
        });

        // Store refresh token in database for revocation support
        await db.session.create({
          data: {
            userId: user.id,
            accessToken: tokens.accessToken.substring(0, 50), // Store partial for reference
            refreshToken: tokens.refreshToken,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });

        // Redirect to dashboard with tokens
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
        const redirectUrl = new URL(`${dashboardUrl}/auth/callback`);
        redirectUrl.searchParams.set('access_token', tokens.accessToken);
        redirectUrl.searchParams.set('refresh_token', tokens.refreshToken);
        redirectUrl.searchParams.set('expires_in', String(tokens.expiresIn));
        
        return reply.redirect(redirectUrl.toString());
      } catch (error) {
        logger.error({ error }, 'OAuth callback error');
        return reply.status(500).send({ error: 'Authentication failed' });
      }
    }
  );

  // Refresh access token
  app.post<{ Body: { refreshToken: string } }>('/refresh', async (request, reply) => {
    const { refreshToken } = request.body || {};

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    // Verify refresh token exists in database
    const session = await db.session.findFirst({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }

    // Generate new tokens
    const newTokens = refreshTokens(refreshToken);

    if (!newTokens) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    // Update session with new refresh token
    await db.session.update({
      where: { id: session.id },
      data: {
        accessToken: newTokens.accessToken.substring(0, 50),
        refreshToken: newTokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn,
      tokenType: 'Bearer',
    };
  });

  // Logout (revoke tokens)
  app.post('/logout', async (request, reply) => {
    const authResult = await authenticateRequest(request.headers.authorization);

    if (!authResult.authenticated || !authResult.payload) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    // Delete all sessions for the user
    await db.session.deleteMany({
      where: { userId: authResult.payload.sub },
    });

    return { success: true, message: 'Logged out successfully' };
  });

  // Get current user
  app.get('/me', async (request, reply) => {
    const authResult = await authenticateRequest(request.headers.authorization);

    if (!authResult.authenticated || !authResult.payload) {
      return reply.status(401).send({ error: authResult.error || 'Unauthorized' });
    }

    try {
      const user = await db.user.findUnique({
        where: { id: authResult.payload.sub },
        include: {
          teams: {
            include: {
              team: {
                include: {
                  organization: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User', authResult.payload.sub);
      }

      return {
        id: user.id,
        githubId: user.githubId,
        login: user.login,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        teams: user.teams,
        tokenExpiry: authResult.payload.exp,
      };
    } catch (error) {
      logger.error({ error }, 'Get user error');
      return reply.status(500).send({ error: 'Failed to get user' });
    }
  });

  // Validate token (for frontend to check if token is still valid)
  app.get('/validate', async (request, reply) => {
    const authResult = await authenticateRequest(request.headers.authorization);

    if (!authResult.authenticated || !authResult.payload) {
      return reply.status(401).send({ 
        valid: false, 
        error: authResult.error || 'Invalid token' 
      });
    }

    return {
      valid: true,
      userId: authResult.payload.sub,
      expiresAt: new Date(authResult.payload.exp * 1000).toISOString(),
      login: authResult.payload.login,
    };
  });

  // ============================================
  // SAML SSO Routes
  // ============================================

  // Initiate SAML authentication
  app.get<{ Params: { orgId: string } }>(
    '/saml/:orgId/login',
    async (request, reply) => {
      const { orgId } = request.params;

      try {
        const settings = await enterpriseService.getSettings(orgId);
        if (!settings?.sso.enabled || settings.sso.provider !== 'saml') {
          throw new ValidationError('SAML SSO not configured for this organization');
        }

        const samlConfig = settings.sso.saml;
        if (!samlConfig) {
          throw new ValidationError('SAML configuration missing');
        }

        // Generate SAML AuthnRequest
        const requestId = `_${crypto.randomUUID()}`;
        const issueInstant = new Date().toISOString();
        const acsUrl = `${process.env.API_URL || 'http://localhost:3001'}/api/auth/saml/${orgId}/callback`;
        const issuer = `https://prflow.io/saml/${orgId}`;

        const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${samlConfig.entryPoint}"
  AssertionConsumerServiceURL="${acsUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

        // Base64 encode and deflate the request
        const encodedRequest = Buffer.from(authnRequest).toString('base64');

        // Build redirect URL
        const redirectUrl = new URL(samlConfig.entryPoint);
        redirectUrl.searchParams.set('SAMLRequest', encodedRequest);
        redirectUrl.searchParams.set('RelayState', orgId);

        logger.info({ orgId, requestId }, 'SAML authentication initiated');
        return reply.redirect(redirectUrl.toString());
      } catch (error) {
        logger.error({ error, orgId }, 'SAML login initiation failed');
        return reply.status(500).send({ error: 'Failed to initiate SAML login' });
      }
    }
  );

  // SAML callback (ACS endpoint)
  app.post<{
    Params: { orgId: string };
    Body: z.infer<typeof samlResponseSchema>;
  }>(
    '/saml/:orgId/callback',
    async (request, reply) => {
      const { orgId } = request.params;
      const { SAMLResponse, RelayState } = samlResponseSchema.parse(request.body);

      try {
        const settings = await enterpriseService.getSettings(orgId);
        if (!settings?.sso.enabled || settings.sso.provider !== 'saml') {
          throw new ValidationError('SAML SSO not configured');
        }

        const samlConfig = settings.sso.saml;
        if (!samlConfig) {
          throw new ValidationError('SAML configuration missing');
        }

        // Decode SAML response
        const decodedResponse = Buffer.from(SAMLResponse, 'base64').toString('utf-8');

        // Parse and validate SAML response
        // In production, use a proper SAML library like passport-saml or saml2-js
        const userAttributes = parseSAMLResponse(decodedResponse, samlConfig, settings.sso.attributeMapping);

        if (!userAttributes) {
          logger.warn({ orgId }, 'Failed to parse SAML response');
          return reply.status(401).send({ error: 'Invalid SAML response' });
        }

        // Validate email domain if restrictions are configured
        if (settings.sso.allowedDomains.length > 0) {
          const emailDomain = userAttributes.email.split('@')[1];
          if (!settings.sso.allowedDomains.includes(emailDomain)) {
            logger.warn({ orgId, email: userAttributes.email }, 'Email domain not allowed');
            return reply.status(403).send({ error: 'Email domain not allowed' });
          }
        }

        // Find or create user
        let user = await db.user.findFirst({
          where: { email: userAttributes.email },
        });

        if (!user) {
          // Create new user from SAML attributes
          user = await db.user.create({
            data: {
              githubId: 0, // Will be linked when they connect GitHub
              login: userAttributes.email.split('@')[0],
              name: userAttributes.name,
              email: userAttributes.email,
            },
          });
          logger.info({ userId: user.id, email: user.email }, 'New user created via SAML');
        }

        // Create session
        const session = await db.session.create({
          data: {
            userId: user.id,
            accessToken: `saml_${crypto.randomUUID()}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          },
        });

        logger.info({ userId: user.id, orgId, sessionId: session.id }, 'SAML authentication successful');

        // Redirect to dashboard
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
        const relayUrl = RelayState || dashboardUrl;
        return reply.redirect(`${relayUrl}?auth=saml&session=${session.id}`);
      } catch (error) {
        logger.error({ error, orgId }, 'SAML callback processing failed');
        return reply.status(500).send({ error: 'SAML authentication failed' });
      }
    }
  );

  // Get SAML metadata for an organization
  app.get<{ Params: { orgId: string } }>(
    '/saml/:orgId/metadata',
    async (request, reply) => {
      const { orgId } = request.params;

      try {
        const settings = await enterpriseService.getSettings(orgId);
        if (!settings) {
          throw new NotFoundError('Organization', orgId);
        }

        const metadata = enterpriseService.generateSAMLMetadata(settings);
        if (!metadata) {
          throw new ValidationError('SAML not configured');
        }

        reply.header('Content-Type', 'application/xml');
        return metadata;
      } catch (error) {
        logger.error({ error, orgId }, 'Failed to generate SAML metadata');
        return reply.status(500).send({ error: 'Failed to generate metadata' });
      }
    }
  );

  // ============================================
  // OIDC SSO Routes
  // ============================================

  // Initiate OIDC authentication
  app.get<{ Params: { orgId: string } }>(
    '/oidc/:orgId/login',
    async (request, reply) => {
      const { orgId } = request.params;

      try {
        const settings = await enterpriseService.getSettings(orgId);
        if (!settings?.sso.enabled || settings.sso.provider !== 'oidc') {
          throw new ValidationError('OIDC SSO not configured for this organization');
        }

        const oidcConfig = settings.sso.oidc;
        if (!oidcConfig) {
          throw new ValidationError('OIDC configuration missing');
        }

        // Generate state for CSRF protection
        const state = `${orgId}:${crypto.randomUUID()}`;
        const redirectUri = `${process.env.API_URL || 'http://localhost:3001'}/api/auth/oidc/${orgId}/callback`;

        // Build authorization URL
        const authUrl = new URL(oidcConfig.authorizationUrl);
        authUrl.searchParams.set('client_id', oidcConfig.clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', oidcConfig.scopes.join(' '));
        authUrl.searchParams.set('state', state);

        logger.info({ orgId }, 'OIDC authentication initiated');
        return reply.redirect(authUrl.toString());
      } catch (error) {
        logger.error({ error, orgId }, 'OIDC login initiation failed');
        return reply.status(500).send({ error: 'Failed to initiate OIDC login' });
      }
    }
  );

  // OIDC callback
  app.get<{
    Params: { orgId: string };
    Querystring: z.infer<typeof oidcCallbackSchema>;
  }>(
    '/oidc/:orgId/callback',
    async (request, reply) => {
      const { orgId } = request.params;
      const { code, state } = oidcCallbackSchema.parse(request.query);

      try {
        // Validate state
        if (!state.startsWith(`${orgId}:`)) {
          throw new ValidationError('Invalid state parameter');
        }

        const settings = await enterpriseService.getSettings(orgId);
        if (!settings?.sso.enabled || settings.sso.provider !== 'oidc') {
          throw new ValidationError('OIDC SSO not configured');
        }

        const oidcConfig = settings.sso.oidc;
        if (!oidcConfig) {
          throw new ValidationError('OIDC configuration missing');
        }

        const redirectUri = `${process.env.API_URL || 'http://localhost:3001'}/api/auth/oidc/${orgId}/callback`;

        // Exchange code for tokens
        const tokenResponse = await fetch(oidcConfig.tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: oidcConfig.clientId,
            client_secret: oidcConfig.clientSecret,
          }),
        });

        if (!tokenResponse.ok) {
          logger.error({ status: tokenResponse.status }, 'OIDC token exchange failed');
          return reply.status(401).send({ error: 'Token exchange failed' });
        }

        const tokens = await tokenResponse.json() as { access_token: string; id_token?: string };

        // Get user info
        const userInfoResponse = await fetch(oidcConfig.userInfoUrl, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });

        if (!userInfoResponse.ok) {
          logger.error({ status: userInfoResponse.status }, 'OIDC userinfo request failed');
          return reply.status(401).send({ error: 'Failed to get user info' });
        }

        const userInfo = await userInfoResponse.json() as Record<string, string>;

        // Extract user attributes based on mapping
        const email = userInfo[settings.sso.attributeMapping.email] || userInfo.email;
        const name = userInfo[settings.sso.attributeMapping.name] || userInfo.name;

        if (!email) {
          throw new ValidationError('Email not provided by OIDC provider');
        }

        // Validate email domain if restrictions are configured
        if (settings.sso.allowedDomains.length > 0) {
          const emailDomain = email.split('@')[1];
          if (!settings.sso.allowedDomains.includes(emailDomain)) {
            logger.warn({ orgId, email }, 'Email domain not allowed');
            return reply.status(403).send({ error: 'Email domain not allowed' });
          }
        }

        // Find or create user
        let user = await db.user.findFirst({
          where: { email },
        });

        if (!user) {
          user = await db.user.create({
            data: {
              githubId: 0,
              login: email.split('@')[0],
              name: name || email.split('@')[0],
              email,
            },
          });
          logger.info({ userId: user.id, email }, 'New user created via OIDC');
        }

        // Create session
        const session = await db.session.create({
          data: {
            userId: user.id,
            accessToken: `oidc_${crypto.randomUUID()}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        logger.info({ userId: user.id, orgId, sessionId: session.id }, 'OIDC authentication successful');

        // Redirect to dashboard
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
        return reply.redirect(`${dashboardUrl}?auth=oidc&session=${session.id}`);
      } catch (error) {
        logger.error({ error, orgId }, 'OIDC callback processing failed');
        return reply.status(500).send({ error: 'OIDC authentication failed' });
      }
    }
  );

  // Get OIDC configuration for an organization
  app.get<{ Params: { orgId: string } }>(
    '/oidc/:orgId/config',
    async (request, reply) => {
      const { orgId } = request.params;

      try {
        const settings = await enterpriseService.getSettings(orgId);
        if (!settings) {
          throw new NotFoundError('Organization', orgId);
        }

        const config = enterpriseService.getOIDCConfig(settings);
        if (!config) {
          throw new ValidationError('OIDC not configured');
        }

        // Return public configuration (without secrets)
        return {
          issuer: (config as Record<string, unknown>).issuer,
          authorization_endpoint: (config as Record<string, unknown>).authorization_endpoint,
          scopes: (config as Record<string, unknown>).scopes,
        };
      } catch (error) {
        logger.error({ error, orgId }, 'Failed to get OIDC config');
        return reply.status(500).send({ error: 'Failed to get configuration' });
      }
    }
  );
}

// ============================================
// SAML Response Parser (Simplified)
// ============================================

interface SAMLUserAttributes {
  email: string;
  name: string;
  groups?: string[];
}

function parseSAMLResponse(
  xmlResponse: string,
  _samlConfig: NonNullable<import('../services/enterprise.js').SSOConfig['saml']>,
  attributeMapping: { email: string; name: string; groups?: string }
): SAMLUserAttributes | null {
  try {
    // This is a simplified parser - in production, use a proper SAML library
    // that validates signatures, conditions, and timing
    
    // Extract NameID (email)
    const emailMatch = xmlResponse.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const email = emailMatch?.[1];

    // Extract attributes
    const getAttributeValue = (attrName: string): string | null => {
      const regex = new RegExp(
        `<saml:Attribute[^>]*Name="${attrName}"[^>]*>\\s*<saml:AttributeValue[^>]*>([^<]+)</saml:AttributeValue>`,
        'i'
      );
      const match = xmlResponse.match(regex);
      return match?.[1] || null;
    };

    const name = getAttributeValue(attributeMapping.name) || 
                 getAttributeValue('displayName') ||
                 getAttributeValue('name') ||
                 email?.split('@')[0] || '';

    if (!email) {
      return null;
    }

    const result: SAMLUserAttributes = { email, name };

    // Extract groups if configured
    if (attributeMapping.groups) {
      const groupsStr = getAttributeValue(attributeMapping.groups);
      if (groupsStr) {
        result.groups = groupsStr.split(',').map(g => g.trim());
      }
    }

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to parse SAML response');
    return null;
  }
}
