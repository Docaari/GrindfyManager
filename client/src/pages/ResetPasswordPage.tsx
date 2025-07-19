import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Key, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

const resetPasswordSchema = z.object({
  password: z.string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres')
    .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, 'A senha deve conter pelo menos uma letra e um número'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const [location] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const { toast } = useToast();

  // Extract token from URL
  const token = location.split('/reset-password/')[1] || '';

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  // Validate token on component mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setTokenValid(false);
        return;
      }

      try {
        const response = await apiRequest('POST', '/api/auth/verify-reset-token', { token });
        setTokenValid(response.valid);
        
        if (!response.valid) {
          toast({
            title: "Token inválido",
            description: "Este link de recuperação expirou ou é inválido.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Erro ao validar token:', error);
        setTokenValid(false);
        toast({
          title: "Erro",
          description: "Não foi possível validar o link de recuperação.",
          variant: "destructive",
        });
      }
    };

    validateToken();
  }, [token, toast]);

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/auth/reset-password', {
        token,
        password: data.password,
      });

      if (response.success) {
        setResetSuccess(true);
        toast({
          title: "Senha redefinida!",
          description: "Sua senha foi alterada com sucesso.",
          variant: "default",
        });
      } else {
        toast({
          title: "Erro",
          description: response.message || "Falha ao redefinir senha.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro inesperado. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Success state
  if (resetSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Senha Redefinida!</h1>
              <p className="text-gray-300">
                Sua senha foi alterada com sucesso. Agora você pode fazer login com a nova senha.
              </p>
            </div>

            <Link href="/login">
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-medium">
                Ir para Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (tokenValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Link Inválido</h1>
              <p className="text-gray-300">
                Este link de recuperação expirou ou é inválido. Solicite um novo link.
              </p>
            </div>

            <div className="space-y-3">
              <Link href="/forgot-password">
                <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-medium">
                  Solicitar Novo Link
                </Button>
              </Link>
              
              <Link href="/login">
                <Button variant="outline" className="w-full">
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

  // Loading token validation
  if (tokenValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 px-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-300">Validando link de recuperação...</p>
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
              <Key className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">🔑 Redefinir Senha</h1>
            <p className="text-gray-300">
              Digite sua nova senha abaixo
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Nova Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 pr-10"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Confirmar Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 pr-10"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-300">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  A senha deve ter pelo menos 6 caracteres com letras e números
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Redefinindo...
                  </div>
                ) : (
                  'Redefinir Senha'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
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