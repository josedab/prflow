/**
 * @fileoverview Types for Copilot Extensions Integration
 */

export interface CopilotSkillDefinition {
  name: string;
  description: string;
  endpoint: string;
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

export interface CopilotExtensionManifest {
  name: string;
  displayName: string;
  description: string;
  version: string;
  skills: CopilotSkillDefinition[];
  icon: string;
  author: string;
}

export interface CopilotSkillRequest {
  skill: string;
  parameters: Record<string, unknown>;
  context: {
    repository?: { owner: string; name: string };
    pullRequest?: { number: number };
    file?: { path: string };
    user: { login: string };
  };
  conversationId?: string;
}

export interface CopilotSkillResponse {
  type: 'text' | 'markdown' | 'json' | 'diff';
  content: string;
  metadata?: Record<string, unknown>;
  suggestedFollowUps?: string[];
}
