import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface Vulnerability {
  id: string;
  source: 'nvd' | 'github' | 'osv';
  cveId?: string;
  ghsaId?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
  cvssScore?: number;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
  affectedPackage: string;
  affectedVersions: string;
  fixedVersions?: string;
  references: string[];
}

export interface DependencyScanResult {
  repositoryId: string;
  scannedAt: string;
  totalDependencies: number;
  vulnerabilitiesFound: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  vulnerabilities: VulnerabilityMatch[];
}

export interface VulnerabilityMatch {
  vulnerability: Vulnerability;
  installedVersion: string;
  packageManager: 'npm' | 'pip' | 'maven' | 'nuget' | 'go' | 'cargo';
  manifestFile: string;
  isDirect: boolean;
  fixAvailable: boolean;
  recommendedVersion?: string;
}

export interface SecurityAdvisory {
  id: string;
  repositoryId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  vulnerabilities: VulnerabilityMatch[];
  prNumber?: number;
  prUrl?: string;
  status: 'pending' | 'pr_created' | 'fixed' | 'dismissed';
  createdAt: string;
}

// GitHub Advisory Database types
interface GitHubSecurityAdvisory {
  ghsaId: string;
  cveId?: string;
  summary: string;
  description: string;
  severity: string;
  publishedAt: string;
  updatedAt: string;
  vulnerabilities: {
    nodes: Array<{
      package: { name: string; ecosystem: string };
      vulnerableVersionRange: string;
      firstPatchedVersion?: { identifier: string };
    }>;
  };
  references: { url: string }[];
}

// Simple in-memory cache for vulnerability data
const vulnerabilityCache = new Map<string, { data: Vulnerability[]; timestamp: number }>();
const CACHE_TTL = 3600000; // 1 hour

export class SecurityScannerService {
  
  /**
   * Scan a repository's dependencies for vulnerabilities
   */
  async scanRepository(
    repositoryId: string,
    installationId: number
  ): Promise<DependencyScanResult> {
    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = repository.fullName.split('/');

    // Get dependency files
    const dependencies = await this.extractDependencies(github, owner, repo);
    
    // Scan each package for vulnerabilities
    const vulnerabilities: VulnerabilityMatch[] = [];
    
    for (const dep of dependencies) {
      const matches = await this.checkPackageVulnerabilities(
        dep.name,
        dep.version,
        dep.ecosystem as VulnerabilityMatch['packageManager'],
        dep.manifestFile,
        dep.isDirect
      );
      vulnerabilities.push(...matches);
    }

    // Calculate summary
    const result: DependencyScanResult = {
      repositoryId,
      scannedAt: new Date().toISOString(),
      totalDependencies: dependencies.length,
      vulnerabilitiesFound: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.vulnerability.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.vulnerability.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.vulnerability.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.vulnerability.severity === 'low').length,
      vulnerabilities,
    };

    logger.info({
      repositoryId,
      vulnerabilitiesFound: result.vulnerabilitiesFound,
      critical: result.critical,
      high: result.high,
    }, 'Security scan completed');

