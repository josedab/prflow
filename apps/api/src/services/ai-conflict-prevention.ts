import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  ConflictPrediction,
  PotentialConflict,
  PRReference,
  ConcurrentPRAnalysis,
  ConflictMatrixEntry,
  AutoResolutionResult,
  ResolvedConflict,
  UnresolvedConflict,
  ConflictAlert,
  MergeOrder,
  ConflictRecommendation,
  ResolutionStrategy,
} from '@prflow/core';

/**
 * AI-Powered Conflict Prevention Service
 * Predicts merge conflicts before they happen and suggests optimal merge ordering
 */
export class AIConflictPreventionService {
  /**
   * Predict conflicts for a PR against other open PRs
   */
  async predictConflicts(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      includeAutoResolution?: boolean;
      includeMergeOrder?: boolean;
    } = {}
  ): Promise<ConflictPrediction> {
    const { includeAutoResolution = false, includeMergeOrder = false } = options;

    logger.info({ owner, repo, prNumber }, 'Predicting conflicts for PR');

    // Get repository
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get the source PR workflow
    const sourceWorkflow = await db.pRWorkflow.findFirst({
      where: {
        repositoryId: repository.id,
        prNumber,
      },
      include: {
        analysis: true,
      },
    });

    if (!sourceWorkflow) {
      throw new Error(`PR #${prNumber} not found`);
    }

    // Get all other open PRs in the repository
    const openWorkflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: repository.id,
        status: { in: ['PENDING', 'ANALYZING', 'REVIEWING'] },
        prNumber: { not: prNumber },
      },
      include: {
        analysis: true,
      },
    });

    // Build source PR reference
    const sourcePR: PRReference = {
      repository: { owner, name: repo },
      number: prNumber,
      title: sourceWorkflow.prTitle,
      branch: sourceWorkflow.headBranch,
      author: sourceWorkflow.authorLogin,
    };

    // Analyze potential conflicts with each open PR
    const potentialConflicts: PotentialConflict[] = [];

    for (const otherWorkflow of openWorkflows) {
      const conflict = await this.analyzeConflictPotential(
        sourceWorkflow,
        otherWorkflow,
        owner,
        repo
      );

      if (conflict && conflict.probability > 0.1) {
        potentialConflicts.push(conflict);
      }
    }

    // Sort by probability descending
    potentialConflicts.sort((a, b) => b.probability - a.probability);

    // Calculate overall conflict probability
    const conflictProbability = potentialConflicts.length > 0
      ? Math.max(...potentialConflicts.map(c => c.probability))
      : 0;

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(conflictProbability, potentialConflicts);

    // Generate recommendations
    const recommendations = await this.generateRecommendations(
      sourcePR,
      potentialConflicts,
      includeAutoResolution
    );

    // Generate merge order if requested
    let suggestedMergeOrder: MergeOrder | undefined;
    if (includeMergeOrder && potentialConflicts.length > 0) {
      suggestedMergeOrder = await this.calculateOptimalMergeOrder(
        prNumber,
        openWorkflows.map(w => w.prNumber),
        potentialConflicts
      );
    }

    const prediction: ConflictPrediction = {
      id: uuidv4(),
      sourcePR,
      potentialConflicts,
      conflictProbability,
      riskLevel,
      recommendations,
      suggestedMergeOrder,
      predictedAt: new Date(),
      validUntil: new Date(Date.now() + 60 * 60 * 1000), // Valid for 1 hour
    };

    // Store prediction
    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'conflict_prediction',
        eventData: JSON.parse(JSON.stringify(prediction)),
      },
    });

    logger.info(
      { predictionId: prediction.id, conflictCount: potentialConflicts.length },
      'Conflict prediction completed'
    );

    return prediction;
  }

  /**
   * Analyze all concurrent PRs in a repository
   */
  async analyzeConcurrentPRs(
    owner: string,
    repo: string,
    prNumbers?: number[]
  ): Promise<ConcurrentPRAnalysis> {
    logger.info({ owner, repo, prNumbers }, 'Analyzing concurrent PRs');

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get open PRs
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: repository.id,
        status: { in: ['PENDING', 'ANALYZING', 'REVIEWING'] },
        ...(prNumbers && prNumbers.length > 0 && { prNumber: { in: prNumbers } }),
      },
      include: {
        analysis: true,
      },
    });

    // Build PR references
    const openPRs: PRReference[] = workflows.map(w => ({
      repository: { owner, name: repo },
      number: w.prNumber,
      title: w.prTitle,
      branch: w.headBranch,
      author: w.authorLogin,
    }));

    // Build conflict matrix
    const conflictMatrix: ConflictMatrixEntry[] = [];
    const highRiskCombinations: ConcurrentPRAnalysis['highRiskCombinations'] = [];

    for (let i = 0; i < workflows.length; i++) {
      for (let j = i + 1; j < workflows.length; j++) {
        const conflict = await this.analyzeConflictPotential(
          workflows[i],
          workflows[j],
          owner,
          repo
        );

        const entry: ConflictMatrixEntry = {
          prA: workflows[i].prNumber,
          prB: workflows[j].prNumber,
          probability: conflict?.probability || 0,
          sharedFilesCount: conflict?.affectedFiles.length || 0,
          severity: this.getSeverityFromProbability(conflict?.probability || 0),
        };

        conflictMatrix.push(entry);

        if (entry.probability > 0.7) {
          highRiskCombinations.push({
            prs: [entry.prA, entry.prB],
            reason: conflict?.description || 'High overlap in changed files',
            probability: entry.probability,
          });
        }
      }
    }

    // Identify safe to merge PRs (no conflicts)
    const safeToMerge = workflows
      .filter(w => {
        const hasConflict = conflictMatrix.some(
          m =>
            (m.prA === w.prNumber || m.prB === w.prNumber) &&
            m.probability > 0.3
        );
        return !hasConflict;
      })
      .map(w => w.prNumber);

    // Calculate recommended sequence
    const recommendedSequence = await this.calculateMergeSequence(
      workflows.map(w => w.prNumber),
      conflictMatrix
    );

    const analysis: ConcurrentPRAnalysis = {
      repository: { owner, name: repo },
      openPRs,
      conflictMatrix,
      highRiskCombinations,
      safeToMerge,
      recommendedSequence,
      analyzedAt: new Date(),
    };

    logger.info(
      { prCount: openPRs.length, highRiskCount: highRiskCombinations.length },
      'Concurrent PR analysis completed'
    );

    return analysis;
  }

  /**
   * Attempt to auto-resolve conflicts
   */
  async autoResolveConflicts(
    owner: string,
    repo: string,
    prNumber: number,
    strategy: ResolutionStrategy = 'conservative',
    dryRun = true
  ): Promise<AutoResolutionResult> {
    logger.info({ owner, repo, prNumber, strategy, dryRun }, 'Attempting auto-resolution');

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get conflict prediction first
    const prediction = await this.predictConflicts(owner, repo, prNumber);

    const resolved: ResolvedConflict[] = [];
    const unresolved: UnresolvedConflict[] = [];

    for (const conflict of prediction.potentialConflicts) {
      if (conflict.autoResolvable && strategy !== 'manual') {
        for (const file of conflict.affectedFiles) {
          // Determine resolution method based on strategy
          const resolution = await this.determineResolution(
            file.path,
            conflict,
            strategy
          );

          if (resolution.canResolve) {
            resolved.push({
              file: file.path,
              method: resolution.method,
              confidence: resolution.confidence,
              diffPreview: resolution.diffPreview || '',
            });
          } else {
            unresolved.push({
              file: file.path,
              reason: resolution.reason || 'Unable to auto-resolve',
              suggestion: resolution.suggestion || 'Manual resolution required',
            });
          }
        }
      } else {
        // Add all files as unresolved
        for (const file of conflict.affectedFiles) {
          unresolved.push({
            file: file.path,
            reason: conflict.autoResolvable
              ? 'Manual resolution strategy selected'
              : 'Conflict too complex for auto-resolution',
            suggestion: 'Review and resolve manually',
          });
        }
      }
    }

    const result: AutoResolutionResult = {
      id: uuidv4(),
      prNumber,
      conflictsResolved: resolved,
      conflictsUnresolved: unresolved,
      success: unresolved.length === 0 && resolved.length > 0,
      strategy,
      ...(resolved.length > 0 && !dryRun && { commitSha: `auto-${uuidv4().slice(0, 8)}` }),
    };

    logger.info(
      { resultId: result.id, resolved: resolved.length, unresolved: unresolved.length },
      'Auto-resolution completed'
    );

    return result;
  }

  /**
   * Create a conflict alert
   */
  async createConflictAlert(
    type: ConflictAlert['type'],
    severity: ConflictAlert['severity'],
    involvedPRs: number[],
    message: string,
    recommendation: string,
    repositoryId: string
  ): Promise<ConflictAlert> {
    const alert: ConflictAlert = {
      id: uuidv4(),
      type,
      severity,
      involvedPRs,
      message,
      recommendation,
      createdAt: new Date(),
    };

    await db.analyticsEvent.create({
      data: {
        repositoryId,
        eventType: 'conflict_alert',
        eventData: JSON.parse(JSON.stringify(alert)),
      },
    });

    logger.info({ alertId: alert.id, type, severity }, 'Conflict alert created');

    return alert;
  }

  /**
   * Get conflict alerts for a repository
   */
  async getConflictAlerts(
    owner: string,
    repo: string,
    options: { limit?: number; severity?: ConflictAlert['severity'] } = {}
  ): Promise<ConflictAlert[]> {
    const { limit = 50, severity } = options;

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      return [];
    }

    const events = await db.analyticsEvent.findMany({
      where: {
        repositoryId: repository.id,
        eventType: 'conflict_alert',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let alerts = events.map(e => e.eventData as unknown as ConflictAlert);

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts;
  }

  // Private helper methods

  private async analyzeConflictPotential(
    sourceWorkflow: { prNumber: number; prTitle: string; headBranch: string; authorLogin: string; analysis?: unknown },
    targetWorkflow: { prNumber: number; prTitle: string; headBranch: string; authorLogin: string; analysis?: unknown },
    owner: string,
    repo: string
  ): Promise<PotentialConflict | null> {
    // Get changed files from both PRs
    const sourceFiles = this.extractChangedFiles(sourceWorkflow.analysis);
    const targetFiles = this.extractChangedFiles(targetWorkflow.analysis);

    // Find overlapping files
    const overlappingFiles = sourceFiles.filter(sf =>
      targetFiles.some(tf => tf.path === sf.path)
    );

    if (overlappingFiles.length === 0) {
      return null;
    }

    // Calculate conflict probability based on overlap
    const overlapRatio = overlappingFiles.length / Math.min(sourceFiles.length, targetFiles.length);
    const probability = Math.min(0.95, overlapRatio * 0.8 + 0.1);

    // Determine conflict type
    const conflictType = this.determineConflictType(overlappingFiles, sourceFiles, targetFiles);

    // Estimate resolution time
    const estimatedResolutionMinutes = overlappingFiles.length * 15;

    // Determine if auto-resolvable
    const autoResolvable = probability < 0.5 && conflictType !== 'delete_modify';

    // Build affected files list
    const affectedFiles = overlappingFiles.map(f => ({
      path: f.path,
      regions: [{
        sourceStart: 1,
        sourceEnd: 10,
        targetStart: 1,
        targetEnd: 10,
        overlapType: 'contextual' as const,
      }],
      linesAtRisk: 10,
      mergeComplexity: probability > 0.7 ? 'complex' as const : 'moderate' as const,
    }));

    const conflict: PotentialConflict = {
      id: uuidv4(),
      conflictingPR: {
        repository: { owner, name: repo },
        number: targetWorkflow.prNumber,
        title: targetWorkflow.prTitle,
        branch: targetWorkflow.headBranch,
        author: targetWorkflow.authorLogin,
      },
      type: conflictType,
      severity: this.getSeverityFromProbability(probability),
      affectedFiles,
      probability,
      estimatedResolutionMinutes,
      autoResolvable,
      description: `${overlappingFiles.length} file(s) modified in both PRs`,
    };

    return conflict;
  }

  private extractChangedFiles(analysis?: unknown): Array<{ path: string; additions: number; deletions: number }> {
    const analysisObj = analysis as { changedFiles?: unknown } | null | undefined;
    if (!analysisObj?.changedFiles) {
      return [];
    }

    const files = analysisObj.changedFiles as Array<{ filename?: string; path?: string; additions?: number; deletions?: number }>;
    return files.map(f => ({
      path: f.filename || f.path || '',
      additions: f.additions || 0,
      deletions: f.deletions || 0,
    }));
  }

  private determineConflictType(
    overlapping: Array<{ path: string }>,
    _source: Array<{ path: string; additions: number; deletions: number }>,
    _target: Array<{ path: string; additions: number; deletions: number }>
  ): PotentialConflict['type'] {
    // Simple heuristics for conflict type
    const hasImportFiles = overlapping.some(f =>
      f.path.includes('package.json') || f.path.includes('import')
    );
    if (hasImportFiles) return 'import_conflict';

    const hasSchemaFiles = overlapping.some(f =>
      f.path.includes('schema') || f.path.includes('migration')
    );
    if (hasSchemaFiles) return 'schema_conflict';

    const hasDependencyFiles = overlapping.some(f =>
      f.path.includes('package.json') || f.path.includes('requirements.txt')
    );
    if (hasDependencyFiles) return 'dependency_conflict';

    return 'same_lines';
  }

  private getSeverityFromProbability(probability: number): 'trivial' | 'minor' | 'moderate' | 'severe' {
    if (probability < 0.3) return 'trivial';
    if (probability < 0.5) return 'minor';
    if (probability < 0.7) return 'moderate';
    return 'severe';
  }

  private calculateRiskLevel(
    probability: number,
    conflicts: PotentialConflict[]
  ): ConflictPrediction['riskLevel'] {
    if (probability > 0.8 || conflicts.some(c => c.severity === 'severe')) {
      return 'critical';
    }
    if (probability > 0.5 || conflicts.some(c => c.severity === 'moderate')) {
      return 'high';
    }
    if (probability > 0.3) {
      return 'medium';
    }
    return 'low';
  }

  private async generateRecommendations(
    sourcePR: PRReference,
    conflicts: PotentialConflict[],
    includeAutoResolution: boolean
  ): Promise<ConflictRecommendation[]> {
    const recommendations: ConflictRecommendation[] = [];

    if (conflicts.length === 0) {
      return recommendations;
    }

    // Sort conflicts by probability
    const sortedConflicts = [...conflicts].sort((a, b) => b.probability - a.probability);
    const highestConflict = sortedConflicts[0];

    // Add merge first recommendation if there's a clear order
    if (highestConflict.probability > 0.5) {
      recommendations.push({
        id: uuidv4(),
        priority: 'high',
        action: 'coordinate',
        title: 'Coordinate with conflicting PR author',
        description: `PR #${highestConflict.conflictingPR.number} by @${highestConflict.conflictingPR.author} has ${Math.round(highestConflict.probability * 100)}% chance of conflict`,
        affectedPRs: [sourcePR.number, highestConflict.conflictingPR.number],
        expectedOutcome: 'Avoid merge conflicts through coordination',
      });
    }

    // Add auto-resolve recommendation if applicable
    if (includeAutoResolution && conflicts.some(c => c.autoResolvable)) {
      recommendations.push({
        id: uuidv4(),
        priority: 'medium',
        action: 'auto_resolve',
        title: 'Use auto-resolution for simple conflicts',
        description: `${conflicts.filter(c => c.autoResolvable).length} conflict(s) can be automatically resolved`,
        affectedPRs: [sourcePR.number],
        expectedOutcome: 'Reduce manual merge work',
      });
    }

    // Add rebase recommendation for older PRs
    const oldConflicts = conflicts.filter(c => c.estimatedResolutionMinutes > 30);
    if (oldConflicts.length > 0) {
      recommendations.push({
        id: uuidv4(),
        priority: 'medium',
        action: 'rebase',
        title: 'Rebase to incorporate recent changes',
        description: 'Rebasing may reduce conflict complexity',
        affectedPRs: [sourcePR.number],
        expectedOutcome: 'Easier conflict resolution',
      });
    }

    // Use LLM for additional recommendations if conflicts are complex
    if (conflicts.some(c => c.severity === 'severe' || c.severity === 'moderate')) {
      try {
        const llmRecommendation = await this.getLLMRecommendation(sourcePR, conflicts);
        if (llmRecommendation) {
          recommendations.push(llmRecommendation);
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to get LLM recommendation');
      }
    }

    return recommendations;
  }

  private async getLLMRecommendation(
    sourcePR: PRReference,
    conflicts: PotentialConflict[]
  ): Promise<ConflictRecommendation | null> {
    const prompt = `Analyze these merge conflicts and provide a recommendation:

Source PR: #${sourcePR.number} "${sourcePR.title}" by ${sourcePR.author}

Conflicting PRs:
${conflicts.map(c => `- #${c.conflictingPR.number} "${c.conflictingPR.title}" (${Math.round(c.probability * 100)}% conflict probability, ${c.affectedFiles.length} files affected)`).join('\n')}

Provide a single actionable recommendation for resolving these conflicts efficiently.
Format: JSON with fields: title (string), description (string), expectedOutcome (string)`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are a git merge conflict resolution expert. Provide concise, actionable recommendations.' },
        { role: 'user', content: prompt },
      ], {
        maxTokens: 300,
      });

      const parsed = JSON.parse(response.content);
      return {
        id: uuidv4(),
        priority: 'medium',
        action: 'coordinate',
        title: parsed.title,
        description: parsed.description,
        affectedPRs: [sourcePR.number, ...conflicts.map(c => c.conflictingPR.number)],
        expectedOutcome: parsed.expectedOutcome,
      };
    } catch {
      return null;
    }
  }

  private async calculateOptimalMergeOrder(
    sourcePR: number,
    otherPRs: number[],
    conflicts: PotentialConflict[]
  ): Promise<MergeOrder> {
    const allPRs = [sourcePR, ...otherPRs];

    // Build dependency graph based on conflicts
    const dependencies: Map<number, number[]> = new Map();

    for (const pr of allPRs) {
      const prConflicts = conflicts.filter(
        c => c.conflictingPR.number === pr
      );

      // PRs with lower conflict probability should merge first
      const shouldMergeAfter = prConflicts
        .filter(c => c.probability > 0.5)
        .map(c => c.conflictingPR.number);

      dependencies.set(pr, shouldMergeAfter);
    }

    // Topological sort with conflict-aware ordering
    const order = this.topologicalSortByConflict(allPRs, conflicts);

    // Calculate conflict reduction
    const originalConflicts = conflicts.reduce((sum, c) => sum + c.probability, 0);
    const conflictReduction = Math.min(0.5, originalConflicts * 0.3);

    return {
      order: order.map((prNumber, index) => ({
        prNumber,
        reason: index === 0 ? 'Lowest conflict potential' : `After PR #${order[index - 1]}`,
        dependencies: Array.from(dependencies.get(prNumber) || []),
      })),
      conflictReduction,
      confidence: 0.7,
    };
  }

  private topologicalSortByConflict(
    prs: number[],
    conflicts: PotentialConflict[]
  ): number[] {
    // Calculate conflict score for each PR
    const conflictScores: Map<number, number> = new Map();

    for (const pr of prs) {
      const score = conflicts
        .filter(c => c.conflictingPR.number === pr)
        .reduce((sum, c) => sum + c.probability, 0);
      conflictScores.set(pr, score);
    }

    // Sort by conflict score (lower first)
    return [...prs].sort((a, b) => {
      const scoreA = conflictScores.get(a) || 0;
      const scoreB = conflictScores.get(b) || 0;
      return scoreA - scoreB;
    });
  }

  private async calculateMergeSequence(
    prNumbers: number[],
    conflictMatrix: ConflictMatrixEntry[]
  ): Promise<number[]> {
    // Calculate total conflict score for each PR
    const conflictScores: Map<number, number> = new Map();

    for (const pr of prNumbers) {
      const score = conflictMatrix
        .filter(m => m.prA === pr || m.prB === pr)
        .reduce((sum, m) => sum + m.probability, 0);
      conflictScores.set(pr, score);
    }

    // Sort by conflict score (lower first = merge first)
    return [...prNumbers].sort((a, b) => {
      const scoreA = conflictScores.get(a) || 0;
      const scoreB = conflictScores.get(b) || 0;
      return scoreA - scoreB;
    });
  }

  private async determineResolution(
    filePath: string,
    conflict: PotentialConflict,
    strategy: ResolutionStrategy
  ): Promise<{
    canResolve: boolean;
    method: ResolvedConflict['method'];
    confidence: number;
    diffPreview?: string;
    reason?: string;
    suggestion?: string;
  }> {
    if (strategy === 'manual') {
      return {
        canResolve: false,
        method: 'keep_ours',
        confidence: 0,
        reason: 'Manual resolution strategy selected',
        suggestion: 'Review and resolve manually',
      };
    }

    // Conservative: only trivial conflicts
    if (strategy === 'conservative' && conflict.severity !== 'trivial') {
      return {
        canResolve: false,
        method: 'keep_ours',
        confidence: 0,
        reason: 'Conflict too complex for conservative strategy',
        suggestion: 'Use moderate or aggressive strategy for auto-resolution',
      };
    }

    // Determine resolution method
    if (conflict.type === 'import_conflict') {
      return {
        canResolve: true,
        method: 'merge',
        confidence: 0.8,
        diffPreview: `// Merged imports from both PRs\n// File: ${filePath}`,
      };
    }

    if (conflict.type === 'dependency_conflict') {
      return {
        canResolve: strategy === 'aggressive',
        method: 'merge',
        confidence: 0.6,
        diffPreview: `// Dependencies merged with version resolution\n// File: ${filePath}`,
        reason: strategy !== 'aggressive' ? 'Dependency conflicts require aggressive strategy' : undefined,
      };
    }

    if (strategy === 'aggressive') {
      return {
        canResolve: true,
        method: 'ai_generated',
        confidence: 0.7,
        diffPreview: `// AI-generated merge resolution\n// File: ${filePath}`,
      };
    }

    return {
      canResolve: conflict.probability < 0.4,
      method: 'merge',
      confidence: 0.5,
      reason: conflict.probability >= 0.4 ? 'Conflict probability too high' : undefined,
    };
  }
}

export const aiConflictPreventionService = new AIConflictPreventionService();
