'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, Eye, Loader2, AlertTriangle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FixableComment {
  id: string;
  file: string;
  line: number;
  severity: string;
  category: string;
  message: string;
  suggestion: {
    originalCode: string;
    suggestedCode: string;
    language: string;
  } | null;
  status: string;
}

interface FixPreview {
  file: string;
  originalCode: string;
  suggestedCode: string;
  previewDiff: string;
  canApply: boolean;
  reason?: string;
}

interface Props {
  workflowId: string;
  token?: string;
}

const severityColors: Record<string, string> = {
  CRITICAL: 'border-red-500 bg-red-50',
  HIGH: 'border-orange-500 bg-orange-50',
  MEDIUM: 'border-yellow-500 bg-yellow-50',
  LOW: 'border-blue-500 bg-blue-50',
  NITPICK: 'border-gray-500 bg-gray-50',
};

export function FixApplicationPanel({ workflowId, token }: Props) {
  const [selectedFixes, setSelectedFixes] = useState<Set<string>>(new Set());
  const [previewCommentId, setPreviewCommentId] = useState<string | null>(null);
  const [customCommitMessage, setCustomCommitMessage] = useState('');
  const queryClient = useQueryClient();

  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const { data: fixableData, isLoading } = useQuery<{
    totalFixable: number;
    byFile: Record<string, FixableComment[]>;
    comments: FixableComment[];
  }>({
    queryKey: ['fixable-comments', workflowId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/fixes/fixable/${workflowId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch fixable comments');
      return res.json();
    },
  });

  const { data: previewData, isLoading: isPreviewLoading } = useQuery<FixPreview>({
    queryKey: ['fix-preview', previewCommentId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/fixes/preview/${previewCommentId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch preview');
      return res.json();
    },
    enabled: !!previewCommentId,
  });

  const applySingleMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(`${API_URL}/api/fixes/apply`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || 'Failed to apply fix');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixable-comments', workflowId] });
    },
  });

  const applyBatchMutation = useMutation({
    mutationFn: async (commentIds: string[]) => {
      const res = await fetch(`${API_URL}/api/fixes/apply-batch`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          commentIds,
          commitMessage: customCommitMessage || undefined,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || 'Failed to apply batch fix');
      }
      return res.json();
    },
    onSuccess: () => {
      setSelectedFixes(new Set());
      setCustomCommitMessage('');
      queryClient.invalidateQueries({ queryKey: ['fixable-comments', workflowId] });
    },
  });

  const handleSelectAll = () => {
    if (!fixableData) return;
    if (selectedFixes.size === fixableData.comments.length) {
      setSelectedFixes(new Set());
    } else {
      setSelectedFixes(new Set(fixableData.comments.map(c => c.id)));
    }
  };

  const handleToggleFix = (commentId: string) => {
    const newSelected = new Set(selectedFixes);
    if (newSelected.has(commentId)) {
      newSelected.delete(commentId);
    } else {
      newSelected.add(commentId);
    }
    setSelectedFixes(newSelected);
  };

  if (isLoading) {
    return <div className="p-4 text-center">Loading fixable comments...</div>;
  }

  if (!fixableData || fixableData.totalFixable === 0) {
    return (
      <div className="p-6 text-center bg-gray-50 rounded-lg">
        <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-gray-600">No fixes available to apply</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Available Fixes ({fixableData.totalFixable})
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSelectAll}
            className="text-sm text-primary-600 hover:text-primary-800"
          >
            {selectedFixes.size === fixableData.comments.length ? 'Deselect All' : 'Select All'}
          </button>
          {selectedFixes.size > 0 && (
            <button
              onClick={() => applyBatchMutation.mutate(Array.from(selectedFixes))}
              disabled={applyBatchMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 flex items-center"
            >
              {applyBatchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Apply {selectedFixes.size} Fix{selectedFixes.size > 1 ? 'es' : ''}
            </button>
          )}
        </div>
      </div>

      {selectedFixes.size > 0 && (
        <div className="bg-gray-50 p-3 rounded-lg">
          <label className="block text-sm text-gray-600 mb-2">
            Custom commit message (optional)
          </label>
          <input
            type="text"
            value={customCommitMessage}
            onChange={(e) => setCustomCommitMessage(e.target.value)}
            placeholder="Apply PRFlow fixes"
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
      )}

      {applyBatchMutation.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2" />
          {(applyBatchMutation.error as Error).message}
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(fixableData.byFile).map(([file, comments]) => (
          <div key={file} className="border rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 font-mono text-sm">
              {file}
            </div>
            <div className="divide-y">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`p-4 ${severityColors[comment.severity]} border-l-4`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={selectedFixes.has(comment.id)}
                        onChange={() => handleToggleFix(comment.id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            comment.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                            comment.severity === 'HIGH' ? 'bg-orange-200 text-orange-800' :
                            'bg-gray-200 text-gray-800'
                          }`}>
                            {comment.severity}
                          </span>
                          <span className="text-xs text-gray-500">Line {comment.line}</span>
                          <span className="text-xs text-gray-500 capitalize">{comment.category.toLowerCase()}</span>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{comment.message}</p>
                        {comment.suggestion && (
                          <div className="mt-2 font-mono text-xs bg-white p-2 rounded border">
                            <div className="text-red-600">- {comment.suggestion.originalCode.substring(0, 100)}...</div>
                            <div className="text-green-600">+ {comment.suggestion.suggestedCode.substring(0, 100)}...</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPreviewCommentId(comment.id)}
                        className="p-1 text-gray-500 hover:text-gray-700"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => applySingleMutation.mutate(comment.id)}
                        disabled={applySingleMutation.isPending}
                        className="p-1 text-green-500 hover:text-green-700 disabled:opacity-50"
                        title="Apply fix"
                      >
                        {applySingleMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {previewCommentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Fix Preview</h3>
              <button
                onClick={() => setPreviewCommentId(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              {isPreviewLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                </div>
              ) : previewData ? (
                <div className="space-y-4">
                  <div className="font-mono text-sm bg-gray-100 p-2 rounded">
                    {previewData.file}
                  </div>
                  {previewData.canApply ? (
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded overflow-auto text-sm">
                      {previewData.previewDiff}
                    </pre>
                  ) : (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded">
                      <AlertTriangle className="h-5 w-5 inline mr-2" />
                      {previewData.reason}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end p-4 border-t space-x-3">
              <button
                onClick={() => setPreviewCommentId(null)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              {previewData?.canApply && (
                <button
                  onClick={() => {
                    applySingleMutation.mutate(previewCommentId);
                    setPreviewCommentId(null);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                >
                  Apply Fix
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
