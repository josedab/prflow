'use client';

import * as React from 'react';
import { useCallback, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useWebSocket, type WebSocketMessage } from '@/lib/websocket';

interface Notification {
  id: string;
  type: 'workflow_update' | 'pr_analyzed' | 'issue_found' | 'test_generated' | 'merge_complete' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  workflowId?: string;
  prNumber?: number;
  repository?: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = React.createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        timestamp: new Date(),
        read: false,
      };

      setNotifications((prev) => [newNotification, ...prev].slice(0, 100));

      // Show toast based on notification type
      const toastOptions = {
        description: notification.message,
        duration: 5000,
      };

      switch (notification.type) {
        case 'workflow_update':
        case 'pr_analyzed':
        case 'test_generated':
        case 'merge_complete':
          toast.success(notification.title, toastOptions);
          break;
        case 'issue_found':
          toast.warning(notification.title, toastOptions);
          break;
        case 'error':
          toast.error(notification.title, toastOptions);
          break;
        default:
          toast(notification.title, toastOptions);
      }
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'workflow_update': {
          const workflowData = message.data as {
            status?: string;
            prNumber?: number;
            repository?: string;
          };
          if (workflowData?.status === 'COMPLETED') {
            addNotification({
              type: 'pr_analyzed',
              title: 'PR Analysis Complete',
              message: `PR #${workflowData.prNumber} has been analyzed`,
              workflowId: message.workflowId,
              prNumber: workflowData.prNumber,
              repository: workflowData.repository,
            });
          } else if (workflowData?.status === 'FAILED') {
            addNotification({
              type: 'error',
              title: 'Analysis Failed',
              message: `PR #${workflowData.prNumber} analysis failed`,
              workflowId: message.workflowId,
              prNumber: workflowData.prNumber,
            });
          }
          break;
        }

        case 'issue_found': {
          const issueData = message.data as {
            severity?: string;
            count?: number;
            prNumber?: number;
          };
          addNotification({
            type: 'issue_found',
            title: 'Issues Detected',
            message: `${issueData?.count || 1} ${issueData?.severity || ''} issue(s) found in PR #${issueData?.prNumber}`,
            prNumber: issueData?.prNumber,
          });
          break;
        }

        case 'test_generated': {
          const testData = message.data as {
            count?: number;
            prNumber?: number;
          };
          addNotification({
            type: 'test_generated',
            title: 'Tests Generated',
            message: `${testData?.count || 0} tests generated for PR #${testData?.prNumber}`,
            prNumber: testData?.prNumber,
          });
          break;
        }

        case 'merge_queue_status': {
          const mergeData = message.data as {
            status?: string;
            prNumber?: number;
          };
          if (mergeData?.status === 'merged') {
            addNotification({
              type: 'merge_complete',
              title: 'PR Merged',
              message: `PR #${mergeData.prNumber} has been merged`,
              prNumber: mergeData.prNumber,
            });
          }
          break;
        }
      }
    },
    [addNotification]
  );

  // Connect to WebSocket
  useWebSocket({
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      toast.success('Connected', { description: 'Real-time updates enabled' });
    },
    onDisconnect: () => {
      toast.warning('Disconnected', { description: 'Attempting to reconnect...' });
    },
  });

  // Load notifications from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('prflow-notifications');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setNotifications(
          parsed.map((n: Notification) => ({
            ...n,
            timestamp: new Date(n.timestamp),
          }))
        );
      } catch {
        // Ignore invalid data
      }
    }
  }, []);

  // Save notifications to localStorage
  useEffect(() => {
    localStorage.setItem('prflow-notifications', JSON.stringify(notifications));
  }, [notifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
