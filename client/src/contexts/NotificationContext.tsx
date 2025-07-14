import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface NotificationData {
  id: string;
  userId: string;
  type: 'subscription_expiring' | 'subscription_expired' | 'general';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  daysUntilExpiration?: number;
  isRead: boolean;
  createdAt: string;
  scheduledFor?: string;
}

interface NotificationContextType {
  notifications: NotificationData[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  showExpiredModal: boolean;
  setShowExpiredModal: (show: boolean) => void;
  showExpiringModal: boolean;
  setShowExpiringModal: (show: boolean) => void;
  showExpiringBanner: boolean;
  setShowExpiringBanner: (show: boolean) => void;
  isLoading: boolean;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showExpiringModal, setShowExpiringModal] = useState(false);
  const [showExpiringBanner, setShowExpiringBanner] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<NotificationData[]>({
    queryKey: ['/api/notifications'],
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/notifications/unread-count'],
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  const unreadCount = unreadCountData?.count || 0;

  const markAsRead = async (id: string) => {
    try {
      await apiRequest('POST', `/api/notifications/${id}/mark-read`);
      // Invalidate queries to refetch data
      // This will be handled by the component that calls this function
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Check for critical notifications that need immediate attention
  useEffect(() => {
    if (!notifications.length) return;

    const now = new Date();
    const unreadNotifications = notifications.filter(n => !n.isRead);

    // Check for expired subscription notifications
    const expiredNotifications = unreadNotifications.filter(
      n => n.type === 'subscription_expired'
    );

    // Check for expiring notifications (1 day)
    const expiringCritical = unreadNotifications.filter(
      n => n.type === 'subscription_expiring' && n.daysUntilExpiration === 1
    );

    // Check for expiring notifications (3 days) - banner
    const expiringBanner = unreadNotifications.filter(
      n => n.type === 'subscription_expiring' && n.daysUntilExpiration === 3
    );

    // Show expired modal if there are expired notifications
    if (expiredNotifications.length > 0) {
      setShowExpiredModal(true);
    }

    // Show expiring modal for 1-day notifications
    if (expiringCritical.length > 0 && !showExpiredModal) {
      setShowExpiringModal(true);
    }

    // Show banner for 3-day notifications
    if (expiringBanner.length > 0 && !showExpiredModal && !showExpiringModal) {
      setShowExpiringBanner(true);
    }

  }, [notifications, showExpiredModal, showExpiringModal]);

  const contextValue: NotificationContextType = {
    notifications,
    unreadCount,
    markAsRead,
    showExpiredModal,
    setShowExpiredModal,
    showExpiringModal,
    setShowExpiringModal,
    showExpiringBanner,
    setShowExpiringBanner,
    isLoading
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};