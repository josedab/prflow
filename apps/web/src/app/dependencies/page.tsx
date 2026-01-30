'use client';

import { useState, useCallback } from 'react';
import {
  GitPullRequest,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Network,
  Zap,
  Play,
} from 'lucide-react';

// Types matching the API
interface DependencyNode {
  id: string;
  prNumber: number;
  title: string;
  author: string;
  status: string;
  branch: string;
  baseBranch: string;
  riskLevel: string;
  affectedFiles: string[];
  createdAt: string;
}

interface DependencyEdge {
  source: string;
  target: string;
  type: 'branch_dependency' | 'file_conflict' | 'semantic_dependency';
  strength: number;
  conflictFiles?: string[];
}

interface CycleInfo {
  nodes: string[];
  description: string;
}

interface DependencyGraph {
  repositoryId: string;
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: CycleInfo[];
  criticalPath: string[];
  generatedAt: string;
}

interface MergeOrderItem {
  id: string;
  prNumber: number;
  title: string;
  priority: number;
  blockedBy: string[];
  blocks: string[];
  estimatedRisk: string;
}

interface MergeOrder {
  hasConflicts: boolean;
  order: MergeOrderItem[];
  conflictDetails: string[];
  recommendations: string[];
}

interface ImpactAnalysis {
  prId: string;
  directlyAffected: string[];
  indirectlyAffected: string[];
  blockedPRs: string[];
  impactScore: number;
  recommendations: string[];
}

