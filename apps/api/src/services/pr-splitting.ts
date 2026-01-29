import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  patch?: string;
}

export interface SplitSuggestion {
  name: string;
  description: string;
  files: string[];
  additions: number;
  deletions: number;
  dependencies: number[]; // Indices of splits this depends on
  reasoning: string;
}

export interface SplitProposalResult {
  proposalId: string;
  strategy: string;
  splits: SplitSuggestion[];
  totalFiles: number;
  confidence: number;
  reasoning: string;
}

export interface ExecuteSplitResult {
  success: boolean;
  splitId: string;
  branchName?: string;
  prNumber?: number;
  error?: string;
}

export interface PRSplitProposalData {
  id: string;
  workflowId: string;
  repositoryId: string;
  originalPrNumber: number;
  originalBranch: string;
  baseBranch: string;
  status: string;
  strategy: string;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  reasoning: string | null;
  confidence: number;
  proposedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
}

export interface PRSplitData {
  id: string;
  proposalId: string;
  splitIndex: number;
  name: string;
  description: string | null;
  branchName: string | null;
  prNumber: number | null;
  files: unknown;
  additions: number;
  deletions: number;
  dependencies: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PRStackData {
  id: string;
  repositoryId: string;
  name: string;
  baseBranch: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PRStackItemData {
  id: string;
  stackId: string;
  prNumber: number;
  branchName: string;
  position: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

type SplitStrategy = 'BY_FEATURE' | 'BY_LAYER' | 'BY_FILE_TYPE' | 'BY_DEPENDENCY' | 'MANUAL';

function createGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

export class PRSplittingService {
  
  /**
   * Analyze a PR and suggest how to split it
   */
  async analyzePRForSplit(
    workflowId: string,
    installationId: number
  ): Promise<SplitProposalResult> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        repository: true,
      },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const github = createGitHubClient(installationId);
    const [owner, repo] = workflow.repository.fullName.split('/');

    // Get PR files
    const prFiles = await github.getPullRequestFiles(owner, repo, workflow.prNumber);
    
    if (prFiles.length < 5) {
      return {
        proposalId: '',
        strategy: 'NONE',
        splits: [],
        totalFiles: prFiles.length,
        confidence: 0,
        reasoning: 'PR is small enough and does not need splitting',
      };
    }

    // Analyze file patterns to determine best split strategy
    const strategy = this.determineSplitStrategy(prFiles);
    const splits = await this.generateSplitSuggestions(prFiles, strategy, workflow);

    // Calculate confidence based on split quality
    const confidence = this.calculateSplitConfidence(splits, prFiles.length);

    // Store the proposal
    const proposal = await db.pRSplitProposal.create({
      data: {
        workflowId,
        repositoryId: workflow.repositoryId,
        originalPrNumber: workflow.prNumber,
        originalBranch: workflow.headBranch,
        baseBranch: workflow.baseBranch,
        strategy,
        totalFiles: prFiles.length,
        totalAdditions: prFiles.reduce((sum, f) => sum + (f.additions || 0), 0),
        totalDeletions: prFiles.reduce((sum, f) => sum + (f.deletions || 0), 0),
        reasoning: this.generateProposalReasoning(splits, strategy),
        confidence,
        splits: {
          create: splits.map((split, index) => ({
            splitIndex: index,
            name: split.name,
            description: split.description,
            files: split.files,
            additions: split.additions,
            deletions: split.deletions,
            dependencies: split.dependencies.map(d => splits[d]?.name || ''),
          })),
        },
      },
    });

    logger.info({ proposalId: proposal.id, strategy, splitCount: splits.length }, 'PR split proposal created');

    return {
      proposalId: proposal.id,
      strategy,
      splits,
      totalFiles: prFiles.length,
      confidence,
      reasoning: proposal.reasoning || '',
    };
  }

  /**
   * Determine the best strategy to split the PR
   */
  private determineSplitStrategy(files: FileChange[]): SplitStrategy {
    const patterns = this.analyzeFilePatterns(files);

    // Check for clear layer separation (frontend/backend, src/test)
    if (patterns.hasLayerSeparation) {
      return 'BY_LAYER';
    }

    // Check for multiple feature directories
    if (patterns.featureDirectories.size >= 2) {
      return 'BY_FEATURE';
    }

    // Check for clear file type groupings
    if (patterns.fileTypeGroups.size >= 3) {
      return 'BY_FILE_TYPE';
    }

    // Default to dependency-based splitting
    return 'BY_DEPENDENCY';
  }

  /**
   * Analyze file patterns for splitting strategy
   */
  private analyzeFilePatterns(files: FileChange[]): {
    hasLayerSeparation: boolean;
    featureDirectories: Set<string>;
    fileTypeGroups: Map<string, string[]>;
  } {
    const frontendDirs = new Set(['src/components', 'src/pages', 'src/app', 'frontend', 'client', 'web']);
    const backendDirs = new Set(['src/api', 'src/services', 'src/routes', 'backend', 'server', 'api']);
    const testDirs = new Set(['__tests__', 'test', 'tests', 'spec']);

    let hasFrontend = false;
    let hasBackend = false;
    let hasTests = false;
    const featureDirectories = new Set<string>();
    const fileTypeGroups = new Map<string, string[]>();

    for (const file of files) {
      const parts = file.path.split('/');
      const ext = file.path.split('.').pop() || '';

      // Check layers
      for (const dir of frontendDirs) {
        if (file.path.includes(dir)) hasFrontend = true;
      }
      for (const dir of backendDirs) {
        if (file.path.includes(dir)) hasBackend = true;
      }
      for (const dir of testDirs) {
        if (file.path.includes(dir)) hasTests = true;
      }

      // Extract feature directory (usually 2nd or 3rd level)
      if (parts.length >= 3) {
        const featureDir = parts.slice(0, 3).join('/');
        featureDirectories.add(featureDir);
      }

      // Group by file type
      if (!fileTypeGroups.has(ext)) {
        fileTypeGroups.set(ext, []);
      }
      fileTypeGroups.get(ext)!.push(file.path);
    }

    return {
      hasLayerSeparation: (hasFrontend && hasBackend) || (hasTests && (hasFrontend || hasBackend)),
      featureDirectories,
      fileTypeGroups,
    };
  }

  /**
   * Generate split suggestions based on strategy
   */
  private async generateSplitSuggestions(
    files: FileChange[],
    strategy: SplitStrategy,
    _workflow: { headBranch: string }
  ): Promise<SplitSuggestion[]> {
    switch (strategy) {
      case 'BY_LAYER':
        return this.splitByLayer(files);
      case 'BY_FEATURE':
        return this.splitByFeature(files);
      case 'BY_FILE_TYPE':
        return this.splitByFileType(files);
      case 'BY_DEPENDENCY':
      default:
        return this.splitByDependency(files);
    }
  }

  /**
   * Split files by architectural layer
   */
  private splitByLayer(files: FileChange[]): SplitSuggestion[] {
    const layers: Record<string, FileChange[]> = {
      'Frontend/UI': [],
      'Backend/API': [],
      'Tests': [],
      'Configuration': [],
      'Other': [],
    };

    for (const file of files) {
      if (this.isTestFile(file.path)) {
        layers['Tests'].push(file);
      } else if (this.isFrontendFile(file.path)) {
        layers['Frontend/UI'].push(file);
      } else if (this.isBackendFile(file.path)) {
        layers['Backend/API'].push(file);
      } else if (this.isConfigFile(file.path)) {
        layers['Configuration'].push(file);
      } else {
        layers['Other'].push(file);
      }
    }

    const splits: SplitSuggestion[] = [];
    const layerOrder = ['Configuration', 'Backend/API', 'Frontend/UI', 'Tests', 'Other'];

    for (const layerName of layerOrder) {
      const layerFiles = layers[layerName];
      if (layerFiles.length > 0) {
        splits.push({
          name: `${layerName} changes`,
          description: `Changes to ${layerName.toLowerCase()} layer (${layerFiles.length} files)`,
          files: layerFiles.map(f => f.path),
          additions: layerFiles.reduce((sum, f) => sum + f.additions, 0),
          deletions: layerFiles.reduce((sum, f) => sum + f.deletions, 0),
          dependencies: splits.length > 0 ? [splits.length - 1] : [],
          reasoning: `Isolated ${layerName.toLowerCase()} changes for focused review`,
        });
      }
    }

    return splits;
  }

  /**
   * Split files by feature directory
   */
  private splitByFeature(files: FileChange[]): SplitSuggestion[] {
    const features = new Map<string, FileChange[]>();

    for (const file of files) {
      const parts = file.path.split('/');
      // Use 2nd-level directory as feature identifier
      const feature = parts.length >= 2 ? parts[1] : 'root';
      
      if (!features.has(feature)) {
        features.set(feature, []);
      }
      features.get(feature)!.push(file);
    }

    const splits: SplitSuggestion[] = [];

    // Sort features by size (smallest first for easier merging)
    const sortedFeatures = Array.from(features.entries())
      .sort((a, b) => a[1].length - b[1].length);

    for (const [feature, featureFiles] of sortedFeatures) {
      if (featureFiles.length > 0) {
        splits.push({
          name: `${this.formatFeatureName(feature)} changes`,
          description: `Changes related to ${feature} (${featureFiles.length} files)`,
          files: featureFiles.map(f => f.path),
          additions: featureFiles.reduce((sum, f) => sum + f.additions, 0),
          deletions: featureFiles.reduce((sum, f) => sum + f.deletions, 0),
          dependencies: [], // Feature splits are typically independent
          reasoning: `Grouped changes for ${feature} feature`,
        });
      }
    }

    return splits;
  }

  /**
   * Split files by file type/extension
   */
  private splitByFileType(files: FileChange[]): SplitSuggestion[] {
    const typeGroups = new Map<string, FileChange[]>();

    for (const file of files) {
      const ext = file.path.split('.').pop() || 'other';
      const group = this.getFileTypeGroup(ext);
      
      if (!typeGroups.has(group)) {
        typeGroups.set(group, []);
      }
      typeGroups.get(group)!.push(file);
    }

    const splits: SplitSuggestion[] = [];
    const groupOrder = ['Config/Build', 'Types/Interfaces', 'Core Logic', 'Components/UI', 'Styles', 'Tests', 'Documentation'];

    for (const group of groupOrder) {
      const groupFiles = typeGroups.get(group);
      if (groupFiles && groupFiles.length > 0) {
        splits.push({
          name: `${group}`,
          description: `${group} file changes (${groupFiles.length} files)`,
          files: groupFiles.map(f => f.path),
          additions: groupFiles.reduce((sum, f) => sum + f.additions, 0),
          deletions: groupFiles.reduce((sum, f) => sum + f.deletions, 0),
          dependencies: group === 'Tests' && splits.length > 0 ? [splits.length - 1] : [],
          reasoning: `Grouped ${group.toLowerCase()} changes`,
        });
      }
    }

    return splits;
  }

  /**
   * Split files by import/dependency relationships
   */
  private splitByDependency(files: FileChange[]): SplitSuggestion[] {
    // Group files by directory depth first
    const byDepth = new Map<number, FileChange[]>();
    
    for (const file of files) {
      const depth = file.path.split('/').length;
      if (!byDepth.has(depth)) {
        byDepth.set(depth, []);
      }
      byDepth.get(depth)!.push(file);
    }

    const splits: SplitSuggestion[] = [];
    const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);

    // Create splits from deepest to shallowest (dependencies flow upward)
    for (const depth of sortedDepths.reverse()) {
      const depthFiles = byDepth.get(depth)!;
      
      // Further group by parent directory
      const byParent = new Map<string, FileChange[]>();
      for (const file of depthFiles) {
        const parts = file.path.split('/');
        const parent = parts.slice(0, -1).join('/') || 'root';
        if (!byParent.has(parent)) {
          byParent.set(parent, []);
        }
        byParent.get(parent)!.push(file);
      }

      for (const [parent, parentFiles] of byParent.entries()) {
        if (parentFiles.length > 0) {
          splits.push({
            name: `Changes in ${parent || 'root'}`,
            description: `Files in ${parent || 'root directory'} (${parentFiles.length} files)`,
            files: parentFiles.map(f => f.path),
            additions: parentFiles.reduce((sum, f) => sum + f.additions, 0),
            deletions: parentFiles.reduce((sum, f) => sum + f.deletions, 0),
            dependencies: splits.length > 0 ? [0] : [], // Each depends on first split
            reasoning: `Directory-based grouping for ${parent || 'root'}`,
          });
        }
      }
    }

    return splits;
  }

