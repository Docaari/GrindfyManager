import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { XCircle, Loader2 } from 'lucide-react';

const rejectSchema = z.object({
  rejectionReason: z.string().min(10, 'O motivo deve ter pelo menos 10 caracteres'),
});

type RejectForm = z.infer<typeof rejectSchema>;

interface BugReport {
  id: string;
  page: string;
  description: string;
  type: string;
  urgency: string;
  status: string;
}

interface RejectItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BugReport | null;
}

export default function RejectItemModal({ isOpen, onClose, item }: RejectItemModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RejectForm>({
    resolver: zodResolver(rejectSchema),
    defaultValues: {
      rejectionReason: '',
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: RejectForm) => 
      apiRequest('PUT', `/api/bug-reports/${item?.id}`, {
        status: 'dismissed',
        adminNotes: data.rejectionReason,
      }),
    onSuccess: () => {
      toast({
        title: "Item rejeitado",
        description: "O item foi marcado como rejeitado com sucesso.",
        duration: 4000,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
      reset();
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao rejeitar item",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RejectForm) => {
    rejectMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="reject-item-modal">
        <DialogHeader className="modal-header">
          <DialogTitle className="modal-title">
            <XCircle className="h-5 w-5 text-red-500" />
            Rejeitar Item
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Explique o motivo da rejeição para documentação interna.
          </DialogDescription>
        </DialogHeader>

        <div className="modal-content">
          {/* Item Info */}
          <div className="item-info-section">
            <div className="item-title">
              {item.description.length > 60 
                ? `${item.description.substring(0, 60)}...` 
                : item.description}
            </div>
            <div className="item-meta">
              <span className="meta-label">Página:</span>
              <span className="meta-value">{item.page}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="modal-form">
            {/* Rejection Reason */}
            <div className="form-field">
              <Label htmlFor="rejectionReason" className="field-label required">
                Motivo da rejeição
              </Label>
              <Textarea
                id="rejectionReason"
                {...register('rejectionReason')}
                placeholder="Explique o motivo da rejeição (duplicata, fora de escopo, já resolvido, etc.)..."
                className="rejection-reason-textarea"
                rows={4}
              />
              {errors.rejectionReason && (
                <span className="field-error">{errors.rejectionReason.message}</span>
              )}
            </div>

            {/* Actions */}
            <div className="modal-actions">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                className="cancel-button"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="reject-button"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rejeitando...
                  </>
                ) : (
                  'Rejeitar'
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}