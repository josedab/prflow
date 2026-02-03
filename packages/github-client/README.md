# @prflow/github-client

GitHub API client wrapper for PRFlow using Octokit.

## Installation

This is an internal package. It's automatically available in the monorepo workspace:

```typescript
import { createGitHubClient, GitHubClient } from '@prflow/github-client';
```

## Features

- **App Authentication**: Authenticate as a GitHub App installation
- **Pull Request Operations**: Fetch PRs, diffs, comments
- **Review Management**: Post review comments, request reviews
- **Check Runs**: Create and update check runs
- **File Operations**: Read and modify repository files
- **Git Operations**: Create branches, commits, merges
- **Webhook Handling**: Verify and process GitHub webhooks

## Usage

### Creating a Client

```typescript
import { createGitHubClient } from '@prflow/github-client';

const github = createGitHubClient({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
  installationId: 12345,
});
```

### Pull Request Operations

```typescript
// Get pull request
const pr = await github.getPullRequest('owner', 'repo', 123);
console.log(pr.title, pr.head.sha);

// Get PR diff
const diff = await github.getPullRequestDiff('owner', 'repo', 123);
console.log(`${diff.files.length} files changed`);
console.log(`+${diff.totalAdditions} -${diff.totalDeletions}`);

// List PR files
const files = await github.listPullRequestFiles('owner', 'repo', 123);
files.forEach(f => console.log(f.filename, f.status));
```

### Review Comments

```typescript
// Post a single review comment
await github.createReviewComment('owner', 'repo', 123, {
  body: 'Consider using a constant here',
  commit_id: 'abc123',
  path: 'src/utils.ts',
  line: 42,
});

// Post a batch review
await github.createReview('owner', 'repo', 123, {
  commit_id: 'abc123',
  event: 'COMMENT',
  comments: [
    { path: 'src/a.ts', line: 10, body: 'Issue 1' },
    { path: 'src/b.ts', line: 20, body: 'Issue 2' },
  ],
});

// Post a PR comment (not line-specific)
await github.createIssueComment('owner', 'repo', 123, 'Summary comment');
```

### Check Runs

```typescript
// Create a check run
const checkRunId = await github.createCheckRun('owner', 'repo', 'abc123', {
  name: 'PRFlow Analysis',
  status: 'in_progress',
  output: {
    title: 'Analyzing...',
    summary: 'PRFlow is analyzing your PR',
  },
});

// Update check run
await github.updateCheckRun('owner', 'repo', checkRunId, {
  status: 'completed',
  conclusion: 'success',
  output: {
    title: 'Analysis Complete',
    summary: 'No issues found',
  },
});
```

### File Operations

```typescript
// Read a file
const content = await github.getFileContent('owner', 'repo', 'src/index.ts', 'main');
console.log(content);

// Create or update a file
await github.createOrUpdateFile('owner', 'repo', 'path/to/file.ts', {
  message: 'Update file',
  content: Buffer.from('new content').toString('base64'),
  branch: 'feature-branch',
  sha: 'existing-file-sha', // Required for updates
});
```

### Git Operations

```typescript
// Create a branch
await github.createBranch('owner', 'repo', 'new-branch', 'main');

// Create a commit
await github.createCommit('owner', 'repo', {
  message: 'Apply fixes',
  tree: 'tree-sha',
  parents: ['parent-sha'],
});

// Merge branches
await github.mergeBranches('owner', 'repo', 'main', 'feature-branch');
```

### Webhook Handling

```typescript
import { verifyWebhookSignature, parseWebhookPayload } from '@prflow/github-client';

// Verify webhook
const isValid = verifyWebhookSignature(
  payload,
  signature,
  process.env.GITHUB_WEBHOOK_SECRET
);

// Parse and handle webhook
const event = parseWebhookPayload(headers, body);

if (event.name === 'pull_request' && event.payload.action === 'opened') {
  const pr = event.payload.pull_request;
  console.log(`New PR: ${pr.title}`);
}
```

## Client Methods

### PR Client

| Method | Description |
|--------|-------------|
| `getPullRequest(owner, repo, number)` | Get PR details |
| `getPullRequestDiff(owner, repo, number)` | Get PR diff with file patches |
| `listPullRequestFiles(owner, repo, number)` | List changed files |
| `listPullRequestCommits(owner, repo, number)` | List PR commits |
| `mergePullRequest(owner, repo, number, options)` | Merge a PR |

### Review Client

| Method | Description |
|--------|-------------|
| `createReview(owner, repo, number, review)` | Create a PR review |
| `createReviewComment(owner, repo, number, comment)` | Add line comment |
| `createIssueComment(owner, repo, number, body)` | Add PR comment |
| `requestReviewers(owner, repo, number, reviewers)` | Request reviewers |

### Check Client

| Method | Description |
|--------|-------------|
| `createCheckRun(owner, repo, sha, options)` | Create check run |
| `updateCheckRun(owner, repo, id, options)` | Update check run |
| `listCheckRuns(owner, repo, ref)` | List check runs for ref |

### File Client

| Method | Description |
|--------|-------------|
| `getFileContent(owner, repo, path, ref)` | Read file content |
| `createOrUpdateFile(owner, repo, path, options)` | Write file |
| `deleteFile(owner, repo, path, options)` | Delete file |
| `getTree(owner, repo, sha, recursive)` | Get tree |

### Git Client

| Method | Description |
|--------|-------------|
| `createBranch(owner, repo, name, base)` | Create branch |
| `deleteBranch(owner, repo, name)` | Delete branch |
| `createCommit(owner, repo, options)` | Create commit |
| `getCommit(owner, repo, sha)` | Get commit |
| `compareBranches(owner, repo, base, head)` | Compare branches |

### Repo Client

| Method | Description |
|--------|-------------|
| `getRepository(owner, repo)` | Get repo info |
| `listBranches(owner, repo)` | List branches |
| `getBranchProtection(owner, repo, branch)` | Get protection rules |

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Lint
pnpm lint
```

## Dependencies

- `@octokit/rest` - GitHub REST API client
- `@octokit/auth-app` - GitHub App authentication
- `@octokit/webhooks` - Webhook handling
- `@octokit/graphql` - GraphQL API support
- `@prflow/core` - Shared types
