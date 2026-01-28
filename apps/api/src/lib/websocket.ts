import type { FastifyInstance } from 'fastify';
import type { WebSocket as WS } from 'ws';
import { WebSocketServer } from 'ws';
import { getRedisClient } from './redis.js';
import { logger } from './logger.js';

export interface WebSocketMessage {
  type: 'workflow_update' | 'comment_posted' | 'test_generated' | 'analysis_complete' | 'error' |
        'presence_update' | 'cursor_move' | 'navigation_sync' | 'review_session_update';
  workflowId: string;
  data: unknown;
  timestamp: string;
}

export interface PresenceData {
  userId: string;
  userName: string;
  avatarUrl?: string;
  prNumber: number;
  repositoryId: string;
  currentFile?: string;
  currentLine?: number;
  cursorPosition?: { line: number; column: number };
  status: 'viewing' | 'reviewing' | 'commenting' | 'idle';
  lastActivity: string;
}

export interface ReviewSession {
  id: string;
  prNumber: number;
  repositoryId: string;
  participants: PresenceData[];
  hostUserId: string;
  syncNavigation: boolean;
  currentFile?: string;
  currentLine?: number;
  createdAt: string;
}

interface AuthenticatedSocket extends WS {
  userId?: string;
  userName?: string;
  avatarUrl?: string;
  repositoryIds?: string[];
  isAlive?: boolean;
  currentSession?: string;
  presence?: PresenceData;
}

let wss: WebSocketServer | null = null;
const clients = new Map<string, Set<AuthenticatedSocket>>();

export async function setupWebSocket(app: FastifyInstance): Promise<void> {
  // Get the underlying HTTP server after Fastify is ready
  await app.ready();
  
  const server = app.server;
  
  wss = new WebSocketServer({ 
    server,
    path: '/ws',
  });

  wss.on('connection', (ws: AuthenticatedSocket, request) => {
    logger.info({ url: request.url }, 'WebSocket client connected');
    
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await handleMessage(ws, data);
      } catch (error) {
        logger.error({ error }, 'Failed to parse WebSocket message');
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      removeClient(ws);
      logger.info('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      logger.error({ error }, 'WebSocket error');
      removeClient(ws);
    });

    // Send welcome message
    ws.send(JSON.stringify({ 
      type: 'connected', 
      message: 'Connected to PRFlow WebSocket',
      timestamp: new Date().toISOString(),
    }));
  });

  // Heartbeat to detect stale connections
  const heartbeatInterval = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.isAlive === false) {
        removeClient(socket);
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // Subscribe to Redis pub/sub for cross-instance communication
  setupRedisPubSub();
  
  logger.info('WebSocket server initialized');
}

async function handleMessage(ws: AuthenticatedSocket, data: { type: string; [key: string]: unknown }): Promise<void> {
  switch (data.type) {
    case 'authenticate':
      await handleAuthenticate(ws, data.token as string);
      break;
    
    case 'subscribe':
      await handleSubscribe(ws, data.repositoryIds as string[]);
      break;
    
    case 'unsubscribe':
      await handleUnsubscribe(ws, data.repositoryIds as string[]);
      break;
    
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;

    // Collaborative review features
    case 'join_review':
      await handleJoinReview(ws, data as { type: string; prNumber: number; repositoryId: string });
      break;
    
    case 'leave_review':
      await handleLeaveReview(ws);
      break;
    
    case 'cursor_move':
      await handleCursorMove(ws, data as { type: string; file: string; line: number; column: number });
      break;
    
    case 'navigate_to':
      await handleNavigateTo(ws, data as { type: string; file: string; line?: number });
      break;
    
    case 'update_status':
      await handleUpdateStatus(ws, data as { type: string; status: PresenceData['status'] });
      break;
    
    case 'start_session':
      await handleStartSession(ws, data as { type: string; prNumber: number; repositoryId: string });
      break;
    
    case 'join_session':
      await handleJoinSession(ws, data as { type: string; sessionId: string });
      break;
    
    case 'toggle_sync':
      await handleToggleSync(ws, data as { type: string; enabled: boolean });
      break;
    
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
  }
}

