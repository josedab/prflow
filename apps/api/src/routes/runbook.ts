/**
 * @fileoverview Runbook Generator API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { RunbookService } from '../services/runbook.js';

const runbookService = new RunbookService();

export const runbookRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Generate a deployment runbook for a PR
   */
  app.post<{
    Params: { owner: string; repo: string; prNumber: string };
    Body: { environment: string; templateId?: string; notes?: string };
  }>('/:owner/:repo/pr/:prNumber/generate', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { environment, templateId, notes } = request.body;

    try {
      const runbook = await runbookService.generateRunbook({
        owner,
        repo,
        prNumber: parseInt(prNumber, 10),
        environment,
        templateId,
        notes,
      });

      return reply.send({
        success: true,
        data: runbook,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get runbook by ID
   */
  app.get<{
    Params: { id: string };
  }>('/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const runbook = await runbookService.getRunbook(id);
      if (!runbook) {
        return reply.status(404).send({ success: false, error: 'Runbook not found' });
      }
      return reply.send({ success: true, data: runbook });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get runbook';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get runbooks for a PR
   */
  app.get<{
    Params: { owner: string; repo: string; prNumber: string };
    Querystring: { environment?: string };
  }>('/:owner/:repo/pr/:prNumber', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { environment } = request.query;

    try {
      if (environment) {
        const runbook = await runbookService.getLatestRunbook(
          owner,
          repo,
          parseInt(prNumber, 10),
          environment
        );
        return reply.send({
          success: true,
          data: runbook ? [runbook] : [],
        });
      }

      const runbooks = await runbookService.getRunbooksForPR(
        owner,
        repo,
        parseInt(prNumber, 10)
      );
      return reply.send({ success: true, data: runbooks });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get runbooks';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Export runbook as markdown
   */
  app.get<{
    Params: { id: string };
  }>('/:id/export', async (request, reply) => {
    const { id } = request.params;

    try {
      const runbook = await runbookService.getRunbook(id);
      if (!runbook) {
        return reply.status(404).send({ success: false, error: 'Runbook not found' });
      }

      const markdown = runbookService.exportAsMarkdown(runbook);
      return reply
        .header('Content-Type', 'text/markdown')
        .header('Content-Disposition', `attachment; filename="runbook-pr-${runbook.prNumber}.md"`)
        .send(markdown);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export runbook';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Update checklist item
   */
  app.patch<{
    Params: { id: string; itemId: string };
    Body: { checked: boolean };
  }>('/:id/checklist/:itemId', async (request, reply) => {
    const { id, itemId } = request.params;
    const { checked } = request.body;

    try {
      const runbook = await runbookService.updateChecklistItem(id, itemId, checked);
      if (!runbook) {
        return reply.status(404).send({ success: false, error: 'Runbook not found' });
      }
      return reply.send({ success: true, data: runbook });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update checklist';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get templates
   */
  app.get<{
    Querystring: { repositoryId?: string };
  }>('/templates', async (request, reply) => {
    const { repositoryId } = request.query;

    try {
      const templates = await runbookService.getTemplates(repositoryId);
      return reply.send({ success: true, data: templates });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get templates';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Create template
   */
  app.post<{
    Body: {
      name: string;
      description: string;
      environment: string;
      defaultSteps: any[];
      defaultChecklist: any[];
      requiredApprovers: string[];
      repositoryId?: string;
    };
  }>('/templates', async (request, reply) => {
    const { repositoryId, ...template } = request.body;

    try {
      const created = await runbookService.createTemplate(
        { ...template, active: true },
        repositoryId
      );
      return reply.status(201).send({ success: true, data: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template';
      return reply.status(500).send({ success: false, error: message });
    }
  });
};
