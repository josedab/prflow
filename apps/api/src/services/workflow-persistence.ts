import { db, type WorkflowStatus } from '@prflow/db';
import type { 
  PRAnalysis, 
  ReviewResult, 
  TestGenerationResult, 
  DocUpdateResult, 
  PRSynthesis 
} from '@prflow/core';

/**
 * Service responsible for persisting workflow data to the database
 */
export class WorkflowPersistenceService {
  async updateWorkflowStatus(
    workflowId: string, 
    status: WorkflowStatus, 
    additionalData?: { startedAt?: Date; checkRunId?: number }
  ): Promise<void> {
    await db.pRWorkflow.update({
      where: { id: workflowId },
      data: { status, ...additionalData },
    });
  }

  async saveAnalysis(workflowId: string, analysis: PRAnalysis): Promise<void> {
    await db.pRAnalysis.create({
      data: {
        workflowId,
        prType: analysis.type.toUpperCase() as 'FEATURE' | 'BUGFIX' | 'REFACTOR' | 'DOCS' | 'CHORE' | 'TEST' | 'DEPS',
        riskLevel: analysis.riskLevel.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
        filesModified: analysis.changes.filesModified,
        linesAdded: analysis.changes.linesAdded,
        linesRemoved: analysis.changes.linesRemoved,
        semanticChanges: JSON.parse(JSON.stringify(analysis.semanticChanges)),
        impactRadius: JSON.parse(JSON.stringify(analysis.impactRadius)),
        risks: analysis.risks,
        suggestedReviewers: JSON.parse(JSON.stringify(analysis.suggestedReviewers)),
        latencyMs: analysis.latencyMs,
      },
    });
  }

  async saveReviewComments(workflowId: string, review: ReviewResult): Promise<void> {
    for (const comment of review.comments) {
      await db.reviewComment.create({
        data: {
          workflowId,
          file: comment.file,
          line: comment.line,
          endLine: comment.endLine,
          severity: comment.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NITPICK',
          category: comment.category.toUpperCase() as 'SECURITY' | 'BUG' | 'PERFORMANCE' | 'ERROR_HANDLING' | 'TESTING' | 'DOCUMENTATION' | 'STYLE' | 'MAINTAINABILITY',
          message: comment.message,
          suggestion: comment.suggestion ? JSON.parse(JSON.stringify(comment.suggestion)) : undefined,
          confidence: comment.confidence,
        },
      });
    }
  }

  async saveGeneratedTests(workflowId: string, tests: TestGenerationResult): Promise<void> {
    for (const test of tests.tests) {
      await db.generatedTest.create({
        data: {
          workflowId,
          testFile: test.testFile,
          targetFile: test.targetFile,
          framework: test.framework,
          testCode: test.testCode,
          coverageTargets: test.coverageTargets,
        },
      });
    }
  }

  async saveDocUpdates(workflowId: string, docs: DocUpdateResult): Promise<void> {
    for (const update of docs.updates) {
      await db.docUpdate.create({
        data: {
          workflowId,
          docType: update.docType.toUpperCase() as 'JSDOC' | 'README' | 'CHANGELOG' | 'API_DOCS' | 'INLINE_COMMENT',
          file: update.file,
          content: update.content,
          reason: update.reason,
        },
      });
    }
  }

  async saveSynthesis(workflowId: string, synthesis: PRSynthesis): Promise<void> {
    await db.pRSynthesis.create({
      data: {
        workflowId,
        summary: synthesis.summary,
        riskAssessment: JSON.parse(JSON.stringify(synthesis.riskAssessment)),
        findingsSummary: JSON.parse(JSON.stringify(synthesis.findingsSummary)),
        humanReviewChecklist: JSON.parse(JSON.stringify(synthesis.humanReviewChecklist)),
      },
    });
  }

  async markWorkflowComplete(workflowId: string): Promise<void> {
    await db.pRWorkflow.update({
      where: { id: workflowId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  async markWorkflowFailed(workflowId: string): Promise<void> {
    await db.pRWorkflow.update({
      where: { id: workflowId },
      data: { status: 'FAILED' },
    });
  }
}

export const workflowPersistence = new WorkflowPersistenceService();
