import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { IntentAgentInput, IntentAnalysis, IntentCategory, IntentConfidence, IntentFeedback, IntentConfiguration, IntentLearningStats, DEFAULT_BRANCH_PATTERNS, DEFAULT_COMMIT_CONVENTIONS, DEFAULT_INTENT_KEYWORDS, BranchNameSignal, CommitMessageSignal, CodeChangeSignal, PRMetadataSignal } from '@prflow/core/models';

// In-memory storage (database schema available for future migration)
const feedbacks: IntentFeedback[] = [];
const configs = new Map<string, IntentConfiguration>();
const analyses = new Map<string, IntentAnalysis>();

function analyzeBranchName(branch: string): { category: IntentCategory; confidence: number } {
  for (const pattern of DEFAULT_BRANCH_PATTERNS) {
    if (new RegExp(pattern.pattern, 'i').test(branch)) {
      return { category: pattern.category, confidence: pattern.weight };
    }
  }
  return { category: 'unknown', confidence: 0.3 };
}

function analyzeCommitMessages(commits: Array<{ message: string }>): { category: IntentCategory; confidence: number } {
  const categoryScores: Record<string, number> = {};
  for (const commit of commits) {
    const msg = commit.message.toLowerCase();
    for (const conv of DEFAULT_COMMIT_CONVENTIONS) {
      if (msg.startsWith(conv.type + ':') || msg.startsWith(conv.type + '(')) {
        categoryScores[conv.category] = (categoryScores[conv.category] || 0) + 1;
      }
    }
  }
  
  let maxCategory: IntentCategory = 'unknown';
  let maxScore = 0;
  for (const [cat, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = cat as IntentCategory;
    }
  }
  return { category: maxCategory, confidence: Math.min(0.9, maxScore / Math.max(commits.length, 1) * 0.8) };
}

function getConfidenceLevel(score: number): IntentConfidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

export async function intentRoutes(app: FastifyInstance) {
  // Full intent analysis
  app.post('/intent/analyze/:repositoryId', async (
    request: FastifyRequest<{ 
      Body: NonNullable<IntentAgentInput['prData']>;
      Params: { repositoryId: string };
    }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const prData = request.body;
    
    const branchResult = analyzeBranchName(prData.headBranch);
    const commitResult = analyzeCommitMessages(prData.commits);
    const combinedScore = (branchResult.confidence * 0.4) + (commitResult.confidence * 0.4) + 0.2;
    const primaryCategory = branchResult.confidence > commitResult.confidence ? branchResult.category : commitResult.category;
    
    const branchSignal: BranchNameSignal = {
      raw: prData.headBranch,
      pattern: branchResult.category !== 'unknown' ? prData.headBranch.split('/')[0] : null,
      issueNumber: null,
      keywords: [],
      suggestedCategory: branchResult.category,
    };
    
    const commitSignal: CommitMessageSignal = {
      messages: prData.commits.map(c => c.message),
      conventionalCommits: prData.commits.slice(0, 10).map(c => ({
        type: c.message.split(':')[0]?.split('(')[0] || 'misc',
        scope: null,
        description: c.message,
        body: null,
        breakingChange: false,
        footers: {},
      })),
      keywords: [],
      suggestedCategory: commitResult.category,
      averageLength: prData.commits.reduce((sum, c) => sum + c.message.length, 0) / Math.max(prData.commits.length, 1),
      hasIssueReferences: prData.commits.some(c => /#\d+/.test(c.message)),
    };
    
    const codeSignal: CodeChangeSignal = {
      filePatterns: [],
      changePatterns: [{ pattern: 'balanced', confidence: 0.5, description: 'Mixed changes' }],
      semanticSignals: [],
      suggestedCategory: primaryCategory,
    };
    
    const metadataSignal: PRMetadataSignal = {
      title: prData.title,
      titleKeywords: prData.title.toLowerCase().split(/\s+/),
      bodyKeywords: (prData.body || '').toLowerCase().split(/\s+/).slice(0, 20),
      labels: prData.labels,
      suggestedCategory: primaryCategory,
      hasPRTemplate: false,
      templateSections: [],
    };
    
    const analysis: IntentAnalysis = {
      prNumber: prData.prNumber,
      repositoryId,
      primaryIntent: primaryCategory,
      primaryConfidence: getConfidenceLevel(combinedScore),
      primaryConfidenceScore: Math.round(combinedScore * 100),
      secondaryIntents: [],
      signals: {
        branchName: branchSignal,
        commitMessages: commitSignal,
        codeChanges: codeSignal,
        prMetadata: metadataSignal,
      },
      summary: {
        oneLiner: `${prData.title}`,
        detailedExplanation: `This PR ${primaryCategory.replace(/_/g, ' ')} - ${prData.body?.slice(0, 200) || 'No description provided'}`,
        keyChanges: prData.files.slice(0, 5).map(f => `Modified ${f.filename}`),
        suggestedFocusAreas: ['Review main changes', 'Verify tests'],
        potentialRisks: ['Check for regressions'],
      },
      reviewStrategy: {
        reviewDepth: 'standard',
        focusAreas: [{ area: primaryCategory, importance: 'high', reason: 'Primary intent' }],
        reviewQuestions: ['Are the changes appropriate for this intent?'],
        suggestedExpertise: [primaryCategory],
        testingExpectations: { required: true, types: ['unit'], minimumCoverage: null, specificTests: [] },
        documentationExpectations: { required: false, types: [], specificRequirements: [] },
      },
      analyzedAt: new Date(),
      analysisVersion: '1.0.0',
    };
    
    // Store in memory
    const analysisKey = `${repositoryId}:${prData.prNumber}`;
    analyses.set(analysisKey, analysis);
    
    return reply.send({ success: true, data: { analysis } });
  });

  // Submit feedback
  app.post('/intent/feedback/:repositoryId', async (
    request: FastifyRequest<{
      Body: { analysisId: string; wasCorrect: boolean; actualIntent?: IntentCategory; comments?: string };
      Params: { repositoryId: string };
    }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const { analysisId, wasCorrect, actualIntent, comments } = request.body;
    
    const feedback: IntentFeedback = {
      analysisId,
      prNumber: 0,
      repositoryId,
      wasCorrect,
      actualIntent,
      comments,
      feedbackBy: 'user',
      feedbackAt: new Date(),
    };
    
    feedbacks.push(feedback);
    return reply.send({ success: true, data: { received: true } });
  });

  // Get stats
  app.get('/intent/stats/:repositoryId', async (
    request: FastifyRequest<{ Params: { repositoryId: string } }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const repoFeedbacks = feedbacks.filter(f => f.repositoryId === repositoryId);
    const repoAnalyses = Array.from(analyses.entries()).filter(([key]) => key.startsWith(repositoryId + ':')).length;
    const correct = repoFeedbacks.filter(f => f.wasCorrect).length;
    
    const stats: IntentLearningStats = {
      repositoryId,
      totalAnalyses: repoAnalyses,
      feedbackCount: repoFeedbacks.length,
      accuracyRate: repoFeedbacks.length > 0 ? correct / repoFeedbacks.length : 0,
      categoryAccuracy: {} as Record<IntentCategory, { total: number; correct: number; accuracy: number }>,
      signalEffectiveness: { branchName: 0.7, commitMessages: 0.8, codeChanges: 0.5, prMetadata: 0.4 },
      lastUpdated: new Date(),
    };
    
    return reply.send({ success: true, data: { stats } });
  });

  // Update configuration
  app.put('/intent/config/:repositoryId', async (
    request: FastifyRequest<{
      Body: { config: Partial<IntentConfiguration> };
      Params: { repositoryId: string };
    }>,
    reply: FastifyReply
  ) => {
    const { repositoryId } = request.params;
    const { config } = request.body;
    
    const existingConfig = configs.get(repositoryId);
    const newConfig: IntentConfiguration = {
      repositoryId,
      branchPatterns: config.branchPatterns || existingConfig?.branchPatterns || DEFAULT_BRANCH_PATTERNS,
      commitConventions: config.commitConventions || existingConfig?.commitConventions || DEFAULT_COMMIT_CONVENTIONS,
      intentKeywords: config.intentKeywords || existingConfig?.intentKeywords || DEFAULT_INTENT_KEYWORDS,
      signalWeights: config.signalWeights || existingConfig?.signalWeights || { branchName: 0.25, commitMessages: 0.35, codeChanges: 0.25, prMetadata: 0.15 },
      minimumConfidence: config.minimumConfidence || existingConfig?.minimumConfidence || 'low',
    };
    
    configs.set(repositoryId, newConfig);
    return reply.send({ success: true, data: { configuration: newConfig } });
  });
}
