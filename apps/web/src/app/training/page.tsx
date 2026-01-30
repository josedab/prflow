'use client';

import { useState, useEffect } from 'react';
import {
  GraduationCap,
  Trophy,
  Target,
  Star,
  Flame,
  CheckCircle,
  XCircle,
  Play,
  RefreshCw,
  ChevronRight,
  Lightbulb,
  Award,
  TrendingUp,
} from 'lucide-react';

// Types matching the API
interface TrainingScenario {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  codeSnippet: string;
  language: string;
  correctIssues: Array<{
    line: number;
    type: string;
    severity: string;
    message: string;
    explanation: string;
  }>;
  hints: string[];
  tags: string[];
}

interface UserProgress {
  userId: string;
  repositoryId: string;
  totalScenarios: number;
  completedScenarios: number;
  avgScore: number;
  strengthAreas: string[];
  improvementAreas: string[];
  badges: string[];
  streak: number;
  lastActivityAt: string;
}

interface TrainingScore {
  scenarioId: string;
  score: number;
  issuesFound: number;
  issuesMissed: number;
  falsePositives: number;
  accuracy: number;
  feedback: string[];
  improvement: string[];
  badge?: string;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  score: number;
  scenariosCompleted: number;
  badges: string[];
}

interface IdentifiedIssue {
  line: number;
  type: string;
  severity: string;
  message: string;
}

