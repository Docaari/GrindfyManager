import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';

interface ActivityTracker {
  trackPageView: (page: string) => void;
  trackFeatureUsage: (feature: string, page: string, metadata?: any) => void;
  trackAction: (action: string, page: string, feature?: string, metadata?: any) => void;
}

export const useActivityTracker = (): ActivityTracker => {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const sessionStartTime = useRef<number>(Date.now());
  const pageStartTime = useRef<number>(Date.now());
  const currentPage = useRef<string>('');

  // Track page views automatically
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const page = location;
    const now = Date.now();
    
    // Track previous page duration if we have one
    if (currentPage.current && currentPage.current !== page) {
      const duration = Math.round((now - pageStartTime.current) / 1000);
      trackActivity(currentPage.current, 'page_leave', undefined, duration);
    }

    // Track new page view
    currentPage.current = page;
    pageStartTime.current = now;
    trackActivity(page, 'page_view');

    // Track session start on first page
    if (page === '/') {
      trackActivity('/', 'session_start');
    }

    // Set up beforeunload handler for session end
    const handleBeforeUnload = () => {
      const sessionDuration = Math.round((Date.now() - sessionStartTime.current) / 1000);
      trackActivity(page, 'session_end', undefined, sessionDuration);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [location, isAuthenticated, user]);

  const trackActivity = async (
    page: string,
    action: string,
    feature?: string,
    duration?: number,
    metadata?: any
  ) => {
    if (!isAuthenticated || !user) return;

    try {
      await apiRequest('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page,
          action,
          feature,
          duration,
          metadata,
        }),
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