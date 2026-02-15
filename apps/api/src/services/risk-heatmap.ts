/**
 * @fileoverview PR Risk Heatmap & Predictive Quality Gate Service
 *
 * Computes per-line risk scores, generates visual heatmap data,
 * and predicts post-merge incident probability.
 */

import type { PRDiff, PRFile, PRAnalysis, FileRiskScore, PRRiskHeatmap } from '@prflow/core';

export class RiskHeatmapService {
  private readonly QUALITY_GATE_THRESHOLD = 0.6;

  /**
   * Generate a complete risk heatmap for a PR.
   */
  generateHeatmap(
    workflowId: string,
    prNumber: number,
    diff: PRDiff,
    analysis: PRAnalysis
  ): PRRiskHeatmap {
    const files = diff.files.map((file) => this.scoreFile(file, analysis));
    const overallRisk = this.computeOverallRisk(files);

    const hotspots = files
      .flatMap((f) =>
        f.lineRisks
          .filter((lr) => lr.riskScore >= 0.7)
          .map((lr) => ({
            file: f.file,
            line: lr.startLine,
            riskScore: lr.riskScore,
            reason: lr.factors.join(', '),
          }))
      )
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20);

    const qualityGate = this.computeQualityGate(files, analysis, diff);
    const incidentProbability = this.predictIncidentProbability(overallRisk, analysis, diff);

    const riskLevel =
      overallRisk >= 0.8
        ? 'critical'
        : overallRisk >= 0.6
          ? 'high'
          : overallRisk >= 0.3
            ? 'medium'
            : 'low';

