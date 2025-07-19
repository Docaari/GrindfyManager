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
import { Bug, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const bugReportSchema = z.object({
  page: z.string().min(1, 'Página é obrigatória'),
  description: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres'),
});

type BugReportForm = z.infer<typeof bugReportSchema>;

interface BugReportModalProps {
  currentPage?: string;
  trigger?: React.ReactNode;
}

const availablePages = [
  'Dashboard',
  'Import', 
  'Biblioteca',
  'Grade',
  'Grind',
  'Grind Ativo',
  'Warm Up',
  'Calendario',
  'Estudos',
  'Ferramentas',
  'Analytics',
  'Usuarios',
  'Bugs',
  'Modais',
  'Outro'
];

// Função de detecção automática de página baseada na URL
const getCurrentPage = (): string => {
  try {
    const url = window.location.pathname;
    
    // Mapeamento de URLs para páginas do Grindfy
    if (url.includes('/dashboard') || url === '/') return 'Dashboard';
    if (url.includes('/upload')) return 'Import';
    if (url.includes('/library')) return 'Biblioteca';
    if (url.includes('/coach')) return 'Grade';
    if (url.includes('/grind-live')) return 'Grind Ativo';
    if (url.includes('/grind') && !url.includes('/grind-live')) return 'Grind';
    if (url.includes('/mental')) return 'Warm Up';
    if (url.includes('/planner')) return 'Calendario';
    if (url.includes('/estudos')) return 'Estudos';
    if (url.includes('/calculadoras')) return 'Ferramentas';
    if (url.includes('/analytics')) return 'Analytics';
    if (url.includes('/admin/users')) return 'Usuarios';
    if (url.includes('/bugs') || url.includes('/admin/bugs')) return 'Bugs';
    
    // Se não conseguir detectar ou der erro, usar "Outro"
    return 'Outro';
  } catch (error) {
    console.warn('Erro na detecção automática de página:', error);
    return 'Outro';
  }
};

export default function BugReportModal({ currentPage, trigger }: BugReportModalProps) {
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
  } = useForm<BugReportForm>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: {
      page: '',
      description: '',
    },
  });

  // Detectar página automaticamente quando modal abrir
  useEffect(() => {
    if (isOpen) {
      const detectedPage = currentPage || getCurrentPage();
      setSelectedPage(detectedPage);
      setValue('page', detectedPage);
    }
  }, [isOpen, currentPage, setValue]);

  const createBugReport = useMutation({
    mutationFn: (data: BugReportForm) => apiRequest('POST', '/api/bug-reports', {
      ...data,
      type: 'bug',
      urgency: 'medium'
    }),
    onSuccess: () => {
      toast({
        title: "Relatório enviado com sucesso!",
        description: "Obrigado pelo seu feedback. Nossa equipe irá analisar em breve.",
        duration: 5000,
      });
      reset();
      setSelectedPage('');
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/bug-reports'] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar relatório",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BugReportForm) => {
    createBugReport.mutate(data);
  };

  const handlePageChange = (page: string) => {
    setSelectedPage(page);
    setValue('page', page);
  };

  const defaultTrigger = (
    <Button 
      variant="outline" 
      size="sm" 
      className="gap-2 bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300"
    >
      <Bug className="h-4 w-4" />
      Reportar Bug
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
            <Bug className="h-5 w-5 text-red-500" />
            Reportar Bug
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            Relate problemas técnicos, erros ou comportamentos inesperados da plataforma.
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
              placeholder="Descreva o problema em detalhes, o que aconteceu, como reproduzir..."
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
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-primary/90 h-10 px-4 py-2 submit-button bug-submit bg-[#16a34a] text-[#ffffff]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Relatório'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}