    return result;
  }

  /**
   * Scan dependencies from a specific PR
   */
  async scanPullRequest(
    workflowId: string,
    installationId: number
  ): Promise<DependencyScanResult> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = workflow.repository.fullName.split('/');

    // Get changed files in PR
    const files = await github.getPullRequestFiles(owner, repo, workflow.prNumber);
    
    // Filter for dependency files
    const dependencyFiles = files.filter(f => this.isDependencyFile(f.path));
    
    if (dependencyFiles.length === 0) {
      return {
        repositoryId: workflow.repositoryId,
        scannedAt: new Date().toISOString(),
        totalDependencies: 0,
        vulnerabilitiesFound: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        vulnerabilities: [],
      };
    }

    // Get PR branch content for dependency files
    const dependencies: Array<{
      name: string;
      version: string;
      ecosystem: string;
      manifestFile: string;
      isDirect: boolean;
    }> = [];

    for (const file of dependencyFiles) {
      try {
        const content = await github.getFileContent(owner, repo, file.path, workflow.headBranch);
        if (content && typeof content === 'string') {
          const parsedDeps = this.parseDependencyFile(file.path, content);
          dependencies.push(...parsedDeps);
        }
      } catch (error) {
        logger.warn({ file: file.path, error }, 'Failed to parse dependency file');
      }
    }

    // Scan for vulnerabilities
    const vulnerabilities: VulnerabilityMatch[] = [];
    
    for (const dep of dependencies) {
      const matches = await this.checkPackageVulnerabilities(
        dep.name,
        dep.version,
        dep.ecosystem as VulnerabilityMatch['packageManager'],
        dep.manifestFile,
        dep.isDirect
      );
      vulnerabilities.push(...matches);
    }

    return {
      repositoryId: workflow.repositoryId,
      scannedAt: new Date().toISOString(),
      totalDependencies: dependencies.length,
      vulnerabilitiesFound: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.vulnerability.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.vulnerability.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.vulnerability.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.vulnerability.severity === 'low').length,
      vulnerabilities,
    };
  }

  /**
   * Query GitHub Advisory Database for vulnerabilities
   */
  async queryGitHubAdvisories(
    ecosystem: string,
    packageName: string
  ): Promise<Vulnerability[]> {
    const cacheKey = `${ecosystem}:${packageName}`;
    const cached = vulnerabilityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    try {
      // Use GitHub's GraphQL API to query advisories
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GITHUB_APP_PRIVATE_KEY}`,
        },
        body: JSON.stringify({
          query: `
            query($ecosystem: SecurityAdvisoryEcosystem!, $package: String!) {
              securityVulnerabilities(first: 100, ecosystem: $ecosystem, package: $package) {
                nodes {
                  advisory {
                    ghsaId
                    cveId: identifiers(type: CVE) { value }
                    summary
                    description
                    severity
                    publishedAt
                    updatedAt
                    references { url }
                  }
                  vulnerableVersionRange
                  firstPatchedVersion { identifier }
                }
              }
            }
          `,
          variables: {
            ecosystem: this.mapEcosystem(ecosystem),
            package: packageName,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json() as {
        data?: {
          securityVulnerabilities?: {
            nodes: Array<{
              advisory: GitHubSecurityAdvisory;
              vulnerableVersionRange: string;
              firstPatchedVersion?: { identifier: string };
            }>;
          };
        };
      };

      const vulnerabilities: Vulnerability[] = (data.data?.securityVulnerabilities?.nodes || []).map(node => ({
        id: node.advisory.ghsaId,
        source: 'github' as const,
        cveId: node.advisory.cveId,
        ghsaId: node.advisory.ghsaId,
        severity: this.normalizeSeverity(node.advisory.severity),
        title: node.advisory.summary,
        description: node.advisory.description,
        publishedAt: node.advisory.publishedAt,
        updatedAt: node.advisory.updatedAt,
        affectedPackage: packageName,
        affectedVersions: node.vulnerableVersionRange,
        fixedVersions: node.firstPatchedVersion?.identifier,
        references: node.advisory.references.map((r: { url: string }) => r.url),
      }));

      vulnerabilityCache.set(cacheKey, { data: vulnerabilities, timestamp: Date.now() });
      
      return vulnerabilities;
    } catch (error) {
      logger.error({ ecosystem, packageName, error }, 'Failed to query GitHub advisories');
      return [];
    }
  }

  /**
   * Query Open Source Vulnerabilities (OSV) database
   */
  async queryOSV(
    ecosystem: string,
    packageName: string,
    version?: string
  ): Promise<Vulnerability[]> {
    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: {
            name: packageName,
            ecosystem: this.mapOSVEcosystem(ecosystem),
          },
          version,
        }),
      });

      if (!response.ok) {
        throw new Error(`OSV API error: ${response.status}`);
      }

      const data = await response.json() as {
        vulns?: Array<{
          id: string;
          aliases?: string[];
          summary?: string;
          details?: string;
          severity?: Array<{ type: string; score: string }>;
          published?: string;
          modified?: string;
          affected?: Array<{
            ranges?: Array<{ events: Array<{ introduced?: string; fixed?: string }> }>;
          }>;
          references?: Array<{ url: string }>;
        }>;
      };

      return (data.vulns || []).map(vuln => {
        const cveId = vuln.aliases?.find(a => a.startsWith('CVE-'));
        const ghsaId = vuln.aliases?.find(a => a.startsWith('GHSA-'));
        
        return {
          id: vuln.id,
          source: 'osv' as const,
          cveId,
          ghsaId,
          severity: this.parseCVSS(vuln.severity),
          title: vuln.summary || vuln.id,
          description: vuln.details || '',
          publishedAt: vuln.published || '',
          updatedAt: vuln.modified,
          affectedPackage: packageName,
          affectedVersions: this.extractAffectedVersions(vuln.affected),
          fixedVersions: this.extractFixedVersions(vuln.affected),
          references: vuln.references?.map(r => r.url) || [],
        };
      });
    } catch (error) {
      logger.error({ ecosystem, packageName, error }, 'Failed to query OSV');
      return [];
    }
  }

  /**
   * Create a security advisory PR with dependency updates
   */
  async createSecurityAdvisoryPR(
    repositoryId: string,
    vulnerabilities: VulnerabilityMatch[],
    installationId: number
  ): Promise<SecurityAdvisory> {
    const repository = await db.repository.findUnique({
      where: { id: repositoryId },
    });

    if (!repository) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = repository.fullName.split('/');

    // Group vulnerabilities by manifest file
    const byManifest = new Map<string, VulnerabilityMatch[]>();
    for (const vuln of vulnerabilities) {
      if (!byManifest.has(vuln.manifestFile)) {
        byManifest.set(vuln.manifestFile, []);
      }
      byManifest.get(vuln.manifestFile)!.push(vuln);
    }

    // Create branch
    const branchName = `security/update-dependencies-${Date.now()}`;
    const baseRef = await github.getRef(owner, repo, `heads/${repository.defaultBranch}`);
    await github.createRef(owner, repo, `refs/heads/${branchName}`, baseRef.object.sha);

    // Update each manifest file
    for (const [manifestFile, vulns] of byManifest) {
      try {
        const content = await github.getFileContent(owner, repo, manifestFile, repository.defaultBranch);
        if (content && typeof content === 'string') {
          const updatedContent = this.updateDependencies(manifestFile, content, vulns);
          await github.createOrUpdateFileContent(
            owner,
            repo,
            manifestFile,
            updatedContent,
            `security: Update dependencies to fix vulnerabilities`,
            branchName
          );
        }
      } catch (error) {
        logger.error({ manifestFile, error }, 'Failed to update manifest');
      }
    }

    // Generate PR title and body
    const criticalCount = vulnerabilities.filter(v => v.vulnerability.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.vulnerability.severity === 'high').length;
    
    const title = `🔒 Security: Fix ${vulnerabilities.length} vulnerabilities`;
    const body = this.generateSecurityPRBody(vulnerabilities);

    // Create PR
    const pr = await github.createPullRequest(owner, repo, title, branchName, repository.defaultBranch, body);

    const advisory: SecurityAdvisory = {
      id: `advisory-${Date.now()}`,
      repositoryId,
      title,
      description: `Fixes ${criticalCount} critical, ${highCount} high severity vulnerabilities`,
      severity: criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : 'medium',
      vulnerabilities,
      prNumber: pr.number,
      prUrl: pr.url,
      status: 'pr_created',
      createdAt: new Date().toISOString(),
    };

    logger.info({
      repositoryId,
      prNumber: pr.number,
      vulnerabilityCount: vulnerabilities.length,
    }, 'Security advisory PR created');

    return advisory;
  }

  /**
   * Get vulnerability summary for a repository
   */
  async getVulnerabilitySummary(_repositoryId: string): Promise<{
    lastScan?: string;
    totalVulnerabilities: number;
    bySeverity: Record<string, number>;
    byPackageManager: Record<string, number>;
    fixableCount: number;
  }> {
    // In a real implementation, this would query stored scan results
    return {
      totalVulnerabilities: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byPackageManager: {},
      fixableCount: 0,
    };
  }

  // Helper methods

  private createGitHubClient(installationId: number): GitHubClient {
    return new GitHubClient({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
      installationId,
    });
  }

  private isDependencyFile(path: string): boolean {
    const dependencyFiles = [
      'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      'requirements.txt', 'Pipfile', 'Pipfile.lock', 'poetry.lock', 'setup.py',
      'pom.xml', 'build.gradle', 'build.gradle.kts',
      'Gemfile', 'Gemfile.lock',
      'go.mod', 'go.sum',
      'Cargo.toml', 'Cargo.lock',
      'composer.json', 'composer.lock',
      '*.csproj', 'packages.config',
    ];
    
    return dependencyFiles.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(path);
      }
      return path.endsWith(pattern);
    });
  }

  private async extractDependencies(
    github: GitHubClient,
    owner: string,
    repo: string
  ): Promise<Array<{
    name: string;
    version: string;
    ecosystem: string;
    manifestFile: string;
    isDirect: boolean;
  }>> {
    const dependencies: Array<{
      name: string;
      version: string;
      ecosystem: string;
      manifestFile: string;
      isDirect: boolean;
    }> = [];

    // Try to get common dependency files
    const filesToCheck = [
      { path: 'package.json', ecosystem: 'npm' },
      { path: 'requirements.txt', ecosystem: 'pip' },
      { path: 'Gemfile', ecosystem: 'gem' },
      { path: 'go.mod', ecosystem: 'go' },
      { path: 'Cargo.toml', ecosystem: 'cargo' },
      { path: 'pom.xml', ecosystem: 'maven' },
    ];

    for (const file of filesToCheck) {
      try {
        const content = await github.getFileContent(owner, repo, file.path, 'HEAD');
        if (content && typeof content === 'string') {
          const parsed = this.parseDependencyFile(file.path, content);
          dependencies.push(...parsed);
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    return dependencies;
  }

  private parseDependencyFile(
    filePath: string,
    content: string
  ): Array<{
    name: string;
    version: string;
    ecosystem: string;
    manifestFile: string;
    isDirect: boolean;
  }> {
    const dependencies: Array<{
      name: string;
      version: string;
      ecosystem: string;
      manifestFile: string;
      isDirect: boolean;
    }> = [];

    if (filePath.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        
        for (const [name, version] of Object.entries(allDeps)) {
          dependencies.push({
            name,
            version: String(version).replace(/^[\^~]/, ''),
            ecosystem: 'npm',
            manifestFile: filePath,
            isDirect: true,
          });
        }
      } catch {
        // Invalid JSON
      }
    } else if (filePath.endsWith('requirements.txt')) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)==?([\d.]+)/);
        if (match) {
          dependencies.push({
            name: match[1],
            version: match[2],
            ecosystem: 'pip',
            manifestFile: filePath,
            isDirect: true,
          });
        }
      }
    } else if (filePath.endsWith('go.mod')) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s+([^\s]+)\s+v?([\d.]+)/);
        if (match) {
          dependencies.push({
            name: match[1],
            version: match[2],
            ecosystem: 'go',
            manifestFile: filePath,
            isDirect: true,
          });
        }
      }
    }

    return dependencies;
  }

  private async checkPackageVulnerabilities(
    packageName: string,
    version: string,
    ecosystem: VulnerabilityMatch['packageManager'],
    manifestFile: string,
    isDirect: boolean
  ): Promise<VulnerabilityMatch[]> {
    const matches: VulnerabilityMatch[] = [];

    // Query OSV for vulnerabilities
    const vulns = await this.queryOSV(ecosystem, packageName, version);

    for (const vuln of vulns) {
      if (this.isVersionAffected(version, vuln.affectedVersions)) {
        matches.push({
          vulnerability: vuln,
          installedVersion: version,
          packageManager: ecosystem,
          manifestFile,
          isDirect,
          fixAvailable: !!vuln.fixedVersions,
          recommendedVersion: vuln.fixedVersions,
        });
      }
    }

    return matches;
  }

  private isVersionAffected(version: string, affectedRange: string): boolean {
    // Simplified version check - in production would use semver
    if (!affectedRange) return false;
    
    // Handle ranges like "< 1.2.3" or ">= 1.0.0, < 2.0.0"
    if (affectedRange.includes('<') || affectedRange.includes('>')) {
      // For simplicity, assume affected if there's a version range
      return true;
    }
    
    return affectedRange.includes(version);
  }

  private mapEcosystem(ecosystem: string): string {
    const mapping: Record<string, string> = {
      npm: 'NPM',
      pip: 'PIP',
      maven: 'MAVEN',
      nuget: 'NUGET',
      go: 'GO',
      cargo: 'RUST',
      gem: 'RUBYGEMS',
    };
    return mapping[ecosystem.toLowerCase()] || ecosystem.toUpperCase();
  }

  private mapOSVEcosystem(ecosystem: string): string {
    const mapping: Record<string, string> = {
      npm: 'npm',
      pip: 'PyPI',
      maven: 'Maven',
      nuget: 'NuGet',
      go: 'Go',
      cargo: 'crates.io',
      gem: 'RubyGems',
    };
    return mapping[ecosystem.toLowerCase()] || ecosystem;
  }

  private normalizeSeverity(severity: string): Vulnerability['severity'] {
    const lower = severity.toLowerCase();
    if (lower === 'critical') return 'critical';
    if (lower === 'high') return 'high';
    if (lower === 'moderate' || lower === 'medium') return 'medium';
    if (lower === 'low') return 'low';
    return 'unknown';
  }

  private parseCVSS(severity?: Array<{ type: string; score: string }>): Vulnerability['severity'] {
    if (!severity || severity.length === 0) return 'unknown';
    
    const cvss = parseFloat(severity[0].score);
    if (cvss >= 9.0) return 'critical';
    if (cvss >= 7.0) return 'high';
    if (cvss >= 4.0) return 'medium';
    if (cvss > 0) return 'low';
    return 'unknown';
  }

  private extractAffectedVersions(affected?: Array<{
    ranges?: Array<{ events: Array<{ introduced?: string; fixed?: string }> }>;
  }>): string {
    if (!affected || affected.length === 0) return '';
    
    const versions: string[] = [];
    for (const a of affected) {
      for (const range of a.ranges || []) {
        for (const event of range.events) {
          if (event.introduced) {
            versions.push(`>= ${event.introduced}`);
          }
        }
      }
    }
    return versions.join(', ');
  }

  private extractFixedVersions(affected?: Array<{
    ranges?: Array<{ events: Array<{ introduced?: string; fixed?: string }> }>;
  }>): string | undefined {
    if (!affected || affected.length === 0) return undefined;
    
    for (const a of affected) {
      for (const range of a.ranges || []) {
        for (const event of range.events) {
          if (event.fixed) {
            return event.fixed;
          }
        }
      }
    }
    return undefined;
  }

  private updateDependencies(
    manifestFile: string,
    content: string,
    vulnerabilities: VulnerabilityMatch[]
  ): string {
    if (manifestFile.endsWith('package.json')) {
      try {
        const pkg = JSON.parse(content);
        
        for (const vuln of vulnerabilities) {
          if (vuln.recommendedVersion) {
            if (pkg.dependencies?.[vuln.vulnerability.affectedPackage]) {
              pkg.dependencies[vuln.vulnerability.affectedPackage] = `^${vuln.recommendedVersion}`;
            }
            if (pkg.devDependencies?.[vuln.vulnerability.affectedPackage]) {
              pkg.devDependencies[vuln.vulnerability.affectedPackage] = `^${vuln.recommendedVersion}`;
            }
          }
        }
        
        return JSON.stringify(pkg, null, 2);
      } catch {
        return content;
      }
    }
    
    // For other formats, return unchanged
    return content;
  }

  private generateSecurityPRBody(vulnerabilities: VulnerabilityMatch[]): string {
    const lines = [
      '## 🔒 Security Updates',
      '',
      'This PR addresses the following security vulnerabilities:',
      '',
    ];

    // Group by severity
    const bySeverity = new Map<string, VulnerabilityMatch[]>();
    for (const vuln of vulnerabilities) {
      const severity = vuln.vulnerability.severity;
      if (!bySeverity.has(severity)) {
        bySeverity.set(severity, []);
      }
      bySeverity.get(severity)!.push(vuln);
    }

    for (const [severity, vulns] of bySeverity) {
      const emoji = severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : severity === 'medium' ? '🟡' : '🟢';
      lines.push(`### ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} Severity (${vulns.length})`);
      lines.push('');
      
      for (const vuln of vulns) {
        lines.push(`- **${vuln.vulnerability.affectedPackage}** ${vuln.installedVersion} → ${vuln.recommendedVersion || 'N/A'}`);
        lines.push(`  - ${vuln.vulnerability.title}`);
        if (vuln.vulnerability.cveId) {
          lines.push(`  - CVE: ${vuln.vulnerability.cveId}`);
        }
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('*This PR was automatically generated by PRFlow Security Scanner*');

    return lines.join('\n');
  }
}

export const securityScannerService = new SecurityScannerService();