export default function TrainingPage() {
  const [repositoryId, setRepositoryId] = useState('');
  const [userId, setUserId] = useState('');
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [scenarios, setScenarios] = useState<TrainingScenario[]>([]);
  const [currentScenario, setCurrentScenario] = useState<TrainingScenario | null>(null);
  const [identifiedIssues, setIdentifiedIssues] = useState<IdentifiedIssue[]>([]);
  const [score, setScore] = useState<TrainingScore | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentHint, setCurrentHint] = useState(0);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'home' | 'practice' | 'leaderboard'>('home');
  const [difficulty, setDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [startTime, setStartTime] = useState<number | null>(null);

  const loadProgress = async () => {
    if (!userId || !repositoryId) return;

    try {
      const response = await fetch(`/api/training/${repositoryId}/progress/${userId}`);
      if (response.ok) {
        setProgress(await response.json());
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    }
  };

  const loadScenarios = async () => {
    if (!repositoryId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/training/${repositoryId}/scenarios?difficulty=${difficulty}&count=5`
      );
      if (response.ok) {
        const data = await response.json();
        setScenarios(data.scenarios || []);
      }
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    if (!repositoryId) return;

    try {
      const response = await fetch(`/api/training/${repositoryId}/leaderboard`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
  };

  useEffect(() => {
    if (repositoryId && userId) {
      loadProgress();
    }
  }, [repositoryId, userId]);

  useEffect(() => {
    if (view === 'leaderboard') {
      loadLeaderboard();
    }
  }, [view, repositoryId]);

  const startScenario = (scenario: TrainingScenario) => {
    setCurrentScenario(scenario);
    setIdentifiedIssues([]);
    setScore(null);
    setCurrentHint(0);
    setStartTime(Date.now());
    setView('practice');
  };

  const addIssue = () => {
    setIdentifiedIssues([
      ...identifiedIssues,
      { line: 1, type: 'BUG', severity: 'MEDIUM', message: '' },
    ]);
  };

  const updateIssue = (index: number, field: keyof IdentifiedIssue, value: string | number) => {
    const updated = [...identifiedIssues];
    updated[index] = { ...updated[index], [field]: value };
    setIdentifiedIssues(updated);
  };

  const removeIssue = (index: number) => {
    setIdentifiedIssues(identifiedIssues.filter((_, i) => i !== index));
  };

  const submitResponse = async () => {
    if (!currentScenario || !userId) return;

    const timeSpent = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

    try {
      const response = await fetch('/api/training/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: currentScenario.id,
          userId,
          repositoryId,
          identifiedIssues,
          timeSpentSeconds: timeSpent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setScore(data);
        loadProgress();
      }
    } catch (err) {
      console.error('Failed to submit response:', err);
    }
  };

  const showHint = () => {
    if (currentScenario && currentHint < currentScenario.hints.length) {
      setCurrentHint(currentHint + 1);
    }
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'beginner':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSeverityOptions = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const getTypeOptions = ['BUG', 'SECURITY', 'PERFORMANCE', 'STYLE', 'ERROR_HANDLING', 'LOGIC'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <GraduationCap className="h-7 w-7 mr-3 text-primary-600" />
            Code Review Training
          </h1>
          <p className="text-gray-600">
            Improve your code review skills with AI-powered training scenarios
          </p>
        </div>
        
        {/* Navigation */}
        <div className="flex space-x-2">
          <button
            onClick={() => setView('home')}
            className={`px-4 py-2 rounded-md ${view === 'home' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => {
              setView('practice');
              loadScenarios();
            }}
            className={`px-4 py-2 rounded-md ${view === 'practice' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Practice
          </button>
          <button
            onClick={() => setView('leaderboard')}
            className={`px-4 py-2 rounded-md ${view === 'leaderboard' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Leaderboard
          </button>
        </div>
      </div>

      {/* Setup */}
      {!progress && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Get Started</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Repository ID"
              value={repositoryId}
              onChange={(e) => setRepositoryId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="text"
              placeholder="Your User ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      )}

      {/* Home View */}
      {view === 'home' && progress && (
        <>
          {/* Progress Stats */}
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <Target className="h-8 w-8 text-primary-600" />
                <span className="text-3xl font-bold text-gray-900">{progress.completedScenarios}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">Scenarios Completed</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <Star className="h-8 w-8 text-yellow-500" />
                <span className="text-3xl font-bold text-gray-900">{progress.avgScore.toFixed(0)}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">Average Score</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <Flame className="h-8 w-8 text-orange-500" />
                <span className="text-3xl font-bold text-gray-900">{progress.streak}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">Day Streak</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <Award className="h-8 w-8 text-purple-500" />
                <span className="text-3xl font-bold text-gray-900">{progress.badges.length}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">Badges Earned</div>
            </div>
          </div>

          {/* Badges */}
          {progress.badges.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">Your Badges</h3>
              <div className="flex flex-wrap gap-3">
                {progress.badges.map((badge, idx) => (
                  <div key={idx} className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-full px-4 py-2 text-sm font-medium text-purple-800">
                    🏆 {badge}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths & Improvements */}
          <div className="grid md:grid-cols-2 gap-6">
            {progress.strengthAreas.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center text-green-600">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Your Strengths
                </h3>
                <ul className="space-y-2">
                  {progress.strengthAreas.map((area, idx) => (
                    <li key={idx} className="flex items-center text-gray-700">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {progress.improvementAreas.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center text-yellow-600">
                  <Target className="h-5 w-5 mr-2" />
                  Areas to Improve
                </h3>
                <ul className="space-y-2">
                  {progress.improvementAreas.map((area, idx) => (
                    <li key={idx} className="flex items-center text-gray-700">
                      <ChevronRight className="h-4 w-4 text-yellow-500 mr-2" />
                      {area}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Start Training CTA */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg p-8 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Ready to Practice?</h2>
            <p className="mb-6 opacity-90">
              Choose a difficulty level and start identifying issues in code
            </p>
            <div className="flex justify-center space-x-4">
              {(['beginner', 'intermediate', 'advanced'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => {
                    setDifficulty(diff);
                    setView('practice');
                    loadScenarios();
                  }}
                  className="px-6 py-3 bg-white text-primary-700 rounded-lg font-medium hover:bg-gray-100 transition-colors capitalize"
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Practice View */}
      {view === 'practice' && (
        <>
          {!currentScenario && !score && (
            <>
              {/* Difficulty Selector */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">Difficulty Level</h3>
                    <p className="text-sm text-gray-500">Choose your challenge level</p>
                  </div>
                  <div className="flex space-x-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => {
                          setDifficulty(diff);
                          loadScenarios();
                        }}
                        className={`px-4 py-2 rounded-md capitalize ${
                          difficulty === diff
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scenarios List */}
              {loading ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Loading scenarios...</p>
                </div>
              ) : scenarios.length > 0 ? (
                <div className="space-y-4">
                  {scenarios.map((scenario) => (
                    <div key={scenario.id} className="bg-white rounded-lg shadow p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-3">
                            <h3 className="font-semibold text-gray-900">{scenario.title}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(scenario.difficulty)}`}>
                              {scenario.difficulty}
                            </span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                              {scenario.category}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{scenario.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {scenario.tags.map((tag, idx) => (
                              <span key={idx} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => startScenario(scenario)}
                          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <p className="text-gray-500">No scenarios available. Try refreshing or changing difficulty.</p>
                  <button
                    onClick={loadScenarios}
                    className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md"
                  >
                    Refresh Scenarios
                  </button>
                </div>
              )}
            </>
          )}

          {/* Active Scenario */}
          {currentScenario && !score && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{currentScenario.title}</h3>
                    <p className="text-sm text-gray-500">{currentScenario.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {currentScenario.hints.length > 0 && currentHint < currentScenario.hints.length && (
                      <button
                        onClick={showHint}
                        className="px-3 py-1 border border-yellow-300 text-yellow-700 rounded-md text-sm flex items-center hover:bg-yellow-50"
                      >
                        <Lightbulb className="h-4 w-4 mr-1" />
                        Hint ({currentScenario.hints.length - currentHint} left)
                      </button>
                    )}
                  </div>
                </div>

                {/* Hints Display */}
                {currentHint > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <div className="font-medium text-yellow-800 mb-2">Hints:</div>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {currentScenario.hints.slice(0, currentHint).map((hint, idx) => (
                        <li key={idx}>💡 {hint}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Code Snippet */}
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-100 font-mono">
                    <code>
                      {currentScenario.codeSnippet.split('\n').map((line, idx) => (
                        <div key={idx} className="flex">
                          <span className="text-gray-500 select-none w-8 text-right mr-4">
                            {idx + 1}
                          </span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </code>
                  </pre>
                </div>
              </div>

              {/* Issue Input */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Identify Issues</h3>
                  <button
                    onClick={addIssue}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                  >
                    + Add Issue
                  </button>
                </div>

                <div className="space-y-4">
                  {identifiedIssues.map((issue, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Line</label>
                          <input
                            type="number"
                            value={issue.line}
                            onChange={(e) => updateIssue(idx, 'line', parseInt(e.target.value) || 1)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Type</label>
                          <select
                            value={issue.type}
                            onChange={(e) => updateIssue(idx, 'type', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {getTypeOptions.map((type) => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Severity</label>
                          <select
                            value={issue.severity}
                            onChange={(e) => updateIssue(idx, 'severity', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            {getSeverityOptions.map((sev) => (
                              <option key={sev} value={sev}>{sev}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            onClick={() => removeIssue(idx)}
                            className="px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-xs text-gray-500 mb-1">Description</label>
                        <input
                          type="text"
                          value={issue.message}
                          onChange={(e) => updateIssue(idx, 'message', e.target.value)}
                          placeholder="Describe the issue..."
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                  ))}

                  {identifiedIssues.length === 0 && (
                    <p className="text-gray-500 text-center py-8">
                      Click &quot;Add Issue&quot; to identify problems in the code
                    </p>
                  )}
                </div>

                <div className="mt-6 flex justify-between">
                  <button
                    onClick={() => {
                      setCurrentScenario(null);
                      setIdentifiedIssues([]);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitResponse}
                    className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    Submit Response
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Score Display */}
          {score && (
            <div className="space-y-6">
              <div className={`rounded-lg p-8 text-center ${
                score.score >= 80 ? 'bg-green-50' : score.score >= 50 ? 'bg-yellow-50' : 'bg-red-50'
              }`}>
                <div className="text-6xl font-bold mb-2">
                  {score.score}
                </div>
                <div className="text-lg text-gray-600">Points</div>
                {score.badge && (
                  <div className="mt-4 inline-block bg-white rounded-full px-6 py-2 text-lg">
                    {score.badge}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow p-4 text-center">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold">{score.issuesFound}</div>
                  <div className="text-sm text-gray-500">Issues Found</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center">
                  <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold">{score.issuesMissed}</div>
                  <div className="text-sm text-gray-500">Issues Missed</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4 text-center">
                  <Target className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold">{score.accuracy}%</div>
                  <div className="text-sm text-gray-500">Accuracy</div>
                </div>
              </div>

              {(score.feedback.length > 0 || score.improvement.length > 0) && (
                <div className="bg-white rounded-lg shadow p-6">
                  {score.feedback.length > 0 && (
                    <div className="mb-4">
                      <h4 className="font-semibold mb-2">Feedback</h4>
                      <ul className="text-gray-700 space-y-1">
                        {score.feedback.map((fb, idx) => (
                          <li key={idx}>{fb}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {score.improvement.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2">Areas to Improve</h4>
                      <ul className="text-gray-700 space-y-1">
                        {score.improvement.map((imp, idx) => (
                          <li key={idx}>• {imp}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => {
                    setScore(null);
                    setCurrentScenario(null);
                    loadScenarios();
                  }}
                  className="px-6 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                >
                  Continue Training
                </button>
                <button
                  onClick={() => setView('home')}
                  className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Leaderboard View */}
      {view === 'leaderboard' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold flex items-center">
              <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
              Leaderboard
            </h3>
          </div>
          <div className="divide-y divide-gray-200">
            {leaderboard.map((entry) => (
              <div key={entry.userId} className="px-6 py-4 flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  entry.rank === 1 ? 'bg-yellow-100 text-yellow-800' :
                  entry.rank === 2 ? 'bg-gray-100 text-gray-600' :
                  entry.rank === 3 ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-50 text-gray-500'
                }`}>
                  {entry.rank}
                </div>
                <div className="ml-4 flex-1">
                  <div className="font-medium text-gray-900">{entry.username}</div>
                  <div className="text-sm text-gray-500">
                    {entry.scenariosCompleted} scenarios • {entry.badges.length} badges
                  </div>
                </div>
                <div className="text-2xl font-bold text-primary-600">{entry.score}</div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="px-6 py-12 text-center text-gray-500">
                No leaderboard data available yet. Start training to appear here!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