export default function DependenciesPage() {
  const [repositoryId, setRepositoryId] = useState('');
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [mergeOrder, setMergeOrder] = useState<MergeOrder | null>(null);
  const [selectedPR, setSelectedPR] = useState<DependencyNode | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGraph = async () => {
    if (!repositoryId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dependencies/${repositoryId}/graph`);
      if (!response.ok) throw new Error('Failed to load dependency graph');
      const data = await response.json();
      setGraph(data);

      // Also load merge order
      const orderResponse = await fetch(`/api/dependencies/${repositoryId}/merge-order`);
      if (orderResponse.ok) {
        setMergeOrder(await orderResponse.json());
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadImpact = async (prId: string) => {
    try {
      const response = await fetch(`/api/dependencies/${prId}/impact`);
      if (!response.ok) throw new Error('Failed to load impact analysis');
      setImpact(await response.json());
    } catch (err) {
      console.error('Failed to load impact:', err);
    }
  };

  const handleNodeClick = useCallback((node: DependencyNode) => {
    setSelectedPR(node);
    loadImpact(node.id);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'REVIEWING':
        return 'bg-blue-100 text-blue-800';
      case 'ANALYZING':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toUpperCase()) {
      case 'CRITICAL':
        return 'text-red-600';
      case 'HIGH':
        return 'text-orange-600';
      case 'MEDIUM':
        return 'text-yellow-600';
      default:
        return 'text-green-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Network className="h-7 w-7 mr-3 text-primary-600" />
            PR Dependency Graph
          </h1>
          <p className="text-gray-600">
            Visualize dependencies, detect cycles, and plan optimal merge order
          </p>
        </div>
      </div>

      {/* Repository Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex space-x-4">
          <input
            type="text"
            placeholder="Repository ID"
            value={repositoryId}
            onChange={(e) => setRepositoryId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={loadGraph}
            disabled={!repositoryId || loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Load Graph
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {graph && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Graph View */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Dependency Graph</h2>
            
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{graph.nodes.length}</div>
                <div className="text-xs text-gray-500">Active PRs</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{graph.edges.length}</div>
                <div className="text-xs text-gray-500">Dependencies</div>
              </div>
              <div className={`rounded-lg p-3 text-center ${graph.cycles.length > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`text-2xl font-bold ${graph.cycles.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {graph.cycles.length}
                </div>
                <div className="text-xs text-gray-500">Cycles</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{graph.criticalPath.length}</div>
                <div className="text-xs text-gray-500">Critical Path</div>
              </div>
            </div>

            {/* Cycles Warning */}
            {graph.cycles.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-center text-red-800 font-medium mb-2">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Circular Dependencies Detected
                </div>
                <ul className="text-sm text-red-700 space-y-1">
                  {graph.cycles.map((cycle, idx) => (
                    <li key={idx}>• {cycle.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* PR List */}
            <div className="space-y-3">
              {graph.nodes.map((node) => (
                <div
                  key={node.id}
                  onClick={() => handleNodeClick(node)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                    selectedPR?.id === node.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                  } ${graph.criticalPath.includes(node.id) ? 'ring-2 ring-blue-300' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <GitPullRequest className="h-5 w-5 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">
                          #{node.prNumber} {node.title}
                        </div>
                        <div className="text-sm text-gray-500">
                          {node.branch} → {node.baseBranch} • by {node.author}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(node.status)}`}>
                        {node.status}
                      </span>
                      <span className={`text-sm font-medium ${getRiskColor(node.riskLevel)}`}>
                        {node.riskLevel}
                      </span>
                    </div>
                  </div>
                  
                  {/* Dependencies */}
                  {graph.edges.filter(e => e.source === node.id || e.target === node.id).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex flex-wrap gap-2">
                        {graph.edges
                          .filter(e => e.source === node.id)
                          .map((edge) => (
                            <span
                              key={edge.target}
                              className={`text-xs px-2 py-1 rounded ${
                                edge.type === 'file_conflict'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              → PR #{graph.nodes.find(n => n.id === edge.target)?.prNumber}
                              {edge.type === 'file_conflict' && ' ⚠️'}
                            </span>
                          ))}
                        {graph.edges
                          .filter(e => e.target === node.id)
                          .map((edge) => (
                            <span
                              key={edge.source}
                              className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700"
                            >
                              ← PR #{graph.nodes.find(n => n.id === edge.source)?.prNumber}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Selected PR Impact */}
            {selectedPR && impact && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-yellow-500" />
                  Impact Analysis
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">Impact Score</div>
                    <div className="text-3xl font-bold text-gray-900">
                      {impact.impactScore.toFixed(1)}
                    </div>
                  </div>
                  
                  {impact.blockedPRs.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Blocks</div>
                      <div className="flex flex-wrap gap-1">
                        {impact.blockedPRs.map(prId => (
                          <span key={prId} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
                            {prId.substring(0, 8)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {impact.recommendations.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Recommendations</div>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {impact.recommendations.map((rec, idx) => (
                          <li key={idx}>• {rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Merge Order */}
            {mergeOrder && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Play className="h-5 w-5 mr-2 text-green-500" />
                  Optimal Merge Order
                </h3>
                
                {mergeOrder.hasConflicts && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-sm text-yellow-800">
                    <strong>Warning:</strong> Conflicts detected. Manual resolution may be required.
                  </div>
                )}

                <ol className="space-y-3">
                  {mergeOrder.order.map((item, idx) => (
                    <li key={item.id} className="flex items-center space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-medium">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          #{item.prNumber} {item.title}
                        </div>
                        {item.blockedBy.length > 0 && (
                          <div className="text-xs text-gray-500">
                            Blocked by: {item.blockedBy.length} PRs
                          </div>
                        )}
                      </div>
                      <span className={`text-xs font-medium ${getRiskColor(item.estimatedRisk)}`}>
                        {item.estimatedRisk}
                      </span>
                    </li>
                  ))}
                </ol>

                {mergeOrder.recommendations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500 mb-2">Recommendations</div>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {mergeOrder.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!graph && !loading && !error && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Network className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Graph Loaded</h3>
          <p className="text-gray-500">Enter a repository ID and click Load Graph to visualize PR dependencies</p>
        </div>
      )}
    </div>
  );
}
