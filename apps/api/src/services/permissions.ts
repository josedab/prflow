import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

// ============================================
// Permission Types
// ============================================

export type Permission =
  // Repository
  | 'repository.read'
  | 'repository.write'
  | 'repository.settings'
  | 'repository.delete'
  // Rules
  | 'rules.read'
  | 'rules.write'
  | 'rules.delete'
  // Workflows
  | 'workflows.read'
  | 'workflows.trigger'
  | 'workflows.cancel'
  // Analytics
  | 'analytics.read'
  | 'analytics.export'
  // Audit
  | 'audit.read'
  | 'audit.export'
  // Team
  | 'team.read'
  | 'team.write'
  | 'team.members.manage'
  // Admin
  | 'admin.full';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

// ============================================
// Role Permission Mapping
// ============================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'repository.read',
    'repository.write',
    'repository.settings',
    'repository.delete',
    'rules.read',
    'rules.write',
    'rules.delete',
    'workflows.read',
    'workflows.trigger',
    'workflows.cancel',
    'analytics.read',
    'analytics.export',
    'audit.read',
    'audit.export',
    'team.read',
    'team.write',
    'team.members.manage',
    'admin.full',
  ],
  admin: [
    'repository.read',
    'repository.write',
    'repository.settings',
    'rules.read',
    'rules.write',
    'rules.delete',
    'workflows.read',
    'workflows.trigger',
    'workflows.cancel',
    'analytics.read',
    'analytics.export',
    'audit.read',
    'team.read',
    'team.write',
    'team.members.manage',
  ],
  member: [
    'repository.read',
    'repository.write',
    'rules.read',
    'workflows.read',
    'workflows.trigger',
    'analytics.read',
    'team.read',
  ],
  viewer: ['repository.read', 'rules.read', 'workflows.read', 'analytics.read', 'team.read'],
};

// ============================================
// Permission Service
// ============================================

export interface PermissionContext {
  userId?: string;
  userLogin?: string;
  organizationId?: string;
  repositoryId?: string;
  teamId?: string;
}

export class PermissionService {
  async getUserRole(userId: string, teamId: string): Promise<Role | null> {
    const membership = await db.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!membership) return null;

    // Convert DB role to our Role type
    switch (membership.role) {
      case 'OWNER':
        return 'owner';
      case 'ADMIN':
        return 'admin';
      case 'MEMBER':
        return 'member';
      default:
        return 'viewer';
    }
  }

  async hasPermission(context: PermissionContext, permission: Permission): Promise<boolean> {
    if (!context.userId) {
      logger.debug({ permission }, 'Permission check failed: no user context');
      return false;
    }

    // If no team context, check if user has any team with this permission
    if (!context.teamId && context.repositoryId) {
      const repository = await db.repository.findUnique({
        where: { id: context.repositoryId },
        include: {
          organization: {
            include: {
              teams: {
                include: {
                  members: {
                    where: { userId: context.userId },
                  },
                },
              },
            },
          },
        },
      });

      if (!repository?.organization) return false;

      for (const team of repository.organization.teams) {
        if (team.members.length > 0) {
          const role = this.dbRoleToRole(team.members[0].role);
          if (this.roleHasPermission(role, permission)) {
            return true;
          }
        }
      }

      return false;
    }

    if (!context.teamId) return false;

    const role = await this.getUserRole(context.userId, context.teamId);
    if (!role) {
      logger.debug({ userId: context.userId, teamId: context.teamId }, 'User not in team');
      return false;
    }

    return this.roleHasPermission(role, permission);
  }

  roleHasPermission(role: Role, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions.includes(permission) || permissions.includes('admin.full');
  }

  getPermissionsForRole(role: Role): Permission[] {
    return [...ROLE_PERMISSIONS[role]];
  }

  async getUserPermissions(userId: string, teamId: string): Promise<Permission[]> {
    const role = await this.getUserRole(userId, teamId);
    if (!role) return [];
    return this.getPermissionsForRole(role);
  }

  private dbRoleToRole(dbRole: string): Role {
    switch (dbRole) {
      case 'OWNER':
        return 'owner';
      case 'ADMIN':
        return 'admin';
      case 'MEMBER':
        return 'member';
      default:
        return 'viewer';
    }
  }

  // Check multiple permissions (AND logic)
  async hasAllPermissions(context: PermissionContext, permissions: Permission[]): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(context, permission))) {
        return false;
      }
    }
    return true;
  }

  // Check multiple permissions (OR logic)
  async hasAnyPermission(context: PermissionContext, permissions: Permission[]): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(context, permission)) {
        return true;
      }
    }
    return false;
  }
}

export const permissionService = new PermissionService();

// ============================================
// Permission Middleware
// ============================================

export function requirePermission(permission: Permission) {
  return async (request: { user?: { id: string }; params?: { teamId?: string; repositoryId?: string } }, reply: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const context: PermissionContext = {
      userId: request.user?.id,
      teamId: request.params?.teamId,
      repositoryId: request.params?.repositoryId,
    };

    const hasPermission = await permissionService.hasPermission(context, permission);
    
    if (!hasPermission) {
      reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required permission: ${permission}` 
      });
      return;
    }
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return async (request: { user?: { id: string }; params?: { teamId?: string; repositoryId?: string } }, reply: { status: (code: number) => { send: (body: unknown) => void } }) => {
    const context: PermissionContext = {
      userId: request.user?.id,
      teamId: request.params?.teamId,
      repositoryId: request.params?.repositoryId,
    };

    const hasPermission = await permissionService.hasAnyPermission(context, permissions);
    
    if (!hasPermission) {
      reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required permissions: ${permissions.join(' or ')}` 
      });
      return;
    }
  };
}
