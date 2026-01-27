import { Webhooks, createNodeMiddleware } from '@octokit/webhooks';

export type PRWebhookAction =
  | 'opened'
  | 'synchronize'
  | 'reopened'
  | 'closed'
  | 'edited'
  | 'ready_for_review';

export interface WebhookConfig {
  secret: string;
}

export interface PRWebhookPayload {
  action: PRWebhookAction;
  pullRequest: {
    number: number;
    title: string;
    body: string | null;
    headSha: string;
    baseSha: string;
    headRef: string;
    baseRef: string;
    draft: boolean;
    author: string;
  };
  repository: {
    id: number;
    owner: string;
    name: string;
    fullName: string;
    private: boolean;
  };
  installation: {
    id: number;
  };
  sender: {
    login: string;
  };
}

export interface WebhookHandlers {
  onPullRequest?: (payload: PRWebhookPayload) => Promise<void>;
  onPullRequestReview?: (payload: unknown) => Promise<void>;
}

export class WebhookHandler {
  private webhooks: Webhooks;
  private handlers: WebhookHandlers;

  constructor(config: WebhookConfig, handlers: WebhookHandlers) {
    this.webhooks = new Webhooks({ secret: config.secret });
    this.handlers = handlers;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.webhooks.on('pull_request', async ({ payload }) => {
      const prPayload = payload as {
        action: string;
        pull_request: {
          number: number;
          title: string;
          body: string | null;
          head: { sha: string; ref: string };
          base: { sha: string; ref: string };
          draft: boolean;
          user: { login: string };
        };
        repository: {
          id: number;
          owner: { login: string };
          name: string;
          full_name: string;
          private: boolean;
        };
        installation?: { id: number };
        sender: { login: string };
      };
      
      const relevantActions = ['opened', 'synchronize', 'reopened', 'ready_for_review'];
      if (!relevantActions.includes(prPayload.action)) {
        return;
      }

      if (prPayload.pull_request.draft) {
        return;
      }

      if (this.handlers.onPullRequest) {
        await this.handlers.onPullRequest({
          action: prPayload.action as PRWebhookAction,
          pullRequest: {
            number: prPayload.pull_request.number,
            title: prPayload.pull_request.title,
            body: prPayload.pull_request.body,
            headSha: prPayload.pull_request.head.sha,
            baseSha: prPayload.pull_request.base.sha,
            headRef: prPayload.pull_request.head.ref,
            baseRef: prPayload.pull_request.base.ref,
            draft: prPayload.pull_request.draft,
            author: prPayload.pull_request.user.login,
          },
          repository: {
            id: prPayload.repository.id,
            owner: prPayload.repository.owner.login,
            name: prPayload.repository.name,
            fullName: prPayload.repository.full_name,
            private: prPayload.repository.private,
          },
          installation: {
            id: prPayload.installation?.id || 0,
          },
          sender: {
            login: prPayload.sender.login,
          },
        });
      }
    });

    this.webhooks.on('pull_request_review', async ({ payload }) => {
      if (this.handlers.onPullRequestReview) {
        await this.handlers.onPullRequestReview(payload);
      }
    });
  }

  getMiddleware() {
    return createNodeMiddleware(this.webhooks, { path: '/api/webhooks/github' });
  }

  async verifyAndReceive(
    id: string,
    name: string,
    payload: string,
    signature: string
  ): Promise<void> {
    await this.webhooks.verifyAndReceive({
      id,
      name: name as 'pull_request',
      payload: JSON.parse(payload),
      signature,
    });
  }
}

export function createWebhookHandler(
  config: WebhookConfig,
  handlers: WebhookHandlers
): WebhookHandler {
  return new WebhookHandler(config, handlers);
}
