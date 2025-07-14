import React from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, X } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';

export const NotificationBanner: React.FC = () => {
  const { showExpiringBanner, setShowExpiringBanner, notifications } = useNotifications();

  if (!showExpiringBanner) return null;

  const expiringNotifications = notifications.filter(
    n => n.type === 'subscription_expiring' && n.daysUntilExpiration === 3 && !n.isRead
  );

  if (expiringNotifications.length === 0) {
    setShowExpiringBanner(false);
    return null;
  }

  const notification = expiringNotifications[0];

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-orange-600 text-white px-4 py-3 shadow-lg">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <span className="font-semibold mr-2">{notification.title}</span>
            <span>{notification.message}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            className="bg-white text-orange-600 hover:bg-gray-100"
            onClick={() => {
              // Redirect to subscription page
              window.location.href = '/subscription';
            }}
          >
            Renovar Agora
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-orange-700"
            onClick={() => setShowExpiringBanner(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};