import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Mail, AlertCircle, CheckCircle } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Por favor, insira um email válido'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/auth/forgot-password', data);
      
      if (response.success) {
        setEmailSent(true);
        toast({
          title: "Link enviado!",
          description: "Link de recuperação enviado para seu email. Verifique sua caixa de entrada.",
          variant: "default",
        });
      } else if (response.message?.includes('não encontrado') || response.message?.includes('not found')) {
        toast({
          title: "Email não encontrado",
          description: "Email não encontrado. Verifique o endereço ou crie uma conta.",
          variant: "destructive",
        });
      } else if (response.message?.includes('limite') || response.message?.includes('limit')) {
        toast({
          title: "Limite atingido",
          description: "Limite de 3 tentativas por dia atingido. Tente novamente amanhã.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro no envio",
          description: "Erro ao enviar email. Tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro ao solicitar recuperação de senha:', error);
      toast({
        title: "Erro de conexão",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Email Enviado!</h1>
              <p className="text-gray-300">
                Enviamos um link de recuperação para <span className="font-medium text-white">{form.getValues('email')}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-300">
                  <AlertCircle className="w-4 h-4 inline mr-2" />
                  Verifique sua caixa de entrada e spam. O link expira em 1 hora.
                </p>
              </div>

              <div className="text-center space-y-3">
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para Login
                  </Button>
                </Link>
                
                <button
                  onClick={() => {
                    setEmailSent(false);
                    form.reset();
                  }}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Enviar para outro email
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">🔐 Esqueci Minha Senha</h1>
            <p className="text-gray-300">
              Digite seu email para receber um link de recuperação
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="seu@email.com"
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Enviando...
                  </div>
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400 mb-4">
              Você pode tentar 3 vezes por dia
            </p>
            
            <Link href="/login">
              <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}