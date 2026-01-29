import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';
import { callLLM } from '../lib/llm.js';
import { prSplittingService, type FileChange, type SplitSuggestion } from './pr-splitting.js';
import { NotFoundError } from '../lib/errors.js';

function createGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * AI-suggested split with detailed reasoning
 */
export interface AISplitRecommendation {
  id: string;
  name: string;
  description: string;
  files: string[];
  estimatedReviewTime: number; // minutes
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';
  riskLevel: 'low' | 'medium' | 'high';
  reviewerHints: string[];
  dependencies: string[];
  reasoning: string;
}

/**
 * Wizard state for interactive splitting
 */
export interface WizardState {
  id: string;
  workflowId: string;
  repositoryId: string;
  prNumber: number;
  step: 'analyze' | 'recommend' | 'customize' | 'preview' | 'execute' | 'complete';
  files: FileChange[];
  aiRecommendations: AISplitRecommendation[];
  userSelections: {
    selectedStrategy?: string;
    customSplits?: Array<{
      name: string;
      files: string[];
    }>;
    excludedFiles?: string[];
    mergeOrder?: string[];
  };
  metadata: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    estimatedReviewTime: number;
    detectedPatterns: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Strategy comparison for user selection
 */
export interface StrategyComparison {
  strategy: string;
  description: string;
  pros: string[];
  cons: string[];
  resultingSplits: number;
  recommendedFor: string;
  confidence: number;
}

/**
 * Preview of what the split will look like
 */
export interface SplitPreview {
  splits: Array<{
    name: string;
    files: string[];
    additions: number;
    deletions: number;
    estimatedReviewTime: number;
    branchName: string;
    prTitle: string;
    prBody: string;
  }>;
  mergeOrder: string[];
  totalEstimatedTime: number;
  warnings: string[];
}

export class PRDecompositionWizardService {
  private wizardStates = new Map<string, WizardState>();

  /**
   * Start a new decomposition wizard session
   */
  async startWizard(workflowId: string, installationId: number): Promise<WizardState> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true, analysis: true },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    // Get PR files using GitHub API
    const files = await this.fetchPRFilesFromGitHub(
      installationId,
      workflow.repository.owner,
      workflow.repository.name,
      workflow.prNumber
    );

