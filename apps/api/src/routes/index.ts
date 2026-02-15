import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health.js';
import { repositoryRoutes } from './repositories.js';
import { workflowRoutes } from './workflows.js';
import { analyticsRoutes } from './analytics.js';
import { rulesRoutes } from './rules.js';
import { auditRoutes } from './audit.js';
import { authRoutes } from './auth.js';
import { mergeQueueRoutes } from './merge-queue.js';
import { teamAnalyticsRoutes } from './team-analytics.js';
import { enterpriseRoutes } from './enterprise.js';
import { registerBatchRoutes } from './batch.js';
import { registerOpenAPI } from './openapi.js';
import { reviewerRoutes } from './reviewers.js';
import { fixRoutes } from './fixes.js';
import { healthScoreRoutes } from './health-score.js';
import { learningRoutes } from './learning.js';
import { prSplittingRoutes } from './pr-splitting.js';
import { collaborativeReviewRoutes } from './collaborative-review.js';
import { securityRoutes } from './security.js';
import conflictResolutionRoutes from './conflict-resolution.js';
import reviewPersonasRoutes from './review-personas.js';
import testPrioritizationRoutes from './test-prioritization.js';
import multiRepoOrchestrationRoutes from './multi-repo-orchestration.js';
import { pairReviewRoutes } from './pair-review.js';
import { predictiveHealthRoutes } from './predictive-health.js';
import { knowledgeGraphRoutes } from './knowledge-graph.js';
import { autoRemediationRoutes } from './auto-remediation.js';
import { reviewReplayRoutes } from './review-replay.js';
import { prDecompositionRoutes } from './pr-decomposition.js';
import { securityComplianceRoutes } from './security-compliance.js';
import { idePreFlightRoutes } from './ide-preflight.js';
import { teamVelocityRoutes } from './team-velocity.js';
import { enhancedMultiRepoRoutes } from './enhanced-multi-repo.js';
import { prDependencyGraphRoutes } from './pr-dependency-graph.js';
import { naturalLanguageQueryRoutes } from './natural-language-query.js';
import { mlTrainingRoutes } from './ml-training.js';
import { interactiveTrainingRoutes } from './interactive-training.js';
import { migrationRoutes } from './migration.js';
import { intentRoutes } from './intent.js';
import { debtDashboardRoutes } from './debt-dashboard.js';
import { semverRoutes } from './semver.js';
import { timeMachineRoutes } from './time-machine.js';
import { impactSimulatorRoutes } from './impact-simulator.js';
import { marketplaceRoutes } from './marketplace.js';
import { conflictPreventionRoutes } from './conflict-prevention.js';
import { runbookRoutes } from './runbook.js';
import { voiceReviewRoutes } from './voice-review.js';

// AI & pair programming
import { aiPairProgrammingRoutes } from './ai-pair-programming.js';
import { enhancedPredictiveHealthRoutes } from './enhanced-predictive-health.js';
import { crossRepoImpactRoutes } from './cross-repo-impact.js';
import { nlPRCreationRoutes } from './nl-pr-creation.js';
import { enhancedReviewDebtRoutes } from './enhanced-review-debt.js';
import { aiConflictPreventionRoutes } from './ai-conflict-prevention.js';
import { regulatoryComplianceRoutes } from './regulatory-compliance.js';
import { developerSkillProfilerRoutes } from './developer-skill-profiler.js';
import { selfHealingCIRoutes } from './self-healing-ci.js';
import { voiceReviewInterfaceRoutes } from './voice-review-interface.js';

// Advanced splitting, canvas & onboarding
import { intelligentSplittingRoutes } from './intelligent-splitting.js';
import { collaborativeCanvasRoutes } from './collaborative-canvas.js';
import { customRulesRoutes } from './custom-rules.js';
import { predictiveRoutingRoutes } from './predictive-routing.js';
import { zeroConfigOnboardingRoutes } from './zero-config-onboarding.js';
import { crossRepoGraphRoutes } from './cross-repo-graph.js';
import { reviewCalibrationRoutes } from './review-calibration.js';
import { prDescriptionRoutes } from './pr-description.js';
import { securityThreatModelRoutes } from './security-threat-model.js';
import { developerGrowthRoutes } from './developer-growth.js';
import { playgroundRoutes } from './playground.js';

