import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const formSchema = z.object({
  site: z.string().min(1, "Site é obrigatório"),
  type: z.string().min(1, "Tipo é obrigatório"),
  speed: z.string().min(1, "Velocidade é obrigatória"),
  time: z.string().min(1, "Horário é obrigatório"),
  buyIn: z.string().min(1, "Buy-in é obrigatório"),
  guaranteed: z.string().min(1, "Garantido é obrigatório"),
  name: z.string().optional(),
});

interface NewTournamentPlanningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dayOfWeek: number | null;
  profileType: 'conservative' | 'aggressive';
}

const SITES = [
  'PokerStars',
  'GGPoker',
  'PartyPoker',
  'WPN',
  'CoinPoker',
  'Chico',
  'Bodog',
  '888poker'
];

const TYPES = ['Vanilla', 'PKO', 'Mystery'];
const SPEEDS = ['Normal', 'Turbo', 'Hyper'];

export function NewTournamentPlanningDialog({
  isOpen,
  onClose,
  dayOfWeek,
  profileType
}: NewTournamentPlanningDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      site: '',
      type: '',
      speed: '',
      time: '',
      buyIn: '',
      guaranteed: '',
      name: '',
    },
  });

  const createTournamentMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/planned-tournaments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/planned-tournaments'] });
      toast({
        title: "Torneio criado",
        description: "O torneio foi adicionado à grade com sucesso.",
      });
      form.reset();
      onClose();
    },
    onError: (error) => {
      console.error('Error creating tournament:', error);
      toast({
        title: "Erro ao criar torneio",
        description: "Ocorreu um erro ao criar o torneio.",
        variant: "destructive",
      });
    }
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    if (dayOfWeek === null) return;
    
    const tournamentData = {
      ...data,
      dayOfWeek,
      profileType: profileType === 'conservative' ? 1 : 2, // Convert to integer
      prioridade: 2,
      status: 'upcoming'
    };

    createTournamentMutation.mutate(tournamentData);
  };

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const selectedDayName = dayOfWeek !== null ? dayNames[dayOfWeek] : '';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            Adicionar Torneio - {selectedDayName}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="site"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Site</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                          <SelectValue placeholder="Selecione o site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {SITES.map((site) => (
                          <SelectItem key={site} value={site} className="text-white">
                            {site}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-white">
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="speed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Velocidade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                          <SelectValue placeholder="Selecione a velocidade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-gray-800 border-gray-600">
                        {SPEEDS.map((speed) => (
                          <SelectItem key={speed} value={speed} className="text-white">
                            {speed}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Horário</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        {...field}
                        className="bg-gray-800 border-gray-600 text-white"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="buyIn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Buy-in ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="guaranteed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Garantido ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        className="bg-gray-800 border-gray-600 text-white"
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Nome do Torneio (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="bg-gray-800 border-gray-600 text-white"
                      placeholder="Nome personalizado do torneio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createTournamentMutation.isPending}
                className="bg-poker-red hover:bg-poker-red/90 text-white"
              >
                {createTournamentMutation.isPending ? 'Criando...' : 'Criar Torneio'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}