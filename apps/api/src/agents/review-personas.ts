import {
  ReviewPersonasInput,
  ReviewPersonasResult,
  ReviewPersona,
  PersonaReview,
  PersonaType,
  MultiPersonaReviewRequest,
  MultiPersonaReviewResult,
  ReviewConsensus,
  FocusedFinding,
  PERSONA_TEMPLATES,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

const AGENT_TYPE = 'review-personas';
const AGENT_DESCRIPTION = 'Simulates code reviews from different expert perspectives';

export class ReviewPersonasAgent extends BaseAgent<ReviewPersonasInput, ReviewPersonasResult> {
  readonly name = AGENT_TYPE;
  readonly description = AGENT_DESCRIPTION;

  async execute(input: ReviewPersonasInput, _context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: ReviewPersonasResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result || !result.success) {
      return this.createErrorResult(result?.error || 'Operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: ReviewPersonasInput): Promise<ReviewPersonasResult> {
    switch (input.operation) {
      case 'review':
        return this.executeMultiPersonaReview(input);
      case 'list_personas':
        return this.listPersonas();
      case 'create_persona':
        return this.createPersona(input);
      case 'get_consensus':
        return this.getConsensus(input);
      default:
        return {
          operation: input.operation,
          success: false,
          error: `Unknown operation: ${input.operation}`,
        };
    }
  }

  private listPersonas(): ReviewPersonasResult {
    const personas: ReviewPersona[] = Object.entries(PERSONA_TEMPLATES).map(
      ([type, template]) => ({
        id: `builtin_${type}`,
        ...template,
      })
    );

    return {
      operation: 'list_personas',
      success: true,
      data: { personas },
    };
  }

  private createPersona(input: ReviewPersonasInput): ReviewPersonasResult {
    if (!input.customPersona) {
      return {
        operation: 'create_persona',
        success: false,
        error: 'Custom persona definition required',
      };
    }

    const persona: ReviewPersona = {
      ...input.customPersona,
      id: input.customPersona.id || `custom_${Date.now()}`,
    };

    return {
      operation: 'create_persona',
      success: true,
      data: { personas: [persona] },
    };
  }

  private async executeMultiPersonaReview(
    input: ReviewPersonasInput
  ): Promise<ReviewPersonasResult> {
    if (!input.reviewRequest) {
      return {
        operation: 'review',
        success: false,
        error: 'Review request required',
      };
    }

    const { reviewRequest } = input;
    const startTime = Date.now();

    logger.info(
      {
        prId: reviewRequest.prId,
        personas: reviewRequest.personas,
        fileCount: reviewRequest.files.length,
      },
      'Starting multi-persona review'
    );

    // Get all personas to use
    const personas = this.resolvePersonas(reviewRequest.personas, reviewRequest.customPersonas);

    // Execute reviews in parallel
    const reviews: PersonaReview[] = await Promise.all(
      personas.map((persona) => this.executePersonaReview(persona, reviewRequest))
    );

    // Generate consensus if requested
    let consensus: ReviewConsensus | undefined;
    if (reviewRequest.includeConsensus) {
      consensus = await this.generateConsensus(reviews);
    }

    const result: MultiPersonaReviewResult = {
      prId: reviewRequest.prId,
      reviews,
      consensus: consensus || this.getDefaultConsensus(reviews),
      timeline: [],
      executionTime: Date.now() - startTime,
    };

    return {
      operation: 'review',
      success: true,
      data: {
        reviews,
        consensus: result.consensus,
        multiPersonaResult: result,
      },
    };
  }

  private resolvePersonas(
    types: PersonaType[],
    customPersonas?: ReviewPersona[]
  ): ReviewPersona[] {
    const personas: ReviewPersona[] = [];

    for (const type of types) {
      const template = PERSONA_TEMPLATES[type];
      if (template) {
        personas.push({
          id: `builtin_${type}`,
          ...template,
        });
      }
    }

    if (customPersonas) {
      personas.push(...customPersonas);
    }

    return personas;
  }

  private async executePersonaReview(
    persona: ReviewPersona,
    request: MultiPersonaReviewRequest
  ): Promise<PersonaReview> {
    const userPrompt = this.buildPersonaPrompt(persona, request);

    const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
You are now reviewing as: ${persona.name} (${persona.title})
${persona.description}
Focus areas: ${persona.focusAreas.join(', ')}
Expertise: ${persona.expertise.join(', ')}
`);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.5, maxTokens: 2000 });
      const content = response.content.trim();

      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      const review = JSON.parse(jsonStr);

      return this.normalizePersonaReview(persona, review);
    } catch (error) {
      logger.error({ error, persona: persona.type }, 'Failed to execute persona review');
      return this.getDefaultPersonaReview(persona);
    }
  }

  private buildPersonaPrompt(
    persona: ReviewPersona,
    request: MultiPersonaReviewRequest
  ): string {
    const focusAreasStr = persona.focusAreas.join(', ');
    const prioritiesStr = persona.priorities
      .map((p) => `${p.focus} (weight: ${p.weight}%, blocker threshold: ${p.blockerThreshold})`)
      .join('\n  - ');

    const filesStr = request.files
      .map(
        (f) =>
          `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n${f.patch ? `\`\`\`\n${f.patch.slice(0, 2000)}\n\`\`\`` : ''}`
      )
      .join('\n\n');

    return `Review this pull request as ${persona.name}, a ${persona.title}.

## Your Persona
- **Focus Areas**: ${focusAreasStr}
- **Expertise**: ${persona.expertise.join(', ')}
- **Review Style**: ${persona.reviewStyle.verbosity}, ${persona.reviewStyle.tone}
- **Strictness**: ${persona.strictness}
- **Priorities**:
  - ${prioritiesStr}

## Pull Request
- **Title**: ${request.prTitle}
- **Description**: ${request.prDescription}
- **Repository**: ${request.repositoryFullName}

## Changed Files
${filesStr}

## Instructions
Review this PR from your unique perspective. Focus on what ${persona.name} would care about most.
${persona.reviewStyle.askQuestions ? 'Ask clarifying questions where needed.' : ''}
${persona.reviewStyle.praiseGoodCode ? 'Acknowledge good practices you see.' : ''}
${persona.reviewStyle.suggestAlternatives ? 'Suggest alternative approaches when appropriate.' : ''}

Respond with JSON:
{
  "verdict": "approve" | "request_changes" | "comment",
  "overallScore": 0-100,
  "summary": "2-3 sentence summary from your perspective",
  "findings": [
    {
      "focus": "${persona.focusAreas[0]}",
      "severity": "info" | "suggestion" | "warning" | "error" | "critical",
      "file": "path/to/file",
      "line": 10,
      "title": "Finding title",
      "description": "Detailed description",
      "rationale": "Why this matters from your perspective",
      "isBlocking": boolean
    }
  ],
  "questions": [
    { "question": "Your question", "context": "Why you're asking", "importance": "clarification" }
  ],
  "praises": ["Good things you noticed"],
  "concerns": ["High-level concerns"],
  "suggestions": [
    { "focus": "area", "title": "Suggestion", "description": "Details", "benefit": "Why", "effort": "small" }
  ]
}`;
  }

  private normalizePersonaReview(persona: ReviewPersona, review: Partial<PersonaReview>): PersonaReview {
    const findings: FocusedFinding[] = (review.focusedFindings || []).map(
      (f: Partial<FocusedFinding>, i: number) => ({
        id: `finding_${persona.type}_${i}`,
        focus: f.focus || persona.focusAreas[0],
        severity: f.severity || 'suggestion',
        file: f.file || 'unknown',
        line: f.line,
        endLine: f.endLine,
        title: f.title || 'Finding',
        description: f.description || '',
        rationale: f.rationale || '',
        isBlocking: f.isBlocking || false,
      })
    );

    const blockingIssues = findings.filter((f) => f.isBlocking).map((f) => f.title);

    return {
      personaId: persona.id,
      personaType: persona.type,
      personaName: persona.name,
      verdict: review.verdict || (blockingIssues.length > 0 ? 'request_changes' : 'approve'),
      overallScore: review.overallScore ?? 70,
      summary: review.summary || `Review completed by ${persona.name}`,
      focusedFindings: findings,
      questions: review.questions || [],
      praises: review.praises || [],
      concerns: review.concerns || [],
      suggestions: review.suggestions || [],
      wouldApprove: blockingIssues.length === 0,
      blockingIssues,
    };
  }

  private getDefaultPersonaReview(persona: ReviewPersona): PersonaReview {
    return {
      personaId: persona.id,
      personaType: persona.type,
      personaName: persona.name,
      verdict: 'comment',
      overallScore: 50,
      summary: `Unable to complete review as ${persona.name}`,
      focusedFindings: [],
      questions: [],
      praises: [],
      concerns: ['Review could not be completed'],
      suggestions: [],
      wouldApprove: false,
      blockingIssues: [],
    };
  }

  private async generateConsensus(reviews: PersonaReview[]): Promise<ReviewConsensus> {
    const prompt = `Synthesize the following code reviews from different personas into a consensus:

${reviews
  .map(
    (r) => `## ${r.personaName} (${r.personaType})
- Verdict: ${r.verdict}
- Score: ${r.overallScore}/100
- Summary: ${r.summary}
- Concerns: ${r.concerns.join(', ') || 'None'}
- Blocking Issues: ${r.blockingIssues.join(', ') || 'None'}
- Would Approve: ${r.wouldApprove}`
  )
  .join('\n\n')}

Generate a consensus that:
1. Determines overall verdict (approve if majority approves with no critical issues)
2. Identifies common concerns across personas
3. Highlights unique insights from each perspective
4. Prioritizes issues by how many personas raised them

Respond with JSON:
{
  "overallVerdict": "approve" | "request_changes" | "needs_discussion",
  "confidenceScore": 0-100,
  "agreementLevel": "unanimous" | "majority" | "split" | "divided",
  "summary": "Consensus summary",
  "commonConcerns": ["Issues raised by multiple personas"],
  "uniqueInsights": [
    { "personaType": "security_engineer", "insight": "...", "relevance": "high" }
  ],
  "recommendations": ["Action items"],
  "prioritizedIssues": [
    { "issue": "Issue text", "raisedBy": ["persona1", "persona2"], "priority": "high" }
  ]
}`;

    const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
Synthesizing reviews from ${reviews.length} different personas.
`);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1500 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      return JSON.parse(jsonStr);
    } catch {
      return this.getDefaultConsensus(reviews);
    }
  }

  private getDefaultConsensus(reviews: PersonaReview[]): ReviewConsensus {
    const approvals = reviews.filter((r) => r.wouldApprove).length;
    const total = reviews.length;
    const approvalRate = total > 0 ? approvals / total : 0;

    let agreementLevel: ReviewConsensus['agreementLevel'] = 'divided';
    if (approvalRate === 1 || approvalRate === 0) agreementLevel = 'unanimous';
    else if (approvalRate >= 0.7) agreementLevel = 'majority';
    else if (approvalRate >= 0.3) agreementLevel = 'split';

    const allConcerns = reviews.flatMap((r) => r.concerns);
    const concernCounts = new Map<string, number>();
    allConcerns.forEach((c) => concernCounts.set(c, (concernCounts.get(c) || 0) + 1));
    const commonConcerns = Array.from(concernCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([concern]) => concern);

    return {
      overallVerdict: approvalRate >= 0.7 ? 'approve' : approvalRate >= 0.3 ? 'needs_discussion' : 'request_changes',
      confidenceScore: Math.round(approvalRate * 100),
      agreementLevel,
      summary: `${approvals} of ${total} personas would approve this PR.`,
      commonConcerns,
      uniqueInsights: reviews
        .filter((r) => r.focusedFindings.length > 0)
        .map((r) => ({
          personaType: r.personaType,
          insight: r.focusedFindings[0]?.title || r.summary,
          relevance: 'medium' as const,
        })),
      recommendations: commonConcerns.length > 0 ? ['Address common concerns before merging'] : [],
      prioritizedIssues: reviews
        .flatMap((r) =>
          r.blockingIssues.map((issue) => ({
            issue,
            raisedBy: [r.personaType],
            priority: 'high' as const,
          }))
        )
        .slice(0, 5),
    };
  }

  private async getConsensus(input: ReviewPersonasInput): Promise<ReviewPersonasResult> {
    if (!input.reviewResults || input.reviewResults.length === 0) {
      return {
        operation: 'get_consensus',
        success: false,
        error: 'Review results required',
      };
    }

    const consensus = await this.generateConsensus(input.reviewResults);

    return {
      operation: 'get_consensus',
      success: true,
      data: { consensus },
    };
  }
}

export const reviewPersonasAgent = new ReviewPersonasAgent();
