import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { resetPasswordSchema, type ResetPasswordData } from '@shared/schema';
import { Eye, EyeOff, Lock, Check, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [token, setToken] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  const form = useForm<ResetPasswordData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: '',
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    // Get token from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      setTokenValid(true);
      form.setValue('token', tokenFromUrl);
    } else {
      setTokenValid(false);
    }
  }, [form]);

  const onSubmit = async (data: ResetPasswordData) => {
    setIsLoading(true);
    
    try {
      const response = await apiRequest('POST', '/api/auth/reset-password', data);
      
      if (response.ok) {
        setResetSuccess(true);
        
        toast({
          title: "Senha redefinida com sucesso!",
          description: "Sua senha foi alterada. Você pode fazer login agora.",
        });
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          setLocation('/login');
        }, 3000);
      } else {
        const error = await response.json();
        toast({
          title: "Erro ao redefinir senha",
          description: error.message || "Token inválido ou expirado",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Reset password error:', error);
      toast({
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Link Inválido
            </CardTitle>
            <CardDescription className="text-gray-300">
              O link de redefinição é inválido ou expirou
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-red-900/20 border-red-500/30">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <AlertDescription className="text-red-200">
                Este link de redefinição de senha não é válido ou expirou. 
                Solicite um novo link para redefinir sua senha.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Link href="/forgot-password">
                <Button className="w-full bg-red-600 hover:bg-red-700">
                  Solicitar Novo Link
                </Button>
              </Link>
              
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Voltar ao Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">
              Senha Redefinida!
            </CardTitle>
            <CardDescription className="text-gray-300">
              Sua senha foi alterada com sucesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="bg-green-900/20 border-green-500/30">
              <Check className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-200">
                Sua senha foi redefinida com sucesso. Você pode fazer login com sua nova senha.
              </AlertDescription>
            </Alert>
            
            <div className="text-center space-y-4">
              <p className="text-gray-400 text-sm">
                Redirecionando para a página de login...
              </p>
              
              <Link href="/login">
                <Button className="w-full bg-red-600 hover:bg-red-700">
                  Fazer Login
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gray-800 border-gray-700">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Redefinir Senha
          </CardTitle>
          <CardDescription className="text-gray-300">
            Digite sua nova senha abaixo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Nova Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Mínimo 8 caracteres"
                          className="pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    <FormLabel className="text-white">Confirmar Nova Senha</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirme sua nova senha"
                          className="pl-10 pr-10 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-white"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Redefinindo...
                  </div>
                ) : (
                  'Redefinir Senha'
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-red-400 hover:text-red-300 font-medium">
              Voltar ao Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}