async function handleAuthenticate(ws: AuthenticatedSocket, token: string): Promise<void> {
  try {
    // Validate token with GitHub API
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid authentication token' }));
      return;
    }

    const user = await response.json() as { id: number; login: string; avatar_url?: string };
    ws.userId = user.id.toString();
    ws.userName = user.login;
    ws.avatarUrl = user.avatar_url;
    
    // Add to authenticated clients
    if (!clients.has(ws.userId)) {
      clients.set(ws.userId, new Set());
    }
    clients.get(ws.userId)!.add(ws);

    ws.send(JSON.stringify({ 
      type: 'authenticated', 
      userId: ws.userId,
      login: user.login,
      avatarUrl: user.avatar_url,
      timestamp: new Date().toISOString(),
    }));

    logger.info({ userId: ws.userId }, 'WebSocket client authenticated');
  } catch (error) {
    logger.error({ error }, 'Authentication failed');
    ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
  }
}

async function handleSubscribe(ws: AuthenticatedSocket, repositoryIds: string[]): Promise<void> {
  if (!ws.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  ws.repositoryIds = [...(ws.repositoryIds || []), ...repositoryIds];
  
  // Subscribe in Redis for each repository
  for (const repoId of repositoryIds) {
    const key = `subscribers:${repoId}`;
    if (!clients.has(key)) {
      clients.set(key, new Set());
    }
    clients.get(key)!.add(ws);
  }

  ws.send(JSON.stringify({ 
    type: 'subscribed', 
    repositoryIds,
    timestamp: new Date().toISOString(),
  }));
}

async function handleUnsubscribe(ws: AuthenticatedSocket, repositoryIds: string[]): Promise<void> {
  if (!ws.repositoryIds) return;

  for (const repoId of repositoryIds) {
    const key = `subscribers:${repoId}`;
    clients.get(key)?.delete(ws);
    ws.repositoryIds = ws.repositoryIds.filter((id) => id !== repoId);
  }

  ws.send(JSON.stringify({ 
    type: 'unsubscribed', 
    repositoryIds,
    timestamp: new Date().toISOString(),
  }));
}

function removeClient(ws: AuthenticatedSocket): void {
  if (ws.userId) {
    clients.get(ws.userId)?.delete(ws);
  }
  
  if (ws.repositoryIds) {
    for (const repoId of ws.repositoryIds) {
      clients.get(`subscribers:${repoId}`)?.delete(ws);
    }
  }
}

// Publish a message to all subscribers of a repository
export async function broadcastToRepository(repositoryId: string, message: WebSocketMessage): Promise<void> {
  const redis = getRedisClient();
  
  // Publish to Redis for cross-instance communication
  await redis.publish('prflow:ws', JSON.stringify({
    repositoryId,
    message,
  }));
}

// Publish a message to a specific user
export async function broadcastToUser(userId: string, message: WebSocketMessage): Promise<void> {
  const redis = getRedisClient();
  
  await redis.publish('prflow:ws:user', JSON.stringify({
    userId,
    message,
  }));
}

// Setup Redis pub/sub for cross-instance communication
function setupRedisPubSub(): void {
  const redis = getRedisClient();
  const subscriber = redis.duplicate();

  subscriber.subscribe('prflow:ws', 'prflow:ws:user');

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      if (channel === 'prflow:ws') {
        // Broadcast to repository subscribers
        const { repositoryId, message: wsMessage } = data;
        const key = `subscribers:${repositoryId}`;
        const sockets = clients.get(key);
        
        if (sockets) {
          const payload = JSON.stringify(wsMessage);
          sockets.forEach((ws) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(payload);
            }
          });
        }
      } else if (channel === 'prflow:ws:user') {
        // Broadcast to specific user
        const { userId, message: wsMessage } = data;
        const sockets = clients.get(userId);
        
        if (sockets) {
          const payload = JSON.stringify(wsMessage);
          sockets.forEach((ws) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(payload);
            }
          });
        }
      }
    } catch (error) {
      logger.error({ error, channel, message }, 'Failed to process Redis pub/sub message');
    }
  });
}

