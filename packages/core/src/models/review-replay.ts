/**
 * @fileoverview Review Replay Learning Models
 * 
 * Types for recording and replaying exceptional code reviews for learning.
 * 
 * @module models/review-replay
 */

/**
 * A recorded review session for replay
 */
export interface ReviewRecording {
  /** Recording ID */
  id: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** PR number */
  prNumber: number;
  /** PR title */
  prTitle: string;
  /** Original reviewer */
  reviewer: ReviewerInfo;
  /** Recording date */
  recordedAt: Date;
  /** Recording metadata */
  metadata: RecordingMetadata;
  /** Review events in order */
  events: ReviewEvent[];
  /** Learning annotations */
  annotations: ReviewAnnotation[];
  /** Quality score */
  qualityScore: number;
  /** Categories */
  categories: string[];
  /** Difficulty level */
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Is public */
  isPublic: boolean;
  /** View count */
  viewCount: number;
  /** Featured */
  featured: boolean;
}

/**
 * Reviewer information
 */
export interface ReviewerInfo {
  /** Login */
  login: string;
  /** Name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Expertise areas */
  expertise: string[];
  /** Total reviews */
  totalReviews: number;
}

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  /** Duration of review (seconds) */
  durationSeconds: number;
  /** Files reviewed */
  filesReviewed: number;
  /** Lines reviewed */
  linesReviewed: number;
  /** Comments made */
  commentsCount: number;
  /** Languages in PR */
  languages: string[];
  /** Primary topics */
  topics: string[];
  /** Tools/frameworks involved */
  technologies: string[];
}

/**
 * An event in the review timeline
 */
export interface ReviewEvent {
  /** Event ID */
  id: string;
  /** Timestamp (relative to start) */
  timestamp: number;
  /** Event type */
  type: ReviewEventType;
  /** Event data */
  data: ReviewEventData;
  /** Explanation/narration */
  narration?: string;
}

/**
 * Types of review events
 */
export type ReviewEventType =
  | 'file_open'
  | 'file_close'
  | 'scroll'
  | 'highlight'
  | 'comment_start'
  | 'comment_draft'
  | 'comment_submit'
  | 'comment_edit'
  | 'comment_delete'
  | 'approval'
  | 'request_changes'
  | 'suggestion'
  | 'reference_lookup'
  | 'pause'
  | 'think_aloud';

/**
 * Event data union
 */
export type ReviewEventData =
  | FileOpenEvent
  | ScrollEvent
  | HighlightEvent
  | CommentEvent
  | ApprovalEvent
  | ThinkAloudEvent
  | ReferenceLookupEvent;

export interface FileOpenEvent {
  file: string;
  totalLines: number;
  language: string;
}

export interface ScrollEvent {
  file: string;
  fromLine: number;
  toLine: number;
  durationMs: number;
}

export interface HighlightEvent {
  file: string;
  startLine: number;
  endLine: number;
  reason?: string;
}

export interface CommentEvent {
  file?: string;
  line?: number;
  body: string;
  suggestion?: string;
  category?: string;
}

export interface ApprovalEvent {
  state: 'approved' | 'changes_requested' | 'commented';
  summary: string;
}

export interface ThinkAloudEvent {
  thought: string;
  context: string;
}

export interface ReferenceLookupEvent {
  query: string;
  source: 'documentation' | 'codebase' | 'external';
  result?: string;
}

/**
 * Learning annotation on a review
 */
export interface ReviewAnnotation {
  /** Annotation ID */
  id: string;
  /** Related event ID */
  eventId?: string;
  /** Timestamp range */
  startTime: number;
  endTime: number;
  /** Annotation type */
  type: AnnotationType;
  /** Content */
  content: string;
  /** Author */
  author: string;
  /** Highlighted */
  highlighted: boolean;
}

/**
 * Annotation types
 */
export type AnnotationType =
  | 'insight'        // Key insight for learners
  | 'technique'      // Review technique being demonstrated
  | 'pattern'        // Pattern being identified
  | 'anti_pattern'   // Anti-pattern being caught
  | 'explanation'    // Explanation of reasoning
  | 'tip'            // Quick tip
  | 'exercise'       // Practice exercise for viewer
  | 'quiz';          // Quiz question

/**
 * A learning path composed of review recordings
 */
export interface ReviewLearningPath {
  /** Path ID */
  id: string;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Target audience */
  audience: string;
  /** Prerequisites */
  prerequisites: string[];
  /** Recordings in order */
  recordings: LearningPathItem[];
  /** Total duration (minutes) */
  totalDurationMinutes: number;
  /** Difficulty progression */
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Topics covered */
  topics: string[];
  /** Created by */
  createdBy: string;
  /** Published */
  published: boolean;
  /** Enrollments */
  enrollmentCount: number;
}

/**
 * Item in a learning path
 */
export interface LearningPathItem {
  /** Recording ID */
  recordingId: string;
  /** Order in path */
  order: number;
  /** Section title */
  sectionTitle: string;
  /** Learning objectives */
  objectives: string[];
  /** Estimated time (minutes) */
  estimatedMinutes: number;
  /** Required */
  required: boolean;
}

/**
 * User progress through a recording
 */
export interface ReplayProgress {
  /** User login */
  userLogin: string;
  /** Recording ID */
  recordingId: string;
  /** Current timestamp */
  currentTime: number;
  /** Completed */
  completed: boolean;
  /** Notes taken */
  notes: string[];
  /** Quiz answers */
  quizAnswers: Record<string, string>;
  /** Last accessed */
  lastAccessedAt: Date;
}

/**
 * Request to record a review
 */
export interface RecordingRequest {
  /** Repository */
  owner: string;
  repo: string;
  /** PR number */
  prNumber: number;
  /** Categories */
  categories: string[];
  /** Make public */
  isPublic: boolean;
}

/**
 * Playback options
 */
export interface PlaybackOptions {
  /** Playback speed */
  speed: 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
  /** Show annotations */
  showAnnotations: boolean;
  /** Show narration */
  showNarration: boolean;
  /** Auto-pause at annotations */
  autoPauseAtAnnotations: boolean;
}
