/**
 * @fileoverview Smart Conflict Prevention API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { ConflictPreventionService } from '../services/conflict-prevention.js';

const conflictPreventionService = new ConflictPreventionService();

export const conflictPreventionRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Scan repository for potential conflicts
   */
  app.post<{
    Params: { owner: string; repo: string };
  }>('/scan/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const scan = await conflictPreventionService.scanRepository(owner, repo);
      return reply.send({
        success: true,
        data: scan,
        summary: {
          prsAnalyzed: scan.prsAnalyzed,
          conflictsFound: scan.conflicts.length,
          hotspotsFound: scan.hotspots.length,
          criticalConflicts: scan.conflicts.filter((c) => c.severity === 'critical').length,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scan failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get latest scan for repository
   */
  app.get<{
    Params: { owner: string; repo: string };
  }>('/scan/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const scan = await conflictPreventionService.getLatestScan(owner, repo);
      if (!scan) {
        return reply.status(404).send({ success: false, error: 'No scan found' });
      }
      return reply.send({ success: true, data: scan });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get scan';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get predicted conflicts for repository
   */
  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { severity?: string };
  }>('/conflicts/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params;
    const { severity } = request.query;

    try {
      const scan = await conflictPreventionService.getLatestScan(owner, repo);
      if (!scan) {
        return reply.status(404).send({ success: false, error: 'No scan found. Run a scan first.' });
      }

      let conflicts = scan.conflicts;
      if (severity) {
        conflicts = conflicts.filter((c) => c.severity === severity);
      }

      return reply.send({
        success: true,
        data: conflicts,
        total: conflicts.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get conflicts';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get merge order recommendation
   */
  app.get<{
    Params: { owner: string; repo: string };
  }>('/merge-order/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const scan = await conflictPreventionService.getLatestScan(owner, repo);
      if (!scan) {
        return reply.status(404).send({ success: false, error: 'No scan found. Run a scan first.' });
      }

      return reply.send({
        success: true,
        data: scan.mergeOrder,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get merge order';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get file hotspots
   */
  app.get<{
    Params: { owner: string; repo: string };
  }>('/hotspots/:owner/:repo', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const scan = await conflictPreventionService.getLatestScan(owner, repo);
      if (!scan) {
        return reply.status(404).send({ success: false, error: 'No scan found. Run a scan first.' });
      }

      return reply.send({
        success: true,
        data: scan.hotspots,
        total: scan.hotspots.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get hotspots';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Acknowledge a conflict
   */
  app.post<{
    Params: { conflictId: string };
  }>('/conflicts/:conflictId/acknowledge', async (request, reply) => {
    const { conflictId } = request.params;

    try {
      await conflictPreventionService.acknowledgeConflict(conflictId);
      return reply.send({ success: true, message: 'Conflict acknowledged' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to acknowledge';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Resolve a conflict
   */
  app.post<{
    Params: { conflictId: string };
    Body: { notes: string };
  }>('/conflicts/:conflictId/resolve', async (request, reply) => {
    const { conflictId } = request.params;
    const { notes } = request.body || { notes: '' };

    try {
      await conflictPreventionService.resolveConflict(conflictId, notes);
      return reply.send({ success: true, message: 'Conflict resolved' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve';
      return reply.status(500).send({ success: false, error: message });
    }
  });
};
