import { describe, it, expect } from 'vitest';

describe('GitHubClient', () => {
  describe('createGitHubClient', () => {
    it('should be importable', async () => {
      const module = await import('../client.js');
      expect(module.createGitHubClient).toBeDefined();
      expect(module.GitHubClient).toBeDefined();
    });

    it('should export all required methods', async () => {
      const module = await import('../client.js');
      const client = module.GitHubClient.prototype;
      
      // Core PR methods
      expect(client.getPullRequest).toBeDefined();
      expect(client.getPullRequestDiff).toBeDefined();
      expect(client.mergePullRequest).toBeDefined();
      
      // Check and status methods
      expect(client.createCheckRun).toBeDefined();
      expect(client.updateCheckRun).toBeDefined();
      expect(client.getCombinedStatus).toBeDefined();
      expect(client.getCheckRuns).toBeDefined();
      
      // Review methods
      expect(client.createReviewComment).toBeDefined();
      expect(client.getReviews).toBeDefined();
      expect(client.requestReviewers).toBeDefined();
      
      // Repository methods
      expect(client.getRepository).toBeDefined();
      expect(client.listBranches).toBeDefined();
      expect(client.listCommits).toBeDefined();
      expect(client.getCommit).toBeDefined();
      expect(client.compareBranches).toBeDefined();
      expect(client.updateBranch).toBeDefined();
      
      // File content methods
      expect(client.getFileContent).toBeDefined();
      expect(client.getCodeowners).toBeDefined();
      
      // Issue/PR comment methods
      expect(client.createIssueComment).toBeDefined();
    });
  });
});

describe('WebhookHandler', () => {
  describe('createWebhookHandler', () => {
    it('should be importable', async () => {
      const module = await import('../webhooks.js');
      expect(module.createWebhookHandler).toBeDefined();
      expect(module.WebhookHandler).toBeDefined();
    });
  });
});
