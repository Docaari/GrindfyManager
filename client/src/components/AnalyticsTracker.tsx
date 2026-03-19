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

  // Wait for authentication to complete before tracking
  if (isLoading) {
    return <>{children}</>;
  }

  useEffect(() => {
    if (!isAuthenticated || !user) return;

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

    // Auto-track common page features
    const features = pageFeatures[page] || [];
    features.forEach(feature => {
      // Set up feature tracking listeners
      const elements = document.querySelectorAll(`[data-feature="${feature}"]`);
      elements.forEach(element => {
        element.addEventListener('click', () => {
          trackFeatureUsage(feature, page);
        });
      });
    });

    // Track specific actions based on page
    const setupPageTracking = () => {
      switch (page) {
        case '/':
          // Track dashboard interactions
          const periodButtons = document.querySelectorAll('[data-period]');
          periodButtons.forEach(button => {
            button.addEventListener('click', (e) => {
              const period = (e.target as HTMLElement).getAttribute('data-period');
              trackAction('period_change', page, 'dashboard_filter', { period });
            });
          });
          break;

        case '/upload':
          // Track file uploads
          const fileInputs = document.querySelectorAll('input[type="file"]');
          fileInputs.forEach(input => {
            input.addEventListener('change', (e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files.length > 0) {
                trackAction('file_select', page, 'upload', {
                  fileCount: files.length,
                  fileTypes: Array.from(files).map(f => f.type)
                });
              }
            });
          });
          break;

        case '/grind':
          // Track session actions
          const sessionButtons = document.querySelectorAll('[data-session-action]');
          sessionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
              const action = (e.target as HTMLElement).getAttribute('data-session-action');
              trackAction(action || 'session_action', page, 'grind_session');
            });
          });
          break;

        case '/analytics':
          // Track analytics usage
          const tabButtons = document.querySelectorAll('[data-tab]');
          tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
              const tab = (e.target as HTMLElement).getAttribute('data-tab');
              trackAction('tab_change', page, 'analytics_navigation', { tab });
            });
          });
          break;
      }
    };

    // Setup tracking after a small delay to ensure DOM is ready
    setTimeout(setupPageTracking, 100);

  }, [location, isAuthenticated, user, trackPageView, trackFeatureUsage, trackAction]);

  return <>{children}</>;
};

export default AnalyticsTracker;