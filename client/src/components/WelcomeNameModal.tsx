import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface WelcomeNameModalProps {
  open: boolean;
  onComplete: () => void;
}

export function WelcomeNameModal({ open, onComplete }: WelcomeNameModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Por favor, digite um nome para continuar",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Update user's display name
      await apiRequest('PATCH', '/api/auth/update-profile', {
        name: displayName.trim(),
      });

      // Update local user context
      if (user) {
        updateUser({
          ...user,
          name: displayName.trim(),
        });
      }

      toast({
        title: "Bem-vindo!",
        description: `Olá, ${displayName.trim()}! Sua conta foi personalizada com sucesso.`,
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível salvar o nome. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md bg-gray-900 border-gray-700"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl text-white flex items-center justify-center gap-2">
            👋 Como gostaria de ser chamado?
          </DialogTitle>
          <DialogDescription className="text-gray-400 mt-2">
            Escolha um nome para personalizar sua experiência no Grindfy
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-gray-300">
              Nome de usuário:
            </Label>
            <Input
              id="displayName"
              placeholder="Digite seu nome..."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
              autoFocus
              maxLength={50}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleSave}
            disabled={isLoading || !displayName.trim()}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-2 min-w-[120px]"
          >
            {isLoading ? 'Salvando...' : 'Continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}