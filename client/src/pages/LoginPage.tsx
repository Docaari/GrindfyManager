import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, AlertCircle, Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import HeaderLogo from '@/components/branding/HeaderLogo';
import { getGoogleAuthURL, getOAuthButtonLabel, isGoogleEnabled, getOAuthProviders } from '@/lib/oauth-ui-helpers';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

type LoginData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [accountLocked, setAccountLocked] = useState(false);
  const [lockRemainingTime, setLockRemainingTime] = useState<number>(0);
  const [resendTimer, setResendTimer] = useState<number>(0);
  const [isResending, setIsResending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{email?: string, password?: string}>({});

  const { data: providersData } = useQuery({
    queryKey: ['auth-providers'],
    queryFn: async () => {
      const res = await fetch('/api/auth/providers');
      return res.json();
    },
    staleTime: Infinity,
  });
  const providers = getOAuthProviders(providersData);
  const showGoogle = isGoogleEnabled(providers);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginData>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (data: LoginData) => {
    setIsSubmitting(true);
    setRequiresVerification(false);
    setAccountLocked(false);
    setFieldErrors({});
    
    try {
      const result = await login(data.email, data.password) as { success: boolean; requiresVerification?: boolean; email?: string; locked?: boolean; remainingTime?: number; error?: string; message?: string };
      
      if (result.success) {
        setLocation('/home');
      } else {
        if (result.requiresVerification) {
          setRequiresVerification(true);
          setUserEmail(result.email || data.email);
        } else if (result.locked) {
          setAccountLocked(true);
          setLockRemainingTime(result.remainingTime || 0);
          setUserEmail(data.email);
        } else {
          // Tratar erros específicos e exibir no campo apropriado
          if (result.error?.includes('não existe') || result.error?.includes('não encontrado')) {
            setFieldErrors({ email: "Esta conta não existe" });
          } else if (result.error?.includes('Senha incorreta')) {
            setFieldErrors({ password: "Senha incorreta" });
          } else if (result.error?.includes('Credenciais inválidas')) {
            // Para erro genérico (email não existe), mostrar erro no email
            setFieldErrors({ email: "Esta conta não existe" });
          } else {
            // Outros erros - mostrar erro genérico no password
            setFieldErrors({ password: result.error || "Email ou senha incorretos" });
          }
        }
      }
    } catch (error: any) {
      // Erro de conexão ou outro erro não tratado
      if (error.message === 'Unauthorized') {
        setFieldErrors({ password: "Email ou senha incorretos" });
      } else {
        setFieldErrors({ password: "Erro de conexão. Tente novamente." });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (resendTimer > 0 || isResending) return;
    
    setIsResending(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      
      if (response.ok) {
        toast({
          title: "Email enviado!",
          description: "Novo email de verificação enviado.",
        });
        // Iniciar timer de 60 segundos
        setResendTimer(60);
      } else {
        toast({
          title: "Erro",
          description: "Erro ao enviar email de verificação.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  // Timer countdown para reenvio de email
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [resendTimer]);

  // FIX (auth-launch P1.8): mostrar erro de OAuth callback via toast PT-BR.
  // OAuth callback redireciona pra /login?error=oauth_failed mas a pagina
  // ignorava o param — usuario via tela de login normal e nao entendia o que
  // aconteceu. Limpa o query param apos exibir pra nao re-disparar em refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (!oauthError) return;

    const errorMessages: Record<string, string> = {
      oauth_failed: 'Falha no login com Google. Tente novamente.',
      missing_params: 'Falha no login com Google. Tente novamente.',
      oauth_account_conflict: 'Email ja registrado com senha. Faca login com senha primeiro pra linkar Google.',
      oauth_account_blocked: 'Conta bloqueada. Entre em contato com o suporte.',
      oauth_account_unverified: 'Sua conta ainda nao foi confirmada. Verifique seu email para ativar.',
    };

    toast({
      title: 'Erro no login',
      description: errorMessages[oauthError] ?? 'Falha no login com Google. Tente novamente.',
      variant: 'destructive',
    });

    // Limpar query param para nao reaparecer em refresh
    params.delete('error');
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
    window.history.replaceState({}, '', newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] flex items-center justify-center p-4">
      {/* Background Pattern - similar to Dashboard */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00ff88]/5 to-transparent"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#00ff88]/3 to-transparent"></div>
      
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Section - Large and Prominent */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <HeaderLogo
              variant="mark"
              alt="Grindfy Logo"
              className="w-16 h-16 mr-4"
            />
            <h1 className="text-4xl font-bold">
              <span className="text-white">Grind</span>
              <span className="text-[#00ff88]">fy</span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg">Poker Tournament Tracker</p>
        </div>

        <Card className="bg-gray-800/80 backdrop-blur-sm border-gray-700/50 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl font-bold text-white">
              Entrar na Plataforma
            </CardTitle>
            <CardDescription className="text-gray-300">
              Acesse sua conta para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
          {requiresVerification && (
            <Alert className="mb-6 bg-yellow-900/20 border-yellow-500">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-200">
                <div className="space-y-2">
                  <p>Sua conta ainda não foi verificada.</p>
                  <p className="text-sm">
                    Verifique seu email <strong>{userEmail}</strong> e clique no link de ativação.
                  </p>
                  <Button
                    onClick={handleResendVerification}
                    variant="outline"
                    size="sm"
                    disabled={resendTimer > 0 || isResending}
                    className="mt-2 bg-yellow-800 border-yellow-600 text-yellow-100 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Enviando...
                      </>
                    ) : resendTimer > 0 ? (
                      `Aguarde ${resendTimer}s`
                    ) : (
                      'Reenviar Email de Verificação'
                    )}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {accountLocked && (
            <Alert className="mb-6 bg-red-900/20 border-red-500">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-200">
                <div className="space-y-2">
                  <p className="font-medium">Conta temporariamente bloqueada</p>
                  <p className="text-sm">
                    Muitas tentativas de login incorretas foram detectadas para <strong>{userEmail}</strong>.
                  </p>
                  <p className="text-sm">
                    Tente novamente em <strong>{lockRemainingTime} minutos</strong>.
                  </p>
                  <p className="text-xs text-red-300 mt-2">
                    Esta medida de segurança protege sua conta contra acessos não autorizados.
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 transition-colors"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.email.message}
                </p>
              )}
              {fieldErrors.email && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white font-medium">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  className="bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 focus:border-[#00ff88] focus:ring-[#00ff88]/20 pr-10 transition-colors"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-gray-700/50 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400 hover:text-white" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400 hover:text-white" />
                  )}
                </Button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password.message}
                </p>
              )}
              {fieldErrors.password && (
                <p className="text-red-400 text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {/* Space for future features like "Remember me" */}
              </div>
              <Link 
                href="/forgot-password" 
                className="text-sm hover:text-[#00ff88] text-[#00ff88] transition-colors underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#00ff88] hover:bg-[#00cc6a] text-black font-semibold"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar na Plataforma'
              )}
            </Button>
          </form>

          {/* OAuth Divider + Google Button — only when provider is enabled */}
          {showGoogle && (
            <>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-700" />
                <span className="text-gray-500 text-sm">ou</span>
                <div className="flex-1 h-px bg-gray-700" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full mt-4 bg-gray-800/50 border-gray-600 text-white hover:bg-gray-700/50"
                onClick={() => { window.location.href = getGoogleAuthURL(); }}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {getOAuthButtonLabel('google', 'login')}
              </Button>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Não tem uma conta?{' '}
              <Link href="/register" className="hover:text-[#00ff88] text-[#00ff88] transition-colors">
                Criar conta
              </Link>
            </p>
          </div>
          
          {/* Footer Info */}
          <div className="mt-4 text-center text-xs text-gray-500">
            <p>© 2025 Grindfy - Poker Tournament Tracker</p>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}