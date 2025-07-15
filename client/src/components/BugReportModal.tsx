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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Bug } from 'lucide-react';
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

export default function BugReportModal({ currentPage, trigger }: BugReportModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BugReportForm>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: {
      page: currentPage || '',
    },
  });

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
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-800">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-red-600">
              <Bug className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-white">
                Reportar Bug
              </DialogTitle>
              <p className="text-sm text-gray-300">
                Descreva o problema para nossa equipe
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="page" className="text-gray-300">
              Página onde ocorreu o problema
            </Label>
            <Input
              id="page"
              {...register('page')}
              placeholder="ex: Dashboard, Biblioteca de Torneios, Upload History"
              className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
            />
            {errors.page && (
              <p className="text-sm text-red-400">{errors.page.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">
              Descrição detalhada
            </Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Descreva o problema em detalhes: o que aconteceu, como reproduzir, o que deveria acontecer..."
              className="min-h-[100px] resize-none bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
            />
            {errors.description && (
              <p className="text-sm text-red-400">{errors.description.message}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Relatório'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}