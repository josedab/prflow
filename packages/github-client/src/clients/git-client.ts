import type { Octokit } from '@octokit/rest';

/**
 * Client module for Git operations.
 * Handles low-level Git operations like commits, trees, and refs.
 */
export class GitClient {
  constructor(private octokit: Octokit) {}

  async createCommit(
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[]
  ): Promise<string> {
    const { data } = await this.octokit.git.createCommit({
      owner,
      repo,
      message,
      tree,
      parents,
    });

    return data.sha;
  }

  async createTree(
    owner: string,
    repo: string,
    baseTree: string,
    files: Array<{ path: string; content: string; mode?: '100644' | '100755' | '040000' | '160000' | '120000' }>
  ): Promise<string> {
    const { data } = await this.octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTree,
      tree: files.map((f) => ({
        path: f.path,
        mode: f.mode || '100644',
        type: 'blob',
        content: f.content,
      })),
    });

    return data.sha;
  }

  async getRef(owner: string, repo: string, ref: string): Promise<{ object: { sha: string; type: string } }> {
    const { data } = await this.octokit.git.getRef({
      owner,
      repo,
      ref,
    });

    return {
      object: {
        sha: data.object.sha,
        type: data.object.type,
      },
    };
  }

  async createRef(owner: string, repo: string, ref: string, sha: string): Promise<void> {
    await this.octokit.git.createRef({
      owner,
      repo,
      ref,
      sha,
    });
  }

  async updateRef(owner: string, repo: string, ref: string, sha: string, force = false): Promise<void> {
    await this.octokit.git.updateRef({
      owner,
      repo,
      ref,
      sha,
      force,
    });
  }
}
