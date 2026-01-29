import type { FastifyInstance } from 'fastify';
import { loadConfigSafe } from '@prflow/config';
import { createWebhookHandler, type PRWebhookPayload } from '@prflow/github-client';
import { db } from '@prflow/db';
import { enqueuePRWorkflow } from '../lib/queue.js';
import { logger } from '../lib/logger.js';

const config = loadConfigSafe();

async function handlePullRequest(payload: PRWebhookPayload): Promise<void> {
  logger.info(
    { pr: payload.pullRequest.number, repo: payload.repository.fullName, action: payload.action },
    'Processing PR webhook'
  );

  // Upsert organization
  const org = await db.organization.upsert({
    where: { login: payload.repository.owner },
    update: {
      installationId: payload.installation.id,
    },
    create: {
      githubId: payload.repository.id,
      login: payload.repository.owner,
      installationId: payload.installation.id,
    },
  });

  // Upsert repository
  const repo = await db.repository.upsert({
    where: { fullName: payload.repository.fullName },
    update: {
      isPrivate: payload.repository.private,
    },
    create: {
      githubId: payload.repository.id,
      name: payload.repository.name,
      fullName: payload.repository.fullName,
      owner: payload.repository.owner,
      organizationId: org.id,
      isPrivate: payload.repository.private,
    },
  });

  // Get or create repository settings
  let settings = await db.repositorySettings.findUnique({
    where: { repositoryId: repo.id },
  });

  if (!settings) {
    settings = await db.repositorySettings.create({
      data: { repositoryId: repo.id },
    });
  }

  // Check if processing is enabled
  if (!settings.reviewEnabled && !settings.testGenerationEnabled && !settings.docUpdatesEnabled) {
    logger.info({ repo: repo.fullName }, 'All processing disabled for repository');
    return;
  }

  // Create or update workflow
  const workflow = await db.pRWorkflow.upsert({
    where: {
      repositoryId_prNumber: {
        repositoryId: repo.id,
        prNumber: payload.pullRequest.number,
      },
    },
    update: {
      status: 'PENDING',
      prTitle: payload.pullRequest.title,
      updatedAt: new Date(),
    },
    create: {
      repositoryId: repo.id,
      prNumber: payload.pullRequest.number,
      prTitle: payload.pullRequest.title,
      prUrl: `https://github.com/${payload.repository.fullName}/pull/${payload.pullRequest.number}`,
      headBranch: payload.pullRequest.headRef,
      baseBranch: payload.pullRequest.baseRef,
      authorLogin: payload.pullRequest.author,
      status: 'PENDING',
    },
  });

  // Enqueue job
  const jobId = await enqueuePRWorkflow({
    installationId: payload.installation.id,
    repositoryId: repo.id,
    owner: payload.repository.owner,
    repo: payload.repository.name,
    prNumber: payload.pullRequest.number,
    headSha: payload.pullRequest.headSha,
    action: payload.action,
  });

  logger.info({ workflowId: workflow.id, jobId }, 'PR workflow enqueued');
}

export async function setupWebhooks(app: FastifyInstance) {
  const webhookSecret = config.GITHUB_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn('GITHUB_WEBHOOK_SECRET not set, webhook verification disabled');
  }

  const handler = webhookSecret
    ? createWebhookHandler({ secret: webhookSecret }, {
        onPullRequest: handlePullRequest,
      })
    : null;

  app.post('/api/webhooks/github', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string;
    const event = request.headers['x-github-event'] as string;
    const deliveryId = request.headers['x-github-delivery'] as string;

    if (!event) {
      return reply.status(400).send({ error: 'Missing X-GitHub-Event header' });
    }

    try {
      if (handler && signature) {
        await handler.verifyAndReceive(
          deliveryId,
          event,
          JSON.stringify(request.body),
          signature
        );
      } else if (event === 'pull_request') {
        // Development mode without verification
        const payload = request.body as { action: string; pull_request: Record<string, unknown>; repository: Record<string, unknown>; installation?: { id: number }; sender: { login: string } };
        
        const relevantActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
        if (relevantActions.includes(payload.action)) {
          await handlePullRequest({
            action: payload.action as PRWebhookPayload['action'],
            pullRequest: {
              number: payload.pull_request.number as number,
              title: payload.pull_request.title as string,
              body: payload.pull_request.body as string | null,
              headSha: (payload.pull_request.head as { sha: string }).sha,
              baseSha: (payload.pull_request.base as { sha: string }).sha,
              headRef: (payload.pull_request.head as { ref: string }).ref,
              baseRef: (payload.pull_request.base as { ref: string }).ref,
              draft: payload.pull_request.draft as boolean,
              author: (payload.pull_request.user as { login: string }).login,
            },
            repository: {
              id: payload.repository.id as number,
              owner: (payload.repository.owner as { login: string }).login,
              name: payload.repository.name as string,
              fullName: payload.repository.full_name as string,
              private: payload.repository.private as boolean,
            },
            installation: {
              id: payload.installation?.id || 0,
            },
            sender: {
              login: payload.sender.login,
            },
          });
        }
      }

      return { received: true };
    } catch (error) {
      logger.error({ error, event }, 'Webhook processing failed');
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  });

  app.get('/api/webhooks/github', async () => {
    return { status: 'Webhook endpoint active' };
  });
}
