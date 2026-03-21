import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const createMaterialSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  type: z.enum(["video", "article", "file", "link"]),
  url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
});

type CreateMaterialData = z.infer<typeof createMaterialSchema>;

interface AddMaterialFormProps {
  studyCardId: string;
  onClose: () => void;
}

export function AddMaterialForm({ studyCardId, onClose }: AddMaterialFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useForm<CreateMaterialData>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      title: "",
      type: "video",
      url: "",
      description: "",
      status: "not_started",
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data: CreateMaterialData) => {
      return await apiRequest('POST', `/api/study-cards/${studyCardId}/materials`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-materials', studyCardId] });
      toast({
        title: "Material adicionado!",
        description: "Material de estudo criado com sucesso.",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar material. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateMaterialData) => {
    createMaterialMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    placeholder="Ex: Aula sobre 3bet ranges"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tipo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="video">📹 Vídeo/Aula</SelectItem>
                    <SelectItem value="article">📄 Artigo</SelectItem>
                    <SelectItem value="file">📎 Arquivo</SelectItem>
                    <SelectItem value="link">🔗 Link</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">URL/Link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="https://..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva o conteúdo do material..."
                  rows={3}
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
            disabled={createMaterialMutation.isPending}
          >
            {createMaterialMutation.isPending ? "Criando..." : "Adicionar Material"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
