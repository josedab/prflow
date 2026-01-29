import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, type SplitStatus } from '@prflow/db';
import { prSplittingService } from '../services/pr-splitting.js';
import { requireAuth } from '../lib/auth.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface AnalyzeParams {
  workflowId: string;
}

interface ProposalParams {
  proposalId: string;
}

interface SplitParams {
  splitId: string;
}

interface StackParams {
  stackId: string;
}

interface ExecuteBody {
  installationId: number;
}

export async function prSplittingRoutes(fastify: FastifyInstance) {
  // Analyze a PR for potential splits
  fastify.post<{ Params: AnalyzeParams; Body: ExecuteBody }>(
    '/workflows/:workflowId/analyze-split',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: AnalyzeParams; Body: ExecuteBody }>, reply: FastifyReply) => {
      const { workflowId } = request.params;
      const { installationId } = request.body;
      const user = request.user!;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      const workflow = await db.pRWorkflow.findUnique({
        where: { id: workflowId },
      });

      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      const proposal = await prSplittingService.analyzePRForSplit(workflowId, installationId);

      logger.info({ workflowId, proposalId: proposal.proposalId, userId: user?.id }, 'PR split analysis completed');

      return reply.send({
        success: true,
        proposal,
      });
    }
  );

  // Get split proposal details
  fastify.get<{ Params: ProposalParams }>(
    '/split-proposals/:proposalId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: ProposalParams }>, reply: FastifyReply) => {
      const { proposalId } = request.params;

      const result = await prSplittingService.getProposalStatus(proposalId);

      if (!result) {
        throw new NotFoundError('Split proposal not found');
      }

      return reply.send({
        success: true,
        ...result,
      });
    }
  );

  // List proposals for a repository
  fastify.get<{ Querystring: { repositoryId: string; status?: string } }>(
    '/split-proposals',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Querystring: { repositoryId: string; status?: string } }>, reply: FastifyReply) => {
      const { repositoryId, status } = request.query;

      if (!repositoryId) {
        throw new BadRequestError('repositoryId is required');
      }

      const proposals = await db.pRSplitProposal.findMany({
        where: {
          repositoryId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma enum type from query string
          ...(status ? { status: status as unknown as SplitStatus } : {}),
        },
        include: {
          splits: {
            orderBy: { splitIndex: 'asc' },
          },
        },
        orderBy: { proposedAt: 'desc' },
        take: 50,
      });

      return reply.send({
        success: true,
        proposals,
      });
    }
  );

  // Accept and execute a split proposal
  fastify.post<{ Params: ProposalParams; Body: ExecuteBody }>(
    '/split-proposals/:proposalId/execute',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: ProposalParams; Body: ExecuteBody }>, reply: FastifyReply) => {
      const { proposalId } = request.params;
      const { installationId } = request.body;
      const user = request.user!;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      const proposal = await db.pRSplitProposal.findUnique({
        where: { id: proposalId },
      });

      if (!proposal) {
        throw new NotFoundError('Split proposal not found');
      }

      if (proposal.status !== 'PROPOSED') {
        throw new BadRequestError(`Cannot execute proposal in ${proposal.status} status`);
      }

      const result = await prSplittingService.executeAllSplits(
        proposalId,
        installationId,
        user?.id || 'unknown'
      );

      logger.info({ proposalId, success: result.success, userId: user?.id }, 'Split proposal execution completed');

      return reply.send({
        success: result.success,
        results: result.results,
      });
    }
  );

  // Execute a single split
  fastify.post<{ Params: SplitParams; Body: ExecuteBody }>(
    '/splits/:splitId/execute',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: SplitParams; Body: ExecuteBody }>, reply: FastifyReply) => {
      const { splitId } = request.params;
      const { installationId } = request.body;
      const user = request.user!;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      const result = await prSplittingService.executeSplit(
        splitId,
        installationId,
        user?.id || 'unknown'
      );

      return reply.send(result);
    }
  );

  // Reject a split proposal
  fastify.post<{ Params: ProposalParams }>(
    '/split-proposals/:proposalId/reject',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: ProposalParams }>, reply: FastifyReply) => {
      const { proposalId } = request.params;

      const proposal = await db.pRSplitProposal.findUnique({
        where: { id: proposalId },
      });

      if (!proposal) {
        throw new NotFoundError('Split proposal not found');
      }

      await db.pRSplitProposal.update({
        where: { id: proposalId },
        data: { status: 'REJECTED' },
      });

      return reply.send({
        success: true,
        message: 'Proposal rejected',
      });
    }
  );

  // Create stack from executed proposal
  fastify.post<{ Params: ProposalParams }>(
    '/split-proposals/:proposalId/create-stack',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: ProposalParams }>, reply: FastifyReply) => {
      const { proposalId } = request.params;

      const proposal = await db.pRSplitProposal.findUnique({
        where: { id: proposalId },
      });

      if (!proposal) {
        throw new NotFoundError('Split proposal not found');
      }

      if (proposal.status !== 'COMPLETED') {
        throw new BadRequestError('Can only create stack from completed proposals');
      }

      const stack = await prSplittingService.createStackFromProposal(proposalId);

      if (!stack) {
        throw new BadRequestError('No splits with PRs found in proposal');
      }

      return reply.send({
        success: true,
        stackId: stack.stackId,
        items: stack.items,
      });
    }
  );

  // Get stack status
  fastify.get<{ Params: StackParams }>(
    '/stacks/:stackId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: StackParams }>, reply: FastifyReply) => {
      const { stackId } = request.params;

      const result = await prSplittingService.getStackStatus(stackId);

      if (!result) {
        throw new NotFoundError('Stack not found');
      }

      return reply.send({
        success: true,
        ...result,
      });
    }
  );

  // List stacks for a repository
  fastify.get<{ Querystring: { repositoryId: string; status?: string } }>(
    '/stacks',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Querystring: { repositoryId: string; status?: string } }>, reply: FastifyReply) => {
      const { repositoryId, status } = request.query;

      if (!repositoryId) {
        throw new BadRequestError('repositoryId is required');
      }

      const stacks = await db.pRStack.findMany({
        where: {
          repositoryId,
          ...(status ? { status } : {}),
        },
        include: {
          items: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return reply.send({
        success: true,
        stacks,
      });
    }
  );

  // Update stack item status (for merge tracking)
  fastify.patch<{ Params: { stackId: string; itemId: string }; Body: { status: string } }>(
    '/stacks/:stackId/items/:itemId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: { stackId: string; itemId: string }; Body: { status: string } }>, reply: FastifyReply) => {
      const { stackId, itemId } = request.params;
      const { status } = request.body;

      const validStatuses = ['pending', 'merged', 'blocked'];
      if (!validStatuses.includes(status)) {
        throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const item = await db.pRStackItem.findFirst({
        where: { id: itemId, stackId },
      });

      if (!item) {
        throw new NotFoundError('Stack item not found');
      }

      await db.pRStackItem.update({
        where: { id: itemId },
        data: { status },
      });

      // Check if all items are merged
      const remainingItems = await db.pRStackItem.count({
        where: { stackId, status: { not: 'merged' } },
      });

      if (remainingItems === 0) {
        await db.pRStack.update({
          where: { id: stackId },
          data: { status: 'merged' },
        });
      }

      return reply.send({
        success: true,
        message: 'Stack item updated',
      });
    }
  );
}
