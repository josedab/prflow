import * as core from '@actions/core';
import * as github from '@actions/github';

interface PRFlowConfig {
  reviewEnabled: boolean;
  testGeneration: boolean;
  docUpdates: boolean;
  severityThreshold: string;
  autoFixStyle: boolean;
  blockOnCritical: boolean;
  failOnHigh: boolean;
  ignorePaths: string[];
  commentOnPr: boolean;
  maxComments: number;
  dryRun: boolean;
}

interface IssueCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  nitpick: number;
}

async function run(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Get inputs
    const githubToken = core.getInput('github-token', { required: true });
    // PRFlow API token for advanced features (reserved for future use)
    core.getInput('prflow-token');

    const config: PRFlowConfig = {
      reviewEnabled: core.getBooleanInput('review-enabled'),
      testGeneration: core.getBooleanInput('test-generation'),
      docUpdates: core.getBooleanInput('doc-updates'),
      severityThreshold: core.getInput('severity-threshold'),
      autoFixStyle: core.getBooleanInput('auto-fix-style'),
      blockOnCritical: core.getBooleanInput('block-on-critical'),
      failOnHigh: core.getBooleanInput('fail-on-high'),
      ignorePaths: core.getInput('ignore-paths')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      commentOnPr: core.getBooleanInput('comment-on-pr'),
      maxComments: parseInt(core.getInput('max-comments') || '25', 10),
      dryRun: core.getBooleanInput('dry-run'),
    };

    core.startGroup('Configuration');
    core.info(`Review enabled: ${config.reviewEnabled}`);
    core.info(`Test generation: ${config.testGeneration}`);
    core.info(`Severity threshold: ${config.severityThreshold}`);
    core.info(`Block on critical: ${config.blockOnCritical}`);
    core.info(`Dry run: ${config.dryRun}`);
    core.endGroup();

    // Get PR context
    const context = github.context;
    if (context.eventName !== 'pull_request' && context.eventName !== 'pull_request_target') {
      core.warning('PRFlow action should only run on pull_request events');
      return;
    }

    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
      core.setFailed('Could not determine PR number');
      return;
    }

    const owner = context.repo.owner;
    const repo = context.repo.repo;

    core.info(`Processing PR #${prNumber} in ${owner}/${repo}`);

    // Create GitHub client
    const octokit = github.getOctokit(githubToken);

    // Get PR details
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get PR files
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    core.info(`Found ${files.length} changed files`);

    // Filter ignored paths
    const filteredFiles = files.filter(
      (f) => !config.ignorePaths.some((p) => f.filename.startsWith(p))
    );

    if (filteredFiles.length === 0) {
      core.info('No files to analyze after applying ignore paths');
      core.setOutput('issues-found', 0);
      core.setOutput('risk-level', 'low');
      return;
    }

    // Create check run (unless dry run)
    let checkRunId: number | undefined;
    if (!config.dryRun) {
      const { data: checkRun } = await octokit.rest.checks.create({
        owner,
        repo,
        name: 'PRFlow Analysis',
        head_sha: pr.head.sha,
        status: 'in_progress',
        output: {
          title: 'Analyzing PR...',
          summary: 'PRFlow is analyzing your pull request.',
        },
      });
      checkRunId = checkRun.id;
      core.setOutput('check-run-id', checkRunId);
    }

    // Perform analysis
    core.startGroup('Analysis');
    const analysis = await analyzePR(pr, filteredFiles, config);
    core.endGroup();

    // Post results
    const summary = formatSummary(analysis);
    const conclusion = determineConclusion(analysis, config);

    if (!config.dryRun && checkRunId) {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: 'completed',
        conclusion,
        output: {
          title: analysis.title,
          summary: summary,
          text: analysis.details,
        },
      });
    }

    // Post review comments (respect max comments limit)
    if (config.reviewEnabled && !config.dryRun && analysis.comments.length > 0) {
      const commentsToPost = analysis.comments.slice(0, config.maxComments);
      let postedCount = 0;
      let failedCount = 0;
      
      for (const comment of commentsToPost) {
        try {
          await octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: prNumber,
            body: comment.body,
            commit_id: pr.head.sha,
            path: comment.path,
            line: comment.line,
          });
          postedCount++;
        } catch (error) {
          failedCount++;
          core.warning(`Failed to post comment on ${comment.path}:${comment.line}`);
        }
      }
      
      if (analysis.comments.length > config.maxComments) {
        core.warning(`Only posted ${config.maxComments} of ${analysis.comments.length} comments (max-comments limit)`);
      }
      
      core.info(`Posted ${postedCount} comments, ${failedCount} failed`);
    }

    // Post summary comment
    if (config.commentOnPr && !config.dryRun) {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: summary,
      });
    }

    // Set outputs
    core.setOutput('analysis-summary', analysis.title);
    core.setOutput('issues-found', analysis.issueCount);
    core.setOutput('tests-generated', analysis.testsGenerated);
    core.setOutput('critical-count', analysis.issueCounts.critical);
    core.setOutput('high-count', analysis.issueCounts.high);
    core.setOutput('medium-count', analysis.issueCounts.medium);
    core.setOutput('risk-level', analysis.riskLevel);
    core.setOutput('pr-type', analysis.prType);

    // Log timing
    const duration = Date.now() - startTime;
    core.info(`Analysis completed in ${duration}ms`);

    // Determine failure condition
    if (config.blockOnCritical && analysis.hasCritical) {
      core.setFailed('Critical issues found in PR');
    } else if (config.failOnHigh && analysis.issueCounts.high > 0) {
      core.setFailed('High severity issues found in PR');
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    core.error(`PRFlow failed after ${duration}ms`);
    
    if (error instanceof Error) {
      core.setFailed(`PRFlow analysis failed: ${error.message}`);
      core.debug(error.stack || '');
    } else {
      core.setFailed('PRFlow analysis failed with unknown error');
    }
  }
}

