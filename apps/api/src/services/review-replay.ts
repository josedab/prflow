/**
 * @fileoverview Review Replay Learning Service
 * 
 * Service for recording, storing, and replaying code reviews for learning.
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

import type {
  ReviewRecording,
  ReviewEvent,
  ReviewAnnotation,
  ReviewLearningPath,
  ReplayProgress,
  RecordingRequest,
  RecordingMetadata,
} from '@prflow/core';

export class ReviewReplayService {
  /**
   * Start recording a review session
   */
  async startRecording(request: RecordingRequest & { installationId: number }): Promise<{ recordingId: string }> {
    const github = getGitHubClient(request.installationId);

    // Get PR details
    const pr = await github.pr.getPullRequest(request.owner, request.repo, request.prNumber);

    // Get PR files
    const files = await github.pr.getPullRequestFiles(request.owner, request.repo, request.prNumber);

    // Create recording entry
    const recordingId = crypto.randomUUID();
    await dbAny.reviewRecording.create({
      data: {
        id: recordingId,
        owner: request.owner,
        repo: request.repo,
        prNumber: request.prNumber,
        prTitle: pr.title,
        reviewer: pr.author?.login || 'unknown',
        status: 'recording',
        categories: request.categories,
        isPublic: request.isPublic,
        metadata: {
          filesCount: files.length,
          linesCount: files.reduce((sum: number, f: { additions: number; deletions: number }) => sum + f.additions + f.deletions, 0),
          languages: this.extractLanguages(files.map((f: { path: string }) => f.path)),
        },
        events: [],
        annotations: [],
        startedAt: new Date(),
      },
    });

    return { recordingId };
  }

  /**
   * Add event to recording
   */
  async addEvent(recordingId: string, event: Omit<ReviewEvent, 'id'>): Promise<void> {
    const recording = await dbAny.reviewRecording.findUnique({ where: { id: recordingId } });
    if (!recording || recording.status !== 'recording') {
      throw new Error('Recording not found or not active');
    }

    const events = (recording.events as any[]) || [];
    events.push({
      id: crypto.randomUUID(),
      ...event,
    });

    await dbAny.reviewRecording.update({
      where: { id: recordingId },
      data: { events },
    });
  }

  /**
   * Stop recording and finalize
   */
  async stopRecording(recordingId: string): Promise<ReviewRecording> {
    const recording = await dbAny.reviewRecording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      throw new Error('Recording not found');
    }

    const events = (recording.events as any[]) || [];
    const durationSeconds = events.length > 0
      ? Math.max(...events.map((e) => e.timestamp)) / 1000
      : 0;

    // Calculate quality score based on review characteristics
    const qualityScore = this.calculateQualityScore(events);

    // Update metadata
    const metadata = recording.metadata as any;
    metadata.durationSeconds = durationSeconds;
    metadata.commentsCount = events.filter((e) => e.type === 'comment_submit').length;

    await dbAny.reviewRecording.update({
      where: { id: recordingId },
      data: {
        status: 'completed',
        metadata,
        qualityScore,
        completedAt: new Date(),
      },
    });

    return this.getRecording(recordingId) as Promise<ReviewRecording>;
  }

  /**
   * Get a recording
   */
  async getRecording(id: string): Promise<ReviewRecording | null> {
    const recording = await dbAny.reviewRecording.findUnique({ where: { id } });
    if (!recording) return null;

    // Increment view count
    await dbAny.reviewRecording.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return this.mapToRecording(recording);
  }

  /**
   * Search recordings
   */
  async searchRecordings(options: {
    categories?: string[];
    difficulty?: string;
    languages?: string[];
    minQualityScore?: number;
    featured?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ recordings: ReviewRecording[]; total: number }> {
    const where: any = {
      status: 'completed',
      isPublic: true,
    };

    if (options.categories?.length) {
      where.categories = { hasSome: options.categories };
    }
    if (options.difficulty) {
      where.difficulty = options.difficulty;
    }
    if (options.minQualityScore) {
      where.qualityScore = { gte: options.minQualityScore };
    }
    if (options.featured) {
      where.featured = true;
    }

    const [recordings, total] = await Promise.all([
      dbAny.reviewRecording.findMany({
        where,
        orderBy: { qualityScore: 'desc' },
        take: options.limit || 20,
        skip: options.offset || 0,
      }),
      dbAny.reviewRecording.count({ where }),
    ]);

    return {
      recordings: recordings.map(this.mapToRecording),
      total,
    };
  }

  /**
   * Add annotation to recording
   */
  async addAnnotation(
    recordingId: string,
    annotation: Omit<ReviewAnnotation, 'id'>
  ): Promise<ReviewAnnotation> {
    const recording = await dbAny.reviewRecording.findUnique({ where: { id: recordingId } });
    if (!recording) {
      throw new Error('Recording not found');
    }

    const annotations = (recording.annotations as any[]) || [];
    const newAnnotation = {
      id: crypto.randomUUID(),
      ...annotation,
    };
    annotations.push(newAnnotation);

    await dbAny.reviewRecording.update({
      where: { id: recordingId },
      data: { annotations },
    });

    return newAnnotation;
  }

  /**
   * Get user progress
   */
  async getProgress(userLogin: string, recordingId: string): Promise<ReplayProgress | null> {
    const progress = await dbAny.replayProgress.findUnique({
      where: { userLogin_recordingId: { userLogin, recordingId } },
    });

    if (!progress) return null;

    return {
      userLogin: progress.userLogin,
      recordingId: progress.recordingId,
      currentTime: progress.currentTime,
      completed: progress.completed,
      notes: progress.notes,
      quizAnswers: progress.quizAnswers as Record<string, string>,
      lastAccessedAt: progress.lastAccessedAt,
    };
  }

  /**
   * Update user progress
   */
  async updateProgress(
    userLogin: string,
    recordingId: string,
    updates: Partial<ReplayProgress>
  ): Promise<ReplayProgress> {
    const progress = await dbAny.replayProgress.upsert({
      where: { userLogin_recordingId: { userLogin, recordingId } },
      create: {
        userLogin,
        recordingId,
        currentTime: updates.currentTime || 0,
        completed: updates.completed || false,
        notes: updates.notes || [],
        quizAnswers: updates.quizAnswers || {},
        lastAccessedAt: new Date(),
      },
      update: {
        ...updates,
        lastAccessedAt: new Date(),
      },
    });

    return {
      userLogin: progress.userLogin,
      recordingId: progress.recordingId,
      currentTime: progress.currentTime,
      completed: progress.completed,
      notes: progress.notes,
      quizAnswers: progress.quizAnswers as Record<string, string>,
      lastAccessedAt: progress.lastAccessedAt,
    };
  }

  /**
   * Create learning path
   */
  async createLearningPath(
    path: Omit<ReviewLearningPath, 'id' | 'enrollmentCount'>
  ): Promise<ReviewLearningPath> {
    const record = await db.reviewLearningPath.create({
      data: {
        title: path.title,
        description: path.description,
        audience: path.audience,
        prerequisites: path.prerequisites,
        recordings: path.recordings as any,
        totalDurationMinutes: path.totalDurationMinutes,
        difficulty: path.difficulty,
        topics: path.topics,
        createdBy: path.createdBy,
        published: path.published,
      },
    });

    return {
      id: record.id,
      ...path,
      enrollmentCount: 0,
    };
  }

  /**
   * Get learning paths
   */
  async getLearningPaths(options?: {
    difficulty?: string;
    topics?: string[];
    published?: boolean;
  }): Promise<ReviewLearningPath[]> {
    const where: any = {};
    if (options?.difficulty) where.difficulty = options.difficulty;
    if (options?.published !== undefined) where.published = options.published;
    if (options?.topics?.length) where.topics = { hasSome: options.topics };

    const paths = await db.reviewLearningPath.findMany({
      where,
      orderBy: { enrollmentCount: 'desc' },
    });

    return paths.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      audience: p.audience,
      prerequisites: p.prerequisites,
      recordings: p.recordings as any[],
      totalDurationMinutes: p.totalDurationMinutes,
      difficulty: p.difficulty as 'beginner' | 'intermediate' | 'advanced',
      topics: p.topics,
      createdBy: p.createdBy,
      published: p.published,
      enrollmentCount: p.enrollmentCount,
    }));
  }

  /**
   * Enroll in learning path
   */
  async enrollInPath(userLogin: string, pathId: string): Promise<void> {
    await db.pathEnrollment.create({
      data: {
        userLogin,
        pathId,
        progress: {},
      },
    });

    await db.reviewLearningPath.update({
      where: { id: pathId },
      data: { enrollmentCount: { increment: 1 } },
    });
  }

  /**
   * Calculate quality score for a recording
   */
  private calculateQualityScore(events: any[]): number {
    let score = 50; // Base score

    // Bonus for comments
    const comments = events.filter((e) => e.type === 'comment_submit').length;
    score += Math.min(comments * 5, 20);

    // Bonus for suggestions
    const suggestions = events.filter((e) => e.type === 'suggestion').length;
    score += Math.min(suggestions * 3, 10);

    // Bonus for think-aloud events (shows reasoning)
    const thinkAloud = events.filter((e) => e.type === 'think_aloud').length;
    score += Math.min(thinkAloud * 2, 10);

    // Bonus for reference lookups (shows thoroughness)
    const lookups = events.filter((e) => e.type === 'reference_lookup').length;
    score += Math.min(lookups * 2, 5);

    // Penalty for very short reviews
    const durationSeconds = events.length > 0
      ? Math.max(...events.map((e) => e.timestamp)) / 1000
      : 0;
    if (durationSeconds < 60) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract languages from file names
   */
  private extractLanguages(files: string[]): string[] {
    const extensionMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.html': 'HTML',
    };

    const languages = new Set<string>();
    for (const file of files) {
      const ext = file.match(/\.[^.]+$/)?.[0];
      if (ext && extensionMap[ext]) {
        languages.add(extensionMap[ext]);
      }
    }

    return Array.from(languages);
  }

  /**
   * Map database record to ReviewRecording
   */
  private mapToRecording(record: any): ReviewRecording {
    return {
      id: record.id,
      repository: { owner: record.owner, name: record.repo },
      prNumber: record.prNumber,
      prTitle: record.prTitle,
      reviewer: {
        login: record.reviewer,
        expertise: [],
        totalReviews: 0,
      },
      recordedAt: record.startedAt,
      metadata: record.metadata as RecordingMetadata,
      events: record.events as ReviewEvent[],
      annotations: record.annotations as ReviewAnnotation[],
      qualityScore: record.qualityScore || 0,
      categories: record.categories,
      difficulty: record.difficulty || 'intermediate',
      isPublic: record.isPublic,
      viewCount: record.viewCount || 0,
      featured: record.featured || false,
    };
  }
}