  /**
   * Execute a single split - create branch and PR
   */
  async executeSplit(
    splitId: string,
    installationId: number,
    _userId: string
  ): Promise<ExecuteSplitResult> {
    const split = await db.pRSplit.findUnique({
      where: { id: splitId },
      include: {
        proposal: {
          include: {
            splits: true,
          },
        },
      },
    });

    if (!split) {
      return { success: false, splitId, error: 'Split not found' };
    }

    // Check dependencies are completed
    const dependencyIds = split.dependencies as string[];
    if (dependencyIds.length > 0) {
      const incompleteDeps = split.proposal.splits.filter(
        s => dependencyIds.includes(s.name) && s.status !== 'COMPLETED'
      );
      if (incompleteDeps.length > 0) {
        return {
          success: false,
          splitId,
          error: `Dependencies not completed: ${incompleteDeps.map(d => d.name).join(', ')}`,
        };
      }
    }

    const repository = await db.repository.findUnique({
      where: { id: split.proposal.repositoryId },
    });

    if (!repository) {
      return { success: false, splitId, error: 'Repository not found' };
    }

    const github = createGitHubClient(installationId);
    const [owner, repo] = repository.fullName.split('/');

    try {
      // Update status to in progress
      await db.pRSplit.update({
        where: { id: splitId },
        data: { status: 'IN_PROGRESS' },
      });

      // Create branch name
      const branchName = `split/${split.proposal.originalBranch}-${split.splitIndex + 1}-${this.slugify(split.name)}`;

      // Get base branch SHA
      const baseBranch = split.proposal.baseBranch;
      const baseRef = await github.getRef(owner, repo, `heads/${baseBranch}`);
      
      // Create new branch from base
      await github.createRef(owner, repo, `refs/heads/${branchName}`, baseRef.object.sha);

      // Cherry-pick the relevant changes (simplified - in production would use proper git operations)
      const files = split.files as string[];
      
      // Get file contents from original PR branch
      for (const filePath of files) {
        try {
          const contentResult = await github.getFileContent(owner, repo, filePath, split.proposal.originalBranch);
          if (contentResult && typeof contentResult === 'object' && 'content' in contentResult) {
            await github.createOrUpdateFileContent(
              owner,
              repo,
              filePath,
              (contentResult as { content: string }).content,
              `Add ${filePath} from split`,
              branchName,
              undefined
            );
          }
        } catch (err) {
          logger.warn({ filePath, error: err }, 'Could not copy file in split');
        }
      }

      // Create PR
      const pr = await github.createPullRequest(
        owner,
        repo,
        split.name,
        branchName,
        baseBranch,
        split.description || `Part ${split.splitIndex + 1} of split from #${split.proposal.originalPrNumber}`
      );

      // Update split with PR info
      await db.pRSplit.update({
        where: { id: splitId },
        data: {
          branchName,
          prNumber: pr.number,
          status: 'COMPLETED',
        },
      });

      logger.info({ splitId, branchName, prNumber: pr.number }, 'Split executed successfully');

      return {
        success: true,
        splitId,
        branchName,
        prNumber: pr.number,
      };
    } catch (error) {
      logger.error({ splitId, error }, 'Failed to execute split');
      
      await db.pRSplit.update({
        where: { id: splitId },
        data: { status: 'FAILED' },
      });

      return {
        success: false,
        splitId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Execute all splits in a proposal
   */
  async executeAllSplits(
    proposalId: string,
    installationId: number,
    userId: string
  ): Promise<{ success: boolean; results: ExecuteSplitResult[] }> {
    const proposal = await db.pRSplitProposal.findUnique({
      where: { id: proposalId },
      include: { splits: { orderBy: { splitIndex: 'asc' } } },
    });

    if (!proposal) {
      return { success: false, results: [] };
    }

    await db.pRSplitProposal.update({
      where: { id: proposalId },
      data: { status: 'IN_PROGRESS', acceptedAt: new Date() },
    });

    const results: ExecuteSplitResult[] = [];

    for (const split of proposal.splits) {
      const result = await this.executeSplit(split.id, installationId, userId);
      results.push(result);

      if (!result.success) {
        // Stop on first failure
        break;
      }
    }

    const allSuccess = results.every(r => r.success);
    
    await db.pRSplitProposal.update({
      where: { id: proposalId },
      data: {
        status: allSuccess ? 'COMPLETED' : 'FAILED',
        completedAt: allSuccess ? new Date() : undefined,
      },
    });

    return { success: allSuccess, results };
  }

  /**
   * Get split proposal status
   */
  async getProposalStatus(proposalId: string): Promise<{
    proposal: PRSplitProposalData | null;
    splits: PRSplitData[];
  } | null> {
    const proposal = await db.pRSplitProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) return null;

    const splits = await db.pRSplit.findMany({
      where: { proposalId },
      orderBy: { splitIndex: 'asc' },
    });

    return { proposal: proposal as PRSplitProposalData, splits: splits as PRSplitData[] };
  }

  /**
   * Create a PR stack from executed splits
   */
  async createStackFromProposal(
    proposalId: string
  ): Promise<{ stackId: string; items: number } | null> {
    const proposal = await db.pRSplitProposal.findUnique({
      where: { id: proposalId },
      include: {
        splits: {
          where: { prNumber: { not: null } },
          orderBy: { splitIndex: 'asc' },
        },
      },
    });

    if (!proposal || proposal.splits.length === 0) {
      return null;
    }

    const stack = await db.pRStack.create({
      data: {
        repositoryId: proposal.repositoryId,
        name: `Stack from PR #${proposal.originalPrNumber}`,
        baseBranch: proposal.baseBranch,
        items: {
          create: proposal.splits.map((split, index) => ({
            prNumber: split.prNumber!,
            branchName: split.branchName!,
            position: index + 1,
          })),
        },
      },
    });

    return { stackId: stack.id, items: proposal.splits.length };
  }

  /**
   * Get stack status with merge order
   */
  async getStackStatus(stackId: string): Promise<{
    stack: PRStackData | null;
    items: PRStackItemData[];
    nextToMerge: PRStackItemData | null;
  } | null> {
    const stack = await db.pRStack.findUnique({
      where: { id: stackId },
    });

    if (!stack) return null;

    const items = await db.pRStackItem.findMany({
      where: { stackId },
      orderBy: { position: 'asc' },
    });

    const nextToMerge = items.find(i => i.status === 'pending') || null;

    return { 
      stack: stack as PRStackData, 
      items: items as PRStackItemData[], 
      nextToMerge: nextToMerge as PRStackItemData | null,
    };
  }

  // Helper methods

  private isTestFile(path: string): boolean {
    return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path) ||
           path.includes('__tests__') ||
           path.includes('/test/') ||
           path.includes('/tests/');
  }

  private isFrontendFile(path: string): boolean {
    return path.includes('/components/') ||
           path.includes('/pages/') ||
           path.includes('/app/') ||
           path.includes('/ui/') ||
           path.endsWith('.tsx') ||
           path.endsWith('.css') ||
           path.endsWith('.scss');
  }

  private isBackendFile(path: string): boolean {
    return path.includes('/api/') ||
           path.includes('/services/') ||
           path.includes('/routes/') ||
           path.includes('/controllers/') ||
           path.includes('/middleware/');
  }

  private isConfigFile(path: string): boolean {
    const configFiles = [
      'package.json', 'tsconfig.json', '.eslintrc', '.prettierrc',
      'webpack.config', 'vite.config', 'next.config', 'jest.config',
      'Dockerfile', 'docker-compose', '.env', 'Makefile',
    ];
    return configFiles.some(cf => path.includes(cf)) ||
           path.endsWith('.config.js') ||
           path.endsWith('.config.ts');
  }

  private getFileTypeGroup(ext: string): string {
    const groups: Record<string, string> = {
      'json': 'Config/Build',
      'yaml': 'Config/Build',
      'yml': 'Config/Build',
      'toml': 'Config/Build',
      'd.ts': 'Types/Interfaces',
      'ts': 'Core Logic',
      'js': 'Core Logic',
      'tsx': 'Components/UI',
      'jsx': 'Components/UI',
      'css': 'Styles',
      'scss': 'Styles',
      'less': 'Styles',
      'md': 'Documentation',
      'mdx': 'Documentation',
      'test.ts': 'Tests',
      'spec.ts': 'Tests',
    };
    return groups[ext] || 'Core Logic';
  }

  private formatFeatureName(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
  }

  private calculateSplitConfidence(splits: SplitSuggestion[], totalFiles: number): number {
    if (splits.length === 0) return 0;
    if (splits.length === 1) return 0.5;

    // Higher confidence when:
    // 1. Splits are relatively balanced in size
    // 2. Number of splits is reasonable (2-5 is ideal)
    // 3. Each split has clear purpose

    const avgFiles = totalFiles / splits.length;
    const sizeVariance = splits.reduce((sum, s) => {
      const diff = s.files.length - avgFiles;
      return sum + (diff * diff);
    }, 0) / splits.length;

    const balanceScore = Math.max(0, 1 - (sizeVariance / (avgFiles * avgFiles)));
    const countScore = splits.length >= 2 && splits.length <= 5 ? 1 : 0.7;

    return Math.min(0.95, (balanceScore * 0.6 + countScore * 0.4));
  }

  private generateProposalReasoning(splits: SplitSuggestion[], strategy: SplitStrategy): string {
    const strategyDescriptions: Record<SplitStrategy, string> = {
      'BY_LAYER': 'architectural layer separation',
      'BY_FEATURE': 'feature/module boundaries',
      'BY_FILE_TYPE': 'file type grouping',
      'BY_DEPENDENCY': 'dependency relationships',
      'MANUAL': 'manual selection',
    };

    return `This PR can be split into ${splits.length} smaller PRs based on ${strategyDescriptions[strategy]}. ` +
           `Each split is designed to be independently reviewable while maintaining logical coherence. ` +
           `Recommended merge order: ${splits.map((s, i) => `${i + 1}. ${s.name}`).join(', ')}.`;
  }
}

export const prSplittingService = new PRSplittingService();
