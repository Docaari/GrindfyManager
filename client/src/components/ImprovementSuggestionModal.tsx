import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Lightbulb, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const improvementSuggestionSchema = z.object({
  page: z.string().min(1, 'Página é obrigatória'),
  description: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres'),
});

type ImprovementSuggestionForm = z.infer<typeof improvementSuggestionSchema>;

interface ImprovementSuggestionModalProps {
  currentPage?: string;
  trigger?: React.ReactNode;
}

const availablePages = [
  'Dashboard',
  'Import',
  'Grade',
  'Grind',
  'Grind Ativo',
  'Outro'
];

// Função de detecção automática de página baseada na URL
const getCurrentPage = (): string => {
  try {
    const url = window.location.pathname;
    
    // Mapeamento simplificado de URLs para as 6 páginas principais
    if (url.includes('/dashboard') || url === '/') return 'Dashboard';
    if (url.includes('/upload')) return 'Import';
    if (url.includes('/coach')) return 'Grade';
    if (url.includes('/grind-live')) return 'Grind Ativo';
    if (url.includes('/grind') && !url.includes('/grind-live')) return 'Grind';
    
    // Todas as outras páginas mapeiam para "Outro"
    return 'Outro';
  } catch (error) {
    console.warn('Erro na detecção automática de página:', error);
    return 'Outro';
  }
};

export default function ImprovementSuggestionModal({ currentPage, trigger }: ImprovementSuggestionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPage, setSelectedPage] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ImprovementSuggestionForm>({
    resolver: zodResolver(improvementSuggestionSchema),
    defaultValues: {
      page: '',
      description: '',
    },
  });

  // Detectar página automaticamente quando modal abrir
  useEffect(() => {
    if (isOpen) {
      const detectedPage = getCurrentPage();
      
      // Use setTimeout to ensure the modal is fully rendered
      setTimeout(() => {
        setSelectedPage(detectedPage);
        setValue('page', detectedPage, { shouldValidate: true, shouldDirty: true });
      }, 100);
    }
  }, [isOpen, setValue]);

  const createImprovementSuggestion = useMutation({
    mutationFn: (data: ImprovementSuggestionForm) => apiRequest('POST', '/api/bug-reports', {
      ...data,
      type: 'enhancement',
      urgency: 'low'
    }),
    onSuccess: () => {
      toast({
        title: "Sugestão enviada com sucesso!",
        description: "Obrigado pela sua contribuição. Nossa equipe irá avaliar sua sugestão.",
        duration: 5000,
      });
      reset();
      setSelectedPage('');
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar sugestão",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ImprovementSuggestionForm) => {
    createImprovementSuggestion.mutate(data);
  };

  const handlePageChange = (page: string) => {
    setSelectedPage(page);
    setValue('page', page);
  };

  const defaultTrigger = (
    <Button 
      variant="outline" 
      size="sm" 
      className="gap-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:border-green-300"
    >
      <Lightbulb className="h-4 w-4" />
      Sugerir Melhoria
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="improvement-suggestion-modal">
        <DialogHeader className="modal-header">
          <DialogTitle className="modal-title">
            <Lightbulb className="h-5 w-5 text-green-500" />
            Sugerir Melhoria
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Sugira melhorias, novas funcionalidades ou otimizações para a plataforma.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="modal-form">
          <div className="form-field">
            <Label htmlFor="page" className="field-label required">
              Página relacionada
            </Label>
            <Select value={selectedPage} onValueChange={handlePageChange}>
              <SelectTrigger className="page-select">
                <SelectValue placeholder="🔽 Selecione uma página" />
              </SelectTrigger>
              <SelectContent>
                {availablePages.map((page) => (
                  <SelectItem key={page} value={page}>
                    {page}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.page && (
              <span className="field-error">{errors.page.message}</span>
            )}
          </div>

          <div className="form-field">
            <Label htmlFor="description" className="field-label required">
              Descreva sua sugestão
            </Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descreva sua ideia de melhoria, funcionalidade nova, otimização ou aprimoramento..."
              className="improvement-description"
              rows={5}
            />
            {errors.description && (
              <span className="field-error">{errors.description.message}</span>
            )}
          </div>

          <div className="modal-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              className="cancel-button"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="submit-button improvement-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Sugestão'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}