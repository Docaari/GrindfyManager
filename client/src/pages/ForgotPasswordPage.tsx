import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Mail, AlertCircle, CheckCircle, KeyRound } from 'lucide-react';
import logoPath from '@assets/Imagem do WhatsApp de 2025-07-24 à(s) 14.09.18_16ebb75d_1753385463919.jpg';

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
      <div className="min-h-screen bg-[#1a1a1a] relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[#2a2a2a] opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)`
          }} />
        </div>

        <div className="relative min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md">
            {/* Header with Logo */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-6">
                <img 
                  src={logoPath} 
                  alt="Grindfy Logo" 
                  className="w-12 h-12 object-contain"
                />
                <div className="text-3xl font-bold">
                  <span className="text-white">Grind</span>
                  <span className="text-[#00ff88]">fy</span>
                </div>
              </div>
              <div className="h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
            </div>

            {/* Success Card */}
            <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-[#00ff88]" />
                </div>
                <CardTitle className="text-2xl font-bold text-white mb-2">
                  Email Enviado!
                </CardTitle>
                <p className="text-gray-300">
                  Enviamos um link de recuperação para <span className="font-medium text-[#00ff88]">{form.getValues('email')}</span>
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-300 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    Verifique sua caixa de entrada e spam. O link expira em 1 hora.
                  </p>
                </div>

                <div className="space-y-4">
                  <Link href="/login">
                    <Button 
                      variant="outline" 
                      className="w-full bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700/50 hover:border-[#00ff88] transition-all duration-200"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Voltar para Login
                    </Button>
                  </Link>
                  
                  <button
                    onClick={() => {
                      setEmailSent(false);
                      form.reset();
                    }}
                    className="w-full text-sm text-[#00ff88] hover:text-white transition-colors underline-offset-4 hover:underline"
                  >
                    Enviar para outro email
                  </button>
                </div>

                {/* Footer Info */}
                <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/50">
                  <p>© 2025 Grindfy - Poker Tournament Tracker</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[#2a2a2a] opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 80% 20%, rgba(34, 197, 94, 0.1) 0%, transparent 50%),
                           radial-gradient(circle at 40% 80%, rgba(34, 197, 94, 0.05) 0%, transparent 50%)`
        }} />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Header with Logo */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <img 
                src={logoPath} 
                alt="Grindfy Logo" 
                className="w-12 h-12 object-contain"
              />
              <div className="text-3xl font-bold">
                <span className="text-white">Grind</span>
                <span className="text-[#00ff88]">fy</span>
              </div>
            </div>
            <div className="h-0.5 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
          </div>

          {/* Main Card */}
          <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-[#00ff88]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-[#00ff88]" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2">
                Esqueci Minha Senha
              </CardTitle>
              <p className="text-gray-300">
                Digite seu email para receber um link de recuperação
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="text-white font-medium">Email</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type="email"
                              placeholder="seu@email.com"
                              className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 
                                         focus:border-[#00ff88] focus:ring-[#00ff88] pr-10 h-12
                                         transition-all duration-200"
                              disabled={isLoading}
                            />
                            {fieldState.error && (
                              <AlertCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-red-400" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-semibold h-12 
                               transition-all duration-200 shadow-lg hover:shadow-[#00ff88]/25"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                        Enviando...
                      </div>
                    ) : (
                      'Enviar Link de Recuperação'
                    )}
                  </Button>
                </form>
              </Form>

              {/* Info and Navigation */}
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm text-gray-400">
                    Você pode tentar 3 vezes por dia
                  </p>
                </div>
                
                <div className="text-center">
                  <p className="text-gray-400">
                    Lembrou da senha?{' '}
                    <Link href="/login" className="hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline">
                      Faça login
                    </Link>
                  </p>
                </div>
              </div>

              {/* Footer Info */}
              <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-700/50">
                <p>© 2025 Grindfy - Poker Tournament Tracker</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}