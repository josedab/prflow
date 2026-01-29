import type { PRAnalysis, ReviewerSuggestion } from '@prflow/core';
import { createGitHubClient, type GitHubClientConfig } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

interface CodeOwnerRule {
  pattern: string;
  owners: string[];
}

interface ReviewerCandidate {
  login: string;
  score: number;
  reasons: string[];
  workload: number;
  expertise: string[];
}

export class AssignmentService {
  private github: ReturnType<typeof createGitHubClient>;
  private owner: string;
  private repo: string;

  constructor(config: GitHubClientConfig, owner: string, repo: string) {
    this.github = createGitHubClient(config);
    this.owner = owner;
    this.repo = repo;
  }

  async suggestReviewers(
    analysis: PRAnalysis,
    excludeUsers: string[] = []
  ): Promise<ReviewerSuggestion[]> {
    const candidates: Map<string, ReviewerCandidate> = new Map();

    // 1. Get CODEOWNERS suggestions
    const codeownerSuggestions = await this.getCodeownersSuggestions(
      analysis.impactRadius.affectedFiles
    );
    for (const suggestion of codeownerSuggestions) {
      this.addOrUpdateCandidate(candidates, suggestion.login, 0.4, 'CODEOWNERS match', suggestion.patterns);
    }

    // 2. Get expertise-based suggestions (from semantic changes)
    const expertiseSuggestions = this.getExpertiseSuggestions(analysis.semanticChanges);
    for (const suggestion of expertiseSuggestions) {
      this.addOrUpdateCandidate(candidates, suggestion.login, 0.3, suggestion.reason, [suggestion.domain]);
    }

    // 3. Get workload-adjusted scores
    await this.adjustForWorkload(candidates);

    // 4. Filter excluded users
    for (const user of excludeUsers) {
      candidates.delete(user);
    }

    // 5. Sort and return top candidates
    const sorted = Array.from(candidates.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return sorted.map((candidate, index) => ({
      login: candidate.login,
      reason: candidate.reasons.join(', '),
      score: candidate.score,
      required: index === 0 && candidate.score > 0.7,
      availability: 'unknown' as const,
    }));
  }

  private async getCodeownersSuggestions(
    files: string[]
  ): Promise<Array<{ login: string; patterns: string[] }>> {
    try {
      const codeowners = await this.github.getCodeowners(this.owner, this.repo, 'main');
      if (!codeowners) return [];

      const rules = this.parseCodeowners(codeowners);
      const suggestions: Map<string, string[]> = new Map();

      for (const file of files) {
        for (const rule of rules) {
          if (this.matchCodeownersPattern(file, rule.pattern)) {
            for (const owner of rule.owners) {
              const login = owner.replace('@', '');
              const patterns = suggestions.get(login) || [];
              if (!patterns.includes(rule.pattern)) {
                patterns.push(rule.pattern);
              }
              suggestions.set(login, patterns);
            }
          }
        }
      }

      return Array.from(suggestions.entries()).map(([login, patterns]) => ({
        login,
        patterns,
      }));
    } catch (error) {
      logger.warn({ error }, 'Failed to get CODEOWNERS');
      return [];
    }
  }

  private parseCodeowners(content: string): CodeOwnerRule[] {
    const rules: CodeOwnerRule[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const pattern = parts[0];
      const owners = parts.slice(1).filter((p) => p.startsWith('@'));

      if (owners.length > 0) {
        rules.push({ pattern, owners });
      }
    }

    return rules;
  }

  private matchCodeownersPattern(file: string, pattern: string): boolean {
    // Simple pattern matching - in production, use proper glob matching
    if (pattern === '*') return true;
    
    if (pattern.startsWith('**/')) {
      return file.includes(pattern.slice(3));
    }
    
    if (pattern.startsWith('*.')) {
      return file.endsWith(pattern.slice(1));
    }
    
    if (pattern.endsWith('/')) {
      return file.startsWith(pattern);
    }
    
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(file);
    }
    
    return file === pattern || file.startsWith(pattern + '/');
  }

  private getExpertiseSuggestions(
    semanticChanges: PRAnalysis['semanticChanges']
  ): Array<{ login: string; reason: string; domain: string }> {
    const suggestions: Array<{ login: string; reason: string; domain: string }> = [];
    const domains = new Set<string>();

    for (const change of semanticChanges) {
      // Detect domain from file path and change type
      if (change.file.includes('api') || change.type.includes('api')) {
        domains.add('api');
      }
      if (change.file.includes('auth') || change.file.includes('security')) {
        domains.add('security');
      }
      if (change.file.includes('database') || change.file.includes('migration')) {
        domains.add('database');
      }
      if (change.file.includes('ui') || change.file.includes('component')) {
        domains.add('frontend');
      }
      if (change.file.includes('payment') || change.file.includes('billing')) {
        domains.add('payments');
      }
    }

    // In production, this would query actual team expertise data
    for (const domain of domains) {
      suggestions.push({
        login: `${domain}-expert`,
        reason: `${domain} domain expertise`,
        domain,
      });
    }

    return suggestions;
  }

  private addOrUpdateCandidate(
    candidates: Map<string, ReviewerCandidate>,
    login: string,
    scoreBoost: number,
    reason: string,
    expertise: string[]
  ): void {
    const existing = candidates.get(login);
    
    if (existing) {
      existing.score += scoreBoost;
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      for (const exp of expertise) {
        if (!existing.expertise.includes(exp)) {
          existing.expertise.push(exp);
        }
      }
    } else {
      candidates.set(login, {
        login,
        score: scoreBoost,
        reasons: [reason],
        workload: 0,
        expertise,
      });
    }
  }

  private async adjustForWorkload(candidates: Map<string, ReviewerCandidate>): Promise<void> {
    // In production, this would query actual pending review counts
    // For now, simulate workload adjustment
    for (const candidate of candidates.values()) {
      // Assume some baseline workload
      const simulatedWorkload = Math.random() * 10;
      candidate.workload = simulatedWorkload;
      
      // Reduce score for high workload (more than 5 pending reviews)
      if (simulatedWorkload > 5) {
        candidate.score *= 0.8;
        candidate.reasons.push('high workload');
      }
    }
  }

  async autoAssign(
    prNumber: number,
    reviewers: ReviewerSuggestion[]
  ): Promise<void> {
    const requiredReviewers = reviewers
      .filter((r) => r.required)
      .map((r) => r.login);

    if (requiredReviewers.length > 0) {
      try {
        await this.github.requestReviewers(
          this.owner,
          this.repo,
          prNumber,
          requiredReviewers
        );
        logger.info({ prNumber, reviewers: requiredReviewers }, 'Auto-assigned reviewers');
      } catch (error) {
        logger.error({ error, prNumber }, 'Failed to auto-assign reviewers');
      }
    }
  }
}

export function createAssignmentService(
  config: GitHubClientConfig,
  owner: string,
  repo: string
): AssignmentService {
  return new AssignmentService(config, owner, repo);
}
