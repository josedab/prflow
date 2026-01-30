'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Clock,
  GitPullRequest,
  User,
  TrendingUp,
  Filter,
  X,
  Loader2,
  History,
  Lightbulb,
} from 'lucide-react';

// Types matching the API
interface PRQueryResult {
  workflowId: string;
  prNumber: number;
  title: string;
  author: string;
  status: string;
  riskLevel: string;
  createdAt: string;
  relevanceScore: number;
  matchedFilters: string[];
}

interface AggregationResult {
  type: string;
  value: number | Record<string, number>;
  details?: string;
}

interface ParsedQuery {
  originalQuery: string;
  type: string;
  intent: string;
  filters: Record<string, unknown>;
  aggregation?: string;
  sortBy?: string;
  sortOrder?: string;
  limit?: number;
  confidence: number;
}

interface QueryResult {
  query: ParsedQuery;
  results: PRQueryResult[];
  aggregation?: AggregationResult;
  totalCount: number;
  executionTimeMs: number;
  suggestions?: string[];
}

interface QuerySuggestion {
  text: string;
  description: string;
  type: string;
}

const EXAMPLE_QUERIES = [
  { query: 'show open PRs', description: 'Find all PRs currently open' },
  { query: 'high risk PRs by john', description: 'High risk PRs from a specific author' },
  { query: 'PRs merged last 7 days', description: 'Recently merged PRs' },
  { query: 'count open PRs per author', description: 'Aggregate by author' },
  { query: 'critical security issues', description: 'Security-related PRs' },
  { query: 'oldest PRs', description: 'PRs waiting longest for review' },
];

export default function QueryPage() {
  const [repositoryId, setRepositoryId] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load suggestions as user types
  useEffect(() => {
    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    if (query.length >= 2) {
      suggestionTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await fetch(
            `/api/query/autocomplete?q=${encodeURIComponent(query)}&repositoryId=${repositoryId}`
          );
          if (response.ok) {
            const data = await response.json();
            setSuggestions(data.suggestions || []);
            setShowSuggestions(true);
          }
        } catch {
          // Ignore autocomplete errors
        }
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [query, repositoryId]);

  const executeQuery = async () => {
    if (!query.trim() || !repositoryId) return;

    setLoading(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const response = await fetch('/api/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, repositoryId }),
      });

      if (!response.ok) throw new Error('Query execution failed');
      
      const data = await response.json();
      setResult(data);

      // Add to history
      setQueryHistory((prev) => {
        const newHistory = [query, ...prev.filter((q) => q !== query)].slice(0, 10);
        return newHistory;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeQuery();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const applySuggestion = (suggestion: QuerySuggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const applyExampleQuery = (exampleQuery: string) => {
    setQuery(exampleQuery);
    inputRef.current?.focus();
  };

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
        return 'bg-red-100 text-red-800';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Sparkles className="h-7 w-7 mr-3 text-primary-600" />
          Natural Language PR Query
        </h1>
        <p className="text-gray-600">
          Search and analyze pull requests using natural language
        </p>
      </div>

      {/* Search Area */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="space-y-4">
          {/* Repository ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Repository
            </label>
            <input
              type="text"
              placeholder="Enter repository ID"
              value={repositoryId}
              onChange={(e) => setRepositoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Query Input */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Query
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Try: 'show open high risk PRs' or 'PRs by john last week'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                className="w-full pl-10 pr-20 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-lg"
              />
              <button
                onClick={executeQuery}
                disabled={!query.trim() || !repositoryId || loading}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </button>
            </div>

            {/* Autocomplete Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => applySuggestion(suggestion)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span className="text-gray-900">{suggestion.text}</span>
                    <span className="text-xs text-gray-400">{suggestion.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Example Queries */}
          <div>
            <div className="flex items-center text-sm text-gray-500 mb-2">
              <Lightbulb className="h-4 w-4 mr-1" />
              Try these examples:
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUERIES.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => applyExampleQuery(example.query)}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
                  title={example.description}
                >
                  {example.query}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Query History */}
      {queryHistory.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center text-sm text-gray-500 mb-2">
            <History className="h-4 w-4 mr-1" />
            Recent Queries
          </div>
          <div className="flex flex-wrap gap-2">
            {queryHistory.map((historyQuery, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(historyQuery)}
                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-full text-sm text-blue-700 flex items-center"
              >
                {historyQuery}
                <X
                  className="h-3 w-3 ml-2 hover:text-blue-900"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQueryHistory((prev) => prev.filter((_, i) => i !== idx));
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Query Understanding */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-blue-900">
                  Understood as: <span className="font-normal">{result.query.intent}</span>
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  Confidence: {(result.query.confidence * 100).toFixed(0)}% • 
                  Executed in {result.executionTimeMs}ms
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {result.totalCount} {result.totalCount === 1 ? 'result' : 'results'}
              </div>
            </div>
          </div>

          {/* Aggregation Result */}
          {result.aggregation && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-primary-600" />
                Aggregation Result
              </h3>
              {typeof result.aggregation.value === 'number' ? (
                <div className="text-4xl font-bold text-gray-900">
                  {result.aggregation.value}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(result.aggregation.value).map(([key, value]) => (
                    <div key={key} className="bg-gray-50 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900">{value}</div>
                      <div className="text-sm text-gray-500">{key}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PR Results */}
          {result.results.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold">Pull Requests</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {result.results.map((pr) => (
                  <div key={pr.workflowId} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <GitPullRequest className="h-5 w-5 text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900">
                            #{pr.prNumber} {pr.title}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center space-x-3">
                            <span className="flex items-center">
                              <User className="h-3 w-3 mr-1" />
                              {pr.author}
                            </span>
                            <span className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date(pr.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(pr.status)}`}>
                          {pr.status}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(pr.riskLevel)}`}>
                          {pr.riskLevel}
                        </span>
                      </div>
                    </div>
                    {pr.matchedFilters.length > 0 && (
                      <div className="mt-2 flex items-center space-x-2">
                        <Filter className="h-3 w-3 text-gray-400" />
                        <div className="flex flex-wrap gap-1">
                          {pr.matchedFilters.map((filter, idx) => (
                            <span key={idx} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">
                              {filter}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions for refinement */}
          {result.suggestions && result.suggestions.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-2">Refine your search:</div>
              <div className="flex flex-wrap gap-2">
                {result.suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => setQuery(suggestion)}
                    className="px-3 py-1 bg-white border border-gray-300 rounded-full text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
