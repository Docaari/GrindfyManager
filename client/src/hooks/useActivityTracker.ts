import { useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';

interface ActivityTracker {
  trackPageView: (page: string) => void;
  trackFeatureUsage: (feature: string, page: string, metadata?: any) => void;
  trackAction: (action: string, page: string, feature?: string, metadata?: any) => void;
}

export const useActivityTracker = (): ActivityTracker => {
  const { user, isAuthenticated } = useAuth();
  const sessionStartTime = useRef<number>(Date.now());

  const trackActivity = async (
    page: string,
    action: string,
    feature?: string,
    duration?: number,
    metadata?: any
  ) => {
    if (!isAuthenticated || !user) return;

    try {
      await apiRequest('POST', '/api/analytics/track', {
        page,
        action,
        feature,
        duration,
        metadata,
      });
    } catch (error) {
      // Silently fail - analytics shouldn't break the app
      console.debug('Analytics tracking failed:', error);
    }
  };

  const trackPageView = (page: string) => {
    trackActivity(page, 'page_view');
  };

  const trackFeatureUsage = (feature: string, page: string, metadata?: any) => {
    trackActivity(page, 'feature_use', feature, undefined, metadata);
  };

  const trackAction = (action: string, page: string, feature?: string, metadata?: any) => {
    trackActivity(page, action, feature, undefined, metadata);
  };

  return {
    trackPageView,
    trackFeatureUsage,
    trackAction,
  };
};

export default useActivityTracker;