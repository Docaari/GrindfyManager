import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const createNoteSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  tags: z.string().optional(),
});

type CreateNoteData = z.infer<typeof createNoteSchema>;

interface AddNoteFormProps {
  studyCardId: string;
  onClose: () => void;
}

export function AddNoteForm({ studyCardId, onClose }: AddNoteFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<CreateNoteData>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: "",
      content: "",
      tags: "",
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: CreateNoteData) => {
      return await apiRequest('POST', `/api/study-cards/${studyCardId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-notes', studyCardId] });
      toast({
        title: "Anotação criada!",
        description: "Anotação adicionada com sucesso.",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar anotação. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateNoteData) => {
    createNoteMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Título</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Descobertas sobre 3bet calling ranges"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Conteúdo</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva suas descobertas, insights e pontos importantes..."
                  rows={8}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Tags (opcional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: 3bet, ranges, BTN vs BB"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button
            type="submit"
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createNoteMutation.isPending}
          >
            {createNoteMutation.isPending ? "Criando..." : "Criar Anotação"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
