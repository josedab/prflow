import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { multiRepoOrchestrationService, type MultiRepoChange } from './multi-repo-orchestration.js';

/**
 * Service dependency definition
 */
export interface ServiceDependency {
  serviceId: string;
  serviceName: string;
  repositoryId: string;
  dependsOn: string[]; // Service IDs this service depends on
  breakingChangeIndicators: string[]; // Patterns that indicate breaking changes
}

/**
 * Cross-repo impact analysis
 */
export interface CrossRepoImpact {
  sourceRepository: string;
  changedFiles: string[];
  impactedServices: Array<{
    serviceId: string;
    serviceName: string;
    repositoryId: string;
    impactLevel: 'none' | 'compatible' | 'requires-update' | 'breaking';
    affectedFiles: string[];
    requiredActions: string[];
  }>;
  suggestedCoordination: CoordinationPlan;
}

/**
 * Coordination plan for multi-repo changes
 */
export interface CoordinationPlan {
  id: string;
  strategy: 'sequential' | 'parallel' | 'staged';
  phases: CoordinationPhase[];
  estimatedDuration: number; // minutes
  risks: string[];
  rollbackPlan: RollbackPlan;
}

/**
 * A phase in the coordination plan
 */
export interface CoordinationPhase {
  id: string;
  name: string;
  order: number;
  repositories: string[];
  actions: Array<{
    type: 'deploy' | 'verify' | 'rollback' | 'notify';
    target: string;
    details: string;
  }>;
  successCriteria: string[];
  timeout: number; // minutes
}

/**
 * Rollback plan for failed coordination
 */
export interface RollbackPlan {
  automatic: boolean;
  steps: Array<{
    order: number;
    repository: string;
    action: 'revert-pr' | 'revert-commit' | 'redeploy-previous';
    details: string;
  }>;
}

/**
 * Service graph for understanding dependencies
 */
export interface ServiceGraph {
  organizationId: string;
  services: ServiceDependency[];
  edges: Array<{
    from: string;
    to: string;
    type: 'depends-on' | 'provides-api' | 'shared-db';
  }>;
  lastUpdated: Date;
}

/**
 * Coordination status
 */
export interface CoordinationStatus {
  planId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  currentPhase: number;
  totalPhases: number;
  phaseStatuses: Array<{
    phaseId: string;
    status: 'pending' | 'in-progress' | 'completed' | 'failed';
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
  }>;
  startedAt?: Date;
  completedAt?: Date;
}

export class EnhancedMultiRepoOrchestrationService {
  private serviceGraphs = new Map<string, ServiceGraph>();
  private coordinationStatuses = new Map<string, CoordinationStatus>();

  /**
   * Register a service in the dependency graph
   */
  async registerService(
    organizationId: string,
    service: ServiceDependency
  ): Promise<void> {
    let graph = this.serviceGraphs.get(organizationId);
    
    if (!graph) {
      graph = {
        organizationId,
        services: [],
        edges: [],
        lastUpdated: new Date(),
      };
      this.serviceGraphs.set(organizationId, graph);
    }

    // Update or add service
    const existingIndex = graph.services.findIndex(s => s.serviceId === service.serviceId);
    if (existingIndex >= 0) {
      graph.services[existingIndex] = service;
    } else {
      graph.services.push(service);
    }

    // Update edges
    for (const depId of service.dependsOn) {
      const edgeExists = graph.edges.some(
        e => e.from === service.serviceId && e.to === depId
      );
      if (!edgeExists) {
        graph.edges.push({
          from: service.serviceId,
          to: depId,
          type: 'depends-on',
        });
      }
    }

    graph.lastUpdated = new Date();

    // Store in database
    await db.analyticsEvent.create({
      data: {
        eventType: 'SERVICE_GRAPH',
        repositoryId: organizationId,
        eventData: JSON.parse(JSON.stringify(graph)),
        
        
      },
    });

    logger.info({ organizationId, serviceId: service.serviceId }, 'Service registered');
  }

