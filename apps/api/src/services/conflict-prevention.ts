/**
 * @fileoverview Smart Conflict Prevention Service
 * 
 * Proactively detects and prevents merge conflicts between concurrent PRs.
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  PredictedConflict,
  ConflictPRInfo,
  ConflictScan,
  MergeOrderRecommendation,
  FileHotspot,
  ConflictLocation,
  PRConflictResolution,
  ConflictSeverity,
  PRConflictType,
} from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface OpenPR {
  number: number;
  title: string;
  user: { login: string };
  head: { ref: string; sha: string };
  created_at: string;
  files: PRFile[];
}

interface GitHubPR {
  number: number;
  title: string;
  user?: { login: string };
  head: { ref: string; sha: string };
  created_at: string;
}

export class ConflictPreventionService {
  /**
   * Scan repository for potential conflicts
   */
  async scanRepository(owner: string, repo: string): Promise<ConflictScan> {
    const repoFullName = `${owner}/${repo}`;
    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });
    
    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }
    
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);
    
    // Get all open PRs
    const { data: prs } = await getOctokit(github).pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    // Get files for each PR
    const openPRs: OpenPR[] = await Promise.all(
      (prs as GitHubPR[]).map(async (pr: GitHubPR) => {
        const { data: files } = await getOctokit(github).pulls.listFiles({
          owner,
          repo,
          pull_number: pr.number,
        });
        return {
          number: pr.number,
          title: pr.title,
          user: { login: pr.user?.login || 'unknown' },
          head: { ref: pr.head.ref, sha: pr.head.sha },
          created_at: pr.created_at,
          files: files as PRFile[],
        };
      })
    );

    // Find file hotspots (files in multiple PRs)
    const hotspots = this.findHotspots(openPRs);

    // Detect conflicts between PRs
    const conflicts = await this.detectConflicts(openPRs, hotspots, owner, repo);

    // Generate merge order recommendation
    const mergeOrder = this.generateMergeOrder(openPRs, conflicts);

    const scan: ConflictScan = {
      id: crypto.randomUUID(),
      repository: { owner, name: repo },
      prsAnalyzed: openPRs.length,
      conflicts,
      mergeOrder,
      hotspots,
      scannedAt: new Date(),
      nextScanAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    };

    // Store scan results
    await this.storeScan(scan);

    return scan;
  }

  /**
   * Find file hotspots - files touched by multiple PRs
   */
  private findHotspots(prs: OpenPR[]): FileHotspot[] {
    const fileMap = new Map<string, { prs: number[]; lines: number }>();

    for (const pr of prs) {
      for (const file of pr.files) {
        const existing = fileMap.get(file.filename) || { prs: [], lines: 0 };
        existing.prs.push(pr.number);
        existing.lines += file.changes;
        fileMap.set(file.filename, existing);
      }
    }

    const hotspots: FileHotspot[] = [];
    for (const [file, data] of fileMap.entries()) {
      if (data.prs.length > 1) {
        hotspots.push({
          file,
          prCount: data.prs.length,
          prs: data.prs,
          riskLevel: this.calculateFileRisk(data.prs.length, data.lines),
          totalLinesModified: data.lines,
        });
      }
    }

    return hotspots.sort((a, b) => b.prCount - a.prCount);
  }

  /**
   * Calculate risk level for a file
   */
  private calculateFileRisk(prCount: number, linesModified: number): ConflictSeverity {
    const score = prCount * 10 + linesModified / 10;
    if (score > 50) return 'critical';
    if (score > 30) return 'high';
    if (score > 15) return 'medium';
    return 'low';
  }

  /**
   * Detect conflicts between PRs
   */
  private async detectConflicts(
    prs: OpenPR[],
    hotspots: FileHotspot[],
    owner: string,
    repo: string
  ): Promise<PredictedConflict[]> {
    const conflicts: PredictedConflict[] = [];

    // Check each hotspot for potential conflicts
    for (const hotspot of hotspots) {
      const involvedPRs = prs.filter((pr) => hotspot.prs.includes(pr.number));

      // Compare each pair of PRs
      for (let i = 0; i < involvedPRs.length; i++) {
        for (let j = i + 1; j < involvedPRs.length; j++) {
          const prA = involvedPRs[i];
          const prB = involvedPRs[j];

          const conflict = await this.analyzeConflict(
            prA,
            prB,
            hotspot.file,
            owner,
            repo
          );

          if (conflict) {
            conflicts.push(conflict);
          }
        }
      }
    }

    return conflicts.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Analyze potential conflict between two PRs
   */
  private async analyzeConflict(
    prA: OpenPR,
    prB: OpenPR,
    file: string,
    owner: string,
    repo: string
  ): Promise<PredictedConflict | null> {
    const fileA = prA.files.find((f) => f.filename === file);
    const fileB = prB.files.find((f) => f.filename === file);

    if (!fileA || !fileB) return null;

    // Determine conflict type
    const type = this.determineConflictType(file, fileA, fileB);

    // Calculate overlap and severity
    const locations = this.findOverlappingRegions(fileA, fileB, file);
    const severity = this.calculateConflictSeverity(type, locations, fileA, fileB);
    const confidence = this.calculateConfidence(locations, fileA, fileB);

    // Only report if significant
    if (confidence < 0.3) return null;

    const resolution = this.suggestResolution(prA, prB, type, locations);

    return {
      id: crypto.randomUUID(),
      prA: this.prToPRInfo(prA),
      prB: this.prToPRInfo(prB),
      type,
      severity,
      confidence,
      affectedFiles: [file],
      locations,
      description: this.generateDescription(type, file, prA, prB),
      resolution,
      predictedAt: new Date(),
      acknowledged: false,
      resolved: false,
    };
  }

  /**
   * Determine the type of conflict
   */
  private determineConflictType(file: string, fileA: PRFile, fileB: PRFile): PRConflictType {
    // Check for specific file types
    if (file.includes('schema.prisma') || file.includes('migrations')) {
      return 'schema_conflict';
    }
    if (file === 'package.json' || file.includes('package-lock') || file.includes('yarn.lock')) {
      return 'dependency_conflict';
    }
    if (file.includes('config') || file.endsWith('.yml') || file.endsWith('.yaml')) {
      return 'config_conflict';
    }

    // Default to file overlap
    return 'file_overlap';
  }

  /**
   * Find overlapping regions in patches
   */
  private findOverlappingRegions(fileA: PRFile, fileB: PRFile, filename: string): ConflictLocation[] {
    const locations: ConflictLocation[] = [];

    // Parse line numbers from patches
    const linesA = this.extractModifiedLines(fileA.patch);
    const linesB = this.extractModifiedLines(fileB.patch);

    // Find overlapping ranges
    const overlapStart = Math.max(Math.min(...linesA), Math.min(...linesB));
    const overlapEnd = Math.min(Math.max(...linesA), Math.max(...linesB));

    if (overlapStart <= overlapEnd) {
      locations.push({
        file: filename,
        startLine: overlapStart,
        endLine: overlapEnd,
        snippetA: this.extractSnippet(fileA.patch, overlapStart, overlapEnd),
        snippetB: this.extractSnippet(fileB.patch, overlapStart, overlapEnd),
      });
    }

    return locations;
  }

  /**
   * Extract modified line numbers from patch
   */
  private extractModifiedLines(patch?: string): number[] {
    if (!patch) return [1, 100];

    const lines: number[] = [];
    const hunkRegex = /@@ -\d+,?\d* \+(\d+),?(\d*) @@/g;
    let match;

    while ((match = hunkRegex.exec(patch)) !== null) {
      const startLine = parseInt(match[1], 10);
      const lineCount = parseInt(match[2] || '1', 10);
      for (let i = 0; i < lineCount; i++) {
        lines.push(startLine + i);
      }
    }

    return lines.length > 0 ? lines : [1];
  }

  /**
   * Extract code snippet from patch
   */
  private extractSnippet(patch?: string, startLine?: number, endLine?: number): string {
    if (!patch) return '';
    const lines = patch.split('\n').slice(0, 5);
    return lines.join('\n');
  }

  /**
   * Calculate conflict severity
   */
  private calculateConflictSeverity(
    type: PRConflictType,
    locations: ConflictLocation[],
    fileA: PRFile,
    fileB: PRFile
  ): ConflictSeverity {
    // Schema conflicts are always critical
    if (type === 'schema_conflict') return 'critical';

    // Config conflicts are usually high
    if (type === 'config_conflict') return 'high';

    // Calculate based on overlap
    const totalChanges = fileA.changes + fileB.changes;
    if (totalChanges > 200) return 'critical';
    if (totalChanges > 100) return 'high';
    if (totalChanges > 30) return 'medium';
    return 'low';
  }

  /**
   * Calculate confidence in conflict prediction
   */
  private calculateConfidence(
    locations: ConflictLocation[],
    fileA: PRFile,
    fileB: PRFile
  ): number {
    if (locations.length === 0) return 0.3;

    // More overlapping regions = higher confidence
    const locationScore = Math.min(locations.length / 3, 1);

    // Both modifying same lines = higher confidence
    const changeScore = Math.min((fileA.changes + fileB.changes) / 100, 1);

    return 0.3 + (locationScore * 0.4) + (changeScore * 0.3);
  }

  /**
   * Convert OpenPR to ConflictPRInfo
   */
  private prToPRInfo(pr: OpenPR): ConflictPRInfo {
    return {
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      branch: pr.head.ref,
      headSha: pr.head.sha,
      filesChanged: pr.files.map((f) => f.filename),
      createdAt: new Date(pr.created_at),
    };
  }

  /**
   * Generate human-readable description
   */
  private generateDescription(
    type: PRConflictType,
    file: string,
    prA: OpenPR,
    prB: OpenPR
  ): string {
    const descriptions: Record<PRConflictType, string> = {
      file_overlap: `Both PRs modify ${file}. Review changes carefully before merging.`,
      function_overlap: `Both PRs modify the same function in ${file}.`,
      import_conflict: `Both PRs add conflicting imports in ${file}.`,
      schema_conflict: `Both PRs modify the database schema. Coordinate migration order.`,
      config_conflict: `Both PRs modify configuration in ${file}. Changes may override each other.`,
      dependency_conflict: `Both PRs modify dependencies. Package versions may conflict.`,
      semantic_conflict: `Changes in ${file} may be logically incompatible.`,
      merge_order: `Merging order matters for ${file}.`,
    };

    return descriptions[type];
  }

  /**
   * Suggest resolution strategy
   */
  private suggestResolution(
    prA: OpenPR,
    prB: OpenPR,
    type: PRConflictType,
    locations: ConflictLocation[]
  ): PRConflictResolution {
    // Determine merge order based on PR age
    const aIsOlder = new Date(prA.created_at) < new Date(prB.created_at);
    const firstPR = aIsOlder ? prA : prB;
    const secondPR = aIsOlder ? prB : prA;

    const strategy = aIsOlder ? 'merge_a_first' : 'merge_b_first';

    return {
      strategy,
      explanation: `Merge PR #${firstPR.number} first (created earlier), then rebase PR #${secondPR.number}.`,
      steps: [
        `1. Review and merge PR #${firstPR.number}`,
        `2. Rebase PR #${secondPR.number} on main`,
        `3. Resolve any conflicts that arise`,
        `4. Re-review PR #${secondPR.number} if changes significant`,
        `5. Merge PR #${secondPR.number}`,
      ],
      estimatedEffort: type === 'schema_conflict' ? 60 : 15,
      canAutoResolve: type === 'dependency_conflict',
    };
  }

  /**
   * Generate merge order recommendation
   */
  private generateMergeOrder(
    prs: OpenPR[],
    conflicts: PredictedConflict[]
  ): MergeOrderRecommendation {
    // Build dependency graph
    const dependencies = new Map<number, Set<number>>();
    for (const pr of prs) {
      dependencies.set(pr.number, new Set());
    }

    // Add dependencies based on conflicts
    for (const conflict of conflicts) {
      const aDate = conflict.prA.createdAt;
      const bDate = conflict.prB.createdAt;
      if (aDate < bDate) {
        dependencies.get(conflict.prB.number)?.add(conflict.prA.number);
      } else {
        dependencies.get(conflict.prA.number)?.add(conflict.prB.number);
      }
    }

    // Topological sort
    const order: number[] = [];
    const visited = new Set<number>();
    const visiting = new Set<number>();

    const visit = (pr: number): void => {
      if (visited.has(pr)) return;
      if (visiting.has(pr)) return; // Cycle detected
      visiting.add(pr);
      for (const dep of dependencies.get(pr) || []) {
        visit(dep);
      }
      visiting.delete(pr);
      visited.add(pr);
      order.push(pr);
    };

    for (const pr of prs) {
      visit(pr.number);
    }

    return {
      repository: '',
      order: order.map((prNum, idx) => {
        const pr = prs.find((p) => p.number === prNum)!;
        const deps = Array.from(dependencies.get(prNum) || []);
        return {
          prNumber: prNum,
          title: pr.title,
          position: idx + 1,
          dependsOn: deps,
          blocks: prs
            .filter((p) => dependencies.get(p.number)?.has(prNum))
            .map((p) => p.number),
          reason: deps.length > 0
            ? `Must wait for PRs ${deps.join(', ')} to avoid conflicts`
            : 'No dependencies, can be merged anytime',
        };
      }),
      reasoning: conflicts.length > 0
        ? `Found ${conflicts.length} potential conflicts. Recommended order minimizes merge issues.`
        : 'No conflicts detected. PRs can be merged in any order.',
      potentialConflicts: conflicts,
      generatedAt: new Date(),
    };
  }

  /**
   * Store scan results in database
   */
  private async storeScan(scan: ConflictScan): Promise<void> {
    await dbAny.conflictScan.create({
      data: {
        id: scan.id,
        owner: scan.repository.owner,
        repo: scan.repository.name,
        prsAnalyzed: scan.prsAnalyzed,
        conflictsFound: scan.conflicts.length,
        hotspotsFound: scan.hotspots.length,
        conflicts: scan.conflicts as any,
        mergeOrder: scan.mergeOrder as any,
        hotspots: scan.hotspots as any,
        scannedAt: scan.scannedAt,
        nextScanAt: scan.nextScanAt,
      },
    });
  }

  /**
   * Get latest scan for repository
   */
  async getLatestScan(owner: string, repo: string): Promise<ConflictScan | null> {
    const scan = await dbAny.conflictScan.findFirst({
      where: { owner, repo },
      orderBy: { scannedAt: 'desc' },
    });

    if (!scan) return null;

    return {
      id: scan.id,
      repository: { owner: scan.owner, name: scan.repo },
      prsAnalyzed: scan.prsAnalyzed,
      conflicts: scan.conflicts as unknown as PredictedConflict[],
      mergeOrder: scan.mergeOrder as unknown as MergeOrderRecommendation,
      hotspots: scan.hotspots as unknown as FileHotspot[],
      scannedAt: scan.scannedAt,
      nextScanAt: scan.nextScanAt,
    };
  }

  /**
   * Get conflict by ID
   */
  async getConflict(id: string): Promise<PredictedConflict | null> {
    const scans = await dbAny.conflictScan.findMany({
      orderBy: { scannedAt: 'desc' },
      take: 10,
    });

    for (const scan of scans) {
      const conflicts = scan.conflicts as unknown as PredictedConflict[];
      const conflict = conflicts.find((c) => c.id === id);
      if (conflict) return conflict;
    }

    return null;
  }

  /**
   * Acknowledge conflict
   */
  async acknowledgeConflict(id: string): Promise<void> {
    // In a full implementation, this would update the conflict in the database
    console.log(`Conflict ${id} acknowledged`);
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(id: string, notes: string): Promise<void> {
    // In a full implementation, this would mark the conflict as resolved
    console.log(`Conflict ${id} resolved: ${notes}`);
  }
}