// Compliance, review insights & collaboration
import { compliancePoliciesRoutes } from './compliance-policies.js';
import { teamReviewInsightsRoutes } from './team-review-insights.js';
import { confidenceCalibrationRoutes } from './confidence-calibration.js';
import { reviewMemoryRoutes } from './review-memory.js';
import { autoFixRoutes } from './auto-fix.js';
import { mergeTrainRoutes } from './merge-train.js';
import { multiTenancyRoutes } from './multi-tenancy.js';
import { nlCreationV2Routes } from './nl-creation-v2.js';
import { collaborativeReviewV2Routes } from './collaborative-review-v2.js';
import { reviewInEditorRoutes } from './review-in-editor.js';

// LLM, config & extensibility
import { llmRoutingRoutes } from './llm-routing.js';
import { reviewConfigRoutes } from './review-config.js';
import { feedbackLearningRoutes } from './feedback-learning.js';
import { riskHeatmapRoutes } from './risk-heatmap.js';
import { copilotExtensionsRoutes } from './copilot-extensions.js';
import { streamingReviewRoutes } from './streaming-review.js';
import { crossPRGraphRoutes as crossPRImpactGraphRoutes } from './cross-pr-impact-graph.js';
import { pluginSDKRoutes } from './plugin-sdk.js';
import { prDecompositionEnhancedRoutes } from './pr-decomposition-enhanced.js';

