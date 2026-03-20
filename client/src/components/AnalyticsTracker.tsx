import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityTracker } from '@/hooks/useActivityTracker';

interface AnalyticsTrackerProps {
  children: React.ReactNode;
}

const AnalyticsTracker: React.FC<AnalyticsTrackerProps> = ({ children }) => {
  const [location] = useLocation();
  const { isAuthenticated, user, isLoading } = useAuth();
  const { trackPageView, trackFeatureUsage, trackAction } = useActivityTracker();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;

    // Track page views
    const page = location;
    trackPageView(page);

    // Track specific page features
    const pageFeatures: Record<string, string[]> = {
      '/': ['dashboard_view', 'profit_chart', 'tournament_stats'],
      '/library': ['tournament_search', 'tournament_filter', 'tournament_edit'],
      '/upload': ['file_upload', 'csv_parse', 'tournament_import'],
      '/grind': ['session_start', 'session_timer', 'tournament_add'],
      '/grind-live': ['tournament_register', 'tournament_complete', 'break_feedback'],
      '/mental': ['warmup_start', 'meditation_timer', 'visualization_guide'],
      '/coach': ['calendar_view', 'routine_generate', 'event_create'],
      '/estudos': ['study_session', 'card_create', 'progress_track'],
      '/analytics': ['user_analytics', 'feature_analytics', 'executive_reports'],
      '/settings': ['exchange_rate', 'profile_update', 'preferences'],
    };

    // Collect all handlers for cleanup
    const cleanupHandlers: Array<{ element: Element; event: string; handler: EventListener }> = [];

    // Auto-track common page features
    const features = pageFeatures[page] || [];
    features.forEach(feature => {
      const elements = document.querySelectorAll(`[data-feature="${feature}"]`);
      elements.forEach(element => {
        const handler = () => {
          trackFeatureUsage(feature, page);
        };
        element.addEventListener('click', handler);
        cleanupHandlers.push({ element, event: 'click', handler });
      });
    });

    // Track specific actions based on page
    const setupPageTracking = () => {
      switch (page) {
        case '/':
          // Track dashboard interactions
          const periodButtons = document.querySelectorAll('[data-period]');
          periodButtons.forEach(button => {
            const handler = ((e: Event) => {
              const period = (e.target as HTMLElement).getAttribute('data-period');
              trackAction('period_change', page, 'dashboard_filter', { period });
            }) as EventListener;
            button.addEventListener('click', handler);
            cleanupHandlers.push({ element: button, event: 'click', handler });
          });
          break;

        case '/upload':
          // Track file uploads
          const fileInputs = document.querySelectorAll('input[type="file"]');
          fileInputs.forEach(input => {
            const handler = ((e: Event) => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files.length > 0) {
                trackAction('file_select', page, 'upload', {
                  fileCount: files.length,
                  fileTypes: Array.from(files).map(f => f.type)
                });
              }
            }) as EventListener;
            input.addEventListener('change', handler);
            cleanupHandlers.push({ element: input, event: 'change', handler });
          });
          break;

        case '/grind':
          // Track session actions
          const sessionButtons = document.querySelectorAll('[data-session-action]');
          sessionButtons.forEach(button => {
            const handler = ((e: Event) => {
              const action = (e.target as HTMLElement).getAttribute('data-session-action');
              trackAction(action || 'session_action', page, 'grind_session');
            }) as EventListener;
            button.addEventListener('click', handler);
            cleanupHandlers.push({ element: button, event: 'click', handler });
          });
          break;

        case '/analytics':
          // Track analytics usage
          const tabButtons = document.querySelectorAll('[data-tab]');
          tabButtons.forEach(button => {
            const handler = ((e: Event) => {
              const tab = (e.target as HTMLElement).getAttribute('data-tab');
              trackAction('tab_change', page, 'analytics_navigation', { tab });
            }) as EventListener;
            button.addEventListener('click', handler);
            cleanupHandlers.push({ element: button, event: 'click', handler });
          });
          break;
      }
    };

    // Setup tracking after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(setupPageTracking, 100);

    // Cleanup function: remove all event listeners and clear timeout
    return () => {
      clearTimeout(timeoutId);
      cleanupHandlers.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });
    };
  }, [location, isAuthenticated, user, isLoading, trackPageView, trackFeatureUsage, trackAction]);

  return <>{children}</>;
};

export default AnalyticsTracker;
