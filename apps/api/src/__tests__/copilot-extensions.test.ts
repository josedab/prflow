/**
 * @fileoverview Tests for Copilot Extensions Service
 */

import { describe, it, expect } from 'vitest';
import { CopilotExtensionsService } from '../services/copilot-extensions.js';

describe('CopilotExtensionsService', () => {
  const service = new CopilotExtensionsService();

  it('should return extension manifest', () => {
    const manifest = service.getManifest();
    expect(manifest.name).toBe('prflow');
    expect(manifest.skills.length).toBeGreaterThan(0);
    expect(manifest.skills.map((s) => s.name)).toContain('review');
    expect(manifest.skills.map((s) => s.name)).toContain('analyze');
  });

  it('should handle review skill', async () => {
    const response = await service.handleSkill({
      skill: 'review',
      parameters: { pr_number: 42 },
      context: { user: { login: 'test' } },
    });

    expect(response.type).toBe('markdown');
    expect(response.content).toContain('PR #42');
    expect(response.suggestedFollowUps).toBeDefined();
  });

  it('should handle analyze skill', async () => {
    const response = await service.handleSkill({
      skill: 'analyze',
      parameters: { pr_number: 10 },
      context: { user: { login: 'test' } },
    });

    expect(response.type).toBe('markdown');
    expect(response.content).toContain('Analysis');
  });

  it('should handle explain skill', async () => {
    const response = await service.handleSkill({
      skill: 'explain',
      parameters: { pr_number: 5 },
      context: { user: { login: 'test' } },
    });

    expect(response.content).toContain('PR #5 Explained');
  });

  it('should handle risk skill', async () => {
    const response = await service.handleSkill({
      skill: 'risk',
      parameters: { pr_number: 7 },
      context: { user: { login: 'test' } },
    });

    expect(response.content).toContain('Risk Heatmap');
    expect(response.content).toContain('Quality Gate');
  });

  it('should handle unknown skill gracefully', async () => {
    const response = await service.handleSkill({
      skill: 'nonexistent',
      parameters: {},
      context: { user: { login: 'test' } },
    });

    expect(response.content).toContain('Unknown skill');
  });

  it('should require PR number for review when not in context', async () => {
    const response = await service.handleSkill({
      skill: 'review',
      parameters: {},
      context: { user: { login: 'test' } },
    });

    expect(response.content).toContain('specify a PR number');
  });
});