interface AnalysisResult {
  title: string;
  details: string;
  comments: Array<{ path: string; line: number; body: string; severity: string }>;
  issueCount: number;
  issueCounts: IssueCount;
  testsGenerated: number;
  hasCritical: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  prType: string;
}

async function analyzePR(
  pr: { title: string; body?: string | null; head: { ref: string } },
  files: Array<{ filename: string; status: string; patch?: string; additions: number; deletions: number }>,
  config: PRFlowConfig
): Promise<AnalysisResult> {
  const comments: Array<{ path: string; line: number; body: string; severity: string }> = [];
  const issueCounts: IssueCount = { critical: 0, high: 0, medium: 0, low: 0, nitpick: 0 };
  let hasCritical = false;

  // Detect PR type from branch name or title
  const prType = detectPRType(pr.title, pr.head.ref);
  core.info(`Detected PR type: ${prType}`);

  // Simple pattern-based analysis (in production, this would call PRFlow API)
  for (const file of files) {
    if (!file.patch) continue;

    const lines = file.patch.split('\n');
    let currentLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track line numbers
      const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (hunkMatch) {
        currentLine = parseInt(hunkMatch[1], 10) - 1;
        continue;
      }

      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      currentLine++;

      const code = line.substring(1);

      // Check for common issues
      if (checkSeverity('critical', config.severityThreshold)) {
        // SQL Injection
        if (/`SELECT.*\$\{|['"]SELECT.*['"].*\+/i.test(code)) {
          comments.push({
            path: file.filename,
            line: currentLine,
            severity: 'critical',
            body: '🔴 **Critical: Potential SQL Injection**\n\nUser input appears to be interpolated into SQL query. Use parameterized queries.',
          });
          issueCounts.critical++;
          hasCritical = true;
        }

        // Hardcoded secrets
        if (/(password|secret|api_key|token)\s*[=:]\s*['"][^'"]+['"]/i.test(code) &&
            !code.includes('process.env') && !code.includes('os.environ')) {
          comments.push({
            path: file.filename,
            line: currentLine,
            severity: 'critical',
            body: '🔴 **Critical: Hardcoded Secret**\n\nSecrets should not be hardcoded. Use environment variables.',
          });
          issueCounts.critical++;
          hasCritical = true;
        }
      }

      if (checkSeverity('high', config.severityThreshold)) {
        // Empty catch blocks
        if (/catch\s*\([^)]*\)\s*{\s*}/.test(code)) {
          comments.push({
            path: file.filename,
            line: currentLine,
            severity: 'high',
            body: '🟠 **High: Empty Catch Block**\n\nEmpty catch blocks swallow errors silently. At minimum, log the error.',
          });
          issueCounts.high++;
        }
      }

      if (checkSeverity('medium', config.severityThreshold)) {
        // Console.log in production code
        if (/console\.(log|debug)\(/.test(code) && !file.filename.includes('test')) {
          comments.push({
            path: file.filename,
            line: currentLine,
            severity: 'medium',
            body: '🟡 **Medium: Console Statement**\n\nConsider removing console statements or using a proper logging library.',
          });
          issueCounts.medium++;
        }
      }
    }
  }

  // Calculate totals
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const issueCount = issueCounts.critical + issueCounts.high + issueCounts.medium + issueCounts.low + issueCounts.nitpick;
  
  // Determine risk level
  const riskLevel = determineRiskLevel(issueCounts, totalAdditions + totalDeletions, files.length);

  const title = issueCount === 0 
    ? '✅ No issues found' 
    : `⚠️ ${issueCount} issue(s) found`;

  const details = `
## PRFlow Analysis

### PR Overview
- **Title:** ${pr.title}
- **Type:** ${prType}
- **Branch:** ${pr.head.ref}
- **Files Changed:** ${files.length}
- **Lines:** +${totalAdditions} / -${totalDeletions}
- **Risk Level:** ${riskLevel}

### Findings
| Severity | Count |
|----------|-------|
| 🔴 Critical | ${issueCounts.critical} |
| 🟠 High | ${issueCounts.high} |
| 🟡 Medium | ${issueCounts.medium} |
| 🔵 Low | ${issueCounts.low} |
| ✨ Nitpick | ${issueCounts.nitpick} |

**Total Issues:** ${issueCount}

### Configuration
- Review Enabled: ${config.reviewEnabled}
- Test Generation: ${config.testGeneration}
- Severity Threshold: ${config.severityThreshold}
`;

  return {
    title,
    details,
    comments,
    issueCount,
    issueCounts,
    testsGenerated: 0,
    hasCritical,
    riskLevel,
    prType,
  };
}

function detectPRType(title: string, branch: string): string {
  const titleLower = title.toLowerCase();
  const branchLower = branch.toLowerCase();
  
  if (branchLower.includes('fix') || titleLower.includes('fix') || titleLower.includes('bug')) {
    return 'bugfix';
  }
  if (branchLower.includes('feat') || titleLower.includes('feat') || titleLower.includes('add')) {
    return 'feature';
  }
  if (branchLower.includes('refactor') || titleLower.includes('refactor')) {
    return 'refactor';
  }
  if (branchLower.includes('doc') || titleLower.includes('doc')) {
    return 'docs';
  }
  if (branchLower.includes('test') || titleLower.includes('test')) {
    return 'test';
  }
  if (branchLower.includes('chore') || titleLower.includes('chore') || titleLower.includes('deps')) {
    return 'chore';
  }
  return 'feature';
}

function determineRiskLevel(counts: IssueCount, totalChanges: number, fileCount: number): 'low' | 'medium' | 'high' | 'critical' {
  if (counts.critical > 0) return 'critical';
  if (counts.high > 2) return 'high';
  if (counts.high > 0 || counts.medium > 5) return 'medium';
  if (totalChanges > 500 || fileCount > 20) return 'medium';
  return 'low';
}

function checkSeverity(level: string, threshold: string): boolean {
  const severityOrder = ['critical', 'high', 'medium', 'low', 'nitpick'];
  const levelIndex = severityOrder.indexOf(level);
  const thresholdIndex = severityOrder.indexOf(threshold);
  return levelIndex <= thresholdIndex;
}

function formatSummary(analysis: AnalysisResult): string {
  return `## 🤖 PRFlow Analysis

${analysis.title}

${analysis.details}

---
*Analyzed by [PRFlow](https://prflow.dev)*`;
}

function determineConclusion(
  analysis: AnalysisResult,
  config: PRFlowConfig
): 'success' | 'failure' | 'neutral' {
  if (config.blockOnCritical && analysis.hasCritical) {
    return 'failure';
  }
  if (analysis.issueCount > 0) {
    return 'neutral';
  }
  return 'success';
}

run();
