import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Bug, AlertTriangle, Lightbulb, Zap, MessageSquare, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const bugReportSchema = z.object({
  page: z.string().min(1, 'Página é obrigatória'),
  description: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres'),
  urgency: z.enum(['low', 'medium', 'high']).default('medium'),
  type: z.enum(['bug', 'suggestion', 'performance']).default('bug'),
});

type BugReportForm = z.infer<typeof bugReportSchema>;

interface BugReportModalProps {
  currentPage?: string;
  trigger?: React.ReactNode;
}

const urgencyConfig = {
  low: { label: 'Baixa', color: 'bg-green-100 text-green-800', icon: MessageSquare },
  medium: { label: 'Média', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
  high: { label: 'Alta', color: 'bg-red-100 text-red-800', icon: Zap },
};

const typeConfig = {
  bug: { label: 'Bug', color: 'bg-red-100 text-red-800', icon: Bug },
  suggestion: { label: 'Sugestão', color: 'bg-blue-100 text-blue-800', icon: Lightbulb },
  performance: { label: 'Performance', color: 'bg-purple-100 text-purple-800', icon: Zap },
};

export default function BugReportModal({ currentPage, trigger }: BugReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BugReportForm>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: {
      page: currentPage || '',
      urgency: 'medium',
      type: 'bug',
    },
  });

  const watchedType = watch('type');
  const watchedUrgency = watch('urgency');

  const createBugReport = useMutation({
    mutationFn: (data: BugReportForm) => apiRequest('POST', '/api/bug-reports', data),
    onSuccess: () => {
      toast({
        title: "Relatório enviado com sucesso!",
        description: "Obrigado pelo seu feedback. Nossa equipe irá analisar em breve.",
        duration: 5000,
      });
      reset();
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

  const TypeIcon = typeConfig[watchedType]?.icon || Bug;
  const UrgencyIcon = urgencyConfig[watchedUrgency]?.icon || AlertTriangle;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Bug className="h-4 w-4" />
            Reportar Bug
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-100">
              <Bug className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">Reportar Problema</DialogTitle>
              <p className="text-sm text-gray-600">
                Ajude-nos a melhorar o Grindfy reportando bugs, sugestões ou problemas de performance
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Página */}
          <div className="space-y-2">
            <Label htmlFor="page">Página onde ocorreu o problema</Label>
            <Input
              id="page"
              {...register('page')}
              placeholder="ex: Dashboard, Biblioteca de Torneios, Upload History"
              className="w-full"
            />
            {errors.page && (
              <p className="text-sm text-red-600">{errors.page.message}</p>
            )}
          </div>

          {/* Tipo e Urgência */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo do Problema</Label>
              <Select value={watchedType} onValueChange={(value) => setValue('type', value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeConfig).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Urgência</Label>
              <Select value={watchedUrgency} onValueChange={(value) => setValue('urgency', value as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a urgência" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(urgencyConfig).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview dos badges */}
          <div className="flex gap-2">
            <Badge className={typeConfig[watchedType]?.color}>
              <TypeIcon className="h-3 w-3 mr-1" />
              {typeConfig[watchedType]?.label}
            </Badge>
            <Badge className={urgencyConfig[watchedUrgency]?.color}>
              <UrgencyIcon className="h-3 w-3 mr-1" />
              {urgencyConfig[watchedUrgency]?.label}
            </Badge>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição detalhada</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descreva o problema em detalhes: o que aconteceu, como reproduzir, o que deveria acontecer..."
              className="min-h-[120px] resize-none"
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Relatório'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}