// Helper to broadcast workflow updates
export async function notifyWorkflowUpdate(
  repositoryId: string, 
  workflowId: string, 
  status: string, 
  data: Record<string, unknown> = {}
): Promise<void> {
  await broadcastToRepository(repositoryId, {
    type: 'workflow_update',
    workflowId,
    data: { status, ...data },
    timestamp: new Date().toISOString(),
  });
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

// ============================================
// Collaborative Review Features
// ============================================

// Store for active review sessions and presence
const reviewSessions = new Map<string, ReviewSession>();
const prPresence = new Map<string, Map<string, PresenceData>>(); // prKey -> userId -> presence

function getPRKey(repositoryId: string, prNumber: number): string {
  return `${repositoryId}:${prNumber}`;
}

async function handleJoinReview(
  ws: AuthenticatedSocket,
  data: { type: string; prNumber: number; repositoryId: string }
): Promise<void> {
  if (!ws.userId || !ws.userName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const prKey = getPRKey(data.repositoryId, data.prNumber);
  
  // Initialize presence map for this PR if needed
  if (!prPresence.has(prKey)) {
    prPresence.set(prKey, new Map());
  }

  // Create presence data for this user
  const presence: PresenceData = {
    userId: ws.userId,
    userName: ws.userName,
    avatarUrl: ws.avatarUrl,
    prNumber: data.prNumber,
    repositoryId: data.repositoryId,
    status: 'viewing',
    lastActivity: new Date().toISOString(),
  };

  ws.presence = presence;
  prPresence.get(prKey)!.set(ws.userId, presence);

  // Subscribe to this PR's updates
  const key = `review:${prKey}`;
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  clients.get(key)!.add(ws);

  // Get all current participants
  const participants = Array.from(prPresence.get(prKey)!.values());

  // Notify the joining user of current participants
  ws.send(JSON.stringify({
    type: 'review_joined',
    prNumber: data.prNumber,
    repositoryId: data.repositoryId,
    participants,
    timestamp: new Date().toISOString(),
  }));

  // Notify others of the new participant
  await broadcastToPR(prKey, ws.userId, {
    type: 'presence_update',
    workflowId: '',
    data: {
      action: 'joined',
      user: presence,
      participants,
    },
    timestamp: new Date().toISOString(),
  });

  logger.info({ userId: ws.userId, prKey }, 'User joined review');
}

async function handleLeaveReview(ws: AuthenticatedSocket): Promise<void> {
  if (!ws.presence) return;

  const prKey = getPRKey(ws.presence.repositoryId, ws.presence.prNumber);
  
  // Remove from presence map
  prPresence.get(prKey)?.delete(ws.userId!);
  
  // Remove from PR subscribers
  const key = `review:${prKey}`;
  clients.get(key)?.delete(ws);

  // Get remaining participants
  const participants = Array.from(prPresence.get(prKey)?.values() || []);

  // Notify others
  await broadcastToPR(prKey, ws.userId!, {
    type: 'presence_update',
    workflowId: '',
    data: {
      action: 'left',
      userId: ws.userId,
      userName: ws.userName,
      participants,
    },
    timestamp: new Date().toISOString(),
  });

  ws.presence = undefined;
  
  logger.info({ userId: ws.userId, prKey }, 'User left review');
}

async function handleCursorMove(
  ws: AuthenticatedSocket,
  data: { type: string; file: string; line: number; column: number }
): Promise<void> {
  if (!ws.presence) return;

  const prKey = getPRKey(ws.presence.repositoryId, ws.presence.prNumber);
  
  // Update presence
  ws.presence.currentFile = data.file;
  ws.presence.currentLine = data.line;
  ws.presence.cursorPosition = { line: data.line, column: data.column };
  ws.presence.lastActivity = new Date().toISOString();
  
  prPresence.get(prKey)?.set(ws.userId!, ws.presence);

  // Broadcast cursor position to others
  await broadcastToPR(prKey, ws.userId!, {
    type: 'cursor_move',
    workflowId: '',
    data: {
      userId: ws.userId,
      userName: ws.userName,
      file: data.file,
      line: data.line,
      column: data.column,
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleNavigateTo(
  ws: AuthenticatedSocket,
  data: { type: string; file: string; line?: number }
): Promise<void> {
  if (!ws.presence) return;

  const prKey = getPRKey(ws.presence.repositoryId, ws.presence.prNumber);
  
  // Check if this user is in a session with sync enabled
  const session = ws.currentSession ? reviewSessions.get(ws.currentSession) : undefined;
  
  if (session?.syncNavigation && session.hostUserId === ws.userId) {
    // Update session navigation state
    session.currentFile = data.file;
    session.currentLine = data.line;

    // Broadcast navigation to all session participants
    await broadcastToSession(session.id, {
      type: 'navigation_sync',
      workflowId: '',
      data: {
        file: data.file,
        line: data.line,
        initiatedBy: ws.userId,
        userName: ws.userName,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Update own presence
  ws.presence.currentFile = data.file;
  ws.presence.currentLine = data.line;
  ws.presence.lastActivity = new Date().toISOString();
  
  prPresence.get(prKey)?.set(ws.userId!, ws.presence);
}

async function handleUpdateStatus(
  ws: AuthenticatedSocket,
  data: { type: string; status: PresenceData['status'] }
): Promise<void> {
  if (!ws.presence) return;

  const prKey = getPRKey(ws.presence.repositoryId, ws.presence.prNumber);
  
  ws.presence.status = data.status;
  ws.presence.lastActivity = new Date().toISOString();
  
  prPresence.get(prKey)?.set(ws.userId!, ws.presence);

  // Broadcast status update
  await broadcastToPR(prKey, ws.userId!, {
    type: 'presence_update',
    workflowId: '',
    data: {
      action: 'status_changed',
      userId: ws.userId,
      userName: ws.userName,
      status: data.status,
    },
    timestamp: new Date().toISOString(),
  });
}

async function handleStartSession(
  ws: AuthenticatedSocket,
  data: { type: string; prNumber: number; repositoryId: string }
): Promise<void> {
  if (!ws.userId || !ws.userName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const session: ReviewSession = {
    id: sessionId,
    prNumber: data.prNumber,
    repositoryId: data.repositoryId,
    participants: [],
    hostUserId: ws.userId,
    syncNavigation: true,
    createdAt: new Date().toISOString(),
  };

  reviewSessions.set(sessionId, session);
  ws.currentSession = sessionId;

  // Add host as first participant
  if (ws.presence) {
    session.participants.push(ws.presence);
  }

  // Subscribe to session channel
  const key = `session:${sessionId}`;
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  clients.get(key)!.add(ws);

  ws.send(JSON.stringify({
    type: 'session_started',
    sessionId,
    session,
    timestamp: new Date().toISOString(),
  }));

  logger.info({ userId: ws.userId, sessionId }, 'Review session started');
}

async function handleJoinSession(
  ws: AuthenticatedSocket,
  data: { type: string; sessionId: string }
): Promise<void> {
  if (!ws.userId || !ws.presence) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated or not in review' }));
    return;
  }

  const session = reviewSessions.get(data.sessionId);
  if (!session) {
    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
    return;
  }

  ws.currentSession = data.sessionId;
  session.participants.push(ws.presence);

  // Subscribe to session channel
  const key = `session:${data.sessionId}`;
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  clients.get(key)!.add(ws);

  // Notify the joining user
  ws.send(JSON.stringify({
    type: 'session_joined',
    sessionId: data.sessionId,
    session,
    timestamp: new Date().toISOString(),
  }));

  // Notify others in session
  await broadcastToSession(data.sessionId, {
    type: 'review_session_update',
    workflowId: '',
    data: {
      action: 'participant_joined',
      user: ws.presence,
      participants: session.participants,
    },
    timestamp: new Date().toISOString(),
  });

  logger.info({ userId: ws.userId, sessionId: data.sessionId }, 'User joined session');
}

async function handleToggleSync(
  ws: AuthenticatedSocket,
  data: { type: string; enabled: boolean }
): Promise<void> {
  if (!ws.currentSession || !ws.userId) return;

  const session = reviewSessions.get(ws.currentSession);
  if (!session || session.hostUserId !== ws.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can toggle sync' }));
    return;
  }

  session.syncNavigation = data.enabled;

  // Notify all participants
  await broadcastToSession(ws.currentSession, {
    type: 'review_session_update',
    workflowId: '',
    data: {
      action: 'sync_toggled',
      syncNavigation: data.enabled,
    },
    timestamp: new Date().toISOString(),
  });
}

// Broadcast to all users viewing a PR except the sender
async function broadcastToPR(prKey: string, excludeUserId: string, message: WebSocketMessage): Promise<void> {
  const key = `review:${prKey}`;
  const sockets = clients.get(key);
  
  if (sockets) {
    const payload = JSON.stringify(message);
    sockets.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.readyState === socket.OPEN && socket.userId !== excludeUserId) {
        socket.send(payload);
      }
    });
  }
}

// Broadcast to all session participants
async function broadcastToSession(sessionId: string, message: WebSocketMessage): Promise<void> {
  const key = `session:${sessionId}`;
  const sockets = clients.get(key);
  
  if (sockets) {
    const payload = JSON.stringify(message);
    sockets.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    });
  }
}

// Get active participants for a PR
export function getPRParticipants(repositoryId: string, prNumber: number): PresenceData[] {
  const prKey = getPRKey(repositoryId, prNumber);
  return Array.from(prPresence.get(prKey)?.values() || []);
}

// Get active session
export function getReviewSession(sessionId: string): ReviewSession | undefined {
  return reviewSessions.get(sessionId);
}

// Export presence and session for API routes
export { reviewSessions, prPresence };
