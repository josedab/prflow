/**
 * @fileoverview Git Provider Factory
 * 
 * Factory for creating provider-specific clients.
 */

import type { GitProvider, IGitProviderClient, ProviderConfig } from '@prflow/core';
import { GitLabClient } from './gitlab.js';
import { BitbucketClient } from './bitbucket.js';

export class ProviderFactory {
  private static instances = new Map<string, IGitProviderClient>();

  /**
   * Create a client for the specified provider
   */
  static createClient(config: ProviderConfig): IGitProviderClient {
    const key = `${config.provider}:${config.baseUrl || 'default'}`;

    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    let client: IGitProviderClient;

    switch (config.provider) {
      case 'gitlab':
        client = new GitLabClient({
          baseUrl: config.baseUrl,
          accessToken: config.accessToken,
        });
        break;

      case 'bitbucket':
        client = new BitbucketClient({
          baseUrl: config.baseUrl,
          accessToken: config.accessToken,
        });
        break;

      case 'github':
        // GitHub uses the existing GitHubClient - return a wrapper
        throw new Error('Use GitHubClient directly for GitHub repositories');

      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }

    this.instances.set(key, client);
    return client;
  }

  /**
   * Get a client by provider and optional base URL
   */
  static getClient(provider: GitProvider, baseUrl?: string): IGitProviderClient | undefined {
    const key = `${provider}:${baseUrl || 'default'}`;
    return this.instances.get(key);
  }

  /**
   * Clear cached clients (useful for testing)
   */
  static clearCache(): void {
    this.instances.clear();
  }
}

export { GitLabClient } from './gitlab.js';
export { BitbucketClient } from './bitbucket.js';