  /**
   * Get the service graph for an organization
   */
  async getServiceGraph(organizationId: string): Promise<ServiceGraph | null> {
    if (this.serviceGraphs.has(organizationId)) {
      return this.serviceGraphs.get(organizationId)!;
    }

    // Try to load from database
    const event = await db.analyticsEvent.findFirst({
      where: {
        repositoryId: organizationId,
        eventType: 'SERVICE_GRAPH',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (event) {
      const graph = event.eventData as unknown as ServiceGraph;
      this.serviceGraphs.set(organizationId, graph);
      return graph;
    }

    return null;
  }

  /**
   * Analyze cross-repo impact of changes
   */
  async analyzeCrossRepoImpact(
    organizationId: string,
    sourceRepositoryId: string,
    changedFiles: string[]
  ): Promise<CrossRepoImpact> {
    const graph = await this.getServiceGraph(organizationId);
    
    if (!graph) {
      return {
        sourceRepository: sourceRepositoryId,
        changedFiles,
        impactedServices: [],
        suggestedCoordination: this.createEmptyCoordinationPlan(),
      };
    }

    // Find the source service
    const sourceService = graph.services.find(s => s.repositoryId === sourceRepositoryId);
    if (!sourceService) {
      return {
        sourceRepository: sourceRepositoryId,
        changedFiles,
        impactedServices: [],
        suggestedCoordination: this.createEmptyCoordinationPlan(),
      };
    }

    // Find services that depend on this service
    const dependentServices = graph.services.filter(s =>
      s.dependsOn.includes(sourceService.serviceId)
    );

    // Analyze impact on each dependent service
    const impactedServices = dependentServices.map(depService => {
      const impactLevel = this.assessImpactLevel(
        changedFiles,
        sourceService.breakingChangeIndicators
      );

      return {
        serviceId: depService.serviceId,
        serviceName: depService.serviceName,
        repositoryId: depService.repositoryId,
        impactLevel,
        affectedFiles: this.findAffectedFiles(changedFiles, depService),
        requiredActions: this.determineRequiredActions(impactLevel),
      };
    });

    // Generate coordination plan
    const suggestedCoordination = await this.generateCoordinationPlan(
      sourceService,
      impactedServices,
      changedFiles
    );

    return {
      sourceRepository: sourceRepositoryId,
      changedFiles,
      impactedServices,
      suggestedCoordination,
    };
  }

  /**
   * Create a coordinated multi-repo change
   */
  async createCoordinatedChange(
    organizationId: string,
    name: string,
    description: string,
    sourceChange: {
      repositoryId: string;
      branchName: string;
      changedFiles: string[];
    },
    userId: string
  ): Promise<{
    changeSet: MultiRepoChange;
    impact: CrossRepoImpact;
    coordinationPlan: CoordinationPlan;
  }> {
    // Analyze impact
    const impact = await this.analyzeCrossRepoImpact(
      organizationId,
      sourceChange.repositoryId,
      sourceChange.changedFiles
    );

    // Build repository list with dependencies
    const repositories: Array<{
      repositoryId: string;
      branchName: string;
      dependencies: string[];
    }> = [
      {
        repositoryId: sourceChange.repositoryId,
        branchName: sourceChange.branchName,
        dependencies: [],
      },
    ];

    // Add impacted services that need updates
    for (const impacted of impact.impactedServices) {
      if (impacted.impactLevel === 'requires-update' || impacted.impactLevel === 'breaking') {
        repositories.push({
          repositoryId: impacted.repositoryId,
          branchName: `coordinated/${sourceChange.branchName}`,
          dependencies: [sourceChange.repositoryId],
        });
      }
    }

    // Create the change set using existing service
    const changeSet = await multiRepoOrchestrationService.createChangeSet(
      name,
      description,
      repositories,
      userId
    );

    return {
      changeSet,
      impact,
      coordinationPlan: impact.suggestedCoordination,
    };
  }

  /**
   * Execute a coordinated deployment
   */
  async executeCoordinatedDeployment(
    planId: string,
    installationId: number,
    options: {
      dryRun?: boolean;
      notifySlack?: boolean;
      pauseBetweenPhases?: boolean;
    } = {}
  ): Promise<CoordinationStatus> {
    const status: CoordinationStatus = {
      planId,
      status: 'in-progress',
      currentPhase: 0,
      totalPhases: 0, // Will be updated
      phaseStatuses: [],
      startedAt: new Date(),
    };

    this.coordinationStatuses.set(planId, status);

    // In a real implementation, this would:
    // 1. Execute each phase in order
    // 2. Wait for success criteria
    // 3. Handle failures and rollbacks
    // 4. Send notifications

    logger.info({ planId, options }, 'Coordinated deployment started');

    // Simulate phase execution
    status.status = 'completed';
    status.completedAt = new Date();

    return status;
  }

  /**
   * Get coordination status
   */
  getCoordinationStatus(planId: string): CoordinationStatus | null {
    return this.coordinationStatuses.get(planId) || null;
  }

  /**
   * Detect potential conflicts between concurrent changes
   */
  async detectConflicts(
    organizationId: string,
    changes: Array<{
      changeId: string;
      repositoryId: string;
      files: string[];
    }>
  ): Promise<Array<{
    change1: string;
    change2: string;
    conflictType: 'file-overlap' | 'service-dependency' | 'deployment-order';
    files?: string[];
    resolution: string;
  }>> {
    const conflicts: Array<{
      change1: string;
      change2: string;
      conflictType: 'file-overlap' | 'service-dependency' | 'deployment-order';
      files?: string[];
      resolution: string;
    }> = [];

    // Check for file overlaps
    for (let i = 0; i < changes.length; i++) {
      for (let j = i + 1; j < changes.length; j++) {
        const change1 = changes[i];
        const change2 = changes[j];

        // Same repository file overlap
        if (change1.repositoryId === change2.repositoryId) {
          const overlappingFiles = change1.files.filter(f => change2.files.includes(f));
          if (overlappingFiles.length > 0) {
            conflicts.push({
              change1: change1.changeId,
              change2: change2.changeId,
              conflictType: 'file-overlap',
              files: overlappingFiles,
              resolution: 'Merge changes sequentially or coordinate between teams',
            });
          }
        }

        // Service dependency conflicts
        const graph = await this.getServiceGraph(organizationId);
        if (graph) {
          const service1 = graph.services.find(s => s.repositoryId === change1.repositoryId);
          const service2 = graph.services.find(s => s.repositoryId === change2.repositoryId);

          if (service1 && service2) {
            const hasDependency = service1.dependsOn.includes(service2.serviceId) ||
                                   service2.dependsOn.includes(service1.serviceId);
            if (hasDependency) {
              conflicts.push({
                change1: change1.changeId,
                change2: change2.changeId,
                conflictType: 'service-dependency',
                resolution: 'Coordinate deployment order based on service dependencies',
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Get deployment readiness across all repositories in a change
   */
  async getDeploymentReadiness(
    changeId: string,
    _installationId: number
  ): Promise<{
    ready: boolean;
    checks: Array<{
      repository: string;
      check: string;
      status: 'passed' | 'failed' | 'pending';
      details?: string;
    }>;
    blockers: string[];
    recommendations: string[];
  }> {
    const changeSet = await multiRepoOrchestrationService.getChangeSet(changeId);
    
    if (!changeSet) {
      return {
        ready: false,
        checks: [],
        blockers: ['Change set not found'],
        recommendations: [],
      };
    }

    const checks: Array<{
      repository: string;
      check: string;
      status: 'passed' | 'failed' | 'pending';
      details?: string;
    }> = [];

    const blockers: string[] = [];
    const recommendations: string[] = [];

    for (const repo of changeSet.repositories) {
      // Check PR exists
      checks.push({
        repository: repo.repositoryName,
        check: 'PR Created',
        status: repo.prNumber ? 'passed' : 'pending',
        details: repo.prNumber ? `PR #${repo.prNumber}` : 'No PR created yet',
      });

      // Check approval status
      checks.push({
        repository: repo.repositoryName,
        check: 'PR Approved',
        status: repo.status === 'approved' ? 'passed' : 
                repo.status === 'merged' ? 'passed' : 'pending',
      });

      // Check dependencies
      const unmergedDeps = repo.dependencies.filter(
        depId => !changeSet.repositories.find(
          r => r.repositoryId === depId && r.status === 'merged'
        )
      );

      if (unmergedDeps.length > 0) {
        checks.push({
          repository: repo.repositoryName,
          check: 'Dependencies Ready',
          status: 'pending',
          details: `Waiting for: ${unmergedDeps.join(', ')}`,
        });
        blockers.push(`${repo.repositoryName} is waiting for dependencies`);
      } else {
        checks.push({
          repository: repo.repositoryName,
          check: 'Dependencies Ready',
          status: 'passed',
        });
      }
    }

    // Generate recommendations
    if (blockers.length === 0 && checks.some(c => c.status === 'pending')) {
      recommendations.push('All blocking dependencies resolved. Proceed when PRs are approved.');
    }

    if (changeSet.repositories.length > 3) {
      recommendations.push('Consider staged deployment due to number of repositories involved.');
    }

    const ready = checks.every(c => c.status === 'passed');

    return {
      ready,
      checks,
      blockers,
      recommendations,
    };
  }

  // Private helper methods

  private createEmptyCoordinationPlan(): CoordinationPlan {
    return {
      id: `plan-${Date.now()}`,
      strategy: 'sequential',
      phases: [],
      estimatedDuration: 0,
      risks: [],
      rollbackPlan: {
        automatic: true,
        steps: [],
      },
    };
  }

  private assessImpactLevel(
    changedFiles: string[],
    breakingIndicators: string[]
  ): CrossRepoImpact['impactedServices'][0]['impactLevel'] {
    // Check if any changed files match breaking change indicators
    for (const file of changedFiles) {
      for (const indicator of breakingIndicators) {
        if (file.includes(indicator)) {
          return 'breaking';
        }
      }
    }

    // Check for API changes
    const apiFiles = changedFiles.filter(f =>
      f.includes('/api/') ||
      f.includes('.proto') ||
      f.includes('schema') ||
      f.includes('types')
    );

    if (apiFiles.length > 0) {
      return 'requires-update';
    }

    // Check for config changes
    const configFiles = changedFiles.filter(f =>
      f.includes('config') ||
      f.endsWith('.json') ||
      f.endsWith('.yaml')
    );

    if (configFiles.length > 0) {
      return 'compatible';
    }

    return 'none';
  }

  private findAffectedFiles(
    changedFiles: string[],
    _service: ServiceDependency
  ): string[] {
    // In a real implementation, this would analyze imports and usage
    return changedFiles.filter(f =>
      f.includes('/api/') ||
      f.includes('/types/') ||
      f.includes('/interfaces/')
    );
  }

  private determineRequiredActions(
    impactLevel: CrossRepoImpact['impactedServices'][0]['impactLevel']
  ): string[] {
    switch (impactLevel) {
      case 'breaking':
        return [
          'Update dependent code to match new API',
          'Run integration tests',
          'Update documentation',
          'Coordinate deployment timing',
        ];
      case 'requires-update':
        return [
          'Review API changes',
          'Update types/interfaces if needed',
          'Run regression tests',
        ];
      case 'compatible':
        return [
          'Verify config compatibility',
          'Run smoke tests after deployment',
        ];
      default:
        return [];
    }
  }

  private async generateCoordinationPlan(
    sourceService: ServiceDependency,
    impactedServices: CrossRepoImpact['impactedServices'],
    _changedFiles: string[]
  ): Promise<CoordinationPlan> {
    const phases: CoordinationPhase[] = [];

    // Phase 1: Deploy source service
    phases.push({
      id: 'phase-1',
      name: 'Deploy Source Changes',
      order: 1,
      repositories: [sourceService.repositoryId],
      actions: [
        { type: 'deploy', target: sourceService.serviceName, details: 'Deploy updated service' },
        { type: 'verify', target: sourceService.serviceName, details: 'Run health checks' },
      ],
      successCriteria: ['Service healthy', 'No errors in logs'],
      timeout: 30,
    });

    // Phase 2+: Deploy dependent services
    const dependentsNeedingUpdate = impactedServices.filter(
      s => s.impactLevel === 'requires-update' || s.impactLevel === 'breaking'
    );

    if (dependentsNeedingUpdate.length > 0) {
      phases.push({
        id: 'phase-2',
        name: 'Deploy Dependent Services',
        order: 2,
        repositories: dependentsNeedingUpdate.map(s => s.repositoryId),
        actions: dependentsNeedingUpdate.flatMap(s => [
          { type: 'deploy' as const, target: s.serviceName, details: 'Deploy updated dependency' },
          { type: 'verify' as const, target: s.serviceName, details: 'Run health checks' },
        ]),
        successCriteria: ['All services healthy', 'Integration tests pass'],
        timeout: 60,
      });
    }

    // Calculate estimated duration
    const estimatedDuration = phases.reduce((sum, p) => sum + p.timeout, 0);

    // Identify risks
    const risks: string[] = [];
    if (impactedServices.some(s => s.impactLevel === 'breaking')) {
      risks.push('Breaking changes detected - coordinate carefully');
    }
    if (dependentsNeedingUpdate.length > 3) {
      risks.push('Multiple dependent services need updates - consider staged rollout');
    }

    // Create rollback plan
    const rollbackPlan: RollbackPlan = {
      automatic: true,
      steps: phases.map((p, i) => ({
        order: phases.length - i,
        repository: p.repositories[0],
        action: 'revert-pr' as const,
        details: `Revert changes from ${p.name}`,
      })),
    };

    return {
      id: `plan-${Date.now()}`,
      strategy: dependentsNeedingUpdate.length > 0 ? 'staged' : 'sequential',
      phases,
      estimatedDuration,
      risks,
      rollbackPlan,
    };
  }
}

export const enhancedMultiRepoOrchestrationService = new EnhancedMultiRepoOrchestrationService();
