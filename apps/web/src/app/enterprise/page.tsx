'use client';

import { useState } from 'react';
import {
  Shield,
  Key,
  Settings,
  Building2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Save,
  AlertTriangle,
  Palette,
  Globe,
} from 'lucide-react';

// Types matching the API
interface SSOConfig {
  enabled: boolean;
  provider: 'saml' | 'oidc' | 'none';
  saml?: {
    entryPoint: string;
    issuer: string;
    cert: string;
    signatureAlgorithm: string;
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
  enforceSSO: boolean;
}

interface ComplianceConfig {
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

interface EnterpriseSettings {
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

type TabType = 'overview' | 'sso' | 'compliance' | 'features' | 'customization';

export default function EnterprisePage() {
  const [orgId, setOrgId] = useState('');
  const [settings, setSettings] = useState<EnterpriseSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const loadSettings = async () => {
    if (!orgId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/enterprise/organizations/${orgId}/settings`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to load settings');
      }
      const data = await response.json();
      setSettings(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveSSO = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/enterprise/organizations/${orgId}/sso`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings.sso),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save SSO settings');
      }

      setSuccess('SSO settings saved successfully');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveCompliance = async () => {
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/enterprise/organizations/${orgId}/compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings.compliance),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save compliance settings');
      }

      setSuccess('Compliance settings saved successfully');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const testSSO = async () => {
    try {
      const response = await fetch(`/api/enterprise/organizations/${orgId}/sso/test`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setSuccess('SSO configuration test passed');
      } else {
        setError('SSO configuration test failed');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Building2 className="h-4 w-4" /> },
    { id: 'sso', label: 'Single Sign-On', icon: <Key className="h-4 w-4" /> },
    { id: 'compliance', label: 'Compliance', icon: <Shield className="h-4 w-4" /> },
    { id: 'features', label: 'Features', icon: <Settings className="h-4 w-4" /> },
    { id: 'customization', label: 'Customization', icon: <Palette className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enterprise Settings</h1>
        <p className="text-gray-600">Configure SSO, compliance, and enterprise features</p>
      </div>

      {/* Organization Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Select Organization</h2>
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Organization ID"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={loadSettings}
            disabled={!orgId || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Load Settings
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-center">
          <XCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md flex items-center">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {settings && (
        <div className="bg-white rounded-lg shadow">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  <span className="ml-2">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && <OverviewTab settings={settings} />}
            {activeTab === 'sso' && (
              <SSOTab
                settings={settings}
                onChange={(sso) => setSettings({ ...settings, sso })}
                onSave={saveSSO}
                onTest={testSSO}
                saving={saving}
              />
            )}
            {activeTab === 'compliance' && (
              <ComplianceTab
                settings={settings}
                onChange={(compliance) => setSettings({ ...settings, compliance })}
                onSave={saveCompliance}
                saving={saving}
              />
            )}
            {activeTab === 'features' && <FeaturesTab settings={settings} />}
            {activeTab === 'customization' && <CustomizationTab settings={settings} />}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ settings }: { settings: EnterpriseSettings }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Enterprise Overview</h3>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          label="SSO"
          enabled={settings.sso.enabled}
          detail={settings.sso.enabled ? settings.sso.provider.toUpperCase() : 'Not configured'}
        />
        <StatusCard
          label="Compliance"
          enabled={settings.compliance.enabled}
          detail={settings.compliance.enabled ? `${settings.compliance.dataRetentionDays}d retention` : 'Not configured'}
        />
        <StatusCard
          label="MFA Required"
          enabled={settings.compliance.requireMFA}
          detail={settings.compliance.requireMFA ? 'Enforced' : 'Optional'}
        />
        <StatusCard
          label="Advanced Analytics"
          enabled={settings.features.advancedAnalytics}
          detail={settings.features.advancedAnalytics ? 'Enabled' : 'Disabled'}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Usage Limits</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Max Repositories</dt>
              <dd className="font-medium">{settings.limits.maxRepositories === -1 ? 'Unlimited' : settings.limits.maxRepositories}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Max Users per Team</dt>
              <dd className="font-medium">{settings.limits.maxUsersPerTeam === -1 ? 'Unlimited' : settings.limits.maxUsersPerTeam}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Max PRs/Month</dt>
              <dd className="font-medium">{settings.limits.maxPRsPerMonth === -1 ? 'Unlimited' : settings.limits.maxPRsPerMonth}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">API Rate Limit</dt>
              <dd className="font-medium">{settings.limits.apiRateLimit}/min</dd>
            </div>
          </dl>
        </div>

        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3">Features Enabled</h4>
          <ul className="space-y-2 text-sm">
            {Object.entries(settings.features).map(([key, value]) => (
              <li key={key} className="flex items-center">
                {value ? (
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300 mr-2" />
                )}
                <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SSOTab({
  settings,
  onChange,
  onSave,
  onTest,
  saving,
}: {
  settings: EnterpriseSettings;
  onChange: (sso: SSOConfig) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
}) {
  const sso = settings.sso;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Single Sign-On Configuration</h3>
        <div className="flex space-x-2">
          <button
            onClick={onTest}
            disabled={!sso.enabled}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm flex items-center hover:bg-gray-50 disabled:opacity-50"
          >
            Test Connection
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-2 bg-primary-600 text-white rounded-md text-sm flex items-center hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Enable SSO */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="font-medium">Enable SSO</div>
          <div className="text-sm text-gray-500">Allow users to authenticate via SSO</div>
        </div>
        <Toggle
          enabled={sso.enabled}
          onChange={(enabled) => onChange({ ...sso, enabled })}
        />
      </div>

      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">SSO Provider</label>
        <select
          value={sso.provider}
          onChange={(e) => onChange({ ...sso, provider: e.target.value as 'saml' | 'oidc' | 'none' })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="none">None</option>
          <option value="saml">SAML 2.0</option>
          <option value="oidc">OpenID Connect (OIDC)</option>
        </select>
      </div>

      {/* SAML Configuration */}
      {sso.provider === 'saml' && (
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">SAML Configuration</h4>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entry Point URL</label>
            <input
              type="url"
              value={sso.saml?.entryPoint || ''}
              onChange={(e) =>
                onChange({ ...sso, saml: { ...sso.saml!, entryPoint: e.target.value } })
              }
              placeholder="https://idp.example.com/sso/saml"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Issuer</label>
            <input
              type="text"
              value={sso.saml?.issuer || ''}
              onChange={(e) =>
                onChange({ ...sso, saml: { ...sso.saml!, issuer: e.target.value } })
              }
              placeholder="https://idp.example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate</label>
            <textarea
              value={sso.saml?.cert || ''}
              onChange={(e) =>
                onChange({ ...sso, saml: { ...sso.saml!, cert: e.target.value } })
              }
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
            />
          </div>
        </div>
      )}

      {/* OIDC Configuration */}
      {sso.provider === 'oidc' && (
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-medium">OIDC Configuration</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issuer URL</label>
              <input
                type="url"
                value={sso.oidc?.issuer || ''}
                onChange={(e) =>
                  onChange({ ...sso, oidc: { ...sso.oidc!, issuer: e.target.value } })
                }
                placeholder="https://idp.example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
              <input
                type="text"
                value={sso.oidc?.clientId || ''}
                onChange={(e) =>
                  onChange({ ...sso, oidc: { ...sso.oidc!, clientId: e.target.value } })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={sso.oidc?.clientSecret || ''}
                onChange={(e) =>
                  onChange({ ...sso, oidc: { ...sso.oidc!, clientSecret: e.target.value } })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* Enforce SSO */}
      <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <div>
          <div className="font-medium text-yellow-800 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Enforce SSO
          </div>
          <div className="text-sm text-yellow-700">
            Disable password and OAuth login, require SSO for all users
          </div>
        </div>
        <Toggle
          enabled={sso.enforceSSO}
          onChange={(enforceSSO) => onChange({ ...sso, enforceSSO })}
        />
      </div>

      {/* Allowed Domains */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Allowed Email Domains
        </label>
        <input
          type="text"
          value={sso.allowedDomains.join(', ')}
          onChange={(e) =>
            onChange({
              ...sso,
              allowedDomains: e.target.value.split(',').map((d) => d.trim()).filter(Boolean),
            })
          }
          placeholder="example.com, company.org"
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        <p className="text-sm text-gray-500 mt-1">Comma-separated list of allowed domains</p>
      </div>
    </div>
  );
}

function ComplianceTab({
  settings,
  onChange,
  onSave,
  saving,
}: {
  settings: EnterpriseSettings;
  onChange: (compliance: ComplianceConfig) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const compliance = settings.compliance;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Compliance & Security</h3>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-2 bg-primary-600 text-white rounded-md text-sm flex items-center hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Enable Compliance */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="font-medium">Enable Compliance Mode</div>
          <div className="text-sm text-gray-500">Enforce security policies and data retention</div>
        </div>
        <Toggle
          enabled={compliance.enabled}
          onChange={(enabled) => onChange({ ...compliance, enabled })}
        />
      </div>

      {/* Data Retention */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Data Retention (days)
          </label>
          <input
            type="number"
            min={30}
            value={compliance.dataRetentionDays}
            onChange={(e) =>
              onChange({ ...compliance, dataRetentionDays: parseInt(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Audit Log Retention (days)
          </label>
          <input
            type="number"
            min={30}
            value={compliance.auditLogRetentionDays}
            onChange={(e) =>
              onChange({ ...compliance, auditLogRetentionDays: parseInt(e.target.value) })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      {/* Session Security */}
      <div className="p-4 border rounded-lg space-y-4">
        <h4 className="font-medium">Session Security</h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              min={5}
              value={compliance.sessionTimeoutMinutes}
              onChange={(e) =>
                onChange({ ...compliance, sessionTimeoutMinutes: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Sessions per User
            </label>
            <input
              type="number"
              min={1}
              value={compliance.maxSessionsPerUser}
              onChange={(e) =>
                onChange({ ...compliance, maxSessionsPerUser: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Require MFA</div>
            <div className="text-sm text-gray-500">Require multi-factor authentication</div>
          </div>
          <Toggle
            enabled={compliance.requireMFA}
            onChange={(requireMFA) => onChange({ ...compliance, requireMFA })}
          />
        </div>
      </div>

      {/* IP Allowlist */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Allowed IP Ranges (CIDR notation)
        </label>
        <textarea
          value={compliance.allowedIPRanges.join('\n')}
          onChange={(e) =>
            onChange({
              ...compliance,
              allowedIPRanges: e.target.value.split('\n').map((ip) => ip.trim()).filter(Boolean),
            })
          }
          placeholder="10.0.0.0/8&#10;192.168.1.0/24"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
        />
        <p className="text-sm text-gray-500 mt-1">One IP range per line. Leave empty to allow all IPs.</p>
      </div>

      {/* Approval Workflow */}
      <div className="p-4 border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Approval Workflow</h4>
          <Toggle
            enabled={compliance.approvalWorkflow.enabled}
            onChange={(enabled) =>
              onChange({
                ...compliance,
                approvalWorkflow: { ...compliance.approvalWorkflow, enabled },
              })
            }
          />
        </div>
        {compliance.approvalWorkflow.enabled && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Approvers
              </label>
              <input
                type="number"
                min={1}
                value={compliance.approvalWorkflow.minApprovers}
                onChange={(e) =>
                  onChange({
                    ...compliance,
                    approvalWorkflow: {
                      ...compliance.approvalWorkflow,
                      minApprovers: parseInt(e.target.value),
                    },
                  })
                }
                className="w-32 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={compliance.approvalWorkflow.requireCodeOwner}
                  onChange={(e) =>
                    onChange({
                      ...compliance,
                      approvalWorkflow: {
                        ...compliance.approvalWorkflow,
                        requireCodeOwner: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm">Require Code Owner approval</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={compliance.approvalWorkflow.requireSecurityReview}
                  onChange={(e) =>
                    onChange({
                      ...compliance,
                      approvalWorkflow: {
                        ...compliance.approvalWorkflow,
                        requireSecurityReview: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm">Require Security Team review</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={compliance.approvalWorkflow.requireComplianceReview}
                  onChange={(e) =>
                    onChange({
                      ...compliance,
                      approvalWorkflow: {
                        ...compliance.approvalWorkflow,
                        requireComplianceReview: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm">Require Compliance Team review</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturesTab({ settings }: { settings: EnterpriseSettings }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Enterprise Features</h3>
      <p className="text-gray-500">Contact support to modify feature flags.</p>

      <div className="space-y-4">
        {Object.entries(settings.features).map(([key, enabled]) => (
          <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </div>
              <div className="text-sm text-gray-500">
                {getFeatureDescription(key)}
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                enabled
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomizationTab({ settings }: { settings: EnterpriseSettings }) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Customization</h3>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg">
          <div className="flex items-center mb-4">
            <Palette className="h-5 w-5 text-primary-600 mr-2" />
            <h4 className="font-medium">Branding</h4>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Branding Enabled</span>
              <span className={settings.customization.brandingEnabled ? 'text-green-600' : 'text-gray-400'}>
                {settings.customization.brandingEnabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Logo URL</span>
              <span className="text-gray-900 truncate max-w-[200px]">
                {settings.customization.logoUrl || 'Not set'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Primary Color</span>
              {settings.customization.primaryColor ? (
                <span className="flex items-center">
                  <span
                    className="w-4 h-4 rounded mr-2"
                    style={{ backgroundColor: settings.customization.primaryColor }}
                  />
                  {settings.customization.primaryColor}
                </span>
              ) : (
                <span className="text-gray-400">Default</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <div className="flex items-center mb-4">
            <Globe className="h-5 w-5 text-primary-600 mr-2" />
            <h4 className="font-medium">Custom Domain</h4>
          </div>
          <div className="text-sm">
            {settings.customization.customDomain ? (
              <div>
                <span className="text-gray-600">Domain: </span>
                <span className="font-medium">{settings.customization.customDomain}</span>
              </div>
            ) : (
              <p className="text-gray-500">No custom domain configured. Contact support to set up.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  enabled,
  detail,
}: {
  label: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900">{label}</span>
        {enabled ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-gray-300" />
        )}
      </div>
      <div className="text-sm text-gray-500">{detail}</div>
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-primary-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function getFeatureDescription(key: string): string {
  const descriptions: Record<string, string> = {
    advancedAnalytics: 'Access to detailed team metrics, benchmarks, and bottleneck analysis',
    customIntegrations: 'Connect with third-party tools via webhooks and APIs',
    prioritySupport: '24/7 priority support with dedicated account manager',
    slaEnabled: 'Guaranteed service level agreements with credits',
    dedicatedInfrastructure: 'Isolated compute and storage resources',
  };
  return descriptions[key] || '';
}