    return {
      workflowId,
      prNumber,
      overallRisk: Math.round(overallRisk * 100) / 100,
      riskLevel,
      files,
      hotspots,
      qualityGate,
      predictedIncidentProbability: Math.round(incidentProbability * 100) / 100,
      calculatedAt: new Date(),
    };
  }

  private scoreFile(file: PRFile, analysis: PRAnalysis): FileRiskScore {
    const complexityScore = this.computeComplexity(file);
    const changeFrequency = this.estimateChangeFrequency(file.filename);
    const bugHistory = this.estimateBugHistory(file.filename);
    const testCoverage = this.estimateTestCoverage(file.filename, analysis);
    const authorExperience = 0.5; // default, would be enriched from git blame

    const lineRisks = this.computeLineRisks(file, { complexityScore, bugHistory, testCoverage });

    const overallRisk = Math.min(
      1,
      complexityScore * 0.25 +
        changeFrequency * 0.15 +
        bugHistory * 0.2 +
        (1 - testCoverage) * 0.25 +
        (1 - authorExperience) * 0.15
    );

    return {
      file: file.filename,
      overallRisk: Math.round(overallRisk * 100) / 100,
      lineRisks,
      factors: {
        complexityScore: Math.round(complexityScore * 100) / 100,
        changeFrequency: Math.round(changeFrequency * 100) / 100,
        bugHistory: Math.round(bugHistory * 100) / 100,
        testCoverage: Math.round(testCoverage * 100) / 100,
        authorExperience: Math.round(authorExperience * 100) / 100,
      },
    };
  }

  private computeComplexity(file: PRFile): number {
    const changes = file.additions + file.deletions;
    if (changes > 200) return 0.9;
    if (changes > 100) return 0.7;
    if (changes > 50) return 0.5;
    if (changes > 20) return 0.3;
    return 0.1;
  }

  private estimateChangeFrequency(filename: string): number {
    // Heuristic: config and core files change more frequently
    if (filename.includes('config') || filename.includes('index')) return 0.7;
    if (filename.includes('test') || filename.includes('spec')) return 0.3;
    return 0.5;
  }

  private estimateBugHistory(filename: string): number {
    // Heuristic: auth/payment/db files have higher bug frequency
    const highRiskPaths = ['auth', 'payment', 'security', 'database', 'migration'];
    if (highRiskPaths.some((p) => filename.toLowerCase().includes(p))) return 0.7;
    return 0.3;
  }

  private estimateTestCoverage(filename: string, analysis: PRAnalysis): number {
    if (filename.includes('.test.') || filename.includes('.spec.')) return 1.0;
    const coverage = analysis.impactRadius.testCoverage;
    return coverage !== null ? coverage / 100 : 0.5;
  }

  private computeLineRisks(
    file: PRFile,
    factors: { complexityScore: number; bugHistory: number; testCoverage: number }
  ): FileRiskScore['lineRisks'] {
    if (!file.patch) return [];

    const risks: FileRiskScore['lineRisks'] = [];
    let currentLine = 0;

    for (const line of file.patch.split('\n')) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        if (match) currentLine = parseInt(match[1], 10) - 1;
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentLine++;
        const lineFactors: string[] = [];
        let riskScore = factors.complexityScore * 0.3;

        // Detect risky patterns
        if (/eval\(|exec\(|Function\(/.test(line)) {
          riskScore += 0.4;
          lineFactors.push('dynamic code execution');
        }
        if (
          /password|secret|token|api[_-]?key/i.test(line) &&
          !/test|mock|example/i.test(file.filename)
        ) {
          riskScore += 0.3;
          lineFactors.push('potential secret');
        }
        if (/TODO|FIXME|HACK|XXX/.test(line)) {
          riskScore += 0.15;
          lineFactors.push('code debt marker');
        }
        if (/catch\s*\(\s*\)\s*\{?\s*\}/.test(line)) {
          riskScore += 0.2;
          lineFactors.push('empty catch block');
        }
        if (/\.innerHTML\s*=/.test(line)) {
          riskScore += 0.3;
          lineFactors.push('potential XSS');
        }

        if (lineFactors.length > 0 || riskScore >= 0.5) {
          if (lineFactors.length === 0) lineFactors.push('high change complexity');
          const riskLevel =
            riskScore >= 0.8
              ? 'critical'
              : riskScore >= 0.6
                ? 'high'
                : riskScore >= 0.3
                  ? 'medium'
                  : 'low';

          risks.push({
            startLine: currentLine,
            endLine: currentLine,
            riskScore: Math.min(1, Math.round(riskScore * 100) / 100),
            riskLevel,
            factors: lineFactors,
          });
        }
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }

    return risks;
  }

  private computeOverallRisk(files: FileRiskScore[]): number {
    if (files.length === 0) return 0;
    const weighted = files.reduce((sum, f) => sum + f.overallRisk, 0) / files.length;
    const maxRisk = Math.max(...files.map((f) => f.overallRisk));
    return weighted * 0.6 + maxRisk * 0.4;
  }

  private computeQualityGate(
    files: FileRiskScore[],
    analysis: PRAnalysis,
    diff: PRDiff
  ): PRRiskHeatmap['qualityGate'] {
    const factors: Array<{
      name: string;
      score: number;
      weight: number;
      status: 'pass' | 'warn' | 'fail';
    }> = [
      {
        name: 'Code Risk',
        score: 1 - this.computeOverallRisk(files),
        weight: 0.3,
        status: 'pass',
      },
      {
        name: 'Test Coverage',
        score:
          analysis.impactRadius.testCoverage !== null
            ? analysis.impactRadius.testCoverage / 100
            : 0.5,
        weight: 0.25,
        status: 'pass',
      },
      {
        name: 'Change Size',
        score: diff.totalChanges < 500 ? 1 : diff.totalChanges < 1000 ? 0.6 : 0.3,
        weight: 0.2,
        status: 'pass',
      },
      {
        name: 'Security',
        score: analysis.risks.some((r) => r.toLowerCase().includes('security')) ? 0.3 : 1,
        weight: 0.25,
        status: 'pass',
      },
    ];

    for (const factor of factors) {
      factor.status = factor.score >= 0.7 ? 'pass' : factor.score >= 0.4 ? 'warn' : 'fail';
    }

    const totalScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);

    return {
      passed: totalScore >= this.QUALITY_GATE_THRESHOLD,
      score: Math.round(totalScore * 100) / 100,
      threshold: this.QUALITY_GATE_THRESHOLD,
      factors,
    };
  }

  private predictIncidentProbability(
    overallRisk: number,
    analysis: PRAnalysis,
    diff: PRDiff
  ): number {
    let probability = overallRisk * 0.4;

    if (analysis.riskLevel === 'critical') probability += 0.2;
    else if (analysis.riskLevel === 'high') probability += 0.1;

    if (diff.totalChanges > 1000) probability += 0.1;
    if (analysis.risks.length > 3) probability += 0.05;

    return Math.min(1, probability);
  }
}

export const riskHeatmapService = new RiskHeatmapService();
