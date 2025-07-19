import { useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Edit3, Loader2 } from 'lucide-react';

const editSchema = z.object({
  description: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres'),
  urgency: z.enum(['low', 'medium', 'high'], {
    required_error: 'Selecione uma urgência',
  }),
});

type EditForm = z.infer<typeof editSchema>;

interface BugReport {
  id: string;
  page: string;
  description: string;
  type: string;
  urgency: string;
  status: string;
}

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: BugReport | null;
}

const urgencyOptions = [
  { value: 'low', label: 'Baixa', color: 'text-green-400' },
  { value: 'medium', label: 'Média', color: 'text-yellow-400' },
  { value: 'high', label: 'Alta', color: 'text-red-400' },
];

export default function EditItemModal({ isOpen, onClose, item }: EditItemModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      description: '',
      urgency: 'medium',
    },
  });

  const urgencyValue = watch('urgency');

  // Load item data when modal opens
  useEffect(() => {
    if (isOpen && item) {
      setValue('description', item.description);
      setValue('urgency', item.urgency as 'low' | 'medium' | 'high');
    }
  }, [isOpen, item, setValue]);

  const editMutation = useMutation({
    mutationFn: (data: EditForm) => 
      apiRequest('PUT', `/api/bug-reports/${item?.id}`, {
        description: data.description,
        urgency: data.urgency,
      }),
    onSuccess: () => {
      toast({
        title: "Item atualizado com sucesso!",
        description: "As alterações foram salvas.",
        duration: 4000,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports/stats'] });
      reset();
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar item",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditForm) => {
    editMutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="edit-item-modal">
        <DialogHeader className="modal-header">
          <DialogTitle className="modal-title">
            <Edit3 className="h-5 w-5 text-blue-500" />
            Editar Item
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Edite a descrição e urgência do item selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="modal-content">
          {/* Item Meta Info */}
          <div className="item-info-section">
            <div className="item-meta">
              <span className="meta-label">Página:</span>
              <span className="meta-value">{item.page}</span>
            </div>
            <div className="item-meta">
              <span className="meta-label">Tipo:</span>
              <span className="meta-value">
                {item.type === 'bug' ? '🐛 Bug' : 
                 item.type === 'enhancement' ? '💡 Melhoria' : '💭 Sugestão'}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="modal-form">
            {/* Description */}
            <div className="form-field">
              <Label htmlFor="description" className="field-label required">
                Descrição
              </Label>
              <Textarea
                id="description"
                {...register('description')}
                placeholder="Descreva o bug ou melhoria..."
                className="edit-description-textarea"
                rows={4}
              />
              {errors.description && (
                <span className="field-error">{errors.description.message}</span>
              )}
            </div>

            {/* Urgency Selection */}
            <div className="form-field">
              <Label className="field-label required">
                Urgência
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
                      id={`edit-${option.value}`}
                      className="radio-item"
                    />
                    <Label 
                      htmlFor={`edit-${option.value}`} 
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
                className="edit-button"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}