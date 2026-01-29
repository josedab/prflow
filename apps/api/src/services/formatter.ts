import type { PRAnalysis, ReviewResult, TestGenerationResult, DocUpdateResult, PRSynthesis } from '@prflow/core';
import { severityToEmoji, riskLevelToEmoji } from '@prflow/core';

interface FormatSummaryInput {
  analysis: PRAnalysis;
  review?: ReviewResult;
  tests?: TestGenerationResult;
  docs?: DocUpdateResult;
  synthesis?: PRSynthesis;
}

export function formatSummaryComment(input: FormatSummaryInput): string {
  const { analysis, review, tests, docs, synthesis } = input;

  let comment = '## 🤖 PRFlow Analysis\n\n';

  // Summary
  if (synthesis?.summary) {
    comment += `### Summary\n${synthesis.summary}\n\n`;
  }

  // Risk Assessment
  comment += `### Risk Assessment: ${riskLevelToEmoji(analysis.riskLevel)} ${analysis.riskLevel.toUpperCase()}\n`;
  if (analysis.risks.length > 0) {
    for (const risk of analysis.risks) {
      comment += `- ${risk}\n`;
    }
  }
  comment += '\n';

  // Changes Overview
  comment += '### Changes Overview\n';
  comment += `| Metric | Value |\n`;
  comment += `|--------|-------|\n`;
  comment += `| Files Modified | ${analysis.changes.filesModified} |\n`;
  comment += `| Lines Added | +${analysis.changes.linesAdded} |\n`;
  comment += `| Lines Removed | -${analysis.changes.linesRemoved} |\n`;
  comment += `| PR Type | ${analysis.type} |\n`;
  comment += '\n';

  // Automated Findings
  if (review) {
    comment += '### Automated Findings\n';
    comment += '| Severity | Count |\n';
    comment += '|----------|-------|\n';
    comment += `| ${severityToEmoji('critical')} Critical | ${review.summary.critical} |\n`;
    comment += `| ${severityToEmoji('high')} High | ${review.summary.high} |\n`;
    comment += `| ${severityToEmoji('medium')} Medium | ${review.summary.medium} |\n`;
    comment += `| ${severityToEmoji('low')} Low | ${review.summary.low} |\n`;
    comment += `| ${severityToEmoji('nitpick')} Nitpick | ${review.summary.nitpick} |\n`;
    if (review.autoFixed.length > 0) {
      comment += `| ✅ Auto-fixed | ${review.autoFixed.length} |\n`;
    }
    comment += '\n';
  }

  // Human Review Checklist
  if (synthesis?.humanReviewChecklist && synthesis.humanReviewChecklist.length > 0) {
    comment += '### Human Review Checklist\n';
    for (const item of synthesis.humanReviewChecklist) {
      const priority = item.priority === 'required' ? '⚠️' : item.priority === 'recommended' ? '💡' : '📝';
      comment += `- [ ] ${priority} ${item.item}\n`;
    }
    comment += '\n';
  }

  // Generated Assets
  const assets: string[] = [];
  if (tests && tests.tests.length > 0) {
    assets.push(`📝 ${tests.tests.length} test(s) generated`);
  }
  if (docs && docs.updates.length > 0) {
    assets.push(`📄 ${docs.updates.length} doc update(s) suggested`);
  }
  if (docs?.changelogEntry) {
    assets.push('📋 Changelog entry created');
  }

  if (assets.length > 0) {
    comment += '### Generated Assets\n';
    for (const asset of assets) {
      comment += `- ${asset}\n`;
    }
    comment += '\n';
  }

  // Suggested Reviewers
  if (analysis.suggestedReviewers.length > 0) {
    comment += '### Suggested Reviewers\n';
    for (const reviewer of analysis.suggestedReviewers) {
      const badge = reviewer.required ? '⭐ Required' : '';
      comment += `- @${reviewer.login} (${reviewer.reason}) ${badge}\n`;
    }
    comment += '\n';
  }

  // Footer
  comment += '---\n';
  comment += `*Analyzed in ${(analysis.latencyMs / 1000).toFixed(1)}s by [PRFlow](https://prflow.dev)*`;

  return comment;
}

export function formatTestSuggestion(test: { testFile: string; testCode: string; targetFile: string }): string {
  let comment = `### 📝 Suggested Test: \`${test.testFile}\`\n\n`;
  comment += `For changes in \`${test.targetFile}\`:\n\n`;
  comment += '```typescript\n';
  comment += test.testCode;
  comment += '\n```\n';
  return comment;
}

export function formatDocUpdate(update: { docType: string; file: string; content: string; reason: string }): string {
  let comment = `### 📄 Suggested Doc Update: \`${update.file}\`\n\n`;
  comment += `**Type:** ${update.docType}\n`;
  comment += `**Reason:** ${update.reason}\n\n`;
  comment += '```\n';
  comment += update.content;
  comment += '\n```\n';
  return comment;
}
