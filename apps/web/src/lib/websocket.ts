'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from './logger';

export interface WebSocketMessage {
  type: string;
  workflowId?: string;
  data?: unknown;
  timestamp?: string;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: WebSocketMessage | null;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
  authenticate: (token: string) => void;
  subscribe: (repositoryIds: string[]) => void;
  unsubscribe: (repositoryIds: string[]) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimeoutId = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    if (isConnecting) return;

    setIsConnecting(true);

    try {
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        reconnectCount.current = 0;
        onConnect?.();
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnect?.();

        // Attempt to reconnect
        if (reconnectCount.current < reconnectAttempts) {
          reconnectTimeoutId.current = setTimeout(() => {
            reconnectCount.current++;
            connect();
          }, reconnectInterval);
        }
      };

      ws.current.onerror = (error) => {
        setIsConnecting(false);
        onError?.(error);
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          logger.error('Failed to parse WebSocket message', error);
        }
      };
    } catch (error) {
      setIsConnecting(false);
      logger.error('Failed to connect WebSocket', error);
    }
  }, [isConnecting, onConnect, onDisconnect, onError, onMessage, reconnectAttempts, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutId.current) {
      clearTimeout(reconnectTimeoutId.current);
    }
    reconnectCount.current = reconnectAttempts; // Prevent auto-reconnect
    ws.current?.close();
    ws.current = null;
    setIsConnected(false);
  }, [reconnectAttempts]);

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    } else {
      logger.warn('WebSocket is not connected');
    }
  }, []);

  const authenticate = useCallback((token: string) => {
    send({ type: 'authenticate', token });
  }, [send]);

  const subscribe = useCallback((repositoryIds: string[]) => {
    send({ type: 'subscribe', repositoryIds });
  }, [send]);

  const unsubscribe = useCallback((repositoryIds: string[]) => {
    send({ type: 'unsubscribe', repositoryIds });
  }, [send]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    lastMessage,
    send,
    connect,
    disconnect,
    authenticate,
    subscribe,
    unsubscribe,
  };
}

// Hook for workflow-specific updates
export function useWorkflowUpdates(workflowId: string) {
  const [status, setStatus] = useState<string | null>(null);
  const [updates, setUpdates] = useState<WebSocketMessage[]>([]);

  const wsResult = useWebSocket({
    onMessage: (message) => {
      if (message.workflowId === workflowId) {
        setUpdates((prev) => [...prev, message]);
        if (message.type === 'workflow_update' && message.data) {
          setStatus((message.data as { status?: string }).status || null);
        }
      }
    },
  });

  return { isConnected: wsResult.isConnected, status, updates, lastMessage: wsResult.lastMessage };
}

// Hook for repository-scoped updates
export function useRepositoryUpdates(repositoryId: string, token?: string) {
  const [updates, setUpdates] = useState<WebSocketMessage[]>([]);
  
  const ws = useWebSocket({
    onMessage: (message) => {
      setUpdates((prev) => [...prev.slice(-50), message]); // Keep last 50 updates
    },
  });

  useEffect(() => {
    if (ws.isConnected && token) {
      ws.authenticate(token);
    }
  }, [ws.isConnected, token, ws]);

  useEffect(() => {
    if (ws.isConnected && repositoryId) {
      ws.subscribe([repositoryId]);
      return () => {
        ws.unsubscribe([repositoryId]);
      };
    }
  }, [ws.isConnected, repositoryId, ws]);

  return { ...ws, updates };
}
