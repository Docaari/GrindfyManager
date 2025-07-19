import { useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, Loader2 } from 'lucide-react';

const approveSchema = z.object({
  urgency: z.enum(['low', 'medium', 'high'], {
    required_error: 'Selecione uma urgência',
  }),
  adminNotes: z.string().optional(),
});

type ApproveForm = z.infer<typeof approveSchema>;

interface BugReport {
  id: string;
  page: string;
  description: string;
  type: string;
  urgency: string;
  status: string;
}

interface ApproveItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BugReport | null;
}

const urgencyOptions = [
  { value: 'low', label: 'Baixa', color: 'text-green-400' },
  { value: 'medium', label: 'Média', color: 'text-yellow-400' },
  { value: 'high', label: 'Alta', color: 'text-red-400' },
];

export default function ApproveItemModal({ isOpen, onClose, item }: ApproveItemModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApproveForm>({
    resolver: zodResolver(approveSchema),
    defaultValues: {
      urgency: 'medium',
      adminNotes: '',
    },
  });

  const urgencyValue = watch('urgency');

  const approveMutation = useMutation({
    mutationFn: (data: ApproveForm) => 
      apiRequest('PUT', `/api/bug-reports/${item?.id}`, {
        status: 'in_progress',
        urgency: data.urgency,
        adminNotes: data.adminNotes,
      }),
    onSuccess: () => {
      toast({
        title: "Item aprovado com sucesso!",
        description: "O item foi movido para a lista de itens pendentes.",
        duration: 4000,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
      reset();
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao aprovar item",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ApproveForm) => {
    approveMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="approve-item-modal">
        <DialogHeader className="modal-header">
          <DialogTitle className="modal-title">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Aprovar Item
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Classifique a urgência e aprove o item para análise detalhada.
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
            {/* Urgency Selection */}
            <div className="form-field">
              <Label className="field-label required">
                Classificar Urgência
              </Label>
              <RadioGroup 
                value={urgencyValue} 
                onValueChange={(value) => setValue('urgency', value as 'low' | 'medium' | 'high')}
                className="urgency-radio-group"
              >
                {urgencyOptions.map((option) => (
                  <div key={option.value} className="radio-option">
                    <RadioGroupItem 
                      value={option.value} 
                      id={option.value}
                      className="radio-item"
                    />
                    <Label 
                      htmlFor={option.value} 
                      className={`radio-label ${option.color}`}
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              {errors.urgency && (
                <span className="field-error">{errors.urgency.message}</span>
              )}
            </div>

            {/* Admin Notes */}
            <div className="form-field">
              <Label htmlFor="adminNotes" className="field-label">
                Observações (opcional)
              </Label>
              <Textarea
                id="adminNotes"
                {...register('adminNotes')}
                placeholder="Comentários internos para a equipe..."
                className="admin-notes-textarea"
                rows={3}
              />
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
                className="approve-button"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aprovando...
                  </>
                ) : (
                  'Aprovar e Classificar'
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}