import { UseFormReturn } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sites, types, speeds, type TournamentForm } from './types';

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: UseFormReturn<TournamentForm>;
  onSubmit: (data: TournamentForm) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function EditDialog({
  open,
  onOpenChange,
  editForm,
  onSubmit,
  onCancel,
  isPending,
}: EditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-emerald-400">Editar Torneio</DialogTitle>
        </DialogHeader>

        <Form {...editForm}>
          <form onSubmit={editForm.handleSubmit(onSubmit)} className="space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Site */}
            <FormField
              control={editForm.control}
              name="site"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Site</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione um site" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {sites.map((site) => (
                        <SelectItem key={site} value={site}>{site}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time */}
            <FormField
              control={editForm.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Hor&#225;rio</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={editForm.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione um tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {types.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Speed */}
            <FormField
              control={editForm.control}
              name="speed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Velocidade</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione a velocidade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {speeds.map((speed) => (
                        <SelectItem key={speed} value={speed}>{speed}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={editForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Nome (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="Nome do torneio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Buy-in */}
            <FormField
              control={editForm.control}
              name="buyIn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Buy-in</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Guaranteed */}
            <FormField
              control={editForm.control}
              name="guaranteed"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Garantido (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      {...field}
                      className="bg-slate-800 border-slate-700 text-slate-200 focus:border-emerald-400"
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Priority */}
            <FormField
              control={editForm.control}
              name="prioridade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-200">Prioridade</FormLabel>
                  <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                    <FormControl>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectValue placeholder="Selecione a prioridade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="1">Alta</SelectItem>
                      <SelectItem value="2">M&#233;dia</SelectItem>
                      <SelectItem value="3">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Buttons */}
            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Salvando...
                  </div>
                ) : (
                  'Salvar Altera\u00e7\u00f5es'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
