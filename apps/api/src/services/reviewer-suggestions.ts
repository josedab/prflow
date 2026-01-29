import type { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface ReviewerSuggestion {
  login: string;
  reason: string;
  score: number;
  required: boolean;
  expertise: string[];
}

interface FileOwnership {
  path: string;
  pattern: string;
  owners: string[];
}

interface ContributorStats {
  login: string;
  commits: number;
  additions: number;
  deletions: number;
  files: Set<string>;
  lastCommit: Date;
}

export class ReviewerSuggestionService {
  private github: GitHubClient;
  private codeownersCache: Map<string, FileOwnership[]> = new Map();

  constructor(github: GitHubClient) {
    this.github = github;
  }

  async suggestReviewers(
    owner: string,
    repo: string,
    prAuthor: string,
    changedFiles: string[],
    baseBranch: string
  ): Promise<ReviewerSuggestion[]> {
    const suggestions: Map<string, ReviewerSuggestion> = new Map();

    // 1. Get CODEOWNERS suggestions
    const codeownerSuggestions = await this.getCodeownerSuggestions(
      owner, repo, changedFiles, baseBranch
    );
    
    for (const suggestion of codeownerSuggestions) {
      if (suggestion.login !== prAuthor) {
        suggestions.set(suggestion.login, suggestion);
      }
    }

    // 2. Get git history-based suggestions
    const historySuggestions = await this.getHistoryBasedSuggestions(
      owner, repo, changedFiles, baseBranch, prAuthor
    );
    
    for (const suggestion of historySuggestions) {
      if (suggestion.login !== prAuthor) {
        if (suggestions.has(suggestion.login)) {
          // Merge suggestions
          const existing = suggestions.get(suggestion.login)!;
          existing.score = Math.max(existing.score, suggestion.score);
          existing.expertise = [...new Set([...existing.expertise, ...suggestion.expertise])];
          existing.reason = `${existing.reason}; ${suggestion.reason}`;
        } else {
          suggestions.set(suggestion.login, suggestion);
        }
      }
    }

    // 3. Sort by score and return top suggestions
    const sortedSuggestions = Array.from(suggestions.values())
      .sort((a, b) => {
        // Required reviewers first
        if (a.required !== b.required) return a.required ? -1 : 1;
        // Then by score
        return b.score - a.score;
      })
      .slice(0, 5); // Return top 5 suggestions

    return sortedSuggestions;
  }

  private async getCodeownerSuggestions(
    owner: string,
    repo: string,
    changedFiles: string[],
    ref: string
  ): Promise<ReviewerSuggestion[]> {
    try {
      const ownerships = await this.parseCodeowners(owner, repo, ref);
      const ownerMatches: Map<string, { paths: string[]; required: boolean }> = new Map();

      for (const file of changedFiles) {
        // Find matching CODEOWNERS patterns (last match wins, like gitignore)
        let matchedOwnership: FileOwnership | null = null;
        
        for (const ownership of ownerships) {
          if (this.matchesPattern(file, ownership.pattern)) {
            matchedOwnership = ownership;
          }
        }

        if (matchedOwnership) {
          for (const ownerLogin of matchedOwnership.owners) {
            if (!ownerMatches.has(ownerLogin)) {
              ownerMatches.set(ownerLogin, { paths: [], required: true });
            }
            ownerMatches.get(ownerLogin)!.paths.push(file);
          }
        }
      }

      return Array.from(ownerMatches.entries()).map(([login, data]) => ({
        login: login.replace('@', ''),
        reason: `Code owner for: ${data.paths.slice(0, 3).join(', ')}${data.paths.length > 3 ? ` (+${data.paths.length - 3} more)` : ''}`,
        score: 1.0, // CODEOWNERS get highest score
        required: data.required,
        expertise: this.inferExpertise(data.paths),
      }));
    } catch (error) {
      logger.warn({ error }, 'Failed to get CODEOWNERS suggestions');
      return [];
    }
  }

  private async parseCodeowners(owner: string, repo: string, ref: string): Promise<FileOwnership[]> {
    const cacheKey = `${owner}/${repo}/${ref}`;
    
    if (this.codeownersCache.has(cacheKey)) {
      return this.codeownersCache.get(cacheKey)!;
    }

    const content = await this.github.getCodeowners(owner, repo, ref);
    
    if (!content) {
      return [];
    }

    const ownerships: FileOwnership[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse pattern and owners
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const pattern = parts[0];
      const owners = parts.slice(1).filter((p) => p.startsWith('@'));

      if (owners.length > 0) {
        ownerships.push({
          path: pattern,
          pattern,
          owners: owners.map((o) => o.replace('@', '')),
        });
      }
    }

    this.codeownersCache.set(cacheKey, ownerships);
    return ownerships;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert CODEOWNERS pattern to regex
    let regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^/]*')
      .replace(/\*\*/g, '.*');

    // Handle patterns starting with /
    if (pattern.startsWith('/')) {
      regexPattern = '^' + regexPattern.slice(1);
    } else {
      regexPattern = '(^|/)' + regexPattern;
    }

    // Handle directory patterns
    if (pattern.endsWith('/')) {
      regexPattern = regexPattern.slice(0, -1) + '/.*';
    }

    try {
      const regex = new RegExp(regexPattern);
      return regex.test(filePath);
    } catch {
      return false;
    }
  }

  private async getHistoryBasedSuggestions(
    owner: string,
    repo: string,
    changedFiles: string[],
    baseBranch: string,
    prAuthor: string
  ): Promise<ReviewerSuggestion[]> {
    try {
      // Get recent commits for the changed files
      const contributors = await this.analyzeFileHistory(
        owner, repo, changedFiles, baseBranch
      );

      // Filter out the PR author and calculate scores
      const suggestions: ReviewerSuggestion[] = [];

      for (const [login, stats] of contributors.entries()) {
        if (login === prAuthor) continue;

        // Calculate score based on:
        // - Number of commits to these files
        // - Recency of commits
        // - Amount of code contributed
        const commitScore = Math.min(stats.commits / 10, 1); // Max 1.0 for 10+ commits
        const recencyScore = this.calculateRecencyScore(stats.lastCommit);
        const sizeScore = Math.min((stats.additions + stats.deletions) / 1000, 1);

        const score = (commitScore * 0.5 + recencyScore * 0.3 + sizeScore * 0.2);

        if (score > 0.1) { // Only include meaningful suggestions
          suggestions.push({
            login,
            reason: `${stats.commits} commits to affected files, last activity ${this.formatRelativeDate(stats.lastCommit)}`,
            score,
            required: false,
            expertise: this.inferExpertise(Array.from(stats.files)),
          });
        }
      }

      return suggestions.sort((a, b) => b.score - a.score).slice(0, 5);
    } catch (error) {
      logger.warn({ error }, 'Failed to get history-based suggestions');
      return [];
    }
  }

  private async analyzeFileHistory(
    owner: string,
    repo: string,
    changedFiles: string[],
    baseBranch: string
  ): Promise<Map<string, ContributorStats>> {
    const contributors: Map<string, ContributorStats> = new Map();

    // Get commits for the branch
    const commits = await this.github.listCommits(owner, repo, baseBranch);
    
    // Analyze each commit (limit to recent history for performance)
    const recentCommits = commits.slice(0, 100);

    for (const commit of recentCommits) {
      const authorLogin = commit.author?.login;
      if (!authorLogin) continue;

      try {
        const commitDetails = await this.github.getCommit(owner, repo, commit.sha);
        const commitFiles = commitDetails.files || [];
        
        // Check if this commit touches any of our changed files
        const relevantFiles = commitFiles.filter(
          (f: { filename: string }) => changedFiles.some((cf) => this.filesRelated(cf, f.filename))
        );

        if (relevantFiles.length > 0) {
          if (!contributors.has(authorLogin)) {
            contributors.set(authorLogin, {
              login: authorLogin,
              commits: 0,
              additions: 0,
              deletions: 0,
              files: new Set(),
              lastCommit: new Date(commit.commit.author?.date || Date.now()),
            });
          }

          const stats = contributors.get(authorLogin)!;
          stats.commits++;
          stats.additions += relevantFiles.reduce(
            (sum: number, f: { additions?: number }) => sum + (f.additions || 0), 0
          );
          stats.deletions += relevantFiles.reduce(
            (sum: number, f: { deletions?: number }) => sum + (f.deletions || 0), 0
          );
          relevantFiles.forEach((f: { filename: string }) => stats.files.add(f.filename));

          const commitDate = new Date(commit.commit.author?.date || Date.now());
          if (commitDate > stats.lastCommit) {
            stats.lastCommit = commitDate;
          }
        }
      } catch {
        // Skip commits we can't fetch details for
        continue;
      }
    }

    return contributors;
  }

  private filesRelated(file1: string, file2: string): boolean {
    // Check if files are the same
    if (file1 === file2) return true;

    // Check if files are in the same directory
    const dir1 = file1.split('/').slice(0, -1).join('/');
    const dir2 = file2.split('/').slice(0, -1).join('/');
    
    return dir1 === dir2 && dir1.length > 0;
  }

  private calculateRecencyScore(lastCommit: Date): number {
    const daysSinceCommit = (Date.now() - lastCommit.getTime()) / (1000 * 60 * 60 * 24);
    
    // Full score for commits within 30 days, declining after
    if (daysSinceCommit <= 30) return 1.0;
    if (daysSinceCommit <= 90) return 0.7;
    if (daysSinceCommit <= 180) return 0.4;
    if (daysSinceCommit <= 365) return 0.2;
    return 0.1;
  }

  private formatRelativeDate(date: Date): string {
    const daysSince = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSince === 0) return 'today';
    if (daysSince === 1) return 'yesterday';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    if (daysSince < 365) return `${Math.floor(daysSince / 30)} months ago`;
    return `${Math.floor(daysSince / 365)} years ago`;
  }

  private inferExpertise(files: string[]): string[] {
    const expertise = new Set<string>();

    for (const file of files) {
      // Infer from directory structure
      if (file.includes('/api/') || file.includes('/routes/')) expertise.add('api');
      if (file.includes('/auth/') || file.includes('auth.')) expertise.add('authentication');
      if (file.includes('/db/') || file.includes('database')) expertise.add('database');
      if (file.includes('/ui/') || file.includes('/components/')) expertise.add('frontend');
      if (file.includes('/test') || file.includes('.test.') || file.includes('.spec.')) expertise.add('testing');
      if (file.includes('security') || file.includes('crypto')) expertise.add('security');
      if (file.includes('config') || file.includes('.env')) expertise.add('configuration');
      if (file.includes('deploy') || file.includes('docker') || file.includes('ci')) expertise.add('devops');

      // Infer from file extension
      const ext = file.split('.').pop();
      if (ext === 'tsx' || ext === 'jsx') expertise.add('react');
      if (ext === 'py') expertise.add('python');
      if (ext === 'go') expertise.add('golang');
      if (ext === 'rs') expertise.add('rust');
    }

    return Array.from(expertise);
  }
}