    const wizardId = `wizard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const state: WizardState = {
      id: wizardId,
      workflowId,
      repositoryId: workflow.repositoryId,
      prNumber: workflow.prNumber,
      step: 'analyze',
      files,
      aiRecommendations: [],
      userSelections: {},
      metadata: {
        totalFiles: files.length,
        totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
        totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
        estimatedReviewTime: this.estimateReviewTime(files),
        detectedPatterns: this.detectPatterns(files),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.wizardStates.set(wizardId, state);

    logger.info({ wizardId, workflowId, fileCount: files.length }, 'Decomposition wizard started');

    return state;
  }

  /**
   * Get AI recommendations for splitting
   */
  async getAIRecommendations(wizardId: string): Promise<AISplitRecommendation[]> {
    const state = this.getState(wizardId);

    if (state.aiRecommendations.length > 0) {
      return state.aiRecommendations;
    }

    // Generate AI recommendations
    const recommendations = await this.generateAIRecommendations(state);
    
    state.aiRecommendations = recommendations;
    state.step = 'recommend';
    state.updatedAt = new Date();

    return recommendations;
  }

  /**
   * Compare different splitting strategies
   */
  async compareStrategies(wizardId: string): Promise<StrategyComparison[]> {
    const state = this.getState(wizardId);
    const { files } = state;

    const strategies: StrategyComparison[] = [
      {
        strategy: 'BY_LAYER',
        description: 'Split by architectural layer (frontend, backend, tests, config)',
        pros: [
          'Clear separation of concerns',
          'Easier to assign specialized reviewers',
          'Natural CI/CD pipeline stages',
        ],
        cons: [
          'May split related changes',
          'Dependencies between layers need careful ordering',
        ],
        resultingSplits: this.countLayerSplits(files),
        recommendedFor: 'Full-stack changes spanning multiple layers',
        confidence: this.calculateLayerConfidence(files),
      },
      {
        strategy: 'BY_FEATURE',
        description: 'Split by feature or module directories',
        pros: [
          'Keeps related changes together',
          'Each PR tells a complete story',
          'Easier to revert specific features',
        ],
        cons: [
          'May create very uneven PR sizes',
          'Cross-cutting changes need special handling',
        ],
        resultingSplits: this.countFeatureSplits(files),
        recommendedFor: 'Multiple independent features or refactoring',
        confidence: this.calculateFeatureConfidence(files),
      },
      {
        strategy: 'BY_RISK',
        description: 'Split by risk level (safe changes first, risky changes last)',
        pros: [
          'Reduces review fatigue on complex changes',
          'Allows quick merge of safe changes',
          'Isolates potentially breaking changes',
        ],
        cons: [
          'May not align with logical grouping',
          'Requires accurate risk assessment',
        ],
        resultingSplits: 3, // Low, medium, high risk
        recommendedFor: 'Large PRs with mixed risk levels',
        confidence: 0.7,
      },
      {
        strategy: 'BY_REVIEW_TIME',
        description: 'Split to achieve target review time per PR (15-30 min)',
        pros: [
          'Optimizes reviewer attention span',
          'Predictable review completion times',
          'Reduces cognitive overload',
        ],
        cons: [
          'May split logically related code',
          'Mechanical splitting may lose context',
        ],
        resultingSplits: Math.ceil(state.metadata.estimatedReviewTime / 20),
        recommendedFor: 'Very large PRs needing time-boxed reviews',
        confidence: 0.65,
      },
      {
        strategy: 'AI_OPTIMAL',
        description: 'AI-optimized split balancing all factors',
        pros: [
          'Considers code dependencies',
          'Balances size and complexity',
          'Learns from codebase patterns',
        ],
        cons: [
          'May need manual adjustments',
          'Reasoning may not always be clear',
        ],
        resultingSplits: state.aiRecommendations.length || 3,
        recommendedFor: 'Complex PRs where best approach is unclear',
        confidence: 0.85,
      },
    ];

    return strategies;
  }

  /**
   * Apply user customizations to the split plan
   */
  async customizeSplits(
    wizardId: string,
    customizations: {
      selectedStrategy?: string;
      customSplits?: Array<{ name: string; files: string[] }>;
      excludedFiles?: string[];
      mergeOrder?: string[];
    }
  ): Promise<WizardState> {
    const state = this.getState(wizardId);

    state.userSelections = {
      ...state.userSelections,
      ...customizations,
    };
    state.step = 'customize';
    state.updatedAt = new Date();

    return state;
  }

  /**
   * Generate preview of the splits
   */
  async generatePreview(wizardId: string): Promise<SplitPreview> {
    const state = this.getState(wizardId);
    const { files, userSelections, aiRecommendations } = state;

    let splits: SplitSuggestion[];

    if (userSelections.customSplits && userSelections.customSplits.length > 0) {
      // Use user's custom splits
      splits = userSelections.customSplits.map((cs, i) => ({
        name: cs.name,
        description: `Custom split ${i + 1}`,
        files: cs.files,
        additions: this.sumAdditions(files.filter(f => cs.files.includes(f.path))),
        deletions: this.sumDeletions(files.filter(f => cs.files.includes(f.path))),
        dependencies: [],
        reasoning: 'User-defined split',
      }));
    } else if (aiRecommendations.length > 0) {
      // Use AI recommendations
      splits = aiRecommendations.map(rec => ({
        name: rec.name,
        description: rec.description,
        files: rec.files,
        additions: this.sumAdditions(files.filter(f => rec.files.includes(f.path))),
        deletions: this.sumDeletions(files.filter(f => rec.files.includes(f.path))),
        dependencies: rec.dependencies.map(d => {
          const idx = aiRecommendations.findIndex(r => r.id === d);
          return idx;
        }).filter(i => i >= 0),
        reasoning: rec.reasoning,
      }));
    } else {
      // Generate default splits
      const proposal = await prSplittingService.analyzePRForSplit(
        state.workflowId,
        parseInt(process.env.GITHUB_INSTALLATION_ID || '0')
      );
      splits = proposal.splits;
    }

    // Exclude specified files
    if (userSelections.excludedFiles && userSelections.excludedFiles.length > 0) {
      splits = splits.map(split => ({
        ...split,
        files: split.files.filter(f => !userSelections.excludedFiles!.includes(f)),
      }));
    }

    // Generate preview data
    const previewSplits = splits.map((split, i) => ({
      name: split.name,
      files: split.files,
      additions: split.additions,
      deletions: split.deletions,
      estimatedReviewTime: this.estimateReviewTimeForFiles(
        files.filter(f => split.files.includes(f.path))
      ),
      branchName: this.generateBranchName(state.prNumber, i, split.name),
      prTitle: this.generatePRTitle(split.name, state.prNumber),
      prBody: this.generatePRBody(split, i, splits.length, state.prNumber),
    }));

    const mergeOrder = userSelections.mergeOrder || splits.map(s => s.name);
    const warnings = this.generateWarnings(splits, files);

    state.step = 'preview';
    state.updatedAt = new Date();

    return {
      splits: previewSplits,
      mergeOrder,
      totalEstimatedTime: previewSplits.reduce((sum, s) => sum + s.estimatedReviewTime, 0),
      warnings,
    };
  }

  /**
   * Execute the decomposition (create branches and PRs)
   */
  async executeDecomposition(
    wizardId: string,
    installationId: number,
    userId: string
  ): Promise<{
    success: boolean;
    proposalId?: string;
    createdPRs: Array<{ number: number; title: string; url: string }>;
    errors: string[];
  }> {
    const state = this.getState(wizardId);
    state.step = 'execute';
    state.updatedAt = new Date();

    try {
      // First create the proposal using the standard service
      const proposal = await prSplittingService.analyzePRForSplit(
        state.workflowId,
        installationId
      );

      if (!proposal.proposalId) {
        return {
          success: false,
          createdPRs: [],
          errors: ['Failed to create split proposal'],
        };
      }

      // Execute all splits
      const result = await prSplittingService.executeAllSplits(
        proposal.proposalId,
        installationId,
        userId
      );

      // Get created PR information
      const proposalStatus = await prSplittingService.getProposalStatus(proposal.proposalId);
      const createdPRs = proposalStatus?.splits
        .filter(s => s.prNumber)
        .map(s => ({
          number: s.prNumber!,
          title: s.name,
          url: `https://github.com/${process.env.GITHUB_REPO}/pull/${s.prNumber}`,
        })) || [];

      state.step = 'complete';
      state.updatedAt = new Date();

      logger.info({
        wizardId,
        proposalId: proposal.proposalId,
        createdPRs: createdPRs.length,
      }, 'Decomposition executed');

      return {
        success: result.success,
        proposalId: proposal.proposalId,
        createdPRs,
        errors: result.results.filter(r => !r.success).map(r => r.error || 'Unknown error'),
      };
    } catch (error) {
      logger.error({ error, wizardId }, 'Failed to execute decomposition');
      return {
        success: false,
        createdPRs: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Get current wizard state
   */
  getWizardState(wizardId: string): WizardState {
    return this.getState(wizardId);
  }

  /**
   * Cancel and cleanup wizard session
   */
  cancelWizard(wizardId: string): void {
    this.wizardStates.delete(wizardId);
    logger.info({ wizardId }, 'Decomposition wizard cancelled');
  }

  // Private helper methods

  private getState(wizardId: string): WizardState {
    const state = this.wizardStates.get(wizardId);
    if (!state) {
      throw new NotFoundError('Wizard', wizardId);
    }
    return state;
  }

  /**
   * Fetch PR files from GitHub API with diff information
   */
  private async fetchPRFilesFromGitHub(
    installationId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<FileChange[]> {
    try {
      const github = createGitHubClient(installationId);
      const prFiles = await github.getPullRequestFiles(owner, repo, prNumber);

      return prFiles.map((file) => ({
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        diff: file.patch,
      }));
    } catch (error) {
      logger.error({ error, owner, repo, prNumber }, 'Failed to fetch PR files from GitHub');
      // Fallback to empty array - the wizard can still work with manual file input
      return [];
    }
  }

  private async generateAIRecommendations(state: WizardState): Promise<AISplitRecommendation[]> {
    const { files, metadata } = state;

    // Prepare context for LLM
    const fileList = files.map(f => 
      `- ${f.path} (+${f.additions}/-${f.deletions}) [${f.status}]`
    ).join('\n');

    const prompt = `Analyze this PR with ${metadata.totalFiles} files and suggest optimal splits.

Files:
${fileList}

Detected patterns: ${metadata.detectedPatterns.join(', ')}
Total changes: +${metadata.totalAdditions}/-${metadata.totalDeletions}
Estimated review time: ${metadata.estimatedReviewTime} minutes

Suggest 2-5 logical splits that:
1. Keep related changes together
2. Respect dependencies (infrastructure before features)
3. Each split should be independently reviewable
4. Target 15-30 min review time per split

For each split provide:
- Clear name
- Files to include
- Complexity level
- Risk level
- Dependencies on other splits
- Reviewer hints

Format as JSON array.`;

    try {
      const response = await callLLM(
        [{ role: 'user', content: prompt }],
        { model: 'gpt-4', temperature: 0.3 }
      );

      const content = response.content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{
          name: string;
          description?: string;
          files: string[];
          complexity?: string;
          riskLevel?: string;
          dependencies?: string[];
          reviewerHints?: string[];
          reasoning?: string;
        }>;
        
        return parsed.map((item, i) => ({
          id: `rec-${i}`,
          name: item.name,
          description: item.description || `Split ${i + 1}`,
          files: item.files,
          estimatedReviewTime: this.estimateReviewTimeForFiles(
            files.filter(f => item.files.includes(f.path))
          ),
          complexity: (item.complexity as AISplitRecommendation['complexity']) || 'moderate',
          riskLevel: (item.riskLevel as AISplitRecommendation['riskLevel']) || 'medium',
          reviewerHints: item.reviewerHints || [],
          dependencies: item.dependencies || [],
          reasoning: item.reasoning || 'AI-generated recommendation',
        }));
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to generate AI recommendations, using fallback');
    }

    // Fallback to heuristic-based recommendations
    return this.generateHeuristicRecommendations(state);
  }

  private generateHeuristicRecommendations(state: WizardState): AISplitRecommendation[] {
    const { files } = state;
    const recommendations: AISplitRecommendation[] = [];

    // Group by top-level directory
    const byDirectory = new Map<string, FileChange[]>();
    for (const file of files) {
      const dir = file.path.split('/')[0] || 'root';
      if (!byDirectory.has(dir)) {
        byDirectory.set(dir, []);
      }
      byDirectory.get(dir)!.push(file);
    }

    let i = 0;
    for (const [dir, dirFiles] of byDirectory.entries()) {
      if (dirFiles.length > 0) {
        recommendations.push({
          id: `rec-${i}`,
          name: `${this.formatDirectoryName(dir)} changes`,
          description: `Changes in ${dir} directory`,
          files: dirFiles.map(f => f.path),
          estimatedReviewTime: this.estimateReviewTimeForFiles(dirFiles),
          complexity: this.assessComplexity(dirFiles),
          riskLevel: this.assessRisk(dirFiles),
          reviewerHints: this.generateReviewerHints(dirFiles),
          dependencies: i > 0 ? [`rec-${i - 1}`] : [],
          reasoning: `Grouped changes from ${dir} directory for focused review`,
        });
        i++;
      }
    }

    return recommendations;
  }

  private detectPatterns(files: FileChange[]): string[] {
    const patterns: string[] = [];

    const hasTests = files.some(f => f.path.includes('test') || f.path.includes('spec'));
    const hasFrontend = files.some(f => f.path.includes('components') || f.path.endsWith('.tsx'));
    const hasBackend = files.some(f => f.path.includes('api') || f.path.includes('services'));
    const hasConfig = files.some(f => f.path.includes('config') || f.path.endsWith('.json'));
    const hasMigrations = files.some(f => f.path.includes('migration'));

    if (hasTests) patterns.push('test-changes');
    if (hasFrontend) patterns.push('frontend-changes');
    if (hasBackend) patterns.push('backend-changes');
    if (hasConfig) patterns.push('config-changes');
    if (hasMigrations) patterns.push('database-migrations');
    if (hasFrontend && hasBackend) patterns.push('full-stack');

    return patterns;
  }

  private estimateReviewTime(files: FileChange[]): number {
    // Rough estimate: 1 min per 10 lines changed, minimum 5 min
    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return Math.max(5, Math.ceil(totalLines / 10));
  }

  private estimateReviewTimeForFiles(files: FileChange[]): number {
    return this.estimateReviewTime(files);
  }

  private countLayerSplits(files: FileChange[]): number {
    const layers = new Set<string>();
    for (const file of files) {
      if (file.path.includes('test') || file.path.includes('spec')) layers.add('tests');
      else if (file.path.includes('components') || file.path.endsWith('.tsx')) layers.add('frontend');
      else if (file.path.includes('api') || file.path.includes('services')) layers.add('backend');
      else if (file.path.includes('config') || file.path.endsWith('.json')) layers.add('config');
      else layers.add('other');
    }
    return layers.size;
  }

  private countFeatureSplits(files: FileChange[]): number {
    const features = new Set<string>();
    for (const file of files) {
      const parts = file.path.split('/');
      if (parts.length >= 2) {
        features.add(parts[1]);
      }
    }
    return Math.max(1, features.size);
  }

  private calculateLayerConfidence(files: FileChange[]): number {
    const layerCount = this.countLayerSplits(files);
    return layerCount >= 2 && layerCount <= 4 ? 0.85 : 0.6;
  }

  private calculateFeatureConfidence(files: FileChange[]): number {
    const featureCount = this.countFeatureSplits(files);
    return featureCount >= 2 && featureCount <= 6 ? 0.8 : 0.5;
  }

  private sumAdditions(files: FileChange[]): number {
    return files.reduce((sum, f) => sum + f.additions, 0);
  }

  private sumDeletions(files: FileChange[]): number {
    return files.reduce((sum, f) => sum + f.deletions, 0);
  }

  private formatDirectoryName(dir: string): string {
    return dir
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private assessComplexity(files: FileChange[]): AISplitRecommendation['complexity'] {
    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const fileCount = files.length;

    if (totalLines < 50 && fileCount < 3) return 'trivial';
    if (totalLines < 100 && fileCount < 5) return 'simple';
    if (totalLines < 300 && fileCount < 10) return 'moderate';
    if (totalLines < 500) return 'complex';
    return 'very-complex';
  }

  private assessRisk(files: FileChange[]): AISplitRecommendation['riskLevel'] {
    const hasCore = files.some(f => 
      f.path.includes('core') || 
      f.path.includes('auth') || 
      f.path.includes('security')
    );
    const hasMigration = files.some(f => f.path.includes('migration'));
    const hasConfig = files.some(f => 
      f.path.includes('.env') || 
      f.path.includes('config')
    );

    if (hasCore || hasMigration) return 'high';
    if (hasConfig) return 'medium';
    return 'low';
  }

  private generateReviewerHints(files: FileChange[]): string[] {
    const hints: string[] = [];

    const hasNewFiles = files.some(f => f.status === 'added');
    const hasDeletedFiles = files.some(f => f.status === 'deleted');
    const hasLargeChanges = files.some(f => f.additions + f.deletions > 200);

    if (hasNewFiles) hints.push('Review new file structure and naming');
    if (hasDeletedFiles) hints.push('Verify deleted code is not referenced elsewhere');
    if (hasLargeChanges) hints.push('Focus on logic changes, skip formatting');

    return hints;
  }

  private generateBranchName(prNumber: number, index: number, name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
    return `split/pr-${prNumber}-${index + 1}-${slug}`;
  }

  private generatePRTitle(name: string, originalPR: number): string {
    return `${name} (from #${originalPR})`;
  }

  private generatePRBody(
    split: SplitSuggestion,
    index: number,
    total: number,
    originalPR: number
  ): string {
    return `## Split ${index + 1} of ${total} from #${originalPR}

### Description
${split.description}

### Changes
- ${split.files.length} files changed
- +${split.additions} additions
- -${split.deletions} deletions

### Files
${split.files.map(f => `- \`${f}\``).join('\n')}

### Reasoning
${split.reasoning}

---
*This PR was created by PRFlow's PR Decomposition Wizard*`;
  }

  private generateWarnings(splits: SplitSuggestion[], files: FileChange[]): string[] {
    const warnings: string[] = [];

    // Check for orphaned files
    const allSplitFiles = new Set(splits.flatMap(s => s.files));
    const orphaned = files.filter(f => !allSplitFiles.has(f.path));
    if (orphaned.length > 0) {
      warnings.push(`${orphaned.length} files not included in any split`);
    }

    // Check for very large splits
    const largeSplits = splits.filter(s => s.files.length > 20);
    if (largeSplits.length > 0) {
      warnings.push(`${largeSplits.length} splits have more than 20 files`);
    }

    // Check for circular dependencies
    // (simplified check - just warn if there are complex dependencies)
    const hasDependencies = splits.some(s => s.dependencies.length > 1);
    if (hasDependencies) {
      warnings.push('Complex dependency chain detected - review merge order carefully');
    }

    return warnings;
  }
}

export const prDecompositionWizardService = new PRDecompositionWizardService();
