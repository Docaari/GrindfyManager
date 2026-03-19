import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Clock, Crown } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';

export const ExpiringSubscriptionModal: React.FC = () => {
  const { showExpiringModal, setShowExpiringModal, notifications, markAsRead } = useNotifications();

  if (!showExpiringModal) return null;

  const expiringNotifications = notifications.filter(
    n => n.type === 'subscription_expiring' && n.daysUntilExpiration === 1 && !n.isRead
  );

  if (expiringNotifications.length === 0) {
    setShowExpiringModal(false);
    return null;
  }

  const notification = expiringNotifications[0];

  const handleRenew = () => {
    markAsRead(notification.id);
    setShowExpiringModal(false);
    window.location.href = '/subscription';
  };

  const handleRemindLater = () => {
    setShowExpiringModal(false);
    // Don't mark as read so it shows again later
  };

  return (
    <Dialog open={showExpiringModal} onOpenChange={setShowExpiringModal}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-yellow-500">
        <DialogHeader>
          <DialogTitle className="text-yellow-400 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Assinatura Expira Amanhã!
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Ação Necessária</h3>
              <p className="text-gray-300 text-sm">Sua assinatura expira em menos de 24 horas</p>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <p className="text-gray-300">
              Não perca o acesso às suas análises, dados históricos e ferramentas de performance. 
              Renove agora para continuar evoluindo no poker.
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Crown className="h-4 w-4" />
            <span>Mantenha todos os benefícios premium</span>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleRemindLater}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Lembrar Depois
          </Button>
          <Button
            onClick={handleRenew}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            Renovar Agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ExpiredSubscriptionModal: React.FC = () => {
  const { showExpiredModal, setShowExpiredModal, notifications, markAsRead } = useNotifications();

  if (!showExpiredModal) return null;

  const expiredNotifications = notifications.filter(
    n => n.type === 'subscription_expired' && !n.isRead
  );

  if (expiredNotifications.length === 0) {
    setShowExpiredModal(false);
    return null;
  }

  const notification = expiredNotifications[0];

  const handleRenew = () => {
    markAsRead(notification.id);
    setShowExpiredModal(false);
    window.location.href = '/subscription';
  };

  const handleGoHome = () => {
    markAsRead(notification.id);
    setShowExpiredModal(false);
    window.location.href = '/';
  };

  return (
    <Dialog open={showExpiredModal} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-red-500" {...{ hideCloseButton: true } as any}>
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Assinatura Expirada
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Acesso Restrito</h3>
              <p className="text-gray-300 text-sm">Sua assinatura expirou</p>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <p className="text-gray-300">
              Você ainda pode acessar seus dados básicos na página inicial, mas funcionalidades 
              avançadas foram temporariamente desabilitadas.
            </p>
          </div>
          
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-300 text-sm">
              <strong>Recursos bloqueados:</strong> Análises avançadas, upload de dados, 
              sessões de grind, planejamento semanal e estudos.
            </p>
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleGoHome}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            Ir para Início
          </Button>
          <Button
            onClick={handleRenew}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Renovar Assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const NotificationModals: React.FC = () => {
  return (
    <>
      <ExpiringSubscriptionModal />
      <ExpiredSubscriptionModal />
    </>
  );
};