export async function setupRoutes(app: FastifyInstance) {
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(repositoryRoutes, { prefix: '/api/repositories' });
  await app.register(workflowRoutes, { prefix: '/api/workflows' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(teamAnalyticsRoutes, { prefix: '/api/teams' });
  await app.register(rulesRoutes, { prefix: '/api/rules' });
  await app.register(auditRoutes, { prefix: '/api/audit' });
  await app.register(mergeQueueRoutes, { prefix: '/api' });
  await app.register(enterpriseRoutes, { prefix: '/api/enterprise' });
  await app.register(reviewerRoutes, { prefix: '/api' });
  await app.register(fixRoutes, { prefix: '/api/fixes' });
  await app.register(healthScoreRoutes, { prefix: '/api/health' });
  await app.register(learningRoutes, { prefix: '/api/learning' });
  await app.register(prSplittingRoutes, { prefix: '/api/splitting' });
  await app.register(collaborativeReviewRoutes, { prefix: '/api/collab' });
  await app.register(securityRoutes, { prefix: '/api/security' });
  // Routes below define full paths internally (e.g. '/api/workflows/:id/conflicts')
  await app.register(conflictResolutionRoutes); // /api/workflows/:id/conflicts/*, /api/conflicts/*
  await app.register(reviewPersonasRoutes); // /api/personas/*
  await app.register(testPrioritizationRoutes); // /api/workflows/:id/tests/*, /api/tests/*
  await app.register(multiRepoOrchestrationRoutes); // /api/multi-repo/*
  await app.register(pairReviewRoutes, { prefix: '/api/pair-review' });
  await app.register(predictiveHealthRoutes, { prefix: '/api/predictions' });
  await app.register(knowledgeGraphRoutes, { prefix: '/api/graph' });
  await app.register(autoRemediationRoutes, { prefix: '/api' });
  await app.register(reviewReplayRoutes, { prefix: '/api' });
  await app.register(prDecompositionRoutes, { prefix: '/api' });
  await app.register(securityComplianceRoutes, { prefix: '/api' });
  await app.register(idePreFlightRoutes, { prefix: '/api' });
  await app.register(teamVelocityRoutes, { prefix: '/api' });
  await app.register(enhancedMultiRepoRoutes, { prefix: '/api' });
  await app.register(prDependencyGraphRoutes, { prefix: '/api' });
  await app.register(naturalLanguageQueryRoutes, { prefix: '/api' });
  await app.register(mlTrainingRoutes, { prefix: '/api/ml' });
  await app.register(interactiveTrainingRoutes, { prefix: '/api' });
  await app.register(migrationRoutes, { prefix: '/api' });
  await app.register(intentRoutes, { prefix: '/api' });
  await app.register(debtDashboardRoutes, { prefix: '/api' });
  await app.register(semverRoutes, { prefix: '/api/semver' });
  await app.register(timeMachineRoutes, { prefix: '/api/time-machine' });
  await app.register(impactSimulatorRoutes, { prefix: '/api/impact' });
  await app.register(marketplaceRoutes, { prefix: '/api/marketplace' });
  await app.register(conflictPreventionRoutes, { prefix: '/api/conflicts' });
  await app.register(runbookRoutes, { prefix: '/api/runbooks' });
  await app.register(voiceReviewRoutes, { prefix: '/api/voice' });

  // Routes below define full paths internally (e.g. '/api/pair-programming/...')
  await app.register(aiPairProgrammingRoutes); // /api/pair-programming/*
  await app.register(enhancedPredictiveHealthRoutes); // /api/health-score/* (comprehensive)
  await app.register(crossRepoImpactRoutes); // /api/cross-repo/*
  await app.register(nlPRCreationRoutes); // /api/nl-pr/*
  await app.register(enhancedReviewDebtRoutes); // /api/review-debt/*
  await app.register(aiConflictPreventionRoutes); // /api/conflict-prevention/*
  await app.register(regulatoryComplianceRoutes); // /api/compliance/* (regulatory)
  await app.register(developerSkillProfilerRoutes); // /api/skills/*
  await app.register(selfHealingCIRoutes); // /api/ci/*
  await app.register(voiceReviewInterfaceRoutes); // /api/voice/* (interface)

  // Advanced PR analysis & splitting
  await app.register(intelligentSplittingRoutes, { prefix: '/api/auto-split' });
  await app.register(collaborativeCanvasRoutes, { prefix: '/api/canvas' });
  await app.register(customRulesRoutes, { prefix: '/api/custom-rules' });
  await app.register(predictiveRoutingRoutes, { prefix: '/api/routing' });
  await app.register(zeroConfigOnboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(crossRepoGraphRoutes, { prefix: '/api/cross-repo-graph' });
  await app.register(reviewCalibrationRoutes, { prefix: '/api/calibration' });
  await app.register(prDescriptionRoutes, { prefix: '/api/description' });
  await app.register(securityThreatModelRoutes, { prefix: '/api/threat-model' });
  await app.register(developerGrowthRoutes, { prefix: '/api/growth' });

  registerBatchRoutes(app);
  registerOpenAPI(app);

  // LLM, config & extensibility
  await app.register(llmRoutingRoutes, { prefix: '/api/llm' });
  await app.register(reviewConfigRoutes, { prefix: '/api/config' });
  await app.register(feedbackLearningRoutes, { prefix: '/api/learning' });
  await app.register(riskHeatmapRoutes, { prefix: '/api/risk-heatmap' });
  await app.register(copilotExtensionsRoutes, { prefix: '/api/copilot' });
  await app.register(streamingReviewRoutes, { prefix: '/api/streaming' });
  await app.register(crossPRImpactGraphRoutes, { prefix: '/api/pr-graph' });
  await app.register(pluginSDKRoutes, { prefix: '/api/plugins' });
  await app.register(prDecompositionEnhancedRoutes, { prefix: '/api/decompose' });

  // Compliance, review insights & collaboration
  await app.register(compliancePoliciesRoutes, { prefix: '/api/compliance' });
  await app.register(teamReviewInsightsRoutes, { prefix: '/api/insights' });
  await app.register(confidenceCalibrationRoutes, { prefix: '/api/calibration-v2' });
  await app.register(reviewMemoryRoutes, { prefix: '/api/memory' });
  await app.register(autoFixRoutes, { prefix: '/api/auto-fix' });
  await app.register(mergeTrainRoutes, { prefix: '/api/merge-train' });
  await app.register(multiTenancyRoutes, { prefix: '/api/tenants' });
  await app.register(nlCreationV2Routes, { prefix: '/api/nl-create' });
  await app.register(collaborativeReviewV2Routes, { prefix: '/api/collab-v2' });
  await app.register(reviewInEditorRoutes, { prefix: '/api/editor' });

  // Playground (dev-only — provides sample analysis without GitHub integration)
  await app.register(playgroundRoutes, { prefix: '/api/playground' });
}
