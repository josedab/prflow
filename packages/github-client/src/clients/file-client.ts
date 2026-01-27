import type { Octokit } from '@octokit/rest';

/**
 * Client module for file and content operations.
 * Handles file reading, writing, and content management.
 */
export class FileClient {
  constructor(private octokit: Octokit) {}

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('content' in data && data.type === 'file') {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }
      throw new Error('Not a file');
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return '';
      }
      throw error;
    }
  }

  async getFileSha(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('sha' in data && data.type === 'file') {
        return data.sha;
      }
      return null;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createOrUpdateFileContent(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<{ sha: string; commitSha: string }> {
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
      branch,
      sha,
    });

    return {
      sha: data.content?.sha || '',
      commitSha: data.commit.sha || '',
    };
  }

  async getCodeowners(owner: string, repo: string, ref: string): Promise<string | null> {
    const paths = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'];
    
    for (const path of paths) {
      try {
        const content = await this.getFileContent(owner, repo, path, ref);
        if (content) return content;
      } catch {
        continue;
      }
    }
    
    return null;
  }
}
