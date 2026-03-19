import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Key, Eye, EyeOff, CheckCircle, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import logoPath from '@assets/Imagem do WhatsApp de 2025-07-24 à(s) 14.09.18_16ebb75d_1753385463919.jpg';

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
            title: "Link inválido",
            description: "Link de recuperação inválido ou expirado. Solicite um novo.",
            variant: "destructive",
          });
        }
      } catch (error) {
        setTokenValid(false);
        toast({
          title: "Erro de conexão",
          description: "Erro de conexão. Tente novamente.",
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
          description: "Senha redefinida com sucesso! Redirecionando para login...",
          variant: "default",
        });
      } else if (response.message?.includes('não coincidem') || response.message?.includes('do not match')) {
        toast({
          title: "Senhas diferentes",
          description: "As senhas não coincidem. Verifique e tente novamente.",
          variant: "destructive",
        });
      } else if (response.message?.includes('inválido') || response.message?.includes('invalid')) {
        toast({
          title: "Link inválido",
          description: "Link de recuperação inválido ou expirado. Solicite um novo.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: response.message || "Falha ao redefinir senha.",
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

  // Success state
  if (resetSuccess) {
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
                  Senha Redefinida!
                </CardTitle>
                <p className="text-gray-300">
                  Sua senha foi alterada com sucesso. Agora você pode fazer login com a nova senha.
                </p>
              </CardHeader>

              <CardContent className="space-y-6">
                <Link href="/login">
                  <Button className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-semibold h-12 
                                     transition-all duration-200 shadow-lg hover:shadow-[#00ff88]/25">
                    Ir para Login
                  </Button>
                </Link>

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

  // Invalid token state
  if (tokenValid === false) {
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

            {/* Error Card */}
            <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <CardTitle className="text-2xl font-bold text-white mb-2">
                  Link Inválido
                </CardTitle>
                <p className="text-gray-300">
                  Link de recuperação inválido ou expirado. Solicite um novo.
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                <Link href="/forgot-password">
                  <Button className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-semibold h-12 
                                     transition-all duration-200 shadow-lg hover:shadow-[#00ff88]/25">
                    Solicitar Novo Link
                  </Button>
                </Link>
                
                <Link href="/login">
                  <Button 
                    variant="outline" 
                    className="w-full bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700/50 hover:border-[#00ff88] transition-all duration-200"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para Login
                  </Button>
                </Link>

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

  // Loading token validation
  if (tokenValid === null) {
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

            {/* Loading Card */}
            <Card className="bg-gray-900/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
              <CardContent className="p-8">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-[#00ff88] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-300">Validando link de recuperação...</p>
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
                <ShieldCheck className="w-8 h-8 text-[#00ff88]" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2">
                Redefinir Senha
              </CardTitle>
              <p className="text-gray-300">
                Digite sua nova senha abaixo
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="text-white font-medium">Nova Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 
                                         focus:border-[#00ff88] focus:ring-[#00ff88] pr-10 h-12
                                         transition-all duration-200"
                              disabled={isLoading}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-[#00ff88] transition-colors"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            {fieldState.error && (
                              <AlertCircle className="absolute right-10 top-1/2 transform -translate-y-1/2 h-5 w-5 text-red-400" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className="text-white font-medium">Confirmar Senha</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 
                                         focus:border-[#00ff88] focus:ring-[#00ff88] pr-10 h-12
                                         transition-all duration-200"
                              disabled={isLoading}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-[#00ff88] transition-colors"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                            {fieldState.error && (
                              <AlertCircle className="absolute right-10 top-1/2 transform -translate-y-1/2 h-5 w-5 text-red-400" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-xs text-blue-300 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-2 flex-shrink-0" />
                      A senha deve ter pelo menos 6 caracteres com letras e números
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-semibold h-12 
                               transition-all duration-200 shadow-lg hover:shadow-[#00ff88]/25"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                        Redefinindo...
                      </div>
                    ) : (
                      'Redefinir Senha'
                    )}
                  </Button>
                </form>
              </Form>

              {/* Navigation */}
              <div className="text-center">
                <p className="text-gray-400">
                  Lembrou da senha?{' '}
                  <Link href="/login" className="hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline">
                    Faça login
                  </Link>
                </